import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { user, passwordHistory } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { compareSync, hashSync } from "bcryptjs"
import { passwordSchema, checkPasswordHistory, getPasswordExpiresAt } from "@/lib/password-policy"
import { createAccessToken, setAccessCookie } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const session = await verifyAuth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()
  const parsed = passwordSchema.safeParse(newPassword)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const rows = await getDb().select().from(user).where(eq(user.username, session.username))
  const row = rows[0]
  if (!row || !compareSync(currentPassword, row.password_hash)) return NextResponse.json({ error: "当前密码错误" }, { status: 400 })

  // Check history
  const history = await getDb().select().from(passwordHistory).where(eq(passwordHistory.user_id, row.id)).orderBy(desc(passwordHistory.created_at)).limit(5)
  if (!checkPasswordHistory(newPassword, [row.password_hash, ...history.map(h => h.password_hash)])) {
    return NextResponse.json({ error: "不能与最近5次密码相同" }, { status: 400 })
  }

  const newHash = hashSync(newPassword, 10)
  await getDb().update(user).set({ password_hash: newHash, must_change_password: false, password_expires_at: getPasswordExpiresAt() }).where(eq(user.id, row.id))
  await getDb().insert(passwordHistory).values({ user_id: row.id, password_hash: newHash })

  const access = await createAccessToken(row.username, row.role, row.id, false)
  const res = NextResponse.json({ ok: true })
  setAccessCookie(res, access)
  return res
}
