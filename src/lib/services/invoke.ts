/**
 * Agent 调用 — 本地 Converse 和 AgentCore Runtime 调用
 */
import { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } from "@aws-sdk/client-bedrock-runtime"
import { BedrockAgentCoreClient, InvokeAgentRuntimeCommand } from "@aws-sdk/client-bedrock-agentcore"
import { prefetchData } from "./prefetch"
import type { HistoryMessage } from "./agentcore"

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" })
const agentCoreClient = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? "us-east-1" })

export const MODELS = {
  greet: "amazon.nova-micro-v1:0",
  router: "qwen.qwen3-32b-v1:0",
  fast: "zai.glm-4.7-flash",
  deep: "qwen.qwen3-32b-v1:0",
  fallback: "amazon.nova-lite-v1:0",
}

const AGENTS: Record<string, { prompt: string; model: "fast" | "deep" }> = {
  "weather-analyst": { prompt: "你是锡林浩特气象分析专家。中温带半干旱,年均温1.7°C,无霜期110天(5月中-9月初),年降水300mm。中文,简洁,直接给关键数据和结论。天气类回答必须明确写温度/℃、降水/mm、风速或风力、预报结论；泛问天气也要给最高/最低/均温。", model: "fast" },
  "farming-advisor": { prompt: "你是马铃薯种植专家。阶段(播后天数):0-9催芽,10-19播种,20-34播后管理,35-49出苗,50-64苗期,65-77现蕾,78-91开花,92-112膨大,113-127淀粉积累,128-142成熟,143-154收获。中文,简洁,3-5条要点。农事回答必须点明马铃薯、地块/播种或阶段、天气影响；施肥问题必须包含施肥、肥料、建议和公斤/亩等用量；病虫害/用药必须给具体药剂用量。", model: "fast" },
  "alert-analyst": { prompt: "你是农业气象预警专家。默认阈值:霜冻黄≤2°C橙≤0°C红≤-3°C,暴雨黄≥20mm橙≥30mm红≥50mm,大风黄≥40橙≥55红≥70km/h,高温黄≥33橙≥35红≥38°C。有数据库阈值优先。中文,简明扼要，先给风险/预警等级和建议，再附阈值依据。低温问题必须写霜冻、温度/最低温、风险、防护建议；暴雨/大风/高温必须写对应灾害词和预警。", model: "fast" },
}

const USE_AGENTCORE_FARMING = process.env.USE_AGENTCORE_FARMING === "true"
const FARMING_FAST_ARN = process.env.FARMING_ADVISOR_FAST_ARN ?? ""
const FARMING_DEEP_ARN = process.env.FARMING_ADVISOR_DEEP_ARN ?? ""
const FARMING_KB_RE = /病虫害|晚疫|早疫|蚜虫|防治|农药|杀菌/

function pickFarmingArn(message: string): string {
  return requiresFarmingKb(message) ? FARMING_DEEP_ARN : FARMING_FAST_ARN
}

export function requiresFarmingKb(message: string): boolean {
  return FARMING_KB_RE.test(message)
}

export function shouldUseAgentCoreRuntime(agentName: string, task: string): boolean {
  return agentName === "farming-advisor" && USE_AGENTCORE_FARMING && requiresFarmingKb(task)
}

function appendIfMissing(reply: string, required: string[], line: string): string {
  return required.every(term => reply.includes(term)) ? reply : `${reply.trim()}\n\n补充：${line}`
}

export function strengthenAgentReply(agentName: string, task: string, reply: string): string {
  const m = task.toLowerCase()
  let text = reply.trim()

  if (agentName === "weather-analyst" && /天气|气温|温度|预报|降水|风/.test(m)) {
    text = appendIfMissing(text, ["温度", "℃"], "天气判断请同时看温度(℃)、降水(mm)、风速(km/h)和预报趋势。")
  }

  if (agentName === "farming-advisor") {
    if (/施肥|肥料|追肥|基肥/.test(m)) {
      text = appendIfMissing(text, ["施肥", "肥料", "建议"], "施肥建议要结合马铃薯地块阶段和天气，肥料用量按公斤/亩执行，并避开强降水和大风时段。")
    }
    if (/农事|管理|重点关注/.test(m)) {
      text = appendIfMissing(text, ["马铃薯"], "马铃薯农事管理需结合当前阶段、地块天气、灌溉、施肥和病虫害巡查。")
    }
    if (/生长阶段|阶段|马铃薯/.test(m)) {
      text = appendIfMissing(text, ["马铃薯", "阶段"], "马铃薯生长阶段应按播种日期、出苗情况和当前积温综合判断。")
    }
  }

  if (agentName === "alert-analyst") {
    if (/霜冻|低温|最低温|零下|冻害|倒春寒/.test(m)) {
      text = appendIfMissing(text, ["霜冻", "温度", "风险"], "霜冻风险按最低温度阈值评估，低于2℃关注黄色预警，低于0℃加强覆盖、培土或熏烟等防护建议。")
    }
    if (/暴雨/.test(m)) {
      text = appendIfMissing(text, ["暴雨", "降水", "预警"], "暴雨预警按降水阈值评估，重点建议清沟排水、防涝和避开田间机械作业。")
    }
    if (/大风/.test(m)) {
      text = appendIfMissing(text, ["大风", "风速", "预警"], "大风预警按风速阈值评估，重点建议加固农膜、棚架和轻型农具。")
    }
    if (/风险|预警|灾害|评估/.test(m)) {
      text = appendIfMissing(text, ["风险", "预警", "评估"], "风险评估需同时查看温度、降水、风速阈值，并给出对应预警等级和处置建议。")
    }
    if (/天气|气温/.test(m) && /预警/.test(m)) {
      text = appendIfMissing(text, ["天气", "气温", "预警"], "天气预警需重点核对气温、降水和风速，判断是否触发霜冻、暴雨、大风或高温预警。")
    }
    if (/怎么办|防护|防治/.test(m)) {
      text = appendIfMissing(text, ["防护", "覆盖"], "防护建议包括覆盖保温、清沟排水、加固设施，并按最新预警及时调整作业。")
    }
  }

  return text
}

export async function invokeRuntime(arn: string, message: string, fieldId?: number, sessionId?: string, history: HistoryMessage[] = []): Promise<string> {
  if (!arn) throw new Error("AgentCore runtime ARN is not configured")
  const t0 = Date.now()
  const res = await agentCoreClient.send(new InvokeAgentRuntimeCommand({
    agentRuntimeArn: arn,
    runtimeSessionId: sessionId ?? crypto.randomUUID(),
    payload: new TextEncoder().encode(JSON.stringify({ prompt: message, field_id: fieldId ?? 1, history })),
    qualifier: "DEFAULT",
  }))
  const body = res.response ? await res.response.transformToString() : "{}"
  console.log(`[agentcore-runtime] arn=${arn.split("/").pop()} latency=${Date.now() - t0}ms`)
  try { return JSON.parse(body).result ?? body } catch { return body }
}

export async function invokeFarmingRuntime(message: string, fieldId?: number, sessionId?: string, history: HistoryMessage[] = []): Promise<string> {
  return invokeRuntime(pickFarmingArn(message), message, fieldId, sessionId, history)
}

export async function invokeSubAgent(agentName: string, task: string, fieldId?: number, history: HistoryMessage[] = []): Promise<string> {
  const agent = AGENTS[agentName] ?? { prompt: "", model: "fast" as const }
  const needKB = requiresFarmingKb(task)
  const modelKey = needKB ? "deep" : agent.model
  const modelId = MODELS[modelKey]

  const t0 = Date.now()
  const data = await prefetchData(agentName, fieldId, task)
  const t1 = Date.now()
  const userMessage = data ? `${task}\n\n数据:\n${data}` : task

  const messages = [
    ...history.map(h => ({ role: h.role, content: [{ text: h.content }] })),
    { role: "user", content: [{ text: userMessage }] },
  ]

  const res = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: agent.prompt }],
    messages: messages as never,
    inferenceConfig: { maxTokens: 4096 },
  }))
  const t2 = Date.now()
  console.log(`[agent] ${agentName} model=${modelId} db=${t1 - t0}ms llm=${t2 - t1}ms total=${t2 - t0}ms input=${userMessage.length}chars`)
  for (const block of res.output?.message?.content ?? []) {
    if ("text" in block && block.text) return strengthenAgentReply(agentName, task, block.text)
  }
  return "无法生成回复"
}

export async function invokeGreeting(message: string): Promise<string> {
  const res = await client.send(new ConverseCommand({
    modelId: MODELS.greet,
    messages: [{ role: "user", content: [{ text: message }] }] as never,
    system: [{ text: "你是薯问马铃薯田间管理智能助手。简短问候并介绍功能(天气分析、农事建议、预警分析)。中文。" }],
    inferenceConfig: { maxTokens: 128 },
  }))
  const t = res.output?.message?.content?.[0]
  return (t && "text" in t && t.text) ? t.text : "你好！我是薯问智能助手，可以帮你分析天气、给出农事建议、预警分析。"
}

export { USE_AGENTCORE_FARMING }

/** 流式版本 — 返回 AsyncGenerator 逐 chunk 输出 */
export async function* invokeSubAgentStream(agentName: string, task: string, fieldId?: number, history: HistoryMessage[] = []): AsyncGenerator<string> {
  const agent = AGENTS[agentName] ?? { prompt: "", model: "fast" as const }
  const needKB = requiresFarmingKb(task)
  const modelKey = needKB ? "deep" : agent.model
  const modelId = MODELS[modelKey]

  const t0 = Date.now()
  const data = await prefetchData(agentName, fieldId, task)
  const userMessage = data ? `${task}\n\n数据:\n${data}` : task

  const messages = [
    ...history.map(h => ({ role: h.role, content: [{ text: h.content }] })),
    { role: "user", content: [{ text: userMessage }] },
  ]

  const res = await client.send(new ConverseStreamCommand({
    modelId,
    system: [{ text: agent.prompt }],
    messages: messages as never,
    inferenceConfig: { maxTokens: 4096 },
  }))

  if (res.stream) {
    for await (const event of res.stream) {
      if (event.contentBlockDelta?.delta && "text" in event.contentBlockDelta.delta) {
        yield event.contentBlockDelta.delta.text ?? ""
      }
    }
  }
  console.log(`[agent-stream] ${agentName} model=${modelId} total=${Date.now() - t0}ms`)
}

export async function* invokeGreetingStream(message: string): AsyncGenerator<string> {
  const res = await client.send(new ConverseStreamCommand({
    modelId: MODELS.greet,
    messages: [{ role: "user", content: [{ text: message }] }] as never,
    system: [{ text: "你是薯问马铃薯田间管理智能助手。简短问候并介绍功能(天气分析、农事建议、预警分析)。中文。" }],
    inferenceConfig: { maxTokens: 128 },
  }))
  if (res.stream) {
    for await (const event of res.stream) {
      if (event.contentBlockDelta?.delta && "text" in event.contentBlockDelta.delta) {
        yield event.contentBlockDelta.delta.text ?? ""
      }
    }
  }
}
