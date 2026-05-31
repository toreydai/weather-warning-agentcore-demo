import { NextRequest, NextResponse } from "next/server"
import { getAllFields, createField } from "@/lib/services/weather"
import { verifyAuth } from "@/lib/auth"
import { createFieldSchema } from "@/lib/validators"
import { resolveCountyCoordinates } from "@/lib/data/administrative-divisions"
import { withHandler } from "@/lib/with-handler"
import { rateLimit, rateLimitResponse, getClientIp } from "@/lib/rate-limit"
import { initFieldWeather } from "@/lib/services/weather-fetch"
import { dispatchEcsTask } from "@/lib/services/ecs-dispatch"
import { getAlertByCountyDate, markNeedsReview, todayChina } from "@/lib/services/daily-alert"
import { env } from "@/lib/env"

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const fields = await getAllFields()
    return NextResponse.json(fields)
  })
}

export async function POST(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    const rl = await rateLimit(`fields:write:${getClientIp(req)}`, 30, 60_000)
    if (!rl.ok) return rateLimitResponse(rl.retryAfter)
    const body = await req.json()
    const parsed = createFieldSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    const d = parsed.data
    const resolvedCoordinates = d.latitude == null || d.longitude == null
      ? resolveCountyCoordinates({ code: d.admin_code, name: d.county })
      : undefined
    if ((d.latitude == null || d.longitude == null) && !resolvedCoordinates) {
      return NextResponse.json({ error: { latitude: ["无法根据县/旗解析坐标"] } }, { status: 400 })
    }
    const f = await createField({
      name: d.name,
      latitude: d.latitude ?? resolvedCoordinates!.latitude,
      longitude: d.longitude ?? resolvedCoordinates!.longitude,
      area_mu: d.area_mu ?? null,
      variety: d.variety ?? null,
      planting_date: d.planting_date ?? null,
      region: d.region ?? "xilinhaote",
      province: d.province ?? null,
      city: d.city ?? null,
      county: d.county ?? null,
      township: d.township ?? null,
      admin_code: d.admin_code ?? null,
      address: d.address ?? null,
    })
    // 异步拉取历史+预报数据，不阻塞响应
    void initFieldWeather({ id: f.id, latitude: f.latitude, longitude: f.longitude })
    // 异步派发 ECS job 回填 ERA5 历史数据并计算累计 GDD/降水
    void dispatchEcsTask("scripts/backfill-historical.ts", ["--field", String(f.id)])
    // 触发当天该县预警重算（若已生成草稿）或标记需复核（若已审核/发布）
    if (env.FEATURE_DAILY_ALERT) {
      const countyCode = f.admin_code ?? f.county ?? null
      if (countyCode) {
        void (async () => {
          const today = todayChina()
          const existing = await getAlertByCountyDate(countyCode, today)
          if (!existing) return
          if (existing.status === "draft") {
            await dispatchEcsTask("scripts/generate-daily-alert.ts", [`--county=${countyCode}`, `--date=${today}`])
          } else {
            await markNeedsReview(countyCode, today)
          }
        })()
      }
    }
    return NextResponse.json(f, { status: 201 })
  })
}
