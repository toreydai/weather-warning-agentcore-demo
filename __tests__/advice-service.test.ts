import { describe, expect, it } from "vitest"
import { generateFarmingAdvice, getPotatoGrowthStage } from "@/lib/services/advice"

describe("getPotatoGrowthStage", () => {
  it("maps days after planting to growth stages at boundaries", () => {
    expect(getPotatoGrowthStage("2026-04-24", "2026-04-25")).toBe("播前整地准备期")
    expect(getPotatoGrowthStage("2026-04-25", "2026-04-25")).toBe("种薯处理/催芽期")
    expect(getPotatoGrowthStage("2026-05-15", "2026-04-25")).toBe("播后管理期")
    expect(getPotatoGrowthStage("2026-06-29", "2026-04-25")).toBe("现蕾期")
    expect(getPotatoGrowthStage("2026-09-15", "2026-04-25")).toBe("收获期")
    expect(getPotatoGrowthStage("2026-10-01", "2026-04-25")).toBe("收获收尾/入窖期")
  })
})

describe("generateFarmingAdvice", () => {
  it("summarizes dry, hot, frosty and windy weeks", () => {
    const advice = generateFarmingAdvice([
      { temp_mean: 12, temp_min: -1, temp_max: 20, precipitation: 1, wind_speed_max: 10 },
      { temp_mean: 18, temp_min: 5, temp_max: 34, precipitation: 2, wind_speed_max: 45 },
    ], "2026-06-10", "2026-04-25")

    expect(advice.summary).toContain("注意霜冻风险")
    expect(advice.summary).toContain("降水偏少")
    expect(advice.summary).toContain("高温天气")
    expect(advice.summary).toContain("大风天气")
    expect(advice.irrigation).toContain("及时灌溉")
  })

  it("handles empty weather data without producing NaN", () => {
    const advice = generateFarmingAdvice([], "2026-06-10", "2026-04-25")
    expect(advice.summary).not.toContain("NaN")
    expect(advice.summary).toContain("暂无本周气象数据")
  })
})

