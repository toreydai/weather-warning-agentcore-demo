import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

type CheckResult = { name: string; ok: boolean; ms: number; error?: string; skipped?: boolean }

async function check(name: string, fn: () => Promise<unknown>, timeoutMs = 3000): Promise<CheckResult> {
  const start = Date.now()
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ])
    return { name, ok: true, ms: Date.now() - start }
  } catch (e: unknown) {
    return { name, ok: false, ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) }
  }
}

function skip(name: string, reason: string): CheckResult {
  return { name, ok: false, ms: 0, skipped: true, error: reason }
}

async function checkOpenMeteo(): Promise<CheckResult> {
  return check("open-meteo", async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=116.4&daily=temperature_2m_max&forecast_days=1&timezone=Asia/Shanghai`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`status ${res.status}`)
    const body = await res.json() as { daily?: { time?: string[] } }
    if (!body.daily?.time?.length) throw new Error("unexpected response shape")
  })
}

export async function GET() {
  const required = ["DATABASE_URL", "AUTH_SECRET"] as const
  const envMissing = required.filter(k => !env[k])
  const envOk = envMissing.length === 0

  const checks = await Promise.all([
    check("db", () => getDb().execute(sql`SELECT 1`)),
    checkOpenMeteo(),
  ])
  const ok = envOk && checks.every(c => c.ok)
  return NextResponse.json(
    { ok, checks, env: { ok: envOk, missing: envMissing }, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 }
  )
}
