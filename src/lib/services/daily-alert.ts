import { createHash } from "node:crypto"
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime"
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { dailyFarmingAlert, field, weatherForecast } from "@/lib/db/schema"
import { env } from "@/lib/env"
import { getPotatoGrowthStage } from "@/lib/services/advice"

const LLM_MODEL_ID = "amazon.nova-lite-v1:0"

export type DailyFarmingAlert = typeof dailyFarmingAlert.$inferSelect
export type DailyAlertStatus = "draft" | "reviewed" | "published"

export interface CountyFieldGroup {
  countyCode: string
  countyName: string
  fields: Array<typeof field.$inferSelect>
}

type ForecastRow = typeof weatherForecast.$inferSelect

export interface WeatherSignals {
  highConfidence: {
    days: number
    totalPrecip: number
    maxTemp: number | null
    minTemp: number | null
    maxWind: number | null
    rainDays: number
    frostDays: string[]
    hotDays: string[]
    windyDays: string[]
  }
  mediumTrend: {
    days: number
    totalPrecip: number
    rainDays: number
  }
  extendedOutlook: {
    days: number
    avgTemp: number | null
    totalPrecip: number
  }
}

export function todayChina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

export async function getCountyFieldGroups(): Promise<CountyFieldGroup[]> {
  const fields = await getDb().select().from(field).orderBy(asc(field.id))
  const map = new Map<string, CountyFieldGroup>()
  for (const f of fields) {
    const countyName = f.county ?? f.region ?? "未设置县域"
    const countyCode = f.admin_code ?? f.county ?? f.region ?? "unknown"
    const key = countyCode
    const existing = map.get(key)
    if (existing) existing.fields.push(f)
    else map.set(key, { countyCode, countyName, fields: [f] })
  }
  return [...map.values()]
}

export function estimateCountyStage(fields: CountyFieldGroup["fields"], date: string): string {
  const plantingDates = fields.map(f => f.planting_date).filter((d): d is string => Boolean(d)).sort()
  return getPotatoGrowthStage(date, plantingDates[0] ?? `${new Date().getFullYear()}-04-25`)
}

function avg(values: number[]): number | null {
  return values.length ? +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1) : null
}

function max(values: number[]): number | null {
  return values.length ? Math.max(...values) : null
}

function min(values: number[]): number | null {
  return values.length ? Math.min(...values) : null
}

function mode(values: number[]): number | null {
  if (!values.length) return null
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
}

function nums<T>(rows: T[], pick: (row: T) => number | null): number[] {
  return rows.map(pick).filter((value): value is number => typeof value === "number")
}

export function aggregateCountyForecastByDate(rows: ForecastRow[]): ForecastRow[] {
  const byDate = new Map<string, ForecastRow[]>()
  for (const row of rows) {
    const group = byDate.get(row.date) ?? []
    group.push(row)
    byDate.set(row.date, group)
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group], index) => ({
      id: index + 1,
      field_id: 0,
      date,
      temp_max: max(nums(group, row => row.temp_max)),
      temp_min: min(nums(group, row => row.temp_min)),
      temp_mean: avg(nums(group, row => row.temp_mean)),
      precipitation: avg(nums(group, row => row.precipitation)),
      wind_speed_max: max(nums(group, row => row.wind_speed_max)),
      humidity: avg(nums(group, row => row.humidity)),
      weather_code: mode(nums(group, row => row.weather_code)),
      wind_gust: max(nums(group, row => row.wind_gust)),
      soil_temp: avg(nums(group, row => row.soil_temp)),
      fetched_at: group
        .map(row => row.fetched_at)
        .filter((value): value is Date => value instanceof Date)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
    }))
}

async function getCountyForecast(fields: CountyFieldGroup["fields"], date: string): Promise<ForecastRow[]> {
  const fieldIds = fields.map(f => f.id)
  if (!fieldIds.length) return []
  const rows = await getDb().select().from(weatherForecast)
    .where(and(inArray(weatherForecast.field_id, fieldIds), gte(weatherForecast.date, date)))
    .orderBy(asc(weatherForecast.date), asc(weatherForecast.field_id))
  return aggregateCountyForecastByDate(rows)
}

export function analyzeWeatherSignals(days: ForecastRow[]): WeatherSignals {
  const summarize = (rows: ForecastRow[]) => {
    const tempsMax = rows.map(d => d.temp_max).filter((v): v is number => typeof v === "number")
    const tempsMin = rows.map(d => d.temp_min).filter((v): v is number => typeof v === "number")
    const winds = rows.map(d => d.wind_speed_max).filter((v): v is number => typeof v === "number")
    const precips = rows.map(d => d.precipitation ?? 0)
    return {
      days: rows.length,
      totalPrecip: +precips.reduce((s, v) => s + v, 0).toFixed(1),
      maxTemp: tempsMax.length ? Math.max(...tempsMax) : null,
      minTemp: tempsMin.length ? Math.min(...tempsMin) : null,
      maxWind: winds.length ? Math.max(...winds) : null,
      rainDays: rows.filter(d => (d.precipitation ?? 0) >= 1).length,
    }
  }
  const highRows = days.slice(0, 7)
  const mediumRows = days.slice(7, 15)
  const extendedRows = days.slice(15, 45)
  const high = summarize(highRows)
  const extendedTemps = extendedRows.map(d => d.temp_mean).filter((v): v is number => typeof v === "number")
  return {
    highConfidence: {
      ...high,
      frostDays: highRows.filter(d => (d.temp_min ?? 99) <= 0).map(d => d.date),
      hotDays: highRows.filter(d => (d.temp_max ?? 0) >= 32).map(d => d.date),
      windyDays: highRows.filter(d => (d.wind_speed_max ?? 0) >= 40).map(d => d.date),
    },
    mediumTrend: summarize(mediumRows),
    extendedOutlook: {
      days: extendedRows.length,
      avgTemp: extendedTemps.length ? +(extendedTemps.reduce((s, v) => s + v, 0) / extendedTemps.length).toFixed(1) : null,
      totalPrecip: +extendedRows.reduce((s, d) => s + (d.precipitation ?? 0), 0).toFixed(1),
    },
  }
}

export function decideFocus(stage: string, signals: WeatherSignals): string {
  if (signals.highConfidence.frostDays.length) return "防冻"
  if (signals.highConfidence.totalPrecip >= 30 || signals.mediumTrend.totalPrecip >= 40) return "排涝"
  if (signals.highConfidence.hotDays.length) return "灌溉"
  if (stage.includes("收获") || stage.includes("成熟")) return "采收"
  if (stage.includes("播种") || stage.includes("催芽")) return "播种"
  if (stage.includes("现蕾") || stage.includes("开花") || stage.includes("膨大")) return "田管"
  return "田管"
}

export function buildDailyAlertMarkdown(input: {
  countyName: string
  date: string
  stage: string
  focus: string
  signals: WeatherSignals
  fieldCount: number
}): string {
  const h = input.signals.highConfidence
  const m = input.signals.mediumTrend
  const e = input.signals.extendedOutlook
  const risk: string[] = []
  if (h.frostDays.length) risk.push(`低温/霜冻窗口：${h.frostDays.join("、")}`)
  if (h.totalPrecip >= 20) risk.push(`未来 7 天累计降水 ${h.totalPrecip}mm`)
  if (h.hotDays.length) risk.push(`高温日：${h.hotDays.join("、")}`)
  if (h.windyDays.length) risk.push(`大风日：${h.windyDays.join("、")}`)
  if (!risk.length) risk.push("未来 7 天无明显极端天气信号")

  return `## ${input.countyName} ${input.date} 每日农事气象预警

**覆盖范围**：${input.fieldCount} 个地块  
**主力生育阶段**：${input.stage}  
**今日关注**：${input.focus}

### 未来 7 天高置信信号
- ${risk.join("\n- ")}
- 温度范围：${h.minTemp ?? "-"}°C ~ ${h.maxTemp ?? "-"}°C；最大风速：${h.maxWind ?? "-"}km/h

### 7~15 天趋势提示
- 趋势期累计降水约 ${m.totalPrecip}mm，降水日 ${m.rainDays} 天。
- 若连续降水增多，提前清理排水沟，避免低洼地块积水。

### 15~45 天月度展望
- 延伸期平均气温约 ${e.avgTemp ?? "-"}°C，累计降水约 ${e.totalPrecip}mm。
- 延伸期预报不确定性较大，仅用于安排农资、人手和作业窗口预判。

### 建议措施
- 围绕“${input.focus}”安排今日巡田，优先检查苗情、墒情和排水情况。
- 结合地块差异执行，不建议仅凭延伸期预报直接安排具体作业。`
}

export interface LlmDraftResult {
  markdown: string
  model: string
  promptHash: string
}

export function buildKbQuery(input: { countyName: string; stage: string; focus: string; signals: WeatherSignals }): string {
  const parts = [input.countyName, "马铃薯", input.stage, input.focus]
  if (input.signals.highConfidence.frostDays.length) parts.push("霜冻防护")
  if (input.signals.highConfidence.hotDays.length) parts.push("高温灌溉")
  if (input.signals.highConfidence.windyDays.length) parts.push("大风作业")
  if (input.signals.highConfidence.totalPrecip >= 20 || input.signals.mediumTrend.totalPrecip >= 30) parts.push("强降雨排涝")
  return parts.join(" ")
}

export function buildLlmDraftPrompt(input: {
  countyName: string
  date: string
  stage: string
  focus: string
  signals: WeatherSignals
  fieldCount: number
  kbPassages: string[]
}): string {
  const h = input.signals.highConfidence
  const m = input.signals.mediumTrend
  const e = input.signals.extendedOutlook
  const kbBlock = input.kbPassages.length
    ? input.kbPassages.map((p, i) => `【参考资料 ${i + 1}】\n${p}`).join("\n\n")
    : "（无相关知识库参考，仅依据上述气象信号撰写）"
  return `你是内蒙古马铃薯种植专家。请为${input.countyName}撰写${input.date}的"每日农事气象预警"草稿，供审核员后续修改。

【县域概况】
- 覆盖地块数：${input.fieldCount}
- 主力生育阶段：${input.stage}
- 系统判定今日关注：${input.focus}

【未来 7 天 高置信预报】
- 累计降水 ${h.totalPrecip}mm，降水日 ${h.rainDays} 天；最高/最低气温 ${h.maxTemp ?? "-"}/${h.minTemp ?? "-"}°C；最大风速 ${h.maxWind ?? "-"}km/h
- 霜冻日：${h.frostDays.join("、") || "无"}
- 高温日（≥32°C）：${h.hotDays.join("、") || "无"}
- 大风日（≥40km/h）：${h.windyDays.join("、") || "无"}

【7~15 天 中置信趋势】
- 累计降水 ${m.totalPrecip}mm，降水日 ${m.rainDays} 天

【15~45 天 低置信延伸期展望】
- 平均气温 ${e.avgTemp ?? "-"}°C，累计降水 ${e.totalPrecip}mm

【知识库参考】
${kbBlock}

撰写要求：
1. 用 Markdown 输出。标题使用 "## ${input.countyName} ${input.date} 每日农事气象预警"，下设以下小节（顺序固定）：
   - 今日要点
   - 未来 7 天 高置信信号
   - 7~15 天 中置信趋势
   - 15~45 天 延伸期展望
   - 建议措施
2. 高置信段允许给具体作业建议（采收/播种/灌溉/施药窗口的日期）；中置信段只给趋势提示，不给具体日期；延伸期段标注"不确定性较大，仅供资源/人手安排参考"。
3. 建议措施 3~5 条，结合"今日关注=${input.focus}"和上述信号，参考知识库中的农艺要点。
4. 如果引用了参考资料，在条目末尾追加"（参见参考资料 N）"。无参考资料时不要编造引用。
5. 仅返回 JSON：{"markdown": "..."}。不要任何解释性文字、不要 \`\`\` 代码块包裹。`
}

export async function retrieveKbPassagesForAlert(query: string, limit = 3): Promise<string[]> {
  const { searchKbPgvector } = await import("@/lib/services/kb-pgvector")
  return searchKbPgvector(query, limit)
}

async function invokeBedrockDraft(prompt: string): Promise<string | null> {
  try {
    const client = new BedrockRuntimeClient({ region: env.AWS_REGION })
    const resp = await client.send(new InvokeModelCommand({
      modelId: LLM_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 2048, temperature: 0.3 },
      }),
    }))
    const result = JSON.parse(new TextDecoder().decode(resp.body))
    const text = result.output?.message?.content?.[0]?.text ?? ""
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    const md = typeof parsed.markdown === "string" ? parsed.markdown.trim() : ""
    return md.length ? md : null
  } catch (e) {
    console.error("Bedrock daily-alert invoke failed:", e instanceof Error ? e.message : e)
    return null
  }
}

export async function generateLlmDraft(input: {
  countyName: string
  date: string
  stage: string
  focus: string
  signals: WeatherSignals
  fieldCount: number
}): Promise<LlmDraftResult | null> {
  const kbPassages = await retrieveKbPassagesForAlert(buildKbQuery(input))
  const prompt = buildLlmDraftPrompt({ ...input, kbPassages })
  const markdown = await invokeBedrockDraft(prompt)
  if (!markdown) return null
  const promptHash = createHash("sha256").update(prompt).digest("hex").slice(0, 16)
  return { markdown, model: LLM_MODEL_ID, promptHash }
}

export async function generateDailyAlertForCounty(group: CountyFieldGroup, date = todayChina()): Promise<DailyFarmingAlert> {
  const forecast = await getCountyForecast(group.fields, date)
  const stage = estimateCountyStage(group.fields, date)
  const signals = analyzeWeatherSignals(forecast)
  const focus = decideFocus(stage, signals)
  const ruleDraft = buildDailyAlertMarkdown({ countyName: group.countyName, date, stage, focus, signals, fieldCount: group.fields.length })

  const llm = await generateLlmDraft({ countyName: group.countyName, date, stage, focus, signals, fieldCount: group.fields.length })
  const draftContent = llm?.markdown ?? ruleDraft
  const draftModel = llm?.model ?? "rule-v1"
  const draftPromptHash = llm?.promptHash ?? null

  const rows = await getDb().insert(dailyFarmingAlert).values({
    county_code: group.countyCode,
    county_name: group.countyName,
    date,
    stage,
    focus,
    signals_json: JSON.stringify(signals),
    draft_content: draftContent,
    draft_model: draftModel,
    draft_prompt_hash: draftPromptHash,
    status: "draft",
  }).onConflictDoUpdate({
    target: [dailyFarmingAlert.county_code, dailyFarmingAlert.date],
    set: {
      county_name: group.countyName,
      stage,
      focus,
      signals_json: JSON.stringify(signals),
      draft_content: draftContent,
      draft_model: draftModel,
      draft_prompt_hash: draftPromptHash,
      status: "draft",
      updated_at: sql`NOW()`,
    },
  }).returning()
  return rows[0]
}

export async function listDailyAlerts(filters: { date?: string; status?: string } = {}): Promise<DailyFarmingAlert[]> {
  const conditions = []
  if (filters.date) conditions.push(eq(dailyFarmingAlert.date, filters.date))
  if (filters.status) conditions.push(eq(dailyFarmingAlert.status, filters.status))
  return getDb().select().from(dailyFarmingAlert)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(dailyFarmingAlert.date), asc(dailyFarmingAlert.county_name))
}

export async function getDailyAlertById(id: number): Promise<DailyFarmingAlert | undefined> {
  const rows = await getDb().select().from(dailyFarmingAlert).where(eq(dailyFarmingAlert.id, id))
  return rows[0]
}

export async function updateDailyAlert(id: number, data: { final_content?: string; draft_content?: string; status?: DailyAlertStatus; reviewed_by?: string | null; reviewed_at?: Date | null }): Promise<DailyFarmingAlert | undefined> {
  const clear = data.status === "reviewed" || data.status === "published" ? { needs_review: false } : {}
  const rows = await getDb().update(dailyFarmingAlert).set({ ...data, ...clear, updated_at: new Date() }).where(eq(dailyFarmingAlert.id, id)).returning()
  return rows[0]
}

export async function publishDailyAlert(id: number, username: string): Promise<DailyFarmingAlert | undefined> {
  const existing = await getDailyAlertById(id)
  if (!existing) return undefined
  const final = existing.final_content?.trim() || existing.draft_content
  const rows = await getDb().update(dailyFarmingAlert).set({
    final_content: final,
    status: "published",
    needs_review: false,
    reviewed_by: existing.reviewed_by ?? username,
    reviewed_at: existing.reviewed_at ?? new Date(),
    published_at: new Date(),
    updated_at: new Date(),
  }).where(eq(dailyFarmingAlert.id, id)).returning()
  return rows[0]
}

export async function getAlertByCountyDate(countyCode: string, date: string): Promise<DailyFarmingAlert | undefined> {
  const rows = await getDb().select().from(dailyFarmingAlert)
    .where(and(eq(dailyFarmingAlert.county_code, countyCode), eq(dailyFarmingAlert.date, date)))
  return rows[0]
}

export async function markNeedsReview(countyCode: string, date: string): Promise<void> {
  await getDb().update(dailyFarmingAlert)
    .set({ needs_review: true, updated_at: new Date() })
    .where(and(eq(dailyFarmingAlert.county_code, countyCode), eq(dailyFarmingAlert.date, date)))
}

export async function getPublishedDailyAlertForField(fieldId: number, date = todayChina()): Promise<DailyFarmingAlert | undefined> {
  const rows = await getDb().select().from(field).where(eq(field.id, fieldId))
  const f = rows[0]
  if (!f) return undefined
  const countyCode = f.admin_code ?? f.county ?? f.region ?? "unknown"
  const alerts = await getDb().select().from(dailyFarmingAlert)
    .where(and(eq(dailyFarmingAlert.county_code, countyCode), eq(dailyFarmingAlert.date, date), eq(dailyFarmingAlert.status, "published")))
  return alerts[0]
}

export function previousMonthChina(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(now)
  const [year, month] = parts.split("-").map(Number)
  const d = new Date(Date.UTC(year, month - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function buildMonthlyArchiveMarkdown(input: { countyCode: string; countyName: string; month: string; alerts: DailyFarmingAlert[] }): string {
  const body = input.alerts
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(alert => {
      const content = (alert.final_content ?? alert.draft_content).trim()
      return `## ${alert.date}\n\n${content}`
    })
    .join("\n\n---\n\n")
  return `---
county_code: ${input.countyCode}
county: ${input.countyName}
month: ${input.month}
alert_count: ${input.alerts.length}
---

# ${input.countyName} ${input.month} 每日农事预警归档

${body}
`
}

export async function listUnarchivedPublishedAlertsForMonth(month: string): Promise<DailyFarmingAlert[]> {
  return getDb().select().from(dailyFarmingAlert)
    .where(and(eq(dailyFarmingAlert.status, "published"), isNull(dailyFarmingAlert.archived_month), sql`${dailyFarmingAlert.date} LIKE ${`${month}-%`}`))
    .orderBy(asc(dailyFarmingAlert.county_code), asc(dailyFarmingAlert.date))
}

export function groupAlertsByCounty(alerts: DailyFarmingAlert[]): Array<{ countyCode: string; countyName: string; alerts: DailyFarmingAlert[] }> {
  const map = new Map<string, { countyCode: string; countyName: string; alerts: DailyFarmingAlert[] }>()
  for (const alert of alerts) {
    const existing = map.get(alert.county_code)
    if (existing) existing.alerts.push(alert)
    else map.set(alert.county_code, { countyCode: alert.county_code, countyName: alert.county_name, alerts: [alert] })
  }
  return [...map.values()]
}

export async function markAlertsArchived(alertIds: number[], month: string): Promise<void> {
  if (!alertIds.length) return
  await getDb().update(dailyFarmingAlert).set({ archived_month: month, updated_at: new Date() }).where(inArray(dailyFarmingAlert.id, alertIds))
}
