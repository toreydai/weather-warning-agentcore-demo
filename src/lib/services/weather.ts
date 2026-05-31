import { cache } from "react"
import { getDb } from "@/lib/db"
import { field, dailyWeather, weatherForecast, historicalMonthly, alert, agentSession } from "@/lib/db/schema"
import { eq, and, gte, lte, asc } from "drizzle-orm"
import { parseLocalDate } from "@/lib/utils"

export type Field = typeof field.$inferSelect
export type NewField = typeof field.$inferInsert
export type DailyWeather = typeof dailyWeather.$inferSelect
export type WeatherForecast = typeof weatherForecast.$inferSelect
export type HistoricalMonthly = typeof historicalMonthly.$inferSelect

export const getAllFields = cache(async (): Promise<Field[]> => {
  return getDb().select().from(field).orderBy(asc(field.id))
})

export const getFieldById = cache(async (id: number): Promise<Field | undefined> => {
  const rows = await getDb().select().from(field).where(eq(field.id, id))
  return rows[0]
})

export async function createField(f: NewField): Promise<Field> {
  const rows = await getDb().insert(field).values(f).returning()
  return rows[0]
}

export async function updateField(id: number, f: Partial<NewField>): Promise<Field | undefined> {
  const rows = await getDb().update(field).set(f).where(eq(field.id, id)).returning()
  return rows[0]
}

export async function deleteField(id: number): Promise<void> {
  await getDb().update(agentSession).set({ field_id: null }).where(eq(agentSession.field_id, id))
  await getDb().delete(dailyWeather).where(eq(dailyWeather.field_id, id))
  await getDb().delete(weatherForecast).where(eq(weatherForecast.field_id, id))
  await getDb().delete(alert).where(eq(alert.field_id, id))
  await getDb().delete(field).where(eq(field.id, id))
}

export const getDailyWeather = cache(async (fieldId: number, startDate?: string, endDate?: string): Promise<DailyWeather[]> => {
  const conditions = [eq(dailyWeather.field_id, fieldId)]
  if (startDate) conditions.push(gte(dailyWeather.date, startDate))
  if (endDate) conditions.push(lte(dailyWeather.date, endDate))
  return getDb().select().from(dailyWeather).where(and(...conditions)).orderBy(asc(dailyWeather.date))
})

export const getForecast = cache(async (fieldId: number, days = 45): Promise<WeatherForecast[]> => {
  const today = new Date().toISOString().slice(0, 10)
  const d = new Date(); d.setDate(d.getDate() + days - 1)
  const cutoff = d.toISOString().slice(0, 10)
  return getDb().select().from(weatherForecast)
    .where(and(eq(weatherForecast.field_id, fieldId), gte(weatherForecast.date, today), lte(weatherForecast.date, cutoff)))
    .orderBy(asc(weatherForecast.date))
})

export interface WeeklyAgg {
  week_start: string; week_end: string; avg_temp: number; total_precip: number; max_wind: number; days: DailyWeather[]
}

export function mergeDailyAndForecast(daily: DailyWeather[], forecast: WeatherForecast[], fieldId: number): DailyWeather[] {
  // Merge: use daily as base, append forecast days not already in daily
  const dateSet = new Set(daily.map(d => d.date))
  const merged = [...daily, ...forecast.filter(f => !dateSet.has(f.date)).map(f => ({
    ...f, id: 0, field_id: fieldId, weather_code: f.weather_code, humidity: f.humidity, source: "openmeteo-forecast",
  } as DailyWeather))]
  merged.sort((a, b) => a.date.localeCompare(b.date))
  return merged
}

export function buildWeeklyReports(merged: DailyWeather[]): WeeklyAgg[] {
  // Group by ISO week (Monday start)
  const weeks: WeeklyAgg[] = []
  let i = 0
  while (i < merged.length) {
    const d = parseLocalDate(merged[i].date)
    const dow = d.getDay() || 7 // 1=Mon..7=Sun
    // Find Monday of this week
    const mondayOffset = 1 - dow
    const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset)
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
    const monStr = monday.toISOString().split("T")[0]
    const sunStr = sunday.toISOString().split("T")[0]
    const days = merged.filter(dd => dd.date >= monStr && dd.date <= sunStr)
    if (days.length) {
      weeks.push({
        week_start: days[0].date, week_end: days[days.length - 1].date,
        avg_temp: days.reduce((s, dd) => s + (dd.temp_mean ?? 0), 0) / days.length,
        total_precip: days.reduce((s, dd) => s + (dd.precipitation ?? 0), 0),
        max_wind: Math.max(...days.map(dd => dd.wind_speed_max ?? 0)), days,
      })
    }
    // Skip to next Monday
    i = merged.findIndex(dd => dd.date > sunStr)
    if (i === -1) break
  }
  return weeks
}

export async function getWeeklyReports(fieldId: number): Promise<WeeklyAgg[]> {
  const daily = await getDailyWeather(fieldId)
  const forecast = await getForecast(fieldId)
  const all = buildWeeklyReports(mergeDailyAndForecast(daily, forecast, fieldId))
  // 只保留当前周和下一周（共 2 条）
  const today = new Date()
  const dow = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() + (1 - dow))
  const mondayStr = monday.toISOString().split("T")[0]
  const upcoming = all.filter(w => w.week_end >= mondayStr)
  return upcoming.slice(0, 2)
}

export const getHistoricalMonthly = cache(async (region: string): Promise<HistoricalMonthly[]> => {
  return getDb().select().from(historicalMonthly).where(eq(historicalMonthly.region, region)).orderBy(asc(historicalMonthly.month))
})

export interface MonthComparison {
  month: number; label: string
  current: { avgTemp: number; totalPrecip: number; maxWind: number; avgHumidity: number }
  historical: HistoricalMonthly
  delta: { temp: number; precip: number; wind: number; humidity: number }
}

export async function getMonthComparisons(fieldId: number, region: string): Promise<MonthComparison[]> {
  const daily = await getDailyWeather(fieldId)
  const forecast = await getForecast(fieldId, 45)
  const hist = await getHistoricalMonthly(region)
  return hist.map(h => {
    const observed = daily.filter(d => parseLocalDate(d.date).getMonth() + 1 === h.month)
    const predicted = forecast.filter(f => parseLocalDate(f.date).getMonth() + 1 === h.month)
    const monthDays = observed.length ? observed : predicted
    if (!monthDays.length) return { month: h.month, label: `${h.month}月`, current: { avgTemp: 0, totalPrecip: 0, maxWind: 0, avgHumidity: 0 }, historical: h, delta: { temp: 0, precip: 0, wind: 0, humidity: 0 } }
    const label = observed.length ? `${h.month}月` : `${h.month}月(预报)`
    const avgTemp = monthDays.reduce((s, d) => s + (d.temp_mean ?? 0), 0) / monthDays.length
    const totalPrecip = monthDays.reduce((s, d) => s + (d.precipitation ?? 0), 0)
    const maxWind = Math.max(...monthDays.map(d => d.wind_speed_max ?? 0))
    const avgHumidity = monthDays.reduce((s, d) => s + (d.humidity ?? 0), 0) / monthDays.length
    return { month: h.month, label, current: { avgTemp, totalPrecip, maxWind, avgHumidity }, historical: h, delta: { temp: +(avgTemp - (h.avg_temp_mean ?? 0)).toFixed(1), precip: +(totalPrecip - (h.avg_precipitation ?? 0)).toFixed(1), wind: +(maxWind - (h.avg_wind_speed_max ?? 0)).toFixed(0), humidity: +(avgHumidity - (h.avg_humidity ?? 0)).toFixed(1) } }
  })
}
