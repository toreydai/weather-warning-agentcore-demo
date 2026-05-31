import { describe, expect, it } from "vitest"
import { fastRoute } from "@/lib/services/router"

describe("fastRoute", () => {
  it("routes comprehensive questions to all relevant agents", () => {
    expect(fastRoute("帮我综合分析一下这块地最近情况")).toEqual({
      agents: ["weather-analyst", "alert-analyst", "farming-advisor"],
      task: "综合分析当前天气情况和风险预警，给出农事建议",
    })
  })

  it("routes alert-intent questions before generic weather/farming wording", () => {
    expect(fastRoute("今天有没有需要预警的天气")?.agents).toEqual(["alert-analyst"])
    expect(fastRoute("如果接下来 3 天最低温降到零下怎么办")?.agents).toEqual(["alert-analyst"])
  })

  it("routes farming stage and farm-work questions to farming advisor", () => {
    expect(fastRoute("未来一周有什么需要重点关注的农事")?.agents).toEqual(["farming-advisor"])
    expect(fastRoute("现在是马铃薯什么生长阶段")?.agents).toEqual(["farming-advisor"])
  })
})
