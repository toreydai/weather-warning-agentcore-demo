import { NextRequest, NextResponse } from "next/server"
import { verifyAuth, requireReviewer } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"
import { createZoneSchema } from "@/lib/validators"
import { getAllZones, createZone, ZONE_LIMIT } from "@/lib/services/zone"

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const zones = await getAllZones()
    return NextResponse.json(zones)
  })
}

export async function POST(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const user = await requireReviewer()
    if (user instanceof NextResponse) return user
    const body = await req.json()
    const parsed = createZoneSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    const existing = await getAllZones()
    if (existing.length >= ZONE_LIMIT) {
      return NextResponse.json({ error: `最多支持 ${ZONE_LIMIT} 个产区` }, { status: 400 })
    }
    const z = await createZone({ ...parsed.data, description: parsed.data.description ?? null })
    return NextResponse.json(z, { status: 201 })
  })
}
