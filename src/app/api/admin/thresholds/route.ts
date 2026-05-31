import { NextRequest, NextResponse } from "next/server"
import { getAllThresholds, updateThreshold, createThreshold, deleteThreshold } from "@/lib/services/alert"
import { updateThresholdSchema, createThresholdSchema } from "@/lib/validators"
import { requireAdmin } from "@/lib/auth"

export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  return NextResponse.json(await getAllThresholds())
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await req.json()
  const parsed = createThresholdSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  try {
    const created = await createThreshold(parsed.data)
    return NextResponse.json(created, { status: 201 })
  } catch {
    return NextResponse.json({ error: "该类型和生育期的阈值已存在" }, { status: 409 })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const body = await req.json()
  const parsed = updateThresholdSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  try {
    const updated = await updateThreshold(parsed.data.id, {
      stage: parsed.data.stage ?? null,
      yellow_condition: parsed.data.yellow_condition,
      orange_condition: parsed.data.orange_condition,
      red_condition: parsed.data.red_condition,
      reference_source: parsed.data.reference_source ?? null,
      reference_note: parsed.data.reference_note ?? null,
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: "该类型和生育期的阈值已存在" }, { status: 409 })
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { id } = await req.json()
  if (typeof id !== "number") return NextResponse.json({ error: "invalid id" }, { status: 400 })
  await deleteThreshold(id)
  return NextResponse.json({ ok: true })
}
