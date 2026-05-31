/**
 * 数据预取 — 从 DB 查询数据并压缩为 Agent prompt 上下文
 */
import { getPool } from "@/lib/db"

function beijingToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
}

function beijingWeekday(): string {
  return new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", weekday: "long" })
}

function compactWeather(rows: Record<string, unknown>[]) {
  return rows.map(r => `${(r.date as string).slice(5)}|${r.temp_max}/${r.temp_min}/${r.temp_mean}°C|${r.precipitation}mm|风${r.wind_speed_max}km/h|湿${r.humidity}%`)
}

function compactField(f: Record<string, unknown>) {
  return `${f.name}(ID:${f.id}) ${f.variety} ${f.area_mu}亩 播种:${f.planting_date} 坐标:${f.latitude},${f.longitude}`
}

export async function queryField(fieldId: number) {
  const r = await getPool().query("SELECT id,name,latitude,longitude,variety,planting_date,area_mu FROM field WHERE id=$1", [fieldId])
  return r.rows[0] ?? null
}

export async function queryWeather(fieldId: number, days = 5) {
  const today = beijingToday()
  const r = await getPool().query("SELECT date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity FROM daily_weather WHERE field_id=$1 AND date<=$2 ORDER BY date DESC LIMIT $3", [fieldId, today, days])
  return r.rows.reverse()
}

export async function queryForecast(fieldId: number, limit = 7) {
  const today = beijingToday()
  const r = await getPool().query("SELECT date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity FROM weather_forecast WHERE field_id=$1 AND date>=$2 ORDER BY date LIMIT $3", [fieldId, today, limit])
  return r.rows
}

export async function queryAlerts(fieldId: number) {
  const r = await getPool().query("SELECT type,severity,title,date FROM alert WHERE field_id=$1 ORDER BY date DESC LIMIT 5", [fieldId])
  return r.rows
}

export async function queryThresholds() {
  const r = await getPool().query("SELECT alert_type,yellow_condition,orange_condition,red_condition FROM alert_threshold")
  return r.rows
}

export async function queryAdviceHistory(fieldId: number) {
  const r = await getPool().query("SELECT week_start,growth_stage,summary FROM farming_advice_record WHERE field_id=$1 ORDER BY week_start DESC LIMIT 2", [fieldId])
  return r.rows
}

export async function queryHistoricalMonthly() {
  const curMonth = new Date().getMonth() + 1
  const r = await getPool().query("SELECT month,avg_temp_max,avg_temp_min,avg_temp_mean,avg_precipitation FROM historical_monthly WHERE region='xilinhaote' AND month BETWEEN $1 AND $2 ORDER BY month", [Math.max(1, curMonth - 1), Math.min(12, curMonth + 1)])
  return r.rows
}

export async function searchKnowledgeBase(query: string) {
  const { searchKbPgvector } = await import("@/lib/services/kb-pgvector")
  return searchKbPgvector(query, 2)
}

/** 为指定 Agent 预取并压缩数据 */
export async function prefetchData(agentName: string, fieldId: number | undefined, message: string): Promise<string> {
  const fid = fieldId ?? 1
  const parts: string[] = []

  const [field, weather, forecast] = await Promise.all([queryField(fid), queryWeather(fid, 5), queryForecast(fid, 7)])
  parts.push(`今天(北京时间): ${beijingToday()} ${beijingWeekday()}`)
  if (field) parts.push(`地块: ${compactField(field)}`)
  if (weather.length) parts.push(`近5天实况:\n${compactWeather(weather).join("\n")}`)
  if (forecast.length) parts.push(`未来7天预报:\n${compactWeather(forecast).join("\n")}`)

  if (agentName === "farming-advisor") {
    const needKB = /病虫害|晚疫|早疫|蚜虫|防治|农药/.test(message)
    const extras = await Promise.all([
      queryAdviceHistory(fid),
      queryHistoricalMonthly(),
      needKB ? searchKnowledgeBase(message) : Promise.resolve([]),
    ])
    if (extras[0].length) parts.push(`近期建议: ${JSON.stringify(extras[0])}`)
    if (extras[1].length) parts.push(`历史同期月均: ${JSON.stringify(extras[1])}`)
    if ((extras[2] as string[]).length) parts.push(`知识库:\n${(extras[2] as string[]).join("\n---\n")}`)
  }

  if (agentName === "alert-analyst") {
    const [alerts, thresholds] = await Promise.all([queryAlerts(fid), queryThresholds()])
    if (alerts.length) parts.push(`现有预警: ${alerts.map((a: Record<string, unknown>) => `${a.severity}:${a.title}(${a.date})`).join("; ")}`)
    if (thresholds.length) parts.push(`阈值: ${thresholds.map((t: Record<string, unknown>) => `${t.alert_type}:黄${JSON.stringify(t.yellow_condition)}橙${JSON.stringify(t.orange_condition)}红${JSON.stringify(t.red_condition)}`).join("; ")}`)
  }

  return parts.join("\n\n")
}
