import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"
import { env, requireEnv } from "../src/lib/env"
import { generateDailyAlertForCounty, getCountyFieldGroups, todayChina } from "../src/lib/services/daily-alert"

const pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), ssl: { rejectUnauthorized: false } })

async function main() {
  if (!env.FEATURE_DAILY_ALERT) {
    console.log("FEATURE_DAILY_ALERT=false, skipped")
    await pool.end()
    return
  }

  const reporter = await startCronRun(pool, "generate-daily-alert")
  let processed = 0
  try {
    const date = process.argv.find(a => a.startsWith("--date="))?.slice("--date=".length) ?? todayChina()
    const countyFilter = process.argv.find(a => a.startsWith("--county="))?.slice("--county=".length) ?? null
    let groups = await getCountyFieldGroups()
    if (countyFilter) groups = groups.filter(g => g.countyCode === countyFilter)
    console.log(`Generating daily alerts for ${date}, ${groups.length} county group(s)${countyFilter ? ` (county=${countyFilter})` : ""}...`)
    for (const group of groups) {
      const alert = await generateDailyAlertForCounty(group, date)
      processed++
      console.log(`  ${alert.county_name} ${alert.date} -> ${alert.status} #${alert.id}`)
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
