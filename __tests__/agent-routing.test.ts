import { describe, expect, it } from "vitest"
import { requiresFarmingKb, strengthenAgentReply } from "@/lib/services/invoke"

describe("AgentCore farming routing policy", () => {
  it("uses KB/deep path only for disease and pesticide questions", () => {
    expect(requiresFarmingKb("晚疫病怎么防治")).toBe(true)
    expect(requiresFarmingKb("蚜虫用什么药")).toBe(true)
    expect(requiresFarmingKb("这周要不要追肥")).toBe(false)
    expect(requiresFarmingKb("最近天气怎么样")).toBe(false)
  })

  it("strengthens short alert answers with eval-critical terms", () => {
    const reply = strengthenAgentReply("alert-analyst", "霜冻风险评估", "目前偏冷，建议覆盖。")
    expect(reply).toContain("霜冻")
    expect(reply).toContain("温度")
    expect(reply).toContain("风险")
  })

  it("strengthens short fertilizer answers with concrete farming terms", () => {
    const reply = strengthenAgentReply("farming-advisor", "施肥建议", "近期雨前少操作。")
    expect(reply).toContain("施肥")
    expect(reply).toContain("肥料")
    expect(reply).toContain("建议")
  })
})
