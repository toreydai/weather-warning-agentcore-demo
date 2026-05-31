import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"
import { getStageInfo } from "../src/lib/services/advice"
import { evaluateWeatherAlerts, rowsToThresholdIndex } from "../src/lib/services/alert"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

interface Threshold {
  alert_type: string
  stage: string | null
  label: string
  yellow_condition: string
  orange_condition: string
  red_condition: string
}
interface ForecastRow {
  field_id: number
  field_name: string
  location_label: string
  planting_date: string | null
  harvest_date: string | null
  harvest_type: string | null
  date: string
  temp_max: number | null
  temp_min: number | null
  precipitation: number | null
  wind_speed_max: number | null
  wind_gust: number | null
  humidity: number | null
  cumulative_gdd: number | null
}

async function main() {
  const reporter = await startCronRun(pool, "check-alerts")
  let created = 0
  try {
    const thresholdRows = (await pool.query("SELECT alert_type,stage,label,yellow_condition,orange_condition,red_condition FROM alert_threshold")).rows as Threshold[]
    const thresholds = rowsToThresholdIndex(thresholdRows)
    const today = new Date().toISOString().slice(0, 10)
    const in7days = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10)

    // 每次全量刷新：先删掉今天及以后的旧预警，再按最新预报重新生成
    await pool.query("DELETE FROM alert WHERE date >= $1", [today])

    const forecasts = (await pool.query(
      `SELECT
         wf.field_id,
         f.name as field_name,
         CASE
           WHEN COALESCE(f.county, f.township) IS NULL THEN f.name
           ELSE CONCAT_WS('', f.county, f.township, ' · ', f.name)
         END as location_label,
         f.planting_date,
         f.harvest_date,
         f.harvest_type,
         wf.date,
         wf.temp_max,
         wf.temp_min,
         wf.precipitation,
         wf.wind_speed_max,
         wf.wind_gust,
         wf.humidity,
         fc.gdd_cumulative as cumulative_gdd
       FROM weather_forecast wf JOIN field f ON f.id=wf.field_id
       LEFT JOIN field_daily_cumulative fc ON fc.field_id=wf.field_id AND fc.date=wf.date
       WHERE wf.date >= $1 AND wf.date <= $2
         AND (f.harvest_date IS NULL OR f.harvest_date > $1)
       ORDER BY wf.field_id, wf.date`, [today, in7days]
    )).rows as ForecastRow[]

    console.log(`Checking ${forecasts.length} forecast rows against ${thresholdRows.length} thresholds...`)

    for (const row of forecasts) {
      const stage = row.planting_date
        ? getStageInfo(row.date, row.planting_date, { date: row.harvest_date, type: row.harvest_type }).main
        : undefined
      if (stage === "harvested") continue
      const results = evaluateWeatherAlerts(
        {
          temp_max: row.temp_max,
          temp_min: row.temp_min,
          precipitation: row.precipitation,
          wind_speed_max: row.wind_speed_max,
          wind_gust: row.wind_gust,
          humidity: row.humidity,
          cumulativeGdd: row.cumulative_gdd,
          futureDays: forecasts
            .filter(d => d.field_id === row.field_id && d.date >= row.date)
            .map(d => ({
              temp_max: d.temp_max,
              temp_min: d.temp_min,
              precipitation: d.precipitation,
              wind_speed_max: d.wind_speed_max,
              wind_gust: d.wind_gust,
              humidity: d.humidity,
              cumulativeGdd: d.cumulative_gdd,
            })),
        },
        thresholds,
        row.location_label,
        stage,
      )
      for (const result of results) {
        const r = await pool.query(
          `UPDATE alert
           SET severity=$4, title=$5, description=$6, emergency_plan=$7, stage=$8
           WHERE field_id=$1 AND date=$2 AND type=$3`,
          [row.field_id, row.date, result.type, result.severity, result.title, result.desc, JSON.stringify(result.plan), stage]
        )
        if ((r.rowCount ?? 0) === 0) {
          await pool.query(
            `INSERT INTO alert (field_id, date, type, severity, title, description, emergency_plan, stage, start_date, end_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$2,$2)`,
            [row.field_id, row.date, result.type, result.severity, result.title, result.desc, JSON.stringify(result.plan), stage]
          )
          created++
          console.log(`  ⚠️ ${result.severity} ${result.type}${stage ? `/${stage}` : ""}: ${row.field_name} ${row.date}`)
        }
      }
    }

    console.log(`\nDone! Created ${created} new alerts.`)
    await reporter.success(created)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
