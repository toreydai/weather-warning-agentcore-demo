import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

async function main() {
  const reporter = await startCronRun(pool, "archive-alerts")
  try {
    const today = new Date().toISOString().slice(0, 10)
    // Mark expired alerts by prepending [已过期] to description
    const r = await pool.query(
      `UPDATE alert SET description = '[已过期] ' || COALESCE(description, '')
       WHERE date < $1 AND (description IS NULL OR description NOT LIKE '[已过期]%' AND description NOT LIKE '[已确认]%')`,
      [today]
    )
    const count = r.rowCount ?? 0
    console.log(`Archived ${count} expired alerts (before ${today})`)
    await reporter.success(count)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
