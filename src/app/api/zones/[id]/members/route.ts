import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"
import { addZoneMemberSchema } from "@/lib/validators"
import { getZoneById, addZoneMember, getZoneWithMembers, MEMBER_LIMIT } from "@/lib/services/zone"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const user = await requireAdmin()
    if (user instanceof NextResponse) return user
    const { id } = await params
    const zoneId = Number(id)
    const z = await getZoneById(zoneId)
    if (!z) return NextResponse.json({ error: "not found" }, { status: 404 })
    const body = await req.json()
    const parsed = addZoneMemberSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    const existing = await getZoneWithMembers(zoneId)
    if (existing && existing.members.length >= MEMBER_LIMIT) {
      return NextResponse.json({ error: `每个产区最多 ${MEMBER_LIMIT} 个成员` }, { status: 400 })
    }
    try {
      const member = await addZoneMember({ zone_id: zoneId, ...parsed.data })
      return NextResponse.json(member, { status: 201 })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "操作失败"
      return NextResponse.json({ error: msg }, { status: 409 })
    }
  })
}
