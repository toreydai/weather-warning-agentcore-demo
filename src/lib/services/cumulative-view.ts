import { cache } from "react"
import { getPool } from "@/lib/db"

export interface CumulativeRow {
  date: string
  year: number
  doy: number
  gdd_cumulative: number
  precip_cumulative: number
}

export const getCumulativeByYear = cache(async (fieldId: number, years: number[]): Promise<Record<number, CumulativeRow[]>> => {
  if (!years.length) return {}
  const pool = getPool()
  const placeholders = years.map((_, i) => `$${i + 2}`).join(",")
  const rows = await pool.query<CumulativeRow>(
    `SELECT date, year, doy, gdd_cumulative::float, precip_cumulative::float
     FROM field_daily_cumulative
     WHERE field_id=$1 AND year IN (${placeholders})
     ORDER BY date`,
    [fieldId, ...years]
  )
  const result: Record<number, CumulativeRow[]> = {}
  for (const row of rows.rows) {
    if (!result[row.year]) result[row.year] = []
    result[row.year].push(row)
  }
  return result
})
