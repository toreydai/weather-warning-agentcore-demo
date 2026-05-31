import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth"
import { env } from "@/lib/env"
import { listKnowledgeDocuments, uploadKnowledgeDocument } from "@/lib/services/knowledge"

export async function GET() {
  if (!env.FEATURE_KB_UPLOAD) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const docs = await listKnowledgeDocuments()
  return NextResponse.json(docs)
}

export async function POST(req: NextRequest) {
  if (!env.FEATURE_KB_UPLOAD) return NextResponse.json({ error: "feature disabled" }, { status: 404 })
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin
  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 })
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const result = await uploadKnowledgeDocument({ filename: file.name, contentType: file.type, bytes, uploadedBy: admin.name })
    return NextResponse.json(result, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 })
  }
}

