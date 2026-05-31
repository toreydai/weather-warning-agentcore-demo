import { describe, expect, it } from "vitest"
import { buildDailyAlertsWecomMarkdown, truncateMarkdown } from "@/lib/services/wecom"
import type { DailyFarmingAlert } from "@/lib/services/daily-alert"

function alert(patch: Partial<DailyFarmingAlert> = {}): DailyFarmingAlert {
  return {
    id: 1,
    county_code: "152502",
    county_name: "锡林浩特市",
    date: "2026-04-24",
    stage: "苗期",
    focus: "田管",
    signals_json: null,
    draft_content: "## 草稿\n\n今日巡田。",
    draft_model: "rule-v1",
    draft_prompt_hash: null,
    final_content: "## 终稿\n\n今日重点检查墒情。",
    status: "published",
    needs_review: false,
    reviewed_by: "reviewer",
    reviewed_at: null,
    published_at: null,
    archived_month: null,
    created_at: null,
    updated_at: null,
    ...patch,
  }
}

describe("wecom service", () => {
  it("builds markdown from published daily alerts", () => {
    const text = buildDailyAlertsWecomMarkdown([alert()], "2026-04-24")
    expect(text).toContain("2026-04-24 每日农事预警")
    expect(text).toContain("锡林浩特市")
    expect(text).toContain("田管 · 苗期")
    expect(text).toContain("今日重点检查墒情")
  })

  it("returns empty-state markdown when no alerts are published", () => {
    const text = buildDailyAlertsWecomMarkdown([], "2026-04-24")
    expect(text).toContain("暂无已发布")
  })

  it("truncates overlong markdown with a clear suffix", () => {
    const text = truncateMarkdown("x".repeat(100), 30)
    expect(text.length).toBeLessThanOrEqual(30)
    expect(text).toContain("已截断")
  })
})

