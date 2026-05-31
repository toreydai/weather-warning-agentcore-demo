import { NextRequest, NextResponse } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { apiCallLog, oauthClient } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const admin = await requireAdmin()
    if (admin instanceof NextResponse) return admin

    const { id } = await params
    const db = getDb()

    const clients = await db.select({ client_id: oauthClient.client_id })
      .from(oauthClient).where(eq(oauthClient.id, Number(id)))
    if (!clients[0]) return NextResponse.json({ error: "not found" }, { status: 404 })

    const limit = Math.min(200, Number(req.nextUrl.searchParams.get("limit") ?? "50"))
    const logs = await db.select().from(apiCallLog)
      .where(eq(apiCallLog.client_id, clients[0].client_id))
      .orderBy(desc(apiCallLog.created_at))
      .limit(limit)

    return NextResponse.json({ client_id: clients[0].client_id, logs })
  })
}
