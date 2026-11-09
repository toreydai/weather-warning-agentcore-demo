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
  if (typeof username !== "string" || !username || username.length > 64 ||
      typeof password !== "string" || !password || password.length > 1024) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 400 })
  }

  const accountLimit = await rateLimit(`login:account:${username.toLowerCase()}`, 20, 15 * 60_000)
  if (!accountLimit.ok) return rateLimitResponse(accountLimit.retryAfter)
  const ipLimit = await rateLimit(`login:ip:${getClientIp(req)}`, 30, 60_000)
  if (!ipLimit.ok) return rateLimitResponse(ipLimit.retryAfter)

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
