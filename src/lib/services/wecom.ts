import type { DailyFarmingAlert } from "@/lib/services/daily-alert"

const WECOM_MARKDOWN_LIMIT = 4096

export function buildDailyAlertsWecomMarkdown(alerts: DailyFarmingAlert[], date: string): string {
  if (!alerts.length) return `# ${date} 每日农事预警\n\n今日暂无已发布的县级农事预警。`

  const sections = alerts.map(alert => {
    const content = (alert.final_content ?? alert.draft_content).trim()
    const summary = content.length > 900 ? `${content.slice(0, 900)}...` : content
    return `## ${alert.county_name}\n> ${alert.focus ?? "田管"} · ${alert.stage ?? "未识别阶段"}\n\n${summary}`
  })
  return truncateMarkdown(`# ${date} 每日农事预警\n\n${sections.join("\n\n---\n\n")}`)
}

export function truncateMarkdown(text: string, limit = WECOM_MARKDOWN_LIMIT): string {
  if (text.length <= limit) return text
  const suffix = "\n\n...内容过长，已截断。请登录系统查看完整预警。"
  return `${text.slice(0, Math.max(0, limit - suffix.length))}${suffix}`
}

export async function sendWecomMarkdown(webhookUrl: string, markdown: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msgtype: "markdown", markdown: { content: truncateMarkdown(markdown) } }),
  })
  if (!res.ok) throw new Error(`WeCom webhook HTTP ${res.status}: ${await res.text()}`)
  const body = await res.json().catch(() => null) as { errcode?: number; errmsg?: string } | null
  if (body && body.errcode !== 0) throw new Error(`WeCom webhook error ${body.errcode}: ${body.errmsg ?? ""}`)
}

