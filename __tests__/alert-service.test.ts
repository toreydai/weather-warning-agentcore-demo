import { describe, expect, it } from "vitest"
import { evaluateWeatherAlerts, type ThresholdIndex } from "@/lib/services/alert"

const thresholds: ThresholdIndex = {
  frost:       { default: {
    label: "霜冻",
    yellow: { match_mode: "all", temp_min_lte: 5, temp_min_lte_days_gte: 3 },
    orange: { match_mode: "all", temp_min_lte: 2, temp_min_lte_days_gte: 4 },
    red: { match_mode: "all", temp_min_lte: 1, temp_min_lte_days_gte: 5 },
  } },
  heavy_rain:  {
    default: { label: "洪涝", yellow: { precip_3d_gte: 200 }, orange: { precip_3d_gte: 250 }, red: { precip_3d_gte: 300 } },
  },
  strong_gust: { default: { label: "阵风", yellow: { gust_gte: 60 }, orange: { gust_gte: 80 }, red: { gust_gte: 100 } } },
  strong_wind: { default: { label: "风灾", yellow: { wind_gte: 50 }, orange: { wind_gte: 62 }, red: { wind_gte: 103 } } },
  heat: {
    default: { label: "高温", yellow: { temp_max_gte: 30 }, orange: { temp_max_gte: 999 }, red: { temp_max_gte: 999 } },
  },
  dry_hot_wind: {
    default: {
      label: "干热风",
      yellow: { match_mode: "all", temp_max_gte: 30, humidity_lte: 30, wind_gte: 10.8 },
      orange: { match_mode: "all", temp_max_gte: 33, humidity_lte: 25, wind_gte: 14.4 },
      red: { temp_max_gte: 999 },
    },
  },
}

describe("evaluateWeatherAlerts", () => {
  it("returns highest frost severity only after the standard duration is met", () => {
    const futureDays = Array.from({ length: 5 }, () => ({ temp_max: 5, temp_min: 0, precipitation: 0, wind_speed_max: 10, wind_gust: 0, humidity: 60 }))
    const alerts = evaluateWeatherAlerts({ ...futureDays[0], futureDays }, thresholds, "锡林浩特市 · 一号田")
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ type: "frost", severity: "red", title: "霜冻红色预警" })
    expect(alerts[0].desc).toContain("锡林浩特市 · 一号田")
  })

  it("can return multiple alert types for the same day", () => {
    const futureDays = [
      { temp_max: 20, temp_min: 4, precipitation: 90, wind_speed_max: 10, wind_gust: 85, humidity: 60 },
      { temp_max: 20, temp_min: 4, precipitation: 80, wind_speed_max: 10, wind_gust: 0, humidity: 60 },
      { temp_max: 20, temp_min: 4, precipitation: 50, wind_speed_max: 10, wind_gust: 0, humidity: 60 },
    ]
    const alerts = evaluateWeatherAlerts({ ...futureDays[0], futureDays }, thresholds, "二号田")
    expect(alerts.map(a => `${a.type}:${a.severity}`)).toEqual([
      "frost:yellow",
      "heavy_rain:yellow",
      "strong_gust:orange",
    ])
  })

  it("evaluates strong wind and heat thresholds", () => {
    const alerts = evaluateWeatherAlerts({ temp_max: 31, temp_min: 8, precipitation: 0, wind_speed_max: 65, wind_gust: 0, humidity: 50 }, thresholds, "四号田")
    expect(alerts.map(a => `${a.type}:${a.severity}`)).toEqual([
      "strong_wind:orange",
      "heat:yellow",
    ])
  })

  it("returns no alerts when values do not cross thresholds", () => {
    expect(evaluateWeatherAlerts({ temp_max: 20, temp_min: 5, precipitation: 1, wind_speed_max: 10, wind_gust: 20, humidity: 60 }, thresholds, "三号田")).toEqual([])
  })

  it("uses three-day accumulated precipitation for flood alerts", () => {
    const futureDays = [
      { temp_max: 20, temp_min: 8, precipitation: 120, wind_speed_max: 10, wind_gust: 20, humidity: 60 },
      { temp_max: 20, temp_min: 8, precipitation: 100, wind_speed_max: 10, wind_gust: 20, humidity: 60 },
      { temp_max: 20, temp_min: 8, precipitation: 90, wind_speed_max: 10, wind_gust: 20, humidity: 60 },
    ]
    const alerts = evaluateWeatherAlerts({ ...futureDays[0], futureDays }, thresholds, "膨大期田", "bulking")
    expect(alerts.map(a => `${a.type}:${a.severity}`)).toEqual(["heavy_rain:red"])
    expect(alerts[0].desc).toContain("3日累计降水310.0mm")
  })

  it("falls back to default thresholds when a stage has no override", () => {
    const futureDays = [
      { temp_max: 20, temp_min: 8, precipitation: 90, wind_speed_max: 10, wind_gust: 20, humidity: 60 },
      { temp_max: 20, temp_min: 8, precipitation: 90, wind_speed_max: 10, wind_gust: 20, humidity: 60 },
      { temp_max: 20, temp_min: 8, precipitation: 80, wind_speed_max: 10, wind_gust: 20, humidity: 60 },
    ]
    const alerts = evaluateWeatherAlerts({ ...futureDays[0], futureDays }, thresholds, "苗期田", "seedling")
    expect(alerts.map(a => `${a.type}:${a.severity}`)).toEqual(["heavy_rain:orange"])
  })

  it("requires all dry-hot-wind conditions for match_mode=all", () => {
    const noHumidityHit = evaluateWeatherAlerts({ temp_max: 34, temp_min: 8, precipitation: 0, wind_speed_max: 20, wind_gust: 20, humidity: 40 }, thresholds, "膨大期田", "bulking")
    expect(noHumidityHit.map(a => a.type)).not.toContain("dry_hot_wind")

    const alerts = evaluateWeatherAlerts({ temp_max: 34, temp_min: 8, precipitation: 0, wind_speed_max: 20, wind_gust: 20, humidity: 24 }, thresholds, "膨大期田", "bulking")
    expect(alerts.map(a => `${a.type}:${a.severity}`)).toEqual(["heat:yellow", "dry_hot_wind:orange"])
    expect(alerts[1].desc).toContain("相对湿度24%")
  })
})
