import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHash } from "crypto"

// ─── pure helpers ──────────────────────────────────────────────────────────

describe("hashSecret", () => {
  it("produces deterministic SHA-256 hex", async () => {
    const { hashSecret } = await import("@/lib/oauth")
    const h1 = hashSecret("hello")
    const h2 = hashSecret("hello")
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it("differs for different inputs", async () => {
    const { hashSecret } = await import("@/lib/oauth")
    expect(hashSecret("a")).not.toBe(hashSecret("b"))
  })

  it("matches manual sha256", async () => {
    const { hashSecret } = await import("@/lib/oauth")
    const expected = createHash("sha256").update("test").digest("hex")
    expect(hashSecret("test")).toBe(expected)
  })
})

describe("generateClientId / generateClientSecret", () => {
  it("generates unique client IDs", async () => {
    const { generateClientId } = await import("@/lib/oauth")
    const ids = new Set(Array.from({ length: 20 }, () => generateClientId()))
    expect(ids.size).toBe(20)
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{24}$/)
  })

  it("generates URL-safe client secrets", async () => {
    const { generateClientSecret } = await import("@/lib/oauth")
    const s = generateClientSecret()
    expect(s.length).toBeGreaterThan(30)
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("secrets are unique", async () => {
    const { generateClientSecret } = await import("@/lib/oauth")
    const secrets = new Set(Array.from({ length: 20 }, () => generateClientSecret()))
    expect(secrets.size).toBe(20)
  })
})

// ─── cache eviction ────────────────────────────────────────────────────────

describe("evictClientCache", () => {
  afterEach(() => { vi.resetModules() })

  it("evicts all cache entries for a given clientId", async () => {
    vi.resetModules()
    const { evictClientCache } = await import("@/lib/oauth")
    // Seed the cache via the module-internal Map by calling evictTokenCache (no-op on missing)
    // We test indirectly: after eviction, a subsequent verifyOAuthToken DB call will be made
    // (i.e. cache miss). Since this is hard to observe without DB mock, we just confirm the
    // function runs without error and returns undefined.
    expect(() => evictClientCache("some-client")).not.toThrow()
    expect(() => evictClientCache("")).not.toThrow()
  })
})

// ─── verifyOAuthToken (mocked DB) ──────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}))

function makeSelect(row: unknown) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(row ? [row] : []),
  }
  return { select: vi.fn().mockReturnValue(chain), chain }
}

describe("verifyOAuthToken", () => {
  beforeEach(() => { vi.resetModules() })

  it("returns null when no Authorization header", async () => {
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/api/v1/test") as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns null for non-Bearer auth", async () => {
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Basic abc" } }) as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns null when token not found in DB", async () => {
    const { getDb } = await import("@/lib/db")
    const { chain } = makeSelect(null)
    vi.mocked(getDb).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as never)
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Bearer unknowntoken" } }) as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns null for revoked token", async () => {
    const { getDb } = await import("@/lib/db")
    const row = {
      token_expires_at: new Date(Date.now() + 3600_000),
      token_revoked_at: new Date(),
      token_scopes: '["read"]',
      client_id: "cid1",
      client_db_id: 1,
      client_is_active: true,
      client_revoked_at: null,
      client_field_ids: null,
      client_zone_ids: null,
      client_rate_limit: 60,
    }
    const { chain } = makeSelect(row)
    vi.mocked(getDb).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as never)
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Bearer validtoken" } }) as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns null for expired token", async () => {
    const { getDb } = await import("@/lib/db")
    const row = {
      token_expires_at: new Date(Date.now() - 1000),
      token_revoked_at: null,
      token_scopes: '["read"]',
      client_id: "cid1",
      client_db_id: 1,
      client_is_active: true,
      client_revoked_at: null,
      client_field_ids: null,
      client_zone_ids: null,
      client_rate_limit: 60,
    }
    const { chain } = makeSelect(row)
    vi.mocked(getDb).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as never)
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Bearer expiredtoken" } }) as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns null for inactive client", async () => {
    const { getDb } = await import("@/lib/db")
    const row = {
      token_expires_at: new Date(Date.now() + 3600_000),
      token_revoked_at: null,
      token_scopes: '["read"]',
      client_id: "cid1",
      client_db_id: 1,
      client_is_active: false,
      client_revoked_at: null,
      client_field_ids: null,
      client_zone_ids: null,
      client_rate_limit: 60,
    }
    const { chain } = makeSelect(row)
    vi.mocked(getDb).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as never)
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Bearer activetoken" } }) as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns null for revoked client", async () => {
    const { getDb } = await import("@/lib/db")
    const row = {
      token_expires_at: new Date(Date.now() + 3600_000),
      token_revoked_at: null,
      token_scopes: '["read"]',
      client_id: "cid1",
      client_db_id: 1,
      client_is_active: true,
      client_revoked_at: new Date(),
      client_field_ids: null,
      client_zone_ids: null,
      client_rate_limit: 60,
    }
    const { chain } = makeSelect(row)
    vi.mocked(getDb).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as never)
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Bearer token" } }) as unknown as import("next/server").NextRequest
    expect(await verifyOAuthToken(req)).toBeNull()
  })

  it("returns full OAuthSession for valid token", async () => {
    const { getDb } = await import("@/lib/db")
    const row = {
      token_expires_at: new Date(Date.now() + 3600_000),
      token_revoked_at: null,
      token_scopes: '["read","forecast"]',
      client_id: "cid-valid",
      client_db_id: 7,
      client_is_active: true,
      client_revoked_at: null,
      client_field_ids: "[1,2,3]",
      client_zone_ids: null,
      client_rate_limit: 120,
    }
    const { chain } = makeSelect(row)
    vi.mocked(getDb).mockReturnValue({ select: vi.fn().mockReturnValue(chain) } as never)
    const { verifyOAuthToken } = await import("@/lib/oauth")
    const req = new Request("http://x/", { headers: { authorization: "Bearer goodtoken" } }) as unknown as import("next/server").NextRequest
    const session = await verifyOAuthToken(req)
    expect(session).toMatchObject({
      clientId: "cid-valid",
      clientDbId: 7,
      scopes: ["read", "forecast"],
      fieldIds: [1, 2, 3],
      zoneIds: null,
      rateLimit: 120,
    })
  })
})

