import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/db"

type Bucket = { count: number; resetAt: number }
export type RateLimitResult = { ok: true } | { ok: false; retryAfter: number }

const buckets = new Map<string, Bucket>()

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) return xff.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

export function memoryRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true }
  }
  if (b.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) }
  }
  b.count++
  return { ok: true }
}

async function pgRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const res = await getPool().query<{ count: number; reset_at: Date }>(
    `
    INSERT INTO rate_limit_bucket (bucket_key, count, reset_at, updated_at)
    VALUES ($1, 1, NOW() + ($2::int * INTERVAL '1 millisecond'), NOW())
    ON CONFLICT (bucket_key) DO UPDATE SET
      count = CASE
        WHEN rate_limit_bucket.reset_at <= NOW() THEN 1
        ELSE rate_limit_bucket.count + 1
      END,
      reset_at = CASE
        WHEN rate_limit_bucket.reset_at <= NOW() THEN NOW() + ($2::int * INTERVAL '1 millisecond')
        ELSE rate_limit_bucket.reset_at
      END,
      updated_at = NOW()
    RETURNING count, reset_at
    `,
    [key, windowMs]
  )

  if (Math.random() < 0.001) {
    getPool().query("DELETE FROM rate_limit_bucket WHERE reset_at < NOW() - INTERVAL '1 day'").catch(() => {})
  }

  const row = res.rows[0]
  if (!row || row.count <= limit) return { ok: true }
  const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000))
  return { ok: false, retryAfter }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (process.env.RATE_LIMIT_STORE === "memory" || !process.env.DATABASE_URL) {
    return memoryRateLimit(key, limit, windowMs)
  }

  try {
    return await pgRateLimit(key, limit, windowMs)
  } catch (e) {
    console.warn(`[rate-limit] pg store failed, falling back to memory: ${e instanceof Error ? e.message : e}`)
    return memoryRateLimit(key, limit, windowMs)
  }
}

export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "rate limit exceeded", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  )
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
  }, 60_000).unref?.()
}
