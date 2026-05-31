import { describe, expect, it } from "vitest"
import { aggregateCountyForecastByDate, analyzeWeatherSignals, buildDailyAlertMarkdown, buildKbQuery, buildLlmDraftPrompt, buildMonthlyArchiveMarkdown, decideFocus, groupAlertsByCounty, previousMonthChina } from "@/lib/services/daily-alert"
import type { DailyFarmingAlert } from "@/lib/services/daily-alert"
import type { WeatherForecast } from "@/lib/services/weather"

function day(i: number, patch: Partial<WeatherForecast> = {}): WeatherForecast {
  const date = new Date("2026-04-24T00:00:00")
  date.setDate(date.getDate() + i)
  return {
    id: i + 1,
    field_id: 1,
    date: date.toISOString().slice(0, 10),
    temp_max: 20,
    temp_min: 8,
    temp_mean: 14,
    precipitation: 0,
    wind_speed_max: 10,
    humidity: null,
    weather_code: null,
    wind_gust: null,
    soil_temp: null,
    fetched_at: null,
    ...patch,
  }
}

describe("daily alert service pure helpers", () => {
  it("splits weather signals into 7/15/45 day confidence windows", () => {
    const rows = Array.from({ length: 45 }, (_, i) => day(i))
    rows[0] = day(0, { temp_min: -1 })
    rows[1] = day(1, { precipitation: 25 })
    rows[8] = day(8, { precipitation: 10 })
    rows[20] = day(20, { temp_mean: 18, precipitation: 2 })

    const signals = analyzeWeatherSignals(rows)
    expect(signals.highConfidence.days).toBe(7)
    expect(signals.highConfidence.frostDays).toEqual(["2026-04-24"])
    expect(signals.highConfidence.totalPrecip).toBe(25)
    expect(signals.mediumTrend.days).toBe(8)
    expect(signals.mediumTrend.totalPrecip).toBe(10)
    expect(signals.extendedOutlook.days).toBe(30)
  })

  it("aggregates county forecast from all fields instead of using the first field only", () => {
    const rows = [
      day(0, { field_id: 1, temp_max: 20, temp_min: 8, temp_mean: 14, precipitation: 2, wind_speed_max: 10 }),
      day(0, { field_id: 2, temp_max: 24, temp_min: 6, temp_mean: 15, precipitation: 6, wind_speed_max: 30 }),
      day(1, { field_id: 1, temp_max: 18, temp_min: 5, temp_mean: 12, precipitation: 0, wind_speed_max: 8 }),
    ]

    const aggregated = aggregateCountyForecastByDate(rows)

    expect(aggregated).toHaveLength(2)
    expect(aggregated[0]).toMatchObject({
      date: "2026-04-24",
      temp_max: 24,
      temp_min: 6,
      temp_mean: 14.5,
      precipitation: 4,
      wind_speed_max: 30,
    })
  })

  it("prioritizes frost and drainage focus before stage defaults", () => {
    const frostSignals = analyzeWeatherSignals([day(0, { temp_min: -2 })])
    expect(decideFocus("苗期", frostSignals)).toBe("防冻")

    const rainSignals = analyzeWeatherSignals([day(0, { precipitation: 35 })])
    expect(decideFocus("苗期", rainSignals)).toBe("排涝")

    const harvestSignals = analyzeWeatherSignals([day(0)])
    expect(decideFocus("成熟/杀秧期", harvestSignals)).toBe("采收")
  })

  it("builds markdown with county, stage, focus and uncertainty notice", () => {
    const signals = analyzeWeatherSignals(Array.from({ length: 45 }, (_, i) => day(i)))
    const markdown = buildDailyAlertMarkdown({ countyName: "锡林浩特市", date: "2026-04-24", stage: "苗期", focus: "田管", signals, fieldCount: 3 })
    expect(markdown).toContain("锡林浩特市")
    expect(markdown).toContain("主力生育阶段")
    expect(markdown).toContain("延伸期预报不确定性较大")
  })

  it("computes previous month in China timezone context", () => {
    expect(previousMonthChina(new Date("2026-04-15T00:00:00Z"))).toBe("2026-03")
    expect(previousMonthChina(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12")
  })

  it("builds KB retrieval query from county, stage, focus and active risk signals", () => {
    const baseSignals = analyzeWeatherSignals(Array.from({ length: 7 }, (_, i) => day(i)))
    expect(buildKbQuery({ countyName: "锡林浩特市", stage: "苗期", focus: "田管", signals: baseSignals }))
      .toBe("锡林浩特市 马铃薯 苗期 田管")

    const frostSignals = analyzeWeatherSignals([day(0, { temp_min: -2 }), ...Array.from({ length: 6 }, (_, i) => day(i + 1))])
    expect(buildKbQuery({ countyName: "正蓝旗", stage: "苗期", focus: "防冻", signals: frostSignals }))
      .toContain("霜冻防护")

    const heavyRain = analyzeWeatherSignals([day(0, { precipitation: 25 }), ...Array.from({ length: 6 }, (_, i) => day(i + 1))])
    expect(buildKbQuery({ countyName: "正蓝旗", stage: "苗期", focus: "排涝", signals: heavyRain }))
      .toContain("强降雨排涝")
  })

  it("builds LLM prompt that surfaces all three confidence tiers and KB section", () => {
    const rows = Array.from({ length: 45 }, (_, i) => day(i))
    rows[0] = day(0, { temp_min: -1 })
    rows[2] = day(2, { precipitation: 12 })
    rows[10] = day(10, { precipitation: 8 })
    rows[30] = day(30, { temp_mean: 17, precipitation: 1 })
    const signals = analyzeWeatherSignals(rows)

    const prompt = buildLlmDraftPrompt({
      countyName: "锡林浩特市",
      date: "2026-04-24",
      stage: "苗期",
      focus: "防冻",
      signals,
      fieldCount: 3,
      kbPassages: ["霜冻防护：覆盖地膜或熏烟。", "苗期低温预防"],
    })

    expect(prompt).toContain("锡林浩特市")
    expect(prompt).toContain("2026-04-24")
    expect(prompt).toContain("主力生育阶段：苗期")
    expect(prompt).toContain("今日关注：防冻")
    expect(prompt).toMatch(/未来 7 天 高置信预报/)
    expect(prompt).toMatch(/7~15 天 中置信趋势/)
    expect(prompt).toMatch(/15~45 天 低置信延伸期展望/)
    expect(prompt).toContain("【参考资料 1】")
    expect(prompt).toContain("【参考资料 2】")
    expect(prompt).toContain("霜冻日：2026-04-24")
    expect(prompt).toContain("仅返回 JSON")
  })

  it("falls back to 'no KB references' notice when KB passages are empty", () => {
    const signals = analyzeWeatherSignals(Array.from({ length: 7 }, (_, i) => day(i)))
    const prompt = buildLlmDraftPrompt({
      countyName: "锡林浩特市",
      date: "2026-04-24",
      stage: "苗期",
      focus: "田管",
      signals,
      fieldCount: 1,
      kbPassages: [],
    })
    expect(prompt).toContain("无相关知识库参考")
    expect(prompt).not.toContain("【参考资料 1】")
  })

  it("groups alerts by county and builds monthly archive markdown", () => {
    const alerts: DailyFarmingAlert[] = [
      alertRecord({ id: 2, county_code: "B", county_name: "乙县", date: "2026-03-02" }),
      alertRecord({ id: 1, county_code: "A", county_name: "甲县", date: "2026-03-01" }),
      alertRecord({ id: 3, county_code: "A", county_name: "甲县", date: "2026-03-02", final_content: "终稿 2" }),
    ]
    const groups = groupAlertsByCounty(alerts)
    expect(groups).toHaveLength(2)
    expect(groups.find(g => g.countyCode === "A")?.alerts).toHaveLength(2)

    const markdown = buildMonthlyArchiveMarkdown({ countyCode: "A", countyName: "甲县", month: "2026-03", alerts: groups.find(g => g.countyCode === "A")!.alerts })
    expect(markdown).toContain("alert_count: 2")
    expect(markdown.indexOf("2026-03-01")).toBeLessThan(markdown.indexOf("2026-03-02"))
    expect(markdown).toContain("终稿 2")
  })
})

function alertRecord(patch: Partial<DailyFarmingAlert>): DailyFarmingAlert {
  return {
    id: 1,
    county_code: "A",
    county_name: "甲县",
    date: "2026-03-01",
    stage: "苗期",
    focus: "田管",
    signals_json: null,
    draft_content: "草稿",
    draft_model: "rule-v1",
    draft_prompt_hash: null,
    final_content: "终稿",
    status: "published",
    needs_review: false,
    reviewed_by: null,
    reviewed_at: null,
    published_at: null,
    archived_month: null,
    created_at: null,
    updated_at: null,
    ...patch,
  }
}
