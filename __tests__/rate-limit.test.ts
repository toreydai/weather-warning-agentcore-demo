import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"
import { getClientIp, memoryRateLimit } from "@/lib/rate-limit"

describe("rateLimit", () => {
  it("uses the ALB-appended address instead of a spoofed first XFF entry", () => {
    const request = new NextRequest("https://example.com/api/auth/login", {
      headers: { "x-forwarded-for": "attacker-controlled, 203.0.113.42" },
    })
    expect(getClientIp(request)).toBe("203.0.113.42")
  })

  it("does not trust a client supplied x-real-ip fallback", () => {
    const request = new NextRequest("https://example.com/api/auth/login", {
      headers: { "x-real-ip": "203.0.113.42" },
    })
    expect(getClientIp(request)).toBe("unknown")
  })
  it("allows the first request and tracks count", () => {
    const key = `test-${Math.random()}`
    expect(memoryRateLimit(key, 3, 1000).ok).toBe(true)
    expect(memoryRateLimit(key, 3, 1000).ok).toBe(true)
    expect(memoryRateLimit(key, 3, 1000).ok).toBe(true)
  })

  it("rejects once limit is exceeded in the window", () => {
    const key = `test-${Math.random()}`
    memoryRateLimit(key, 2, 1000)
    memoryRateLimit(key, 2, 1000)
    const r = memoryRateLimit(key, 2, 1000)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.retryAfter).toBeGreaterThan(0)
  })

  it("resets after window elapses", async () => {
    const key = `test-${Math.random()}`
    memoryRateLimit(key, 1, 50)
    expect(memoryRateLimit(key, 1, 50).ok).toBe(false)
    await new Promise(r => setTimeout(r, 70))
    expect(memoryRateLimit(key, 1, 50).ok).toBe(true)
  })

  it("independent keys do not share buckets", () => {
    const k1 = `test-${Math.random()}`
    const k2 = `test-${Math.random()}`
    expect(memoryRateLimit(k1, 1, 1000).ok).toBe(true)
    expect(memoryRateLimit(k1, 1, 1000).ok).toBe(false)
    expect(memoryRateLimit(k2, 1, 1000).ok).toBe(true)
  })
})
