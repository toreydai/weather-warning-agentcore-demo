/**
 * Agent 路由 — 根据用户消息决定分发到哪个 Agent
 */
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime"

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" })

const ROUTER_MODEL = "qwen.qwen3-32b-v1:0"

export interface RouteResult { agents: string[]; task: string }

/** 正则快速路由 — 0 延迟 */
export function fastRoute(message: string): RouteResult | null {
  const m = message.toLowerCase()
  if (/全面|综合|分析一下|总体/.test(m)) {
    return { agents: ["weather-analyst", "alert-analyst", "farming-advisor"], task: "综合分析当前天气情况和风险预警，给出农事建议" }
  }
  if (/预警|霜冻|暴雨|大风|高温|风险|灾害|冻害|低温|最低温|零下|结冰|倒春寒/.test(m)) return { agents: ["alert-analyst"], task: message }
  if (/天气|气温|降水|风速|风力|预报|温度|气候|对比|历史|最高温|最低温/.test(m)) return { agents: ["weather-analyst"], task: message }
  if (/施肥|肥料|用药|灌溉|农事|管理|建议|种植|播种|追肥|基肥|生长阶段|阶段|苗期|现蕾|开花|膨大|马铃薯/.test(m)) return { agents: ["farming-advisor"], task: message }
  if (/病虫害|晚疫|早疫|蚜虫|防治|农药|杀菌/.test(m)) return { agents: ["farming-advisor"], task: message }
  if (/这周|本周|下周|最近/.test(m)) return { agents: ["weather-analyst"], task: message }
  if (/怎么办|该做什么|注意什么/.test(m)) return { agents: ["farming-advisor"], task: message }
  return null
}

/** LLM 路由 — fastRoute 未命中时使用 */
export async function supervisorRoute(message: string, fieldId?: number): Promise<RouteResult> {
  const cmd = new ConverseCommand({
    modelId: ROUTER_MODEL,
    system: [{ text: "根据问题选agent。可选:weather-analyst,farming-advisor,alert-analyst。只返回JSON:{\"agents\":[...],\"task\":\"...\"}" }],
    messages: [{ role: "user", content: [{ text: fieldId ? `(地块ID:${fieldId})${message}` : message }] }] as never,
    inferenceConfig: { maxTokens: 100 },
  })
  const res = await client.send(cmd)
  const text = res.output?.message?.content?.[0]
  if (text && "text" in text && text.text) {
    const match = text.text.match(/\{[\s\S]*\}/)
    if (match) {
      try { return JSON.parse(match[0]) } catch { /* fall through */ }
    }
  }
  return { agents: ["farming-advisor"], task: message }
}
