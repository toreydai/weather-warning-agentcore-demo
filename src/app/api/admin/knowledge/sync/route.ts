import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { env } from "@/lib/env"
import { startKnowledgeBaseIngestion } from "@/lib/services/knowledge"

export async function POST() {
  if (!env.FEATURE_KB_UPLOAD) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  try {
    const ingestionJobId = await startKnowledgeBaseIngestion()
    return NextResponse.json({ ok: true, ingestionJobId })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

