import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/oauth", () => ({
  verifyOAuthToken: vi.fn(),
  checkOAuthRateLimit: vi.fn().mockResolvedValue({ ok: true }),
}))

describe("authenticatePublic scope enforcement", () => {
  beforeEach(() => { vi.resetModules() })

  it("rejects with insufficient_scope when required scope is missing", async () => {
    const oauth = await import("@/lib/oauth")
    vi.mocked(oauth.verifyOAuthToken).mockResolvedValue({
      clientId: "cid-1",
      clientDbId: 1,
      scopes: ["weather:read"],
      fieldIds: null,
      zoneIds: null,
      rateLimit: 60,
    })
    const { authenticatePublic } = await import("@/lib/public-api")
    const req = new Request("http://x/", { headers: { authorization: "Bearer x" } }) as unknown as import("next/server").NextRequest
    const result = await authenticatePublic(req, "alert:read")
    expect(result).toBeInstanceOf(Response)
    const res = result as Response
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.errors[0].code).toBe("insufficient_scope")
  })

  it("allows the call when required scope is present", async () => {
    const oauth = await import("@/lib/oauth")
    vi.mocked(oauth.verifyOAuthToken).mockResolvedValue({
      clientId: "cid-2",
      clientDbId: 2,
      scopes: ["weather:read", "alert:read"],
      fieldIds: null,
      zoneIds: null,
      rateLimit: 60,
    })
    const { authenticatePublic } = await import("@/lib/public-api")
    const req = new Request("http://x/", { headers: { authorization: "Bearer y" } }) as unknown as import("next/server").NextRequest
    const result = await authenticatePublic(req, "alert:read")
    expect(result).not.toBeInstanceOf(Response)
    expect((result as { session: { clientId: string } }).session.clientId).toBe("cid-2")
  })

  it("allows the call when no required scope is specified", async () => {
    const oauth = await import("@/lib/oauth")
    vi.mocked(oauth.verifyOAuthToken).mockResolvedValue({
      clientId: "cid-3",
      clientDbId: 3,
      scopes: [],
      fieldIds: null,
      zoneIds: null,
      rateLimit: 60,
    })
    const { authenticatePublic } = await import("@/lib/public-api")
    const req = new Request("http://x/", { headers: { authorization: "Bearer z" } }) as unknown as import("next/server").NextRequest
    const result = await authenticatePublic(req)
    expect(result).not.toBeInstanceOf(Response)
  })

  it("rejects with 401 when verifyOAuthToken returns null", async () => {
    const oauth = await import("@/lib/oauth")
    vi.mocked(oauth.verifyOAuthToken).mockResolvedValue(null)
    const { authenticatePublic } = await import("@/lib/public-api")
    const req = new Request("http://x/") as unknown as import("next/server").NextRequest
    const result = await authenticatePublic(req, "weather:read")
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })
})
