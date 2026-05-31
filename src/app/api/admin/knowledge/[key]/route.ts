import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { env } from "@/lib/env"
import { deleteKnowledgeDocument } from "@/lib/services/knowledge"

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!env.FEATURE_KB_UPLOAD) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const { key } = await params
  try {
    const result = await deleteKnowledgeDocument(decodeURIComponent(key))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

