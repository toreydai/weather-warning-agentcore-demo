import { beforeAll, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { SignJWT } from "jose"

const secret = "middleware-test-secret-at-least-32-bytes"

beforeAll(() => {
  process.env.AUTH_SECRET = secret
  vi.resetModules()
})

async function request(path: string, token?: string) {
  const { middleware } = await import("@/middleware")
  const headers = token ? { cookie: `auth_token=${token}` } : undefined
  return middleware(new NextRequest(`https://example.com${path}`, { headers }))
}

async function token(role: string, mustChangePassword = false) {
  return new SignJWT({ role, mustChangePassword })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("alice")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret))
}

describe("middleware access control", () => {
  it("redirects anonymous page requests to login", async () => {
    const response = await request("/")
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("https://example.com/login")
  })

  it("allows the login page and authenticated pages", async () => {
    expect((await request("/login")).status).toBe(200)
    expect((await request("/fields/1", await token("farmer"))).status).toBe(200)
  })

  it("redirects a user who must change their password", async () => {
    const response = await request("/fields/1", await token("farmer", true))
    expect(response.headers.get("location")).toBe("https://example.com/change-password")
  })

  it("rejects an anonymous protected API request", async () => {
    expect((await request("/api/fields")).status).toBe(401)
  })
})
