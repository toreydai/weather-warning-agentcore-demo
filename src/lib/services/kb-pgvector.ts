/**
 * pgvector 知识库检索，替代 Bedrock Knowledge Base + AOSS
 */
import { getPool } from "@/lib/db"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"

const EMBED_MODEL = "amazon.titan-embed-text-v2:0"

async function embedQuery(text: string): Promise<number[]> {
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" })
  const res = await client.send(new InvokeModelCommand({
    modelId: EMBED_MODEL,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify({ inputText: text }),
  }))
  const body = JSON.parse(new TextDecoder().decode(res.body))
  return body.embedding as number[]
}

export async function searchKbPgvector(query: string, limit = 3): Promise<string[]> {
  try {
    const embedding = await embedQuery(query)
    const pool = getPool()
    const { rows } = await pool.query<{ content: string }>(
      `SELECT content FROM kb_chunk
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    )
    return rows.map(r => r.content)
  } catch (e) {
    console.error("[searchKbPgvector] error:", e)
    return []
  }
}
