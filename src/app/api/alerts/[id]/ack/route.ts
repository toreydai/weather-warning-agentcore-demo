import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { alert } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rows = await getDb().select().from(alert).where(eq(alert.id, parseInt(id)))
  if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const desc = rows[0].description?.startsWith("[已确认]") ? rows[0].description : `[已确认] ${rows[0].description ?? ""}`
  await getDb().update(alert).set({ description: desc }).where(eq(alert.id, parseInt(id)))
  return NextResponse.json({ ok: true })
}
