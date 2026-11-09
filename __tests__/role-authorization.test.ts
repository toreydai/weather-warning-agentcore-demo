import { beforeAll, describe, expect, it, vi } from "vitest"
import { SignJWT } from "jose"

const state = vi.hoisted(() => ({ token: "" }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: state.token }) }),
}))

const secret = "role-authorization-test-secret-32-bytes"

beforeAll(() => {
  process.env.AUTH_SECRET = secret
  vi.resetModules()
})

async function loginAs(role: string) {
  state.token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("alice")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret))
}

describe("write role boundaries", () => {
  it("blocks farmers from field and advice editing", async () => {
    await loginAs("farmer")
    const { requireReviewer, requireAgronomist } = await import("@/lib/auth")
    expect((await requireReviewer() as Response).status).toBe(403)
    expect((await requireAgronomist() as Response).status).toBe(403)
  })

  it("allows reviewers to manage fields and agronomists to edit advice", async () => {
    const { requireReviewer, requireAgronomist } = await import("@/lib/auth")
    await loginAs("reviewer")
    expect(await requireReviewer()).toEqual({ name: "alice", role: "reviewer" })
    await loginAs("agronomist")
    expect(await requireAgronomist()).toEqual({ name: "alice", role: "agronomist" })
  })
})
