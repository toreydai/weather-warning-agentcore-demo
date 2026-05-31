import { NextRequest, NextResponse } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { getDb } from "@/lib/db"
import { oauthToken } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { createHash } from "crypto"
import { evictTokenCache } from "@/lib/oauth"

export async function POST(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    let token = ""
    const ct = req.headers.get("content-type") ?? ""
    if (ct.includes("application/json")) {
      const body = await req.json() as { token?: string }
      token = body.token ?? ""
    } else {
      const text = await req.text()
      for (const pair of text.split("&")) {
        const [k, v] = pair.split("=").map(decodeURIComponent)
        if (k === "token") token = v ?? ""
      }
    }

    if (!token) {
      return NextResponse.json({ error: "invalid_request", error_description: "token required" }, { status: 400 })
    }

    const hash = createHash("sha256").update(token).digest("hex")
    evictTokenCache(hash)

    await getDb().update(oauthToken)
      .set({ revoked_at: new Date() })
      .where(eq(oauthToken.token_hash, hash))

    // RFC 7009: always return 200 even if token not found
    return NextResponse.json({ ok: true })
  })
}
