import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { hashSync } from "bcryptjs"
import { requireAdmin } from "@/lib/auth"
import { logAudit } from "@/lib/services/audit"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const body = await req.json()
  const updates: any = {}
  if (body.role) updates.role = body.role
  if (body.is_active !== undefined) updates.is_active = body.is_active

  const rows = await getDb().update(user).set(updates).where(eq(user.id, parseInt(id))).returning()
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await logAudit({ username: admin.name, action: "update_user", targetType: "user", targetId: parseInt(id), detail: JSON.stringify(updates) })
  return NextResponse.json(rows[0])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  const { password } = await req.json()
  if (!password || password.length < 6) return NextResponse.json({ error: "密码至少6位" }, { status: 400 })

  const rows = await getDb().update(user).set({ password_hash: hashSync(password, 10), must_change_password: true }).where(eq(user.id, parseInt(id))).returning()
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await logAudit({ username: admin.name, action: "reset_password", targetType: "user", targetId: parseInt(id) })
  return NextResponse.json({ ok: true })
}
