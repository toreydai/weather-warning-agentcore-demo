import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"
import { env, requireEnv } from "../src/lib/env"
import { listDailyAlerts, todayChina } from "../src/lib/services/daily-alert"
import { buildDailyAlertsWecomMarkdown, sendWecomMarkdown } from "../src/lib/services/wecom"

const pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), ssl: { rejectUnauthorized: false } })

async function main() {
  if (!env.FEATURE_WECOM_PUSH) {
    console.log("FEATURE_WECOM_PUSH=false, skipped")
    await pool.end()
    return
  }

  const reporter = await startCronRun(pool, "push-daily-alert")
  try {
    const webhookUrl = requireEnv("WECOM_WEBHOOK_URL")
    const date = process.argv.find(a => a.startsWith("--date="))?.slice("--date=".length) ?? todayChina()
    const alerts = await listDailyAlerts({ date, status: "published" })
    const markdown = buildDailyAlertsWecomMarkdown(alerts, date)
    await sendWecomMarkdown(webhookUrl, markdown)
    console.log(`Pushed ${alerts.length} published daily alert(s) for ${date}`)
    await reporter.success(alerts.length)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})

