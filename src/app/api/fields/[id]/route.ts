import { NextRequest, NextResponse } from "next/server"
import { getFieldById, updateField, deleteField } from "@/lib/services/weather"
import { verifyAuth } from "@/lib/auth"
import { updateFieldSchema } from "@/lib/validators"
import { withHandler } from "@/lib/with-handler"
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const { id } = await params
    const f = await getFieldById(parseInt(id))
    if (!f) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json(f)
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const rl = await rateLimit(`fields:write:${getClientIp(req)}`, 30, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfter)
    const { id } = await params
    const body = await req.json()
    const parsed = updateFieldSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    const f = await updateField(parseInt(id), parsed.data)
    return NextResponse.json(f)
  })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const rl = await rateLimit(`fields:write:${getClientIp(req)}`, 30, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfter)
    const { id } = await params
    await deleteField(parseInt(id))
    return NextResponse.json({ ok: true })
  })
}
