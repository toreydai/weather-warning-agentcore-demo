import { NextResponse } from "next/server"
import { getPool } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"

export async function GET() {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const pool = getPool()
  const fields = (await pool.query("SELECT COUNT(*) as c FROM field")).rows[0]?.c
  const users = (await pool.query("SELECT COUNT(*) as c FROM \"user\"")).rows[0]?.c
  const alerts = (await pool.query("SELECT COUNT(*) as c FROM alert")).rows[0]?.c
  const lastFetch = (await pool.query("SELECT MAX(date) as d FROM daily_weather")).rows[0]?.d

  const alertsByType = (await pool.query("SELECT type, severity, COUNT(*) as count FROM alert GROUP BY type, severity ORDER BY type")).rows
  const recentAlerts = (await pool.query("SELECT date, type, severity, title, field_id FROM alert ORDER BY date DESC LIMIT 10")).rows

  // Alert trend (last 30 days)
  const alertTrend = (await pool.query(`
    SELECT date, COUNT(*) as count, 
      SUM(CASE WHEN severity='red' THEN 1 ELSE 0 END) as red,
      SUM(CASE WHEN severity='orange' THEN 1 ELSE 0 END) as orange,
      SUM(CASE WHEN severity='yellow' THEN 1 ELSE 0 END) as yellow
    FROM alert WHERE date >= (CURRENT_DATE - INTERVAL '30 days')::text
    GROUP BY date ORDER BY date
  `)).rows

  return NextResponse.json({ fields, users, alerts, lastFetch, alertsByType, recentAlerts, alertTrend })
}
