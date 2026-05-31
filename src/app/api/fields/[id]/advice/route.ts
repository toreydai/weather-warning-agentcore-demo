import { NextRequest, NextResponse } from "next/server"
import { getDb } from "@/lib/db"
import { farmingAdviceRecord } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { getDailyWeather, getFieldById } from "@/lib/services/weather"
import { generateFarmingAdvice, getStageInfo } from "@/lib/services/advice"
import { generateAIAdvice } from "@/lib/services/ai"
import { generateAdviceViaAgent } from "@/lib/services/agentcore"
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit"

function harvestedResponse() {
  return NextResponse.json({ growth_stage: "已采收", summary: "该地块已完成采收，无需生成农事建议。", fertilizer: "-", pesticide: "-", irrigation: "-", field_work: "-", source: "system" })
}

// 快速生成：始终走硬编码规则，返回临时结果不落库，保证与 POST(AI 生成) 路径可见区分
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const week = new URL(req.url).searchParams.get("week")
  if (!week) return NextResponse.json({ error: "week param required" }, { status: 400 })

  const field = await getFieldById(parseInt(id))
  const plantingDate = field?.planting_date ?? `${new Date().getFullYear()}-04-25`
  const harvestInfo = { date: field?.harvest_date, type: field?.harvest_type }
  if (getStageInfo(week, plantingDate, harvestInfo).main === "harvested") return harvestedResponse()

  const days = await getDailyWeather(parseInt(id), week)
  const advice = generateFarmingAdvice(days.slice(0, 7), week, plantingDate)
  return NextResponse.json({ ...advice, source: "code", growth_stage: advice.potatoGrowthStage, field_work: advice.fieldWork })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fieldId = parseInt(id)
  const week = new URL(req.url).searchParams.get("week")
  if (!week) return NextResponse.json({ error: "week param required" }, { status: 400 })

  const rl = await rateLimit(`advice:${fieldId}`, 5, 60_000)
  if (!rl.ok) return rateLimitResponse(rl.retryAfter)

  const field = await getFieldById(fieldId)
  if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 })

  const plantingDate = field.planting_date ?? `${new Date().getFullYear()}-04-25`
  const harvestInfo = { date: field.harvest_date, type: field.harvest_type }
  if (getStageInfo(week, plantingDate, harvestInfo).main === "harvested") return harvestedResponse()

  const existing = await getDb().select().from(farmingAdviceRecord).where(and(eq(farmingAdviceRecord.field_id, fieldId), eq(farmingAdviceRecord.week_start, week)))
  if (existing[0]?.source === "manual") return NextResponse.json({ error: "人工编辑版本已存在" }, { status: 409 })

  const days = await getDailyWeather(fieldId, week)
  const weekDays = days.slice(0, 7)
  const weekEnd = weekDays[weekDays.length - 1]?.date ?? week

  // Level 1: AgentCore multi-agent
  let advice: Record<string, string> | null = null
  let source = "agentcore"
  try {
    const agentResult = await generateAdviceViaAgent(fieldId, week)
    if (agentResult) advice = { growth_stage: agentResult.growth_stage, summary: agentResult.summary, fertilizer: agentResult.fertilizer, pesticide: agentResult.pesticide, irrigation: agentResult.irrigation, field_work: agentResult.field_work }
  } catch { /* fall through */ }

  // Level 2: Single Bedrock call
  if (!advice) {
    source = "auto"
    const ai = await generateAIAdvice({ latitude: field.latitude, longitude: field.longitude, variety: field.variety ?? "荷兰15号", plantingDate, weekStart: week, weekEnd, days: weekDays })
    if (ai) advice = ai
  }

  // Level 3: Hardcoded
  if (!advice) {
    source = "code"
    const code = generateFarmingAdvice(weekDays, week, plantingDate)
    advice = { growth_stage: code.potatoGrowthStage, summary: code.summary, fertilizer: code.fertilizer, pesticide: code.pesticide, irrigation: code.irrigation, field_work: code.fieldWork }
  }

  const ai_model = source === "agentcore" ? "mixed" : source === "auto" ? "amazon-nova-lite" : null
  const { getPool } = await import("@/lib/db")
  // Atomic: lock the row (if any) with FOR UPDATE, re-check source inside the txn,
  // then UPSERT unconditionally. 避免 AgentCore 慢调用期间另一端 PUT 把行改成 manual
  // 却仍然落到 INSERT ... ON CONFLICT WHERE 从而踩到 PG 的唯一键保护。
  const client = await getPool().connect()
  let savedRow: Record<string, unknown> | null = null
  let conflictManual = false
  try {
    await client.query("BEGIN")
    const chk = await client.query(
      "SELECT source FROM farming_advice_record WHERE field_id=$1 AND week_start=$2 FOR UPDATE",
      [fieldId, week]
    )
    if (chk.rows[0]?.source === "manual") {
      conflictManual = true
    } else {
      await client.query(
        `INSERT INTO farming_advice_record (field_id,week_start,week_end,growth_stage,source,summary,fertilizer,pesticide,irrigation,field_work,ai_model)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (field_id,week_start) DO UPDATE SET
         week_end=EXCLUDED.week_end,growth_stage=EXCLUDED.growth_stage,source=EXCLUDED.source,
         summary=EXCLUDED.summary,fertilizer=EXCLUDED.fertilizer,pesticide=EXCLUDED.pesticide,
         irrigation=EXCLUDED.irrigation,field_work=EXCLUDED.field_work,ai_model=EXCLUDED.ai_model,updated_at=NOW()`,
        [fieldId, week, weekEnd, advice?.growth_stage ?? "", source, advice?.summary ?? "", advice?.fertilizer ?? "", advice?.pesticide ?? "", advice?.irrigation ?? "", advice?.field_work ?? "", ai_model]
      )
      const fetched = await client.query(
        "SELECT * FROM farming_advice_record WHERE field_id=$1 AND week_start=$2",
        [fieldId, week]
      )
      savedRow = fetched.rows[0] ?? null
    }
    await client.query("COMMIT")
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {})
    throw e
  } finally {
    client.release()
  }

  if (conflictManual) return NextResponse.json({ error: "人工编辑版本已存在" }, { status: 409 })
  const { logAudit } = await import("@/lib/services/audit")
  await logAudit({ username: "system", action: "generate_advice", targetType: "field", targetId: fieldId, detail: `week=${week} source=${source}` }).catch(() => {})
  return NextResponse.json(savedRow)
}
