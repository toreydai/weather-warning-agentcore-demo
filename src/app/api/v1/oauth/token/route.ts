import { NextRequest, NextResponse } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { getDb } from "@/lib/db"
import { oauthClient, oauthToken } from "@/lib/db/schema"
import { eq, and, isNull } from "drizzle-orm"
import { randomBytes, createHash } from "crypto"
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit"

function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

function parseCredentials(req: NextRequest, body: Record<string, string>): { clientId: string; clientSecret: string } | null {
  // Support Basic auth: Authorization: Basic base64(client_id:client_secret)
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8")
    const colon = decoded.indexOf(":")
    if (colon > 0) {
      return { clientId: decoded.slice(0, colon), clientSecret: decoded.slice(colon + 1) }
    }
  }
  // Support body params
  if (body.client_id && body.client_secret) {
    return { clientId: body.client_id, clientSecret: body.client_secret }
  }
  return null
}

export async function POST(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    // IP-based rate limit: 20/min to prevent brute force
    const rl = await rateLimit(`oauth:token:${getClientIp(req)}`, 20, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfter)

    let body: Record<string, string> = {}
    const ct = req.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      body = await req.json() as Record<string, string>
    } else {
      const text = await req.text()
      for (const pair of text.split("&")) {
        const [k, v] = pair.split("=").map(decodeURIComponent)
        if (k) body[k] = v ?? ""
      }
    }

    if (body.grant_type !== "client_credentials") {
      return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 })
    }

    const creds = parseCredentials(req, body)
    if (!creds) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 })
    }

    const db = getDb()
    const clients = await db.select().from(oauthClient)
      .where(and(eq(oauthClient.client_id, creds.clientId), isNull(oauthClient.revoked_at)))

    const client = clients[0]
    if (!client || !client.is_active) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 })
    }
    if (client.client_secret_hash !== hashSecret(creds.clientSecret)) {
      return NextResponse.json({ error: "invalid_client" }, { status: 401 })
    }

    const rawToken = randomBytes(32).toString("base64url")
    const tokenHash = hashSecret(rawToken)
    const expiresAt = new Date(Date.now() + 3600_000)

    await db.insert(oauthToken).values({
      client_id: client.client_id,
      token_hash: tokenHash,
      scopes: client.scopes,
      expires_at: expiresAt,
    })

    return NextResponse.json({
      access_token: rawToken,
      token_type: "Bearer",
      expires_in: 3600,
    })
  })
}
