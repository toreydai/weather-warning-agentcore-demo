import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { getPotatoGrowthStage } from "./advice"
import type { DailyWeather } from "./weather"
import { parseLocalDate } from "@/lib/utils"

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" })

export interface AIAdviceInput {
  latitude: number; longitude: number; variety: string; plantingDate: string
  weekStart: string; weekEnd: string; days: DailyWeather[]
}

export async function generateAIAdvice(input: AIAdviceInput) {
  const stage = getPotatoGrowthStage(input.weekStart, input.plantingDate)
  const dap = Math.floor((parseLocalDate(input.weekStart).getTime() - parseLocalDate(input.plantingDate).getTime()) / 86400000)
  const avgTemp = input.days.reduce((s, d) => s + (d.temp_mean ?? 0), 0) / input.days.length
  const totalPrecip = input.days.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const maxWind = Math.max(...input.days.map(d => d.wind_speed_max ?? 0))
  const maxTemp = Math.max(...input.days.map(d => d.temp_max ?? 0))
  const minTemp = Math.min(...input.days.map(d => d.temp_min ?? 99))

  const prompt = `你是内蒙古马铃薯种植专家。根据以下信息给出本周田间管理建议。
地块: ${input.latitude}°N, ${input.longitude}°E, 品种${input.variety}, 播种${input.plantingDate}, ${stage}(第${dap}天)
本周(${input.weekStart}~${input.weekEnd}): 均温${avgTemp.toFixed(1)}°C(高${maxTemp.toFixed(1)}/低${minTemp.toFixed(1)}), 降水${totalPrecip.toFixed(1)}mm, 最大风速${maxWind.toFixed(0)}km/h
以JSON返回:{"summary":"...","fertilizer":"...","pesticide":"...","irrigation":"...","fieldWork":"..."}
药剂名称和用量必须具体。只返回JSON。`

  try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId: "amazon.nova-lite-v1:0",
      contentType: "application/json", accept: "application/json",
      body: JSON.stringify({ messages: [{ role: "user", content: [{ text: prompt }] }], inferenceConfig: { maxTokens: 1024 } }),
    }))
    const result = JSON.parse(new TextDecoder().decode(response.body))
    const text = result.output?.message?.content?.[0]?.text ?? ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in response")
    const advice = JSON.parse(jsonMatch[0])
    const toString = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v)
    return {
      growth_stage: stage, summary: toString(advice.summary ?? ""), fertilizer: toString(advice.fertilizer ?? ""),
      pesticide: toString(advice.pesticide ?? ""), irrigation: toString(advice.irrigation ?? ""),
      field_work: toString(advice.fieldWork ?? advice.field_work ?? ""), ai_model: "amazon-nova-lite",
    }
  } catch (e: unknown) {
    console.error("Bedrock AI failed:", e instanceof Error ? e.message : e)
    return null
  }
}
