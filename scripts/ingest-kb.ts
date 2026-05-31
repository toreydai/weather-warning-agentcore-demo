#!/usr/bin/env npx tsx
/**
 * scripts/ingest-kb.ts
 * 从 S3 读取知识库文档，分块，调 Bedrock Embeddings，存入 RDS pgvector
 *
 * 用法：
 *   npx tsx scripts/ingest-kb.ts              # 全量 ingest
 *   npx tsx scripts/ingest-kb.ts --key uploads/2026-04-15/xxx.md  # 指定文件
 */

import { Pool } from "pg"
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" })
const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" })

const BUCKET = process.env.KNOWLEDGE_BASE_BUCKET!
const CHUNK_SIZE = 500      // 字符数
const CHUNK_OVERLAP = 50
const EMBED_MODEL = "amazon.titan-embed-text-v2:0"
const EMBED_DIM = 1024  // Titan Embed v2 输出 1024 维

const keyFilter = (() => { const i = process.argv.indexOf("--key"); return i >= 0 ? process.argv[i + 1] : null })()

function chunkText(text: string): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length)
    chunks.push(text.slice(start, end).trim())
    start += CHUNK_SIZE - CHUNK_OVERLAP
  }
  return chunks.filter(c => c.length > 20)
}

async function embed(text: string): Promise<number[]> {
  const res = await bedrock.send(new InvokeModelCommand({
    modelId: EMBED_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: text }),
  }))
  const body = JSON.parse(new TextDecoder().decode(res.body))
  return body.embedding as number[]
}

async function ingestKey(key: string) {
  console.log(`  Fetching s3://${BUCKET}/${key}`)
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const text = await obj.Body!.transformToString("utf-8")
  const chunks = chunkText(text)
  console.log(`  ${chunks.length} chunks`)

  // 删旧 chunks
  await pool.query("DELETE FROM kb_chunk WHERE s3_key=$1", [key])

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embed(chunks[i])
    await pool.query(
      "INSERT INTO kb_chunk(s3_key, chunk_index, content, embedding) VALUES($1,$2,$3,$4::vector)",
      [key, i, chunks[i], JSON.stringify(embedding)]
    )
    process.stdout.write(".")
  }
  console.log(` done`)
}

async function main() {
  if (!BUCKET) throw new Error("KNOWLEDGE_BASE_BUCKET not set")

  let keys: string[]
  if (keyFilter) {
    keys = [keyFilter]
  } else {
    // 只处理 knowledge-base/ 前缀下的文档（种子文档），以及 uploads/ 下的用户上传
    const [seed, uploads] = await Promise.all([
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "knowledge-base/" })),
      s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "uploads/" })),
    ])
    keys = [
      ...(seed.Contents ?? []).map(o => o.Key!),
      ...(uploads.Contents ?? []).map(o => o.Key!),
    ].filter(k => k.match(/\.(md|txt)$/i))  // 暂只处理文本格式，PDF 需解析库支持
  }

  console.log(`Ingesting ${keys.length} file(s) into pgvector...`)
  for (const key of keys) {
    await ingestKey(key)
  }

  // 重建索引（数据量小时 ivfflat 需要足够数据）
  const { rows } = await pool.query("SELECT COUNT(*) FROM kb_chunk")
  console.log(`\nTotal chunks: ${rows[0].count}`)
  if (parseInt(rows[0].count) >= 10) {
    console.log("Rebuilding ivfflat index...")
    await pool.query("DROP INDEX IF EXISTS idx_kb_chunk_embedding")
    await pool.query("CREATE INDEX idx_kb_chunk_embedding ON kb_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)")
    console.log("Index rebuilt.")
  }

  console.log("\nDone.")
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
