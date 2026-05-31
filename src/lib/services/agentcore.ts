/**
 * Agent 编排层 — 组合 router + prefetch + invoke，对外暴露 chatWithAgent / generateAdviceViaAgent
 */
import { getDb } from "@/lib/db"
import { agentMessage } from "@/lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { memoryEnabled, readMemoryHistory } from "@/lib/services/memory"
import { fastRoute, supervisorRoute } from "./router"
import { invokeSubAgent, invokeFarmingRuntime, invokeGreeting, invokeSubAgentStream, invokeGreetingStream, shouldUseAgentCoreRuntime } from "./invoke"

const HISTORY_TURNS = 10
const HISTORY_MESSAGES = HISTORY_TURNS * 2

export interface HistoryMessage { role: "user" | "assistant"; content: string }

async function loadHistoryFromDb(sessionId: string): Promise<HistoryMessage[]> {
  const rows = await getDb()
    .select({ role: agentMessage.role, content: agentMessage.content })
    .from(agentMessage)
    .where(eq(agentMessage.session_id, sessionId))
    .orderBy(desc(agentMessage.created_at))
    .limit(HISTORY_MESSAGES)
  return rows
    .filter(r => r.role === "user" || r.role === "assistant")
    .map(r => ({ role: r.role as "user" | "assistant", content: r.content }))
    .reverse()
}

async function loadHistory(sessionId?: string, actorId?: string): Promise<HistoryMessage[]> {
  if (!sessionId) return []
  if (!memoryEnabled() || !actorId) return loadHistoryFromDb(sessionId)
  const t0 = Date.now()
  try {
    const memRows = await readMemoryHistory(sessionId, actorId)
    console.log(`[memory] read session=${sessionId} actor=${actorId} mem=${memRows.length} latency=${Date.now() - t0}ms`)
    return memRows
  } catch (e) {
    console.warn(`[memory] read failed, falling back to PG: ${e instanceof Error ? e.message : e}`)
    return loadHistoryFromDb(sessionId)
  }
}

export async function loadChatHistory(sessionId: string, actorId: string): Promise<{ messages: HistoryMessage[]; source: "memory" | "pg" }> {
  if (memoryEnabled()) {
    try {
      return { messages: await readMemoryHistory(sessionId, actorId), source: "memory" }
    } catch {
      return { messages: await loadHistoryFromDb(sessionId), source: "pg" }
    }
  }
  return { messages: await loadHistoryFromDb(sessionId), source: "pg" }
}

export interface AgentAdviceResult {
  growth_stage: string; summary: string; fertilizer: string; pesticide: string
  irrigation: string; field_work: string
}

export async function generateAdviceViaAgent(fieldId: number, weekStart: string): Promise<AgentAdviceResult | null> {
  try {
    const text = await invokeSubAgent("farming-advisor", `为地块${fieldId}生成${weekStart}这周的田间管理建议。必须只返回一个JSON对象，不要其他文字：{"growth_stage":"阶段","summary":"摘要","fertilizer":"施肥建议","pesticide":"防治建议","irrigation":"灌溉建议","field_work":"田间管理"}`, fieldId)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    return JSON.parse(match[0])
  } catch { return null }
}

export async function chatWithAgent(message: string, fieldId?: number, sessionId?: string, actorId?: string): Promise<{ reply: string; sessionId: string }> {
  const sid = sessionId ?? `chat-${Date.now()}`
  try {
    if (/^(你好|hi|hello|嗨|hey|您好|早上好|下午好|晚上好|在吗)/i.test(message.trim())) {
      return { reply: await invokeGreeting(message), sessionId: sid }
    }

    const [route, history] = await Promise.all([
      Promise.resolve(fastRoute(message)).then(r => r ?? supervisorRoute(message, fieldId)),
      loadHistory(sessionId, actorId),
    ])
    const results = await Promise.all(route.agents.map(a => {
      if (a === "farming-advisor") {
        if (shouldUseAgentCoreRuntime(a, route.task || message)) {
          return invokeFarmingRuntime(route.task || message, fieldId, sessionId, history).catch(e => `[agentcore错误: ${e instanceof Error ? e.message : e}]`)
        }
        return invokeSubAgent(a, route.task || message, fieldId, history).catch(e => `[${a}错误: ${e instanceof Error ? e.message : e}]`)
      }
      return invokeSubAgent(a, route.task || message, fieldId, history).catch(e => `[${a}错误: ${e instanceof Error ? e.message : e}]`)
    }))
    return { reply: results.length === 1 ? results[0] : results.join("\n\n---\n\n"), sessionId: sid }
  } catch (e) {
    return { reply: `Agent调用失败: ${e instanceof Error ? e.message : "未知错误"}`, sessionId: sid }
  }
}

/** 流式版本 — 返回 AsyncGenerator<string> */
export async function* chatWithAgentStream(message: string, fieldId?: number, sessionId?: string, actorId?: string): AsyncGenerator<string, { reply: string; sessionId: string }> {
  const sid = sessionId ?? `chat-${Date.now()}`
  let full = ""

  if (/^(你好|hi|hello|嗨|hey|您好|早上好|下午好|晚上好|在吗)/i.test(message.trim())) {
    for await (const chunk of invokeGreetingStream(message)) {
      full += chunk
      yield chunk
    }
    return { reply: full, sessionId: sid }
  }

  const [route, history] = await Promise.all([
    Promise.resolve(fastRoute(message)).then(r => r ?? supervisorRoute(message, fieldId)),
    loadHistory(sessionId, actorId),
  ])

  const task = route.task || message

  for (const [idx, agent] of route.agents.entries()) {
    if (idx > 0) {
      const separator = "\n\n---\n\n"
      full += separator
      yield separator
    }

    try {
      // AgentCore Runtime 不支持流式，走非流式回退
      if (shouldUseAgentCoreRuntime(agent, task)) {
        const reply = await invokeFarmingRuntime(task, fieldId, sessionId, history)
        full += reply
        yield reply
        continue
      }

      for await (const chunk of invokeSubAgentStream(agent, task, fieldId, history)) {
        full += chunk
        yield chunk
      }
    } catch (e) {
      const reply = `[${agent}错误: ${e instanceof Error ? e.message : e}]`
      full += reply
      yield reply
    }
  }
  return { reply: full, sessionId: sid }
}
