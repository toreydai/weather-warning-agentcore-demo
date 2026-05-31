import { NextRequest, NextResponse } from "next/server"
import { getAuditLogs } from "@/lib/services/audit"
import { requireAdmin } from "@/lib/auth"

export async function GET(req: NextRequest) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const url = new URL(req.url)
  const page = parseInt(url.searchParams.get("page") ?? "1")
  const user = url.searchParams.get("user") ?? undefined
  const action = url.searchParams.get("action") ?? undefined
  return NextResponse.json(await getAuditLogs({ page, user, action }))
}
