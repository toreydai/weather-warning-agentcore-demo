import { NextRequest, NextResponse } from "next/server"
import { requireReviewer } from "@/lib/auth"
import { env } from "@/lib/env"
import { publishDailyAlert } from "@/lib/services/daily-alert"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!env.FEATURE_DAILY_ALERT) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const reviewer = await requireReviewer()
  if (reviewer instanceof NextResponse) return reviewer
  const { id } = await params
  const published = await publishDailyAlert(parseInt(id), reviewer.name)
  if (!published) return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(published)
}

