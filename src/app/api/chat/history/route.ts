import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { loadChatHistory } from "@/lib/services/agentcore"
import { chatSessionSchema } from "@/lib/validators"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const sessionId = new URL(req.url).searchParams.get("sessionId") ?? ""
    const parsed = chatSessionSchema.safeParse({ sessionId })
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

    const history = await loadChatHistory(parsed.data.sessionId, auth.username)
    return NextResponse.json(history)
  })
}
