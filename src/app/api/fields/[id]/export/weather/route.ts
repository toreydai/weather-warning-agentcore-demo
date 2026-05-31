import { NextRequest, NextResponse } from "next/server"
import { getDailyWeather } from "@/lib/services/weather"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const { id } = await params
    const url = new URL(req.url)
    const data = await getDailyWeather(parseInt(id), url.searchParams.get("start") ?? undefined, url.searchParams.get("end") ?? undefined)
    const header = "日期,最高温(°C),最低温(°C),均温(°C),降水(mm),风速(km/h),湿度(%),天气代码"
    const rows = data.map(d => `${d.date},${d.temp_max ?? ""},${d.temp_min ?? ""},${d.temp_mean ?? ""},${d.precipitation ?? ""},${d.wind_speed_max ?? ""},${d.humidity ?? ""},${d.weather_code ?? ""}`)
    const csv = "\uFEFF" + [header, ...rows].join("\n")
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="weather_${id}.csv"` } })
  })
}
