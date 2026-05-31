import { NextRequest, NextResponse } from "next/server"
import { chatWithAgent } from "@/lib/services/agentcore"
import { getDb } from "@/lib/db"
import { agentSession, agentMessage } from "@/lib/db/schema"
import { verifyAuth } from "@/lib/auth"
import { logAudit } from "@/lib/services/audit"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"
import { reqLogger } from "@/lib/logger"
import { emitMetric } from "@/lib/metrics"
import { appendMemoryTurn, memoryEnabled, shouldPersistPgTranscript } from "@/lib/services/memory"
import { chatSchema } from "@/lib/validators"

export async function POST(req: NextRequest) {
  const log = reqLogger(req)
  const auth = await verifyAuth(req)
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const rl = await rateLimit(`chat:${auth.username}`, 20, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const raw = await req.json()
  const parsed = chatSchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  const { message, fieldId, sessionId } = parsed.data

  await logAudit({ username: auth.username, action: "agent_chat", targetType: fieldId ? "field" : undefined, targetId: fieldId, detail: message.slice(0, 200) }).catch(() => {})

  const start = Date.now()
  log.info({ username: auth.username, fieldId, msgLen: message.length }, "chat.start")
  try {
    const result = await chatWithAgent(message, fieldId, sessionId, auth.username)
    const latency = Date.now() - start
    try {
      if (!sessionId) {
        await getDb().insert(agentSession).values({ session_id: result.sessionId, field_id: fieldId ?? null })
      }
      if (shouldPersistPgTranscript()) {
        await getDb().insert(agentMessage).values([
          { session_id: result.sessionId, role: "user", content: message, agent_name: "supervisor" },
          { session_id: result.sessionId, role: "assistant", content: result.reply, agent_name: "supervisor", latency_ms: latency },
        ])
      }
    } catch (dbErr) {
      log.warn({ err: dbErr }, "chat.persist_failed")
    }
    if (memoryEnabled()) {
      const memStart = Date.now()
      appendMemoryTurn(result.sessionId, auth.username, message, result.reply)
        .then(() => log.info({ sessionId: result.sessionId, latency: Date.now() - memStart }, "chat.memory_write_ok"))
        .catch(err => log.warn({ err, sessionId: result.sessionId }, "chat.memory_write_failed"))
    }
    emitMetric("Weather Warning/Chat", [
      { name: "Latency", value: latency, unit: "Milliseconds" },
      { name: "Success", value: 1, unit: "Count" },
      { name: "ReplyLength", value: result.reply.length, unit: "Count" },
    ], { Service: "chat" })
    log.info({ username: auth.username, latency, replyLen: result.reply.length }, "chat.ok")
    return NextResponse.json(result)
  } catch (e: unknown) {
    const latency = Date.now() - start
    emitMetric("Weather Warning/Chat", [
      { name: "Latency", value: latency, unit: "Milliseconds" },
      { name: "Failure", value: 1, unit: "Count" },
    ], { Service: "chat" })
    log.error({ err: e, latency }, "chat.failed")
    return NextResponse.json({ error: "Agent invocation failed" }, { status: 500 })
  }
}
