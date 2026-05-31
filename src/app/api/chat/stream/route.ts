import { NextRequest, NextResponse } from "next/server"
import { chatWithAgentStream } from "@/lib/services/agentcore"
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
  log.info({ username: auth.username, fieldId, msgLen: message.length }, "chat.stream.start")

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let fullReply = ""
      let sid = sessionId ?? ""
      try {
        const gen = chatWithAgentStream(message, fieldId, sessionId, auth.username)
        let result = await gen.next()
        while (!result.done) {
          const chunk = result.value as string
          fullReply += chunk
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
          result = await gen.next()
        }
        // Generator return value has the final result
        if (result.value) {
          sid = result.value.sessionId
          fullReply = result.value.reply
        }

        // Send done event with sessionId
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, sessionId: sid })}\n\n`))

        // Persist (fire-and-forget)
        const latency = Date.now() - start
        try {
          if (!sessionId) await getDb().insert(agentSession).values({ session_id: sid, field_id: fieldId ?? null })
          if (shouldPersistPgTranscript()) {
            await getDb().insert(agentMessage).values([
              { session_id: sid, role: "user", content: message, agent_name: "supervisor" },
              { session_id: sid, role: "assistant", content: fullReply, agent_name: "supervisor", latency_ms: latency },
            ])
          }
        } catch (e) { log.warn({ err: e }, "chat.stream.persist_failed") }

        if (memoryEnabled()) {
          appendMemoryTurn(sid, auth.username, message, fullReply).catch(e => log.warn({ err: e }, "chat.stream.memory_failed"))
        }

        emitMetric("Weather Warning/Chat", [
          { name: "Latency", value: latency, unit: "Milliseconds" },
          { name: "Success", value: 1, unit: "Count" },
          { name: "ReplyLength", value: fullReply.length, unit: "Count" },
        ], { Service: "chat" })
        log.info({ username: auth.username, latency, replyLen: fullReply.length }, "chat.stream.ok")
      } catch (e) {
        const errMsg = "Agent invocation failed"
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`))
        emitMetric("Weather Warning/Chat", [
          { name: "Latency", value: Date.now() - start, unit: "Milliseconds" },
          { name: "Failure", value: 1, unit: "Count" },
        ], { Service: "chat" })
        log.error({ err: e }, "chat.stream.failed")
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  })
}
