import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { farmingAdviceRecord } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireAgronomist } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"

export async function POST(req: NextRequest, { params }: { params: Promise<{ adviceId: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const session = await requireAgronomist()
    if (session instanceof NextResponse) return session
    const { adviceId } = await params
    const rows = await getDb().update(farmingAdviceRecord).set({
      reviewed_by: session.name, reviewed_at: new Date(),
    }).where(eq(farmingAdviceRecord.id, parseInt(adviceId))).returning()
    if (!rows[0]) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json(rows[0])
  })
}
