import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { getPool } from "@/lib/db"

export async function GET(req: Request) {
  const auth = await verifyAuth(req as never)
  if (!auth || auth.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const r = await getPool().query("SELECT id,started_at,finished_at,total,passed,failed,critical_failed,avg_latency_ms,p95_latency_ms FROM eval_run ORDER BY started_at DESC LIMIT 10")
  return NextResponse.json(r.rows)
}
