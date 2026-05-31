import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"
import { removeZoneMember } from "@/lib/services/zone"

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const user = await requireAdmin()
    if (user instanceof NextResponse) return user
    const { memberId } = await params
    const ok = await removeZoneMember(Number(memberId))
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  })
}
