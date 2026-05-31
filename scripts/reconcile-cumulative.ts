#!/usr/bin/env npx tsx
/**
 * scripts/reconcile-cumulative.ts
 * 增量维护 field_daily_cumulative 表：
 * 对当年所有有新 daily_weather 数据但 cumulative 未更新的地块重新计算并 upsert。
 * 每日 22:30 由 cron 调用（替代原 REFRESH MATERIALIZED VIEW）。
 */
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

async function main() {
  const currentYear = new Date().getFullYear()
  console.log(`Reconciling field_daily_cumulative for year ${currentYear}...`)

  // Find fields that have daily_weather in current year not yet reflected in cumulative
  const staleRes = await pool.query<{ field_id: number }>(`
    SELECT DISTINCT dw.field_id
    FROM daily_weather dw
    LEFT JOIN field_daily_cumulative fc ON fc.field_id = dw.field_id AND fc.date = dw.date
    WHERE EXTRACT(YEAR FROM dw.date::date)::int = $1
      AND fc.field_id IS NULL
  `, [currentYear])

  const staleFieldIds = staleRes.rows.map(r => r.field_id)
  if (!staleFieldIds.length) {
    console.log("All up to date.")
    await pool.end()
    return
  }

  console.log(`Reconciling ${staleFieldIds.length} fields: [${staleFieldIds.join(", ")}]`)

  for (const fieldId of staleFieldIds) {
    await pool.query(`
      INSERT INTO field_daily_cumulative (field_id, date, year, doy, gdd_cumulative, precip_cumulative)
      SELECT
        $1 AS field_id,
        date,
        EXTRACT(YEAR FROM date::date)::int AS year,
        EXTRACT(DOY FROM date::date)::int AS doy,
        SUM(GREATEST(0, (COALESCE(temp_max, 0) + COALESCE(temp_min, 0)) / 2.0 - 4))
          OVER (PARTITION BY EXTRACT(YEAR FROM date::date)::int ORDER BY date)::real AS gdd_cumulative,
        SUM(COALESCE(precipitation, 0))
          OVER (PARTITION BY EXTRACT(YEAR FROM date::date)::int ORDER BY date)::real AS precip_cumulative
      FROM daily_weather
      WHERE field_id = $1
      ORDER BY date
      ON CONFLICT (field_id, date) DO UPDATE SET
        gdd_cumulative = EXCLUDED.gdd_cumulative,
        precip_cumulative = EXCLUDED.precip_cumulative,
        year = EXCLUDED.year,
        doy = EXCLUDED.doy
    `, [fieldId])
    console.log(`  field ${fieldId} done`)
  }

  console.log("Reconcile complete.")
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
