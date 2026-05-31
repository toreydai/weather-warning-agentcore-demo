import { randomBytes, createHash } from "crypto"
import { NextRequest } from "next/server"
import { getDb } from "@/lib/db"
import { oauthClient, oauthToken } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { rateLimit } from "@/lib/rate-limit"

export type OAuthSession = {
  clientId: string
  clientDbId: number
  scopes: string[]
  fieldIds: number[] | null  // null = all fields allowed
  zoneIds: number[] | null   // null = all zones allowed
  rateLimit: number
}

// 30s in-memory cache for token validation
const tokenCache = new Map<string, { session: OAuthSession; cachedUntil: number }>()
const CACHE_TTL_MS = 30_000

export function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export function generateClientId(): string {
  return randomBytes(12).toString("hex")
}

export function generateClientSecret(): string {
  return randomBytes(32).toString("base64url")
}

export async function verifyOAuthToken(req: NextRequest): Promise<OAuthSession | null> {
  const auth = req.headers.get("authorization")
  if (!auth?.startsWith("Bearer ")) return null
  const rawToken = auth.slice(7).trim()
  if (!rawToken) return null

  const hash = hashSecret(rawToken)

  const cached = tokenCache.get(hash)
  if (cached && cached.cachedUntil > Date.now()) return cached.session

  const db = getDb()
  const rows = await db.select({
    token_expires_at: oauthToken.expires_at,
    token_revoked_at: oauthToken.revoked_at,
    token_scopes: oauthToken.scopes,
    client_id: oauthClient.client_id,
    client_db_id: oauthClient.id,
    client_is_active: oauthClient.is_active,
    client_revoked_at: oauthClient.revoked_at,
    client_field_ids: oauthClient.field_ids,
    client_zone_ids: oauthClient.zone_ids,
    client_rate_limit: oauthClient.rate_limit,
  }).from(oauthToken)
    .innerJoin(oauthClient, eq(oauthToken.client_id, oauthClient.client_id))
    .where(eq(oauthToken.token_hash, hash))

  const row = rows[0]
  if (!row) return null
  if (row.token_revoked_at) return null
  if (row.token_expires_at <= new Date()) return null
  if (!row.client_is_active || row.client_revoked_at) return null

  const session: OAuthSession = {
    clientId: row.client_id,
    clientDbId: row.client_db_id,
    scopes: JSON.parse(row.token_scopes) as string[],
    fieldIds: row.client_field_ids ? (JSON.parse(row.client_field_ids) as number[]) : null,
    zoneIds: row.client_zone_ids ? (JSON.parse(row.client_zone_ids) as number[]) : null,
    rateLimit: row.client_rate_limit,
  }

  tokenCache.set(hash, { session, cachedUntil: Date.now() + CACHE_TTL_MS })
  return session
}

export async function checkOAuthRateLimit(
  clientId: string,
  limit: number
): Promise<{ ok: boolean; retryAfter?: number }> {
  const result = await rateLimit(`api:${clientId}`, limit, 60_000)
  if (result.ok) return { ok: true }
  return { ok: false, retryAfter: result.retryAfter }
}

export function evictTokenCache(tokenHash: string) {
  tokenCache.delete(tokenHash)
}

export function evictClientCache(clientId: string) {
  for (const [hash, entry] of tokenCache) {
    if (entry.session.clientId === clientId) tokenCache.delete(hash)
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of tokenCache) if (v.cachedUntil <= now) tokenCache.delete(k)
  }, 60_000).unref?.()
}
