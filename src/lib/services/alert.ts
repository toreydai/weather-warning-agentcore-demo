import { getDb } from "@/lib/db"
import { alert, alertThreshold, fieldDailyCumulative } from "@/lib/db/schema"
import { getFieldById, getForecast } from "./weather"
import type { WeatherForecast } from "./weather"
import { getStageInfo, type MainStage } from "./advice"
import { eq, asc, desc } from "drizzle-orm"

export type Alert = typeof alert.$inferSelect

type MatchMode = "any" | "all"
interface ThresholdLevel {
  match_mode?: MatchMode
  temp_min_lte?: number
  temp_min_lte_days_gte?: number
  precip_gte?: number
  precip_3d_gte?: number
  precip_sum_gte?: number
  window_days?: number
  rain_days_gte?: number
  wind_gte?: number
  gust_gte?: number
  temp_max_gte?: number
  humidity_lte?: number
  gdd_gte?: number
}
export interface EvaluatedAlert { type: string; severity: string; title: string; desc: string; plan: string[] }

export type LoadedThreshold = { label: string; yellow: ThresholdLevel; orange: ThresholdLevel; red: ThresholdLevel }
export type ThresholdStageKey = MainStage | "default"
export type ThresholdIndex = Record<string, Partial<Record<ThresholdStageKey, LoadedThreshold>>>

export function rowsToThresholdIndex(rows: Array<{
  alert_type: string
  stage?: string | null
  label: string
  yellow_condition: string
  orange_condition: string
  red_condition: string
}>): ThresholdIndex {
  const result: ThresholdIndex = {}
  for (const r of rows) {
    const key = (r.stage ?? "default") as ThresholdStageKey
    result[r.alert_type] ??= {}
    result[r.alert_type][key] = {
      label: r.label,
      yellow: JSON.parse(r.yellow_condition),
      orange: JSON.parse(r.orange_condition),
      red: JSON.parse(r.red_condition),
    }
  }
  return result
}

async function loadThresholds(): Promise<ThresholdIndex> {
  return rowsToThresholdIndex(await getDb().select().from(alertThreshold))
}

type WeatherDay = Pick<WeatherForecast, "temp_max" | "temp_min" | "precipitation" | "wind_speed_max" | "wind_gust" | "humidity">
type AlertDay = WeatherDay & { humidity?: number | null; cumulativeGdd?: number | null; futureDays?: AlertDay[] }

function futureWindow(day: AlertDay, days: number): AlertDay[] {
  return (day.futureDays?.length ? day.futureDays : [day]).slice(0, days)
}

function countConsecutiveTempMinLte(day: AlertDay, threshold: number): number {
  let count = 0
  for (const d of futureWindow(day, 7)) {
    if (d.temp_min == null || d.temp_min > threshold) break
    count++
  }
  return count
}

function sumPrecip(day: AlertDay, days: number): number | null {
  const values = futureWindow(day, days).map(d => d.precipitation)
  if (values.some(v => v == null)) return null
  return values.reduce<number>((sum, v) => sum + (v ?? 0), 0)
}

function countRainDays(day: AlertDay, days: number): number | null {
  const values = futureWindow(day, days).map(d => d.precipitation)
  if (values.some(v => v == null)) return null
  return values.filter(v => (v ?? 0) > 0).length
}

function conditionChecks(level: ThresholdLevel, day: AlertDay): Array<{ ok: boolean; desc: string }> {
  const checks: Array<{ ok: boolean; desc: string }> = []
  if (level.temp_min_lte != null) checks.push({
    ok: day.temp_min != null && day.temp_min <= level.temp_min_lte,
    desc: day.temp_min == null ? `最低气温缺失` : `最低气温${day.temp_min}°C`,
  })
  if (level.temp_min_lte_days_gte != null) {
    const threshold = level.temp_min_lte
    const count = threshold == null ? 0 : countConsecutiveTempMinLte(day, threshold)
    checks.push({
      ok: threshold != null && count >= level.temp_min_lte_days_gte,
      desc: threshold == null ? `连续低温阈值缺失` : `最低气温≤${threshold}°C连续${count}天`,
    })
  }
  if (level.temp_max_gte != null) checks.push({
    ok: day.temp_max != null && day.temp_max >= level.temp_max_gte,
    desc: day.temp_max == null ? `最高气温缺失` : `最高气温${day.temp_max}°C`,
  })
  if (level.precip_gte != null) checks.push({
    ok: day.precipitation != null && day.precipitation >= level.precip_gte,
    desc: day.precipitation == null ? `降水缺失` : `降水${day.precipitation}mm`,
  })
  if (level.precip_3d_gte != null) {
    const precip = sumPrecip(day, 3)
    checks.push({
      ok: precip != null && precip >= level.precip_3d_gte,
      desc: precip == null ? `3日累计降水缺失` : `3日累计降水${precip.toFixed(1)}mm`,
    })
  }
  if (level.precip_sum_gte != null) {
    const days = level.window_days ?? 3
    const precip = sumPrecip(day, days)
    checks.push({
      ok: precip != null && precip >= level.precip_sum_gte,
      desc: precip == null ? `${days}日累计降水缺失` : `${days}日累计降水${precip.toFixed(1)}mm`,
    })
  }
  if (level.rain_days_gte != null) {
    const days = level.window_days ?? 3
    const count = countRainDays(day, days)
    checks.push({
      ok: count != null && count >= level.rain_days_gte,
      desc: count == null ? `${days}日降水日数缺失` : `${days}日内降水${count}天`,
    })
  }
  if (level.wind_gte != null) checks.push({
    ok: day.wind_speed_max != null && day.wind_speed_max >= level.wind_gte,
    desc: day.wind_speed_max == null ? `最大风速缺失` : `最大风速${day.wind_speed_max}km/h`,
  })
  if (level.gust_gte != null) checks.push({
    ok: day.wind_gust != null && day.wind_gust >= level.gust_gte,
    desc: day.wind_gust == null ? `阵风缺失` : `阵风${day.wind_gust}km/h`,
  })
  if (level.humidity_lte != null) checks.push({
    ok: day.humidity != null && day.humidity <= level.humidity_lte,
    desc: day.humidity == null ? `相对湿度缺失` : `相对湿度${day.humidity}%`,
  })
  if (level.gdd_gte != null) checks.push({
    ok: day.cumulativeGdd != null && day.cumulativeGdd >= level.gdd_gte,
    desc: day.cumulativeGdd == null ? `累计积温缺失` : `累计积温${day.cumulativeGdd.toFixed(1)}°C·d`,
  })
  return checks
}

function conditionMet(level: ThresholdLevel, day: AlertDay): { met: boolean; desc: string } {
  const checks = conditionChecks(level, day)
  if (!checks.length) return { met: false, desc: "" }
  if (level.match_mode === "all") {
    return checks.every(c => c.ok)
      ? { met: true, desc: checks.map(c => c.desc).join("，") }
      : { met: false, desc: "" }
  }
  const hit = checks.find(c => c.ok)
  return hit ? { met: true, desc: hit.desc } : { met: false, desc: "" }
}

const SEVERITY_LABELS: Record<string, string> = { red: "红色", orange: "橙色", yellow: "黄色" }
const BUILTIN_PLANS: Record<string, Record<string, string[]>> = {
  frost:       { red: ["加厚培土", "覆盖地膜防冻"], orange: ["覆盖地膜防冻"], yellow: ["关注天气变化"] },
  heavy_rain:  { red: ["立即清理排水沟"], orange: ["清理排水沟"], yellow: ["检查排水系统"] },
  strong_wind: { red: ["停止高空作业", "加固设施和覆盖物"], orange: ["检查并加固农膜、棚架"], yellow: ["关注风速变化", "固定轻型农具"] },
  strong_gust: { red: ["加固大棚棚膜", "转移轻型农机"], orange: ["检查大棚加固"], yellow: ["关注大风动态"] },
  heat:        { red: ["增加灌溉频次", "避开高温时段田间作业"], orange: ["午后减少田间作业", "关注土壤墒情"], yellow: ["适时补水", "观察叶片萎蔫情况"] },
  dry_hot_wind:{ red: ["立即补水降温", "避开高温大风时段作业"], orange: ["加强墒情监测", "适时补水降温"], yellow: ["关注高温低湿和风速变化"] },
  cold_wave:   { red: ["启动防冻应急预案", "转移育苗至室内"], orange: ["加强保温覆盖", "检查越冬作物"], yellow: ["关注寒潮动态", "备好防寒物资"] },
  heavy_snow:  { red: ["清除大棚积雪防压塌", "疏通排水"], orange: ["及时清雪", "检查棚架承重"], yellow: ["关注降雪进展", "提前备好除雪工具"] },
  typhoon:     { red: ["停止一切田间作业", "加固温室大棚"], orange: ["收拢农具", "加固设施"], yellow: ["关注台风路径", "做好防风准备"] },
  chilling:    { red: ["紧急覆膜保温", "补充磷钾肥增强抗寒"], orange: ["覆盖保温材料", "控制灌溉减少散热"], yellow: ["关注最低气温", "适当减少氮肥施用"] },
}

export async function generateAlerts(fieldId: number): Promise<Alert[]> {
  const thresholds = await loadThresholds()
  const field = await getFieldById(fieldId)
  const locationLabel = field
    ? ([field.county, field.township].filter(Boolean).join("") ? `${[field.county, field.township].filter(Boolean).join("")} · ${field.name}` : field.name)
    : "当前地块"
  const forecast = await getForecast(fieldId, 7)
  const cumulativeRows = await getDb()
    .select({ date: fieldDailyCumulative.date, gdd: fieldDailyCumulative.gdd_cumulative })
    .from(fieldDailyCumulative)
    .where(eq(fieldDailyCumulative.field_id, fieldId))
  const cumulativeByDate = new Map(cumulativeRows.map(r => [r.date, r.gdd]))
  const db = getDb()
  await db.delete(alert).where(eq(alert.field_id, fieldId))

  const values = forecast.flatMap(day => {
    const stage = field?.planting_date
      ? getStageInfo(day.date, field.planting_date, { date: field.harvest_date, type: field.harvest_type }).main
      : undefined
    if (stage === "harvested") return []
    return evaluateWeatherAlerts(
      {
        ...day,
        cumulativeGdd: cumulativeByDate.get(day.date),
        futureDays: forecast
          .filter(d => d.date >= day.date)
          .map(d => ({ ...d, cumulativeGdd: cumulativeByDate.get(d.date) })),
      },
      thresholds,
      locationLabel,
      stage,
    ).map(c => ({
      field_id: fieldId, date: day.date, type: c.type, severity: c.severity,
      title: c.title, description: c.desc, emergency_plan: JSON.stringify(c.plan),
      start_date: day.date, end_date: day.date, stage,
    }))
  })
  if (!values.length) return []
  return db.insert(alert).values(values).returning()
}

export function evaluateWeatherAlerts(
  day: AlertDay,
  thresholds: ThresholdIndex,
  locationLabel: string,
  stage?: MainStage,
): EvaluatedAlert[] {
  const checks: EvaluatedAlert[] = []
  for (const [type, thresholdByStage] of Object.entries(thresholds)) {
    // 暴雪仅在气温低于 4°C 时触发，避免将夏季降雨误判为降雪
    if (type === "heavy_snow" && day.temp_max != null && day.temp_max >= 4) continue
    const t = (stage ? thresholdByStage[stage] : undefined) ?? thresholdByStage.default
    if (!t) continue
    for (const severity of ["red", "orange", "yellow"] as const) {
      const { met, desc } = conditionMet(t[severity], day)
      if (met) {
        const severityLabel = SEVERITY_LABELS[severity]
        const plans = BUILTIN_PLANS[type]?.[severity] ?? ["请关注天气变化，采取相应措施"]
        checks.push({ type, severity, title: `${t.label}${severityLabel}预警`, desc: `${locationLabel} ${desc}`, plan: plans })
        break
      }
    }
  }
  return checks
}

export async function getAlerts(fieldId: number): Promise<Alert[]> {
  return getDb().select().from(alert).where(eq(alert.field_id, fieldId)).orderBy(asc(alert.date), desc(alert.severity))
}

export async function getAllThresholds() {
  return getDb().select().from(alertThreshold).orderBy(asc(alertThreshold.alert_type), asc(alertThreshold.stage))
}

export async function updateThreshold(id: number, data: { stage?: MainStage | null; yellow_condition: string; orange_condition: string; red_condition: string; reference_source?: string | null; reference_note?: string | null }) {
  const rows = await getDb().update(alertThreshold).set(data).where(eq(alertThreshold.id, id)).returning()
  return rows[0]
}

export async function createThreshold(data: { alert_type: string; stage?: MainStage | null; label: string; yellow_condition: string; orange_condition: string; red_condition: string; reference_source?: string | null; reference_note?: string | null }) {
  const rows = await getDb().insert(alertThreshold).values(data).returning()
  return rows[0]
}

export async function deleteThreshold(id: number) {
  await getDb().delete(alertThreshold).where(eq(alertThreshold.id, id))
}
