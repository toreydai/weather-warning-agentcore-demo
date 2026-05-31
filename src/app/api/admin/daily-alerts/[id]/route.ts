import { NextRequest, NextResponse } from "next/server"
import { requireReviewer } from "@/lib/auth"
import { env } from "@/lib/env"
import { getDailyAlertById, updateDailyAlert } from "@/lib/services/daily-alert"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!env.FEATURE_DAILY_ALERT) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const reviewer = await requireReviewer()
  if (reviewer instanceof NextResponse) return reviewer
  const { id } = await params
  const alert = await getDailyAlertById(parseInt(id))
  if (!alert) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(alert)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!env.FEATURE_DAILY_ALERT) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const reviewer = await requireReviewer()
  if (reviewer instanceof NextResponse) return reviewer
  const { id } = await params
  const body = await req.json() as { draft_content?: string; final_content?: string; status?: "draft" | "reviewed" }
  const saved = await updateDailyAlert(parseInt(id), {
    draft_content: body.draft_content,
    final_content: body.final_content,
    status: body.status ?? "reviewed",
    reviewed_by: reviewer.name,
    reviewed_at: new Date(),
  })
  if (!saved) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(saved)
}

