import { describe, it, expect } from "vitest"
import { computeGDD, computeTotalPrecip } from "@/lib/services/cumulative"
import { potatoClimateScore, plantProtectionScore } from "@/lib/services/suitability"
import type { DailyWeather } from "@/lib/services/weather"
import type { ForecastDay } from "@/lib/weather-types"

const makeDay = (tmax: number, tmin: number, precip = 0): DailyWeather => ({
  id: 1, field_id: 1, date: "2026-05-01",
  temp_max: tmax, temp_min: tmin, temp_mean: (tmax + tmin) / 2,
  precipitation: precip, wind_speed_max: 10, humidity: 60,
  weather_code: 0, wind_gust: null, soil_temp: null, source: "openmeteo-daily",
})

describe("computeGDD", () => {
  it("修正法：Tmin 封底 7°C", () => {
    // Tmin=-5 → 封底为 7，Tmax=15 → (15+7)/2 - 7 = 4
    expect(computeGDD([makeDay(15, -5)])).toBeCloseTo(4, 1)
  })

  it("修正法：Tmax 封顶 30°C", () => {
    // Tmax=35 → 封顶为 30，Tmin=20 → (30+20)/2 - 7 = 18
    expect(computeGDD([makeDay(35, 20)])).toBeCloseTo(18, 1)
  })

  it("低温天 GDD 为 0", () => {
    // Tmax=5, Tmin=0 → Tmin 封底 7，(5+7)/2 - 7 = -1 → max(0,-1) = 0
    expect(computeGDD([makeDay(5, 0)])).toBe(0)
  })

  it("多天累加", () => {
    const days = [makeDay(20, 10), makeDay(25, 15), makeDay(15, 5)]
    // day1: (20+10)/2 - 7 = 8
    // day2: (25+15)/2 - 7 = 13
    // day3: Tmin 封底 7 → (15+7)/2 - 7 = 4
    expect(computeGDD(days)).toBeCloseTo(25, 1)
  })

  it("null 值跳过", () => {
    const day = { ...makeDay(20, 10), temp_max: null, temp_min: null }
    expect(computeGDD([day])).toBe(0)
  })
})

describe("computeTotalPrecip", () => {
  it("累加降水", () => {
    expect(computeTotalPrecip([makeDay(20, 10, 5), makeDay(20, 10, 3)])).toBeCloseTo(8, 1)
  })

  it("null 降水视为 0", () => {
    const day = { ...makeDay(20, 10), precipitation: null }
    expect(computeTotalPrecip([day])).toBe(0)
  })
})

describe("potatoClimateScore", () => {
  it("最适温度 + 适宜降水 → 高分", () => {
    const days = Array(7).fill(makeDay(22, 12, 4)) // 均温 17°C，5天等效降水 ~20mm
    const score = potatoClimateScore(days, "vegetative")
    expect(score.score).toBeGreaterThan(70)
  })

  it("极端高温 → 低于适宜温度", () => {
    const normal = potatoClimateScore(Array(7).fill(makeDay(22, 12, 4)), "vegetative")
    const hot = potatoClimateScore(Array(7).fill(makeDay(38, 28, 4)), "vegetative")
    expect(hot.score).toBeLessThan(normal.score)
  })

  it("返回 level 字段", () => {
    const days = Array(7).fill(makeDay(22, 12, 4))
    const score = potatoClimateScore(days, "vegetative")
    expect(["excellent", "good", "fair", "poor"]).toContain(score.level)
  })
})

describe("plantProtectionScore", () => {
  const makeForecast = (precip: number, wind: number): ForecastDay => ({
    date: "2026-05-01", temp_max: 22, temp_min: 12, temp_mean: 17,
    precipitation: precip, wind_speed_max: wind, humidity: 60, weather_code: 0,
  })

  it("无雨 + 小风 → 高分", () => {
    const score = plantProtectionScore([makeForecast(0, 10), makeForecast(0, 8), makeForecast(0, 12)])
    expect(score.score).toBeGreaterThan(70)
  })

  it("大雨 → 低于无雨情况", () => {
    const noRain = plantProtectionScore([makeForecast(0, 10), makeForecast(0, 8), makeForecast(0, 12)])
    const heavyRain = plantProtectionScore([makeForecast(20, 10), makeForecast(15, 10), makeForecast(10, 10)])
    expect(heavyRain.score).toBeLessThan(noRain.score)
    expect(heavyRain.level).not.toBe("excellent")
  })
})
