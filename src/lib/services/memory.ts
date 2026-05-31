import { BedrockAgentCoreClient, CreateEventCommand, ListEventsCommand } from "@aws-sdk/client-bedrock-agentcore"

const MEMORY_ID = process.env.CHAT_MEMORY_ID ?? ""
const HISTORY_TURNS = 10
const HISTORY_MESSAGES = HISTORY_TURNS * 2

const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? "us-east-1" })

export interface MemoryTurn { role: "user" | "assistant"; content: string }

export function memoryEnabled(): boolean {
  return MEMORY_ID !== ""
}

export function shouldPersistPgTranscript(): boolean {
  const mode = process.env.CHAT_PG_TRANSCRIPT_MODE ?? "fallback"
  if (mode === "dual") return true
  if (mode === "off") return false
  return !memoryEnabled()
}

export async function readMemoryHistory(sessionId: string, actorId: string): Promise<MemoryTurn[]> {
  if (!MEMORY_ID || !sessionId) return []
  const res = await client.send(new ListEventsCommand({
    memoryId: MEMORY_ID,
    sessionId,
    actorId,
    includePayloads: true,
    maxResults: HISTORY_TURNS,
  }))
  const events = (res.events ?? []).slice().sort((a, b) => {
    const ta = a.eventTimestamp ? new Date(a.eventTimestamp).getTime() : 0
    const tb = b.eventTimestamp ? new Date(b.eventTimestamp).getTime() : 0
    return ta - tb
  })
  const turns: MemoryTurn[] = []
  for (const ev of events) {
    for (const p of ev.payload ?? []) {
      const c = p.conversational
      if (!c) continue
      const role = c.role === "USER" ? "user" : c.role === "ASSISTANT" ? "assistant" : null
      const text = c.content && "text" in c.content ? c.content.text : undefined
      if (role && text) turns.push({ role, content: text })
    }
  }
  return turns.slice(-HISTORY_MESSAGES)
}

export async function appendMemoryTurn(
  sessionId: string,
  actorId: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  if (!MEMORY_ID || !sessionId) return
  if (!userMsg || !assistantMsg) return
  await client.send(new CreateEventCommand({
    memoryId: MEMORY_ID,
    actorId,
    sessionId,
    eventTimestamp: new Date(),
    payload: [
      { conversational: { content: { text: userMsg }, role: "USER" } },
      { conversational: { content: { text: assistantMsg }, role: "ASSISTANT" } },
    ],
  }))
}
