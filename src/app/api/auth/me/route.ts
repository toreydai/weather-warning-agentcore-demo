import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const session = await verifyAuth(req)
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    return NextResponse.json({ username: session.username, role: session.role })
  })
}
