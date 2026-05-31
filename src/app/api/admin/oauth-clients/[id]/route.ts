import { NextRequest, NextResponse } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { oauthClient, oauthToken } from "@/lib/db/schema"
import { eq, and, isNull, gt } from "drizzle-orm"
import { logAudit } from "@/lib/services/audit"
import { evictClientCache } from "@/lib/oauth"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const admin = await requireAdmin()
    if (admin instanceof NextResponse) return admin

    const { id } = await params
    const clientDbId = Number(id)
    const db = getDb()

    const clients = await db.select().from(oauthClient).where(eq(oauthClient.id, clientDbId))
    const client = clients[0]
    if (!client) return NextResponse.json({ error: "not found" }, { status: 404 })
    if (client.revoked_at) return NextResponse.json({ error: "already revoked" }, { status: 409 })

    const now = new Date()
    // cascade: revoke all active tokens
    await db.update(oauthToken)
      .set({ revoked_at: now })
      .where(and(
        eq(oauthToken.client_id, client.client_id),
        isNull(oauthToken.revoked_at),
        gt(oauthToken.expires_at, now),
      ))

    await db.update(oauthClient).set({ revoked_at: now, is_active: false }).where(eq(oauthClient.id, clientDbId))
    evictClientCache(client.client_id)

    await logAudit({ username: admin.name, action: "revoke_oauth_client", targetType: "oauth_client", targetId: clientDbId })

    return NextResponse.json({ ok: true })
  })
}
