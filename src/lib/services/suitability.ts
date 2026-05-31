import type { DailyWeather } from "@/lib/services/weather"
import type { ForecastDay } from "@/lib/weather-types"
import type { MainStage } from "@/lib/services/advice"
import type { SeasonCumulative } from "@/lib/services/cumulative"

export interface SuitabilityScore {
  score: number                   // 0-100
  level: "excellent" | "good" | "fair" | "poor"
  label: string
  factors: Array<{ name: string; score: number; weight: number }>
}

function toLevel(score: number): SuitabilityScore["level"] {
  if (score >= 80) return "excellent"
  if (score >= 60) return "good"
  if (score >= 40) return "fair"
  return "poor"
}

const LEVEL_LABELS: Record<SuitabilityScore["level"], string> = {
  excellent: "适宜", good: "较适宜", fair: "一般", poor: "不适宜",
}

function avg(xs: (number | null)[]): number {
  const valid = xs.filter((x): x is number => x != null)
  return valid.length ? valid.reduce((s, x) => s + x, 0) / valid.length : 0
}

// 温度适宜度（钟形，马铃薯最适 17-20°C）
function tempSuit(t: number): number {
  if (t <= 5 || t >= 30) return 0
  if (t >= 17 && t <= 20) return 1
  if (t < 17) return (t - 5) / 12
  return (30 - t) / 10
}

// 水分适宜度（按生育阶段分阈值，mm/5天等效）
const WATER_THRESHOLDS: Record<MainStage, { low: number; optLow: number; optHigh: number; high: number }> = {
  preplant:   { low: 2,  optLow: 5,  optHigh: 20, high: 40 },
  seedling:   { low: 3,  optLow: 5,  optHigh: 20, high: 45 },
  vegetative: { low: 8,  optLow: 15, optHigh: 30, high: 60 },
  budding:    { low: 10, optLow: 20, optHigh: 35, high: 65 },
  flowering:  { low: 15, optLow: 25, optHigh: 45, high: 70 },
  bulking:    { low: 15, optLow: 25, optHigh: 45, high: 75 },
  maturation: { low: 5,  optLow: 10, optHigh: 25, high: 50 },
  harvested:  { low: 0,  optLow: 0,  optHigh: 999, high: 999 },
}

function waterSuit(precip5d: number, stage: MainStage): number {
  const t = WATER_THRESHOLDS[stage]
  if (precip5d <= t.low) return 0.2
  if (precip5d <= t.optLow) {
    const denom = t.optLow - t.low
    return denom > 0 ? 0.5 + 0.5 * (precip5d - t.low) / denom : 0.7
  }
  if (precip5d <= t.optHigh) return 1
  if (precip5d <= t.high) {
    const denom = t.high - t.optHigh
    return denom > 0 ? 1 - 0.7 * (precip5d - t.optHigh) / denom : 0.5
  }
  return 0.3
}

// 昼夜温差适宜度（8-15°C 最佳，有利于块茎积累）
function diurnalSuit(days: DailyWeather[]): number {
  const avgDiurnal = avg(days.map(d => d.temp_max != null && d.temp_min != null ? d.temp_max - d.temp_min : null))
  if (avgDiurnal < 5 || avgDiurnal > 20) return 0.4
  if (avgDiurnal >= 8 && avgDiurnal <= 15) return 1
  return 0.7
}

function makeScore(factors: Array<{ name: string; score: number; weight: number }>): SuitabilityScore {
  const total = factors.reduce((s, f) => s + f.score * f.weight, 0)
  const score = Math.round(Math.min(100, Math.max(0, total * 100)))
  const level = toLevel(score)
  return { score, level, label: LEVEL_LABELS[level], factors }
}

// 马铃薯气候适宜度（综合，基于历史观测）
export function potatoClimateScore(days: DailyWeather[], stage: MainStage): SuitabilityScore {
  if (!days.length) return makeScore([])
  const avgT = avg(days.map(d => d.temp_mean))
  const totalP = days.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const precip5d = totalP / days.length * 5

  const tScore = tempSuit(avgT)
  const wScore = waterSuit(precip5d, stage)
  const dScore = diurnalSuit(days)

  const isKeyStage = stage === "bulking" || stage === "flowering"
  const weights = isKeyStage
    ? [{ name: "温度", score: tScore, weight: 0.4 }, { name: "水分", score: wScore, weight: 0.4 }, { name: "昼夜温差", score: dScore, weight: 0.2 }]
    : [{ name: "温度", score: tScore, weight: 0.5 }, { name: "水分", score: wScore, weight: 0.3 }, { name: "昼夜温差", score: dScore, weight: 0.2 }]

  return makeScore(weights)
}

// 植保适宜度（未来 3 天：无雨 & 风小 & 温适中）
export function plantProtectionScore(forecast3d: ForecastDay[]): SuitabilityScore {
  if (!forecast3d.length) return makeScore([])
  const days = forecast3d.slice(0, 3)
  const totalRain = days.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const maxWind = Math.max(...days.map(d => d.wind_speed_max ?? 0))
  const avgT = avg(days.map(d => d.temp_mean))

  const rainScore = totalRain === 0 ? 1 : totalRain < 2 ? 0.7 : totalRain < 5 ? 0.4 : 0.1
  const windScore = maxWind < 15 ? 1 : maxWind < 25 ? 0.6 : maxWind < 40 ? 0.3 : 0
  const tScore = tempSuit(avgT)

  return makeScore([
    { name: "降水", score: rainScore, weight: 0.5 },
    { name: "风速", score: windScore, weight: 0.3 },
    { name: "温度", score: tScore, weight: 0.2 },
  ])
}

// 施肥适宜度（未来 7 天：施肥后需有雨但不能大雨）
export function fertilizerScore(forecast7d: ForecastDay[]): SuitabilityScore {
  if (!forecast7d.length) return makeScore([])
  const days = forecast7d.slice(0, 7)
  const totalRain = days.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const maxDayRain = Math.max(...days.map(d => d.precipitation ?? 0))
  const avgT = avg(days.map(d => d.temp_mean))

  // 施肥后 3-5 天内有小雨最佳（5-20mm），大雨会冲走肥料，无雨需灌溉
  const rainScore = totalRain < 3 ? 0.5 : totalRain <= 20 ? 1 : maxDayRain > 25 ? 0.2 : 0.6
  const tScore = tempSuit(avgT)

  return makeScore([
    { name: "降水条件", score: rainScore, weight: 0.6 },
    { name: "温度", score: tScore, weight: 0.4 },
  ])
}

// 灌溉适宜度（降水缺口大 & 近期无雨预期 = 高分）
export function irrigationScore(forecast7d: ForecastDay[], cumulative: SeasonCumulative, stage: MainStage): SuitabilityScore {
  if (!forecast7d.length) return makeScore([])
  const days = forecast7d.slice(0, 7)
  const forecastRain = days.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const avgT = avg(days.map(d => d.temp_mean))

  // 近 7 天预报降水少 = 灌溉需求高
  const t = WATER_THRESHOLDS[stage]
  const rainDeficit = forecastRain < t.optLow ? 1 : forecastRain < t.optHigh ? 0.5 : 0.1
  const tScore = tempSuit(avgT)

  return makeScore([
    { name: "降水缺口", score: rainDeficit, weight: 0.7 },
    { name: "温度", score: tScore, weight: 0.3 },
  ])
}
