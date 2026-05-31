import { NextRequest, NextResponse } from "next/server"
import { getDailyWeather } from "@/lib/services/weather"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const { id } = await params
    const url = new URL(req.url)
    const days = await getDailyWeather(parseInt(id), url.searchParams.get("start") ?? undefined, url.searchParams.get("end") ?? undefined)
    return NextResponse.json(days)
  })
}
