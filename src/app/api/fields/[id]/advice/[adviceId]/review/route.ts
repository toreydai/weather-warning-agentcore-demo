import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { farmingAdviceRecord } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { requireAgronomist } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; adviceId: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const session = await requireAgronomist()
    if (session instanceof NextResponse) return session
    const { id, adviceId } = await params
    const fieldId = Number(id)
    const recordId = Number(adviceId)
    if (!Number.isSafeInteger(fieldId) || fieldId <= 0 || !Number.isSafeInteger(recordId) || recordId <= 0) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 })
    }
    const rows = await getDb().update(farmingAdviceRecord).set({
      reviewed_by: session.name, reviewed_at: new Date(),
    }).where(and(eq(farmingAdviceRecord.id, recordId), eq(farmingAdviceRecord.field_id, fieldId))).returning()
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(rows[0])
  })
}
