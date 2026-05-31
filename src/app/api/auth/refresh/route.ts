import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createAccessToken, issueRefreshToken, rotateRefreshToken, setAuthCookies, clearAuthCookies } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const raw = req.cookies.get("refresh_token")?.value
  if (!raw) return NextResponse.json({ error: "no refresh token" }, { status: 401 })

  const rotated = await rotateRefreshToken(raw)
  if (!rotated) {
    const res = NextResponse.json({ error: "invalid refresh token" }, { status: 401 })
    clearAuthCookies(res)
    return res
  }

  const rows = await getDb().select().from(user).where(eq(user.id, rotated.userId))
  const u = rows[0]
  if (!u || !u.is_active) {
    const res = NextResponse.json({ error: "user inactive" }, { status: 401 })
    clearAuthCookies(res)
    return res
  }

  const access = await createAccessToken(u.username, u.role, u.id, u.must_change_password)
  const refresh = await issueRefreshToken(u.id)
  const res = NextResponse.json({ ok: true, username: u.username, role: u.role })
  setAuthCookies(res, access, refresh)
  return res
}
