import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"
import { getDb } from "@/lib/db"
import { zoneAlert, zone } from "@/lib/db/schema"
import { eq, and, gte, lte, desc } from "drizzle-orm"

function dateChina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { id } = await params
    const zoneId = Number(id)
    const db = getDb()

    const zoneRow = await db.select().from(zone).where(eq(zone.id, zoneId)).then(r => r[0])
    if (!zoneRow) return NextResponse.json({ error: "not found" }, { status: 404 })

    const today = dateChina()
    const days = Number(req.nextUrl.searchParams.get("days") ?? "7")
    const from = req.nextUrl.searchParams.get("from") ?? today
    const to = req.nextUrl.searchParams.get("to") ?? from

    const alerts = await db.select().from(zoneAlert)
      .where(and(eq(zoneAlert.zone_id, zoneId), gte(zoneAlert.date, from), lte(zoneAlert.date, to)))
      .orderBy(desc(zoneAlert.date), desc(zoneAlert.severity))

    return NextResponse.json({ zone_id: zoneId, zone_name: zoneRow.name, date_from: from, date_to: to, alerts })
  })
}
