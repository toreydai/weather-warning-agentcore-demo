import { NextRequest, NextResponse } from "next/server"
import { verifyAuth, requireReviewer } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"
import { updateZoneSchema } from "@/lib/validators"
import { getZoneWithMembers, updateZone, deleteZone } from "@/lib/services/zone"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const { id } = await params
    const z = await getZoneWithMembers(Number(id))
    if (!z) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json(z)
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const user = await requireReviewer()
    if (user instanceof NextResponse) return user
    const { id } = await params
    const body = await req.json()
    const parsed = updateZoneSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    const z = await updateZone(Number(id), parsed.data)
    if (!z) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json(z)
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const user = await requireReviewer()
    if (user instanceof NextResponse) return user
    const { id } = await params
    const ok = await deleteZone(Number(id))
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json({ ok: true })
  })
}
