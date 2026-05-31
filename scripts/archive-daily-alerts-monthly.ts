import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"
import { env, requireEnv } from "../src/lib/env"
import { buildMonthlyArchiveMarkdown, groupAlertsByCounty, listUnarchivedPublishedAlertsForMonth, markAlertsArchived, previousMonthChina } from "../src/lib/services/daily-alert"
import { putKnowledgeObject } from "../src/lib/services/knowledge"

const pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), ssl: { rejectUnauthorized: false } })

async function main() {
  if (!env.FEATURE_DAILY_ALERT || !env.FEATURE_KB_UPLOAD) {
    console.log("FEATURE_DAILY_ALERT or FEATURE_KB_UPLOAD disabled, skipped")
    await pool.end()
    return
  }

  const reporter = await startCronRun(pool, "archive-daily-alerts-monthly")
  let processed = 0
  try {
    const month = process.argv.find(a => a.startsWith("--month="))?.slice("--month=".length) ?? previousMonthChina()
    const alerts = await listUnarchivedPublishedAlertsForMonth(month)
    const groups = groupAlertsByCounty(alerts)
    console.log(`Archiving ${alerts.length} alert(s) for ${month} across ${groups.length} county group(s)...`)
    for (const group of groups) {
      const markdown = buildMonthlyArchiveMarkdown({ countyCode: group.countyCode, countyName: group.countyName, month, alerts: group.alerts })
      const year = month.slice(0, 4)
      const key = `daily-alerts/${year}/${group.countyCode}-${month}.md`
      const ingestionJobId = await putKnowledgeObject({ key, content: markdown })
      await markAlertsArchived(group.alerts.map(a => a.id), month)
      processed += group.alerts.length
      console.log(`  ${group.countyName}: ${group.alerts.length} alert(s) -> ${key} ingestion=${ingestionJobId ?? "not-started"}`)
    }
    await reporter.success(processed)
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

