import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { compare } from "bcryptjs"
import { createAccessToken, issueRefreshToken, setAuthCookies, clearAuthCookies, revokeRefreshToken } from "@/lib/auth"
import { logAudit } from "@/lib/services/audit"
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit"

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()
  if (!username || !password) return NextResponse.json({ error: "username and password required" }, { status: 400 })

  const rl = await rateLimit(`login:${getClientIp(req)}:${username}`, 10, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const rows = await getDb().select().from(user).where(eq(user.username, username))
  const u = rows[0]
  if (!u || !u.is_active) {
    await logAudit({ username: username ?? "unknown", action: "login_failed", detail: "invalid credentials" }).catch(() => {})
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 })
  }
  const valid = await compare(password, u.password_hash)
  if (!valid) {
    await logAudit({ username, action: "login_failed", detail: "wrong password" }).catch(() => {})
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 })
  }
  await logAudit({ userId: u.id, username: u.username, action: "login_success" }).catch(() => {})
  const access = await createAccessToken(u.username, u.role, u.id, u.must_change_password)
  const refresh = await issueRefreshToken(u.id)
  const res = NextResponse.json({ ok: true, username: u.username, role: u.role })
  setAuthCookies(res, access, refresh)
  return res
}

export async function DELETE(req: NextRequest) {
  const raw = req.cookies.get("refresh_token")?.value
  if (raw) await revokeRefreshToken(raw).catch(() => {})
  const res = NextResponse.json({ ok: true })
  clearAuthCookies(res)
  return res
}
