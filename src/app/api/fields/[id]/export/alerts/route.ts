import { NextRequest, NextResponse } from "next/server"
import { getAlerts } from "@/lib/services/alert"
import { withHandler } from "@/lib/with-handler"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const { id } = await params
    const data = await getAlerts(parseInt(id))
    const header = "日期,类型,级别,标题,描述,开始日期,结束日期"
    const rows = data.map(a => `${a.date},${a.type},${a.severity},"${a.title}","${(a.description ?? "").replace(/"/g, '""')}",${a.start_date ?? ""},${a.end_date ?? ""}`)
    const csv = "\uFEFF" + [header, ...rows].join("\n")
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="alerts_${id}.csv"` } })
  })
}
