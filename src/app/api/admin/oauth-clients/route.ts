import { NextRequest, NextResponse } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { requireAdmin } from "@/lib/auth"
import { getDb } from "@/lib/db"
import { oauthClient } from "@/lib/db/schema"
import { asc } from "drizzle-orm"
import { generateClientId, generateClientSecret, hashSecret } from "@/lib/oauth"
import { logAudit } from "@/lib/services/audit"

export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const clients = await getDb().select({
    id: oauthClient.id,
    client_id: oauthClient.client_id,
    name: oauthClient.name,
    scopes: oauthClient.scopes,
    field_ids: oauthClient.field_ids,
    zone_ids: oauthClient.zone_ids,
    rate_limit: oauthClient.rate_limit,
    is_active: oauthClient.is_active,
    revoked_at: oauthClient.revoked_at,
    created_at: oauthClient.created_at,
  }).from(oauthClient).orderBy(asc(oauthClient.id))

  return NextResponse.json(clients)
}

export async function POST(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const admin = await requireAdmin()
    if (admin instanceof NextResponse) return admin

    const body = await req.json() as {
      name?: string
      scopes?: string[]
      field_ids?: number[] | null
      zone_ids?: number[] | null
      rate_limit?: number
    }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name 必填" }, { status: 400 })
    }

    const clientId = generateClientId()
    const rawSecret = generateClientSecret()
    const secretHash = hashSecret(rawSecret)
    const scopes = body.scopes?.length ? body.scopes : ["read"]
    const rateLimit = Math.max(1, Math.min(1000, body.rate_limit ?? 60))

    const rows = await getDb().insert(oauthClient).values({
      client_id: clientId,
      client_secret_hash: secretHash,
      name: body.name.trim(),
      scopes: JSON.stringify(scopes),
      field_ids: body.field_ids?.length ? JSON.stringify(body.field_ids) : null,
      zone_ids: body.zone_ids?.length ? JSON.stringify(body.zone_ids) : null,
      rate_limit: rateLimit,
      created_by: (admin as { name: string; id?: number }).id,
    }).returning()

    await logAudit({ username: admin.name, action: "create_oauth_client", targetType: "oauth_client", targetId: rows[0].id })

    return NextResponse.json({ ...rows[0], client_secret: rawSecret }, { status: 201 })
  })
}
