import { describe, it, expect, beforeAll } from "vitest"

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-at-least-32-bytes-long-xxx"
})

describe("auth token primitives", () => {
  it("issues a valid access token that verifies", async () => {
    const { createAccessToken, verifyAccessToken } = await import("@/lib/auth")
    const token = await createAccessToken("alice", "admin", 42)
    const session = await verifyAccessToken(token)
    expect(session).toEqual({ username: "alice", role: "admin", userId: 42, mustChangePassword: false })
  })

  it("preserves the forced password change claim", async () => {
    const { createAccessToken, verifyAccessToken } = await import("@/lib/auth")
    const token = await createAccessToken("alice", "farmer", 42, true)
    const session = await verifyAccessToken(token)
    expect(session?.mustChangePassword).toBe(true)
  })

  it("rejects a token signed with a different secret", async () => {
    const { createAccessToken } = await import("@/lib/auth")
    const token = await createAccessToken("alice", "admin", 1)
    // swap secret, then re-import a fresh module graph to pick it up
    process.env.AUTH_SECRET = "different-secret-also-32-bytes-abcdef"
    const mod = await import("@/lib/auth?variant=alt" as string).catch(async () => {
      // Fallback: reset modules and re-import
      const vi = await import("vitest")
      vi.vi.resetModules()
      return import("@/lib/auth")
    })
    const session = await mod.verifyAccessToken(token)
    expect(session).toBeNull()
    // restore
    process.env.AUTH_SECRET = "test-secret-at-least-32-bytes-long-xxx"
  })

  it("rejects a tampered token", async () => {
    const { createAccessToken, verifyAccessToken } = await import("@/lib/auth")
    const token = await createAccessToken("alice", "admin", 1)
    const parts = token.split(".")
    parts[1] = Buffer.from(JSON.stringify({ sub: "alice", role: "admin", exp: 9999999999 })).toString("base64url")
    const tampered = parts.join(".")
    expect(await verifyAccessToken(tampered)).toBeNull()
  })

  it("rejects an expired token", async () => {
    const { SignJWT } = await import("jose")
    const { verifyAccessToken } = await import("@/lib/auth")
    const key = new TextEncoder().encode(process.env.AUTH_SECRET!)
    const expired = await new SignJWT({ role: "farmer" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("bob")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(key)
    expect(await verifyAccessToken(expired)).toBeNull()
  })

  it("rejects garbage", async () => {
    const { verifyAccessToken } = await import("@/lib/auth")
    expect(await verifyAccessToken("not.a.jwt")).toBeNull()
    expect(await verifyAccessToken("")).toBeNull()
  })
})

describe("AUTH_SECRET enforcement", () => {
  it("throws at import time when AUTH_SECRET is missing", async () => {
    const original = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET
    const vi = await import("vitest")
    vi.vi.resetModules()
    await expect(import("@/lib/auth")).rejects.toThrow(/AUTH_SECRET required/)
    process.env.AUTH_SECRET = original
    vi.vi.resetModules()
  })
})
