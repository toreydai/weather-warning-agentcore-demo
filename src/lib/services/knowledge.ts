import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { desc, eq } from "drizzle-orm"
import { getDb, getPool } from "@/lib/db"
import { kbDocument } from "@/lib/db/schema"
import { env, requireEnv } from "@/lib/env"

const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".pdf"])
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const EMBED_MODEL = "amazon.titan-embed-text-v2:0"
const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50

export type KbDocument = typeof kbDocument.$inferSelect

function s3Client() { return new S3Client({ region: env.AWS_REGION }) }

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    const chunk = text.slice(start, end).trim()
    if (chunk.length > 20) chunks.push(chunk)
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks
}

async function embedText(text: string): Promise<number[]> {
  const client = new BedrockRuntimeClient({ region: env.AWS_REGION })
  const res = await client.send(new InvokeModelCommand({
    modelId: EMBED_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: text }),
  }))
  return (JSON.parse(new TextDecoder().decode(res.body)) as { embedding: number[] }).embedding
}

/** 从 S3 读取文档，分块，写入 pgvector */
export async function ingestToPgvector(s3Key: string): Promise<number> {
  const bucket = requireEnv("KNOWLEDGE_BASE_BUCKET")
  const pool = getPool()
  try {
    const obj = await s3Client().send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }))
    const text = await obj.Body!.transformToString("utf-8")
    const chunks = chunkText(text)
    await pool.query("DELETE FROM kb_chunk WHERE s3_key=$1", [s3Key])
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await embedText(chunks[i])
      await pool.query(
        "INSERT INTO kb_chunk(s3_key, chunk_index, content, embedding) VALUES($1,$2,$3,$4::vector)",
        [s3Key, i, chunks[i], JSON.stringify(embedding)]
      )
    }
    return chunks.length
  } catch (e) {
    console.error(`[ingestToPgvector] failed for ${s3Key}:`, e)
    throw e
  }
}

/** 全量重新 ingest 所有文档 */
export async function ingestAllToPgvector(): Promise<number> {
  const bucket = requireEnv("KNOWLEDGE_BASE_BUCKET")
  const [seed, uploads] = await Promise.all([
    s3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "knowledge-base/" })),
    s3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "uploads/" })),
  ])
  const keys = [
    ...(seed.Contents ?? []).map(o => o.Key!),
    ...(uploads.Contents ?? []).map(o => o.Key!),
  ].filter(k => k.match(/\.(md|txt)$/i))
  let total = 0
  for (const key of keys) total += await ingestToPgvector(key)
  return total
}

export function sanitizeKbFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop()?.trim() || "document"
  return base.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_")
}

export function validateKbUpload(filename: string, size: number) {
  const safe = sanitizeKbFilename(filename)
  const ext = safe.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ""
  if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error("仅支持 .md / .txt / .pdf")
  if (size <= 0) throw new Error("文件不能为空")
  if (size > MAX_UPLOAD_BYTES) throw new Error("文件不能超过 10MB")
  return safe
}

export function buildKbS3Key(filename: string): string {
  const safe = sanitizeKbFilename(filename)
  const date = new Date().toISOString().slice(0, 10)
  return `uploads/${date}/${Date.now()}-${safe}`
}

export async function putKnowledgeObject(input: { key: string; content: string; contentType?: string }): Promise<number> {
  const bucket = requireEnv("KNOWLEDGE_BASE_BUCKET")
  await s3Client().send(new PutObjectCommand({
    Bucket: bucket, Key: input.key,
    Body: new TextEncoder().encode(input.content),
    ContentType: input.contentType ?? "text/markdown; charset=utf-8",
  }))
  return ingestToPgvector(input.key)
}

export async function listKnowledgeDocuments(): Promise<Array<{ key: string; size: number; lastModified: string | null; document?: KbDocument }>> {
  const bucket = requireEnv("KNOWLEDGE_BASE_BUCKET")
  const s3 = await s3Client().send(new ListObjectsV2Command({ Bucket: bucket, Prefix: "uploads/" }))
  const docs = await getDb().select().from(kbDocument).orderBy(desc(kbDocument.uploaded_at))
  const byKey = new Map(docs.map(doc => [doc.s3_key, doc]))
  return (s3.Contents ?? []).filter(obj => obj.Key).map(obj => ({
    key: obj.Key!,
    size: obj.Size ?? 0,
    lastModified: obj.LastModified?.toISOString() ?? null,
    document: byKey.get(obj.Key!),
  }))
}

export async function uploadKnowledgeDocument(input: { filename: string; contentType: string; bytes: Uint8Array; uploadedBy: string }) {
  const filename = validateKbUpload(input.filename, input.bytes.byteLength)
  const bucket = requireEnv("KNOWLEDGE_BASE_BUCKET")
  const key = buildKbS3Key(filename)
  await s3Client().send(new PutObjectCommand({
    Bucket: bucket, Key: key,
    Body: input.bytes,
    ContentType: input.contentType || "application/octet-stream",
  }))
  // 自动 ingest 到 pgvector（仅文本格式）
  let chunksIndexed = 0
  if (filename.match(/\.(md|txt)$/i)) {
    chunksIndexed = await ingestToPgvector(key).catch(() => 0)
  }
  const rows = await getDb().insert(kbDocument).values({
    s3_key: key, filename,
    content_type: input.contentType || null,
    size_bytes: input.bytes.byteLength,
    uploaded_by: input.uploadedBy,
    last_ingestion_job_id: `pgvector:${chunksIndexed}chunks`,
  }).returning()
  return { document: rows[0], chunksIndexed, ingestionJobId: `pgvector:${chunksIndexed}chunks` }
}

export async function deleteKnowledgeDocument(key: string) {
  const bucket = requireEnv("KNOWLEDGE_BASE_BUCKET")
  await s3Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  // 删除对应 pgvector chunks
  await getPool().query("DELETE FROM kb_chunk WHERE s3_key=$1", [key])
  await getDb().update(kbDocument).set({ deleted_at: new Date(), last_ingestion_job_id: "deleted" }).where(eq(kbDocument.s3_key, key))
  return { ok: true }
}

/** 手动全量同步（管理后台"手动同步"按钮） */
export async function startKnowledgeBaseIngestion(): Promise<string> {
  const total = await ingestAllToPgvector()
  return `pgvector:${total}chunks`
}
