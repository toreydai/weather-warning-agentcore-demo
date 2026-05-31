import { NextRequest, NextResponse } from "next/server"
import { getForecast } from "@/lib/services/weather"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const { id } = await params
    const forecast = await getForecast(parseInt(id))
    return NextResponse.json(forecast)
  })
}
