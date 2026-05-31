import { NextRequest, NextResponse } from "next/server"
import { getPool } from "@/lib/db"
import { verifyAuth } from "@/lib/auth"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifyAuth(req)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const fieldId = parseInt(id)
  const yearsParam = req.nextUrl.searchParams.get("years") ?? ""
  const years = yearsParam.split(",").map(Number).filter(y => y > 2000 && y <= new Date().getFullYear())
  if (!years.length) return NextResponse.json({})

  const pool = getPool()
  const placeholders = years.map((_, i) => `$${i + 2}`).join(",")
  const rows = await pool.query<{ date: string; year: number; gdd_cumulative: string; precip_cumulative: string }>(
    `SELECT date, year, gdd_cumulative::text, precip_cumulative::text
     FROM field_daily_cumulative
     WHERE field_id=$1 AND year IN (${placeholders})
     ORDER BY date`,
    [fieldId, ...years]
  )

  const result: Record<number, { date: string; gdd: number; precip: number }[]> = {}
  for (const row of rows.rows) {
    if (!result[row.year]) result[row.year] = []
    result[row.year].push({ date: row.date, gdd: parseFloat(row.gdd_cumulative), precip: parseFloat(row.precip_cumulative) })
  }

  return NextResponse.json(result)
}
