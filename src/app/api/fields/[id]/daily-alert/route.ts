import { NextRequest, NextResponse } from "next/server"
import { env } from "@/lib/env"
import { getPublishedDailyAlertForField, todayChina } from "@/lib/services/daily-alert"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    if (!env.FEATURE_DAILY_ALERT) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
    const { id } = await params
    const date = new URL(req.url).searchParams.get("date") ?? todayChina()
    const alert = await getPublishedDailyAlertForField(parseInt(id), date)
    return NextResponse.json(alert ?? null)
  })
}
