import type { DailyWeather as DbDaily, WeatherForecast as DbForecast, WeeklyAgg, HistoricalMonthly } from "@/lib/services/weather"
import type { Alert as DbAlert } from "@/lib/services/alert"
import type { FarmingAdvice } from "@/lib/services/advice"

// ── Client-side types (camelCase, used by all components) ──

export type { FarmingAdvice } from "@/lib/services/advice"
export type { MonthComparison } from "@/lib/services/weather"

export interface DailyWeather {
  date: string
  tempMax: number
  tempMin: number
  tempMean: number
  precipitation: number
  windSpeedMax: number
  humidity: number
  weatherCode: number
}

export interface WeeklyReport {
  weekStart: string
  weekEnd: string
  weekLabel: string
  days: DailyWeather[]
  avgTemp: number
  totalPrecip: number
  maxWind: number
  farmingAdvice: FarmingAdvice
}

export interface ExtremeWeatherAlert {
  id: string
  date: string
  type: "frost" | "heavy_rain" | "hail" | "drought" | "strong_wind" | "strong_gust" | "heat" | "cold_wave" | "heavy_snow" | "typhoon" | "chilling"
  severity: "yellow" | "orange" | "red"
  title: string
  description: string
  emergencyPlan: string[]
}

export interface ChartDay {
  date: string
  temp_max: number | null
  temp_min: number | null
  temp_mean: number | null
  precipitation: number | null
}

export interface ForecastDay {
  date: string
  temp_max: number | null
  temp_min: number | null
  temp_mean: number | null
  precipitation: number | null
  wind_speed_max: number | null
  humidity: number | null
  weather_code: number | null
}

export interface HistOverlay {
  month: number
  avg_temp_max: number | null
  avg_temp_min: number | null
  avg_precipitation: number | null
}

export interface TempThresholds {
  frost?: { yellow?: number; orange?: number; red?: number }
  heat?: { yellow?: number; orange?: number; red?: number }
  cold_wave?: { yellow?: number; orange?: number; red?: number }
  chilling?: { yellow?: number; orange?: number; red?: number }
}

// ── Converters (DB snake_case → client types) ──

export function toClientDay(d: DbDaily): DailyWeather {
  return {
    date: d.date,
    tempMax: d.temp_max ?? 0,
    tempMin: d.temp_min ?? 0,
    tempMean: d.temp_mean ?? 0,
    precipitation: d.precipitation ?? 0,
    windSpeedMax: d.wind_speed_max ?? 0,
    humidity: d.humidity ?? 0,
    weatherCode: d.weather_code ?? 0,
  }
}

export function toClientWeekly(w: WeeklyAgg & { weekLabel: string; farmingAdvice: FarmingAdvice }): WeeklyReport {
  return {
    weekStart: w.week_start,
    weekEnd: w.week_end,
    weekLabel: w.weekLabel,
    days: w.days.map(toClientDay),
    avgTemp: w.avg_temp,
    totalPrecip: w.total_precip,
    maxWind: w.max_wind,
    farmingAdvice: w.farmingAdvice,
  }
}

export function toClientAlert(a: DbAlert): ExtremeWeatherAlert {
  return {
    id: String(a.id),
    date: a.date,
    type: a.type as ExtremeWeatherAlert["type"],
    severity: a.severity as ExtremeWeatherAlert["severity"],
    title: a.title,
    description: a.description ?? "",
    emergencyPlan: a.emergency_plan ? JSON.parse(a.emergency_plan) : [],
  }
}

export function toChartDay(d: DbDaily): ChartDay {
  return { date: d.date, temp_max: d.temp_max, temp_min: d.temp_min, temp_mean: d.temp_mean, precipitation: d.precipitation }
}

export function toForecastDay(f: DbForecast): ForecastDay {
  return { date: f.date, temp_max: f.temp_max, temp_min: f.temp_min, temp_mean: f.temp_mean, precipitation: f.precipitation, wind_speed_max: f.wind_speed_max, humidity: f.humidity, weather_code: f.weather_code }
}

export function toHistOverlay(h: HistoricalMonthly): HistOverlay {
  return { month: h.month, avg_temp_max: h.avg_temp_max, avg_temp_min: h.avg_temp_min, avg_precipitation: h.avg_precipitation }
}

// ── WMO Weather codes ──

const descriptions: Record<number, string> = {
  0: "晴天", 1: "大部晴朗", 2: "多云", 3: "阴天",
  45: "雾", 48: "雾凇",
  51: "小毛毛雨", 53: "中毛毛雨", 55: "大毛毛雨",
  61: "小雨", 63: "中雨", 65: "大雨",
  71: "小雪", 73: "中雪", 75: "大雪",
  80: "小阵雨", 81: "中阵雨", 82: "大阵雨",
  85: "小阵雪", 86: "大阵雪",
  95: "雷暴", 96: "雷暴伴冰雹", 99: "强雷暴伴冰雹",
}

export function getWeatherDescription(code: number): string {
  return descriptions[code] || "未知"
}

export function getWeatherIcon(code: number): string {
  if (code === 0 || code === 1) return "☀️"
  if (code === 2) return "⛅"
  if (code === 3) return "☁️"
  if (code >= 45 && code <= 48) return "🌫️"
  if (code >= 51 && code <= 55) return "🌦️"
  if (code >= 61 && code <= 65) return "🌧️"
  if (code >= 80 && code <= 82) return "🌧️"
  if (code >= 71 && code <= 86) return "🌨️"
  if (code >= 95) return "⛈️"
  return "🌤️"
}
