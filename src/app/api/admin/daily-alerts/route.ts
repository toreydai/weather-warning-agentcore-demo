import { NextRequest, NextResponse } from "next/server"
import { requireReviewer } from "@/lib/auth"
import { env } from "@/lib/env"
import { generateDailyAlertForCounty, getCountyFieldGroups, listDailyAlerts, todayChina } from "@/lib/services/daily-alert"

export async function GET(req: NextRequest) {
  if (!env.FEATURE_DAILY_ALERT) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const reviewer = await requireReviewer()
  if (reviewer instanceof NextResponse) return reviewer
  const sp = new URL(req.url).searchParams
  const rows = await listDailyAlerts({ date: sp.get("date") ?? undefined, status: sp.get("status") ?? undefined })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  if (!env.FEATURE_DAILY_ALERT) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const reviewer = await requireReviewer()
  if (reviewer instanceof NextResponse) return reviewer
  const body = await req.json().catch(() => ({})) as { date?: string }
  const date = body.date ?? todayChina()
  const groups = await getCountyFieldGroups()
  const generated = []
  for (const group of groups) generated.push(await generateDailyAlertForCounty(group, date))
  return NextResponse.json({ ok: true, count: generated.length, alerts: generated })
}

