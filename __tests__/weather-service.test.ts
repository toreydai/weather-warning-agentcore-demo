import { describe, expect, it } from "vitest"
import { buildWeeklyReports, mergeDailyAndForecast } from "@/lib/services/weather"
import type { DailyWeather, WeatherForecast } from "@/lib/services/weather"

const daily = (date: string, temp = 10, precipitation = 0, wind = 5): DailyWeather => ({
  id: 1,
  field_id: 1,
  date,
  temp_max: temp + 5,
  temp_min: temp - 5,
  temp_mean: temp,
  precipitation,
  wind_speed_max: wind,
  humidity: null,
  weather_code: null,
  wind_gust: null,
  soil_temp: null,
  source: "openmeteo-daily",
})

const forecast = (date: string, temp = 12): WeatherForecast => ({
  id: 2,
  field_id: 1,
  date,
  temp_max: temp + 5,
  temp_min: temp - 5,
  temp_mean: temp,
  precipitation: 1,
  wind_speed_max: 6,
  humidity: null,
  weather_code: null,
  wind_gust: null,
  soil_temp: null,
  fetched_at: null,
})

describe("weather service pure helpers", () => {
  it("merges forecast without overriding observed daily rows", () => {
    const merged = mergeDailyAndForecast(
      [daily("2026-04-20", 9), daily("2026-04-21", 10)],
      [forecast("2026-04-21", 99), forecast("2026-04-22", 11)],
      1,
    )

    expect(merged.map(d => d.date)).toEqual(["2026-04-20", "2026-04-21", "2026-04-22"])
    expect(merged.find(d => d.date === "2026-04-21")?.temp_mean).toBe(10)
    expect(merged.find(d => d.date === "2026-04-22")?.temp_mean).toBe(11)
  })

  it("groups days by ISO week and computes aggregates", () => {
    const weeks = buildWeeklyReports([
      daily("2026-04-20", 10, 2, 10),
      daily("2026-04-21", 12, 3, 20),
      daily("2026-04-27", 20, 5, 30),
    ])

    expect(weeks).toHaveLength(2)
    expect(weeks[0]).toMatchObject({
      week_start: "2026-04-20",
      week_end: "2026-04-21",
      avg_temp: 11,
      total_precip: 5,
      max_wind: 20,
    })
    expect(weeks[1].week_start).toBe("2026-04-27")
  })
})

