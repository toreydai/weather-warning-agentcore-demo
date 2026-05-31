import { NextResponse } from "next/server"
import { getPool } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const pool = getPool()
  const recent = (await pool.query(`
    WITH ranked AS (
      SELECT id, name, started_at, finished_at, status, error, items_processed,
             ROW_NUMBER() OVER (PARTITION BY name ORDER BY started_at DESC) AS rn
      FROM cron_run
    )
    SELECT id, name, started_at, finished_at, status, error, items_processed
    FROM ranked WHERE rn <= 7
    ORDER BY name, started_at DESC
  `)).rows

  return NextResponse.json({ runs: recent })
}
