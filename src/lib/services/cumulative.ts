import type { DailyWeather } from "@/lib/services/weather"
import { getDailyWeather } from "@/lib/services/weather"
import { parseLocalDate } from "@/lib/utils"

const TBASE = 7
const TUPPER = 30

export function computeGDD(days: DailyWeather[]): number {
  return days.reduce((sum, d) => {
    if (d.temp_max == null || d.temp_min == null) return sum
    const tmax = Math.min(d.temp_max, TUPPER)
    const tmin = Math.max(d.temp_min, TBASE)
    return sum + Math.max(0, (tmax + tmin) / 2 - TBASE)
  }, 0)
}

export function computeTotalPrecip(days: DailyWeather[]): number {
  return days.reduce((sum, d) => sum + (d.precipitation ?? 0), 0)
}

export interface SeasonCumulative {
  fromDate: string
  toDate: string
  dap: number
  gdd: number
  totalPrecip: number
  lastYear: {
    fromDate: string
    toDate: string
    gdd: number
    totalPrecip: number
  } | null
  gddDelta: number | null
  precipDelta: number | null
  gddTrend: "up" | "down" | "flat"
  precipTrend: "up" | "down" | "flat"
}

function addDays(date: string, days: number): string {
  const d = parseLocalDate(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function trend(delta: number | null): "up" | "down" | "flat" {
  if (delta == null) return "flat"
  if (delta > 1) return "up"
  if (delta < -1) return "down"
  return "flat"
}

export async function computeSeasonCumulative(
  fieldId: number,
  plantingDate: string
): Promise<SeasonCumulative> {
  const today = new Date().toISOString().slice(0, 10)
  const dap = Math.floor((parseLocalDate(today).getTime() - parseLocalDate(plantingDate).getTime()) / 86400000)

  // 今年：播种日至今
  const currentDays = await getDailyWeather(fieldId, plantingDate, today)
  const gdd = computeGDD(currentDays)
  const totalPrecip = computeTotalPrecip(currentDays)

  // 去年同期：按 DAP 农事同期对齐
  const lastYearPlanting = addDays(plantingDate, -365)
  const lastYearEnd = addDays(lastYearPlanting, dap)
  const lastYearDays = await getDailyWeather(fieldId, lastYearPlanting, lastYearEnd)

  let lastYear: SeasonCumulative["lastYear"] = null
  let gddDelta: number | null = null
  let precipDelta: number | null = null

  if (lastYearDays.length > 0) {
    const lyGdd = computeGDD(lastYearDays)
    const lyPrecip = computeTotalPrecip(lastYearDays)
    lastYear = { fromDate: lastYearPlanting, toDate: lastYearEnd, gdd: lyGdd, totalPrecip: lyPrecip }
    gddDelta = parseFloat((gdd - lyGdd).toFixed(1))
    precipDelta = parseFloat((totalPrecip - lyPrecip).toFixed(1))
  }

  return {
    fromDate: plantingDate,
    toDate: today,
    dap,
    gdd: parseFloat(gdd.toFixed(1)),
    totalPrecip: parseFloat(totalPrecip.toFixed(1)),
    lastYear,
    gddDelta,
    precipDelta,
    gddTrend: trend(gddDelta),
    precipTrend: trend(precipDelta),
  }
}
