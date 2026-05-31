import { Pool } from "pg"

export {}

interface Args {
  startDate: string
  endDate: string
  leadMax: number
  groupBy: "lead" | "field" | "county"
  json: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const get = (name: string, fallback?: string) => {
    const prefix = `--${name}=`
    const inline = args.find(a => a.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : fallback
  }

  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit" }).format(new Date())
  const month = get("month", currentMonth)
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error("Use --month=YYYY-MM")
  const startDate = get("start", `${month}-01`)
  const endDate = get("end", monthEnd(month))
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("Use --start=YYYY-MM-DD")
  if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error("Use --end=YYYY-MM-DD")
  if (startDate > endDate) throw new Error("--start must be <= --end")
  const leadMax = Number(get("lead-max", "45"))
  if (!Number.isFinite(leadMax) || leadMax < 1) throw new Error("--lead-max must be a positive number")
  const groupBy = get("group-by", "lead")
  if (groupBy !== "lead" && groupBy !== "field" && groupBy !== "county") throw new Error("--group-by must be lead, field, or county")
  return { startDate, endDate, leadMax, groupBy, json: args.includes("--json") }
}

function monthEnd(month: string): string {
  const [year, mon] = month.split("-").map(Number)
  return new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10)
}

function fmt(value: string | null): string {
  return value == null ? "-" : Number(value).toFixed(2)
}

function groupSql(groupBy: Args["groupBy"]) {
  if (groupBy === "field") {
    return {
      key: "f.id::text",
      name: "f.name",
      sort: "f.id",
    }
  }
  if (groupBy === "county") {
    return {
      key: "COALESCE(f.admin_code, f.county, f.region, 'unknown')",
      name: "COALESCE(f.county, f.region, '未设置县域')",
      sort: "COALESCE(f.admin_code, f.county, f.region, 'unknown')",
    }
  }
  return {
    key: `CASE
            WHEN h.lead_days BETWEEN 0 AND 7 THEN '0-7d'
            WHEN h.lead_days BETWEEN 8 AND 15 THEN '8-15d'
            ELSE '16-45d'
          END`,
    name: `CASE
            WHEN h.lead_days BETWEEN 0 AND 7 THEN '0-7d'
            WHEN h.lead_days BETWEEN 8 AND 15 THEN '8-15d'
            ELSE '16-45d'
          END`,
    sort: `CASE
             WHEN h.lead_days BETWEEN 0 AND 7 THEN 1
             WHEN h.lead_days BETWEEN 8 AND 15 THEN 2
             ELSE 3
           END`,
  }
}

async function main() {
  const args = parseArgs()
  const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })
  try {
    const grouping = groupSql(args.groupBy)
    const rows = await pool.query<{
      group_key: string
      group_name: string
      snapshot_samples: string
      paired_samples: string
      temp_mean_mae: string | null
      temp_mean_bias: string | null
      temp_mean_rmse: string | null
      temp_max_mae: string | null
      temp_min_mae: string | null
      precip_mae: string | null
      wind_mae: string | null
    }>(`
      WITH paired AS (
        SELECT
          ${grouping.key} AS group_key,
          ${grouping.name} AS group_name,
          ${grouping.sort} AS sort_key,
          h.temp_mean AS f_temp_mean,
          h.temp_max AS f_temp_max,
          h.temp_min AS f_temp_min,
          h.precipitation AS f_precip,
          h.wind_speed_max AS f_wind,
          d.temp_mean AS a_temp_mean,
          d.temp_max AS a_temp_max,
          d.temp_min AS a_temp_min,
          d.precipitation AS a_precip,
          d.wind_speed_max AS a_wind,
          d.id AS actual_id
        FROM weather_forecast_history h
        JOIN field f ON f.id = h.field_id
        LEFT JOIN daily_weather d
          ON d.field_id = h.field_id
         AND d.date = h.forecast_date
        WHERE h.forecast_date BETWEEN $1 AND $2
          AND h.lead_days BETWEEN 0 AND $3
      )
      SELECT
        group_key,
        group_name,
        COUNT(*)::text AS snapshot_samples,
        COUNT(actual_id)::text AS paired_samples,
        (AVG(ABS(f_temp_mean - a_temp_mean)) FILTER (WHERE actual_id IS NOT NULL))::text AS temp_mean_mae,
        (AVG(f_temp_mean - a_temp_mean) FILTER (WHERE actual_id IS NOT NULL))::text AS temp_mean_bias,
        SQRT(AVG(POWER(f_temp_mean - a_temp_mean, 2)) FILTER (WHERE actual_id IS NOT NULL))::text AS temp_mean_rmse,
        (AVG(ABS(f_temp_max - a_temp_max)) FILTER (WHERE actual_id IS NOT NULL))::text AS temp_max_mae,
        (AVG(ABS(f_temp_min - a_temp_min)) FILTER (WHERE actual_id IS NOT NULL))::text AS temp_min_mae,
        (AVG(ABS(COALESCE(f_precip, 0) - COALESCE(a_precip, 0))) FILTER (WHERE actual_id IS NOT NULL))::text AS precip_mae,
        (AVG(ABS(f_wind - a_wind)) FILTER (WHERE actual_id IS NOT NULL))::text AS wind_mae
      FROM paired
      GROUP BY group_key, group_name
      ORDER BY MIN(sort_key), group_name
    `, [args.startDate, args.endDate, args.leadMax])

    if (args.json) {
      console.log(JSON.stringify(rows.rows, null, 2))
      return
    }

    console.log(`Forecast accuracy for ${args.startDate}..${args.endDate} (lead <= ${args.leadMax}d, group=${args.groupBy})`)
    console.log("group | snapshots | paired | temp_mean_mae | temp_mean_bias | temp_mean_rmse | temp_max_mae | temp_min_mae | precip_mae | wind_mae")
    console.log("---|---:|---:|---:|---:|---:|---:|---:|---:|---:")
    for (const r of rows.rows) {
      console.log([r.group_name, r.snapshot_samples, r.paired_samples, fmt(r.temp_mean_mae), fmt(r.temp_mean_bias), fmt(r.temp_mean_rmse), fmt(r.temp_max_mae), fmt(r.temp_min_mae), fmt(r.precip_mae), fmt(r.wind_mae)].join(" | "))
    }
    if (!rows.rows.length) console.log("(no paired forecast/history samples yet)")
  } finally {
    await pool.end()
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
