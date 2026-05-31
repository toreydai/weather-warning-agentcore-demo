import { NextRequest, NextResponse } from "next/server"
import { getAlerts } from "@/lib/services/alert"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const { id } = await params
    const alerts = await getAlerts(parseInt(id))
    return NextResponse.json(alerts)
  })
}
