import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { asc } from "drizzle-orm"
import { hashSync } from "bcryptjs"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/services/audit"

export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const users = await getDb().select({ id: user.id, username: user.username, role: user.role, is_active: user.is_active, must_change_password: user.must_change_password, last_login_at: user.last_login_at, created_at: user.created_at }).from(user).orderBy(asc(user.id))
  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { username, password, role } = await req.json()
  if (!username || !password) return NextResponse.json({ error: "用户名和密码必填" }, { status: 400 })
  try {
    const rows = await getDb().insert(user).values({ username, password_hash: hashSync(password, 10), role: role ?? "farmer" }).returning()
    await logAudit({ username: admin.name, action: "create_user", targetType: "user", targetId: rows[0].id })
    return NextResponse.json(rows[0], { status: 201 })
  } catch {
    return NextResponse.json({ error: "用户名已存在" }, { status: 409 })
  }
}
