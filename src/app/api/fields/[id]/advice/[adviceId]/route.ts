import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { farmingAdviceRecord } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { verifyAuth } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ adviceId: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const session = await verifyAuth(req)
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { adviceId } = await params
    const body = await req.json()
    const rows = await getDb().update(farmingAdviceRecord).set({
      summary: body.summary, fertilizer: body.fertilizer, pesticide: body.pesticide,
      irrigation: body.irrigation, field_work: body.field_work,
      source: "manual", updated_at: new Date(),
    }).where(eq(farmingAdviceRecord.id, parseInt(adviceId))).returning()
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(rows[0])
  })
}
