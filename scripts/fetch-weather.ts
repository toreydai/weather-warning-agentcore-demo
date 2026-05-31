import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

interface Field { id: number; name: string; latitude: number; longitude: number }

interface Args {
  startDate?: string
  endDate?: string
  observationsOnly: boolean
  forecastOnly: boolean
}

function parseArgs(): Args {
  const raw = process.argv.slice(2)
  const get = (name: string) => {
    const prefix = `--${name}=`
    const inline = raw.find(a => a.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const i = raw.indexOf(`--${name}`)
    return i >= 0 ? raw[i + 1] : undefined
  }
  const startDate = get("start")
  const endDate = get("end")
  const datePattern = /^\d{4}-\d{2}-\d{2}$/
  if (startDate && !datePattern.test(startDate)) throw new Error("Use --start=YYYY-MM-DD")
  if (endDate && !datePattern.test(endDate)) throw new Error("Use --end=YYYY-MM-DD")
  if (startDate && endDate && startDate > endDate) throw new Error("--start must be <= --end")
  return {
    startDate,
    endDate,
    observationsOnly: raw.includes("--observations-only"),
    forecastOnly: raw.includes("--forecast-only"),
  }
}

function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  return Math.round((end - start) / 86400000)
}

function dateChina(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function listDates(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) dates.push(d)
  return dates
}

function contiguousRanges(dates: string[]): Array<{ start: string; end: string }> {
  const sorted = [...new Set(dates)].sort()
  const ranges: Array<{ start: string; end: string }> = []
  for (const date of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && addDays(last.end, 1) === date) last.end = date
    else ranges.push({ start: date, end: date })
  }
  return ranges
}

function yesterdayUtc(): string {
  return addDays(new Date().toISOString().slice(0, 10), -1)
}

async function fetchHistorical(lat: number, lon: number, startDate: string, endDate: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,weather_code&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Historical API error: ${res.status}`)
  return res.json()
}

async function getMissingObservationRanges(fieldId: number, startDate: string, endDate: string) {
  const existing = await pool.query<{ date: string }>(
    `SELECT date
     FROM daily_weather
     WHERE field_id = $1
       AND date BETWEEN $2 AND $3
       AND temp_max IS NOT NULL
       AND temp_min IS NOT NULL
       AND temp_mean IS NOT NULL
       AND precipitation IS NOT NULL
       AND wind_speed_max IS NOT NULL
       AND humidity IS NOT NULL
       AND weather_code IS NOT NULL`,
    [fieldId, startDate, endDate])
  const existingDates = new Set(existing.rows.map(r => r.date))
  return contiguousRanges(listDates(startDate, endDate).filter(date => !existingDates.has(date)))
}

async function upsertHistoricalRows(fieldId: number, data: any): Promise<number> {
  const dates = data.daily.time as string[]
  let changed = 0
  for (let i = 0; i < dates.length; i++) {
    const r = await pool.query(
      `INSERT INTO daily_weather (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (field_id,date) DO UPDATE SET
         temp_max = COALESCE(daily_weather.temp_max, EXCLUDED.temp_max),
         temp_min = COALESCE(daily_weather.temp_min, EXCLUDED.temp_min),
         temp_mean = COALESCE(daily_weather.temp_mean, EXCLUDED.temp_mean),
         precipitation = COALESCE(daily_weather.precipitation, EXCLUDED.precipitation),
         wind_speed_max = COALESCE(daily_weather.wind_speed_max, EXCLUDED.wind_speed_max),
         humidity = COALESCE(daily_weather.humidity, EXCLUDED.humidity),
         weather_code = COALESCE(daily_weather.weather_code, EXCLUDED.weather_code)`,
      [fieldId, dates[i], data.daily.temperature_2m_max[i], data.daily.temperature_2m_min[i], data.daily.temperature_2m_mean?.[i], data.daily.precipitation_sum[i], data.daily.wind_speed_10m_max[i], data.daily.relative_humidity_2m_mean?.[i], data.daily.weather_code[i]])
    changed += r.rowCount ?? 0
  }
  return changed
}

async function fetchForecast(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,` +
    `wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_max,relative_humidity_2m_min,` +
    `weather_code,soil_temperature_0_to_7cm&forecast_days=16&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo forecast ${res.status}: ${await res.text()}`)
  const json = await res.json() as {
    daily: {
      time: string[]
      temperature_2m_max: (number | null)[]
      temperature_2m_min: (number | null)[]
      temperature_2m_mean: (number | null)[]
      precipitation_sum: (number | null)[]
      wind_speed_10m_max: (number | null)[]
      wind_gusts_10m_max: (number | null)[]
      relative_humidity_2m_max: (number | null)[]
      relative_humidity_2m_min: (number | null)[]
      weather_code: (number | null)[]
      soil_temperature_0_to_7cm: (number | null)[]
    }
  }
  const d = json.daily
  const humMean = d.relative_humidity_2m_max.map((mx, i) => {
    const mn = d.relative_humidity_2m_min[i]
    return mx != null && mn != null ? +((mx + mn) / 2).toFixed(1) : null
  })
  return {
    daily: {
      time: d.time,
      temperature_2m_max: d.temperature_2m_max,
      temperature_2m_min: d.temperature_2m_min,
      temperature_2m_mean: d.temperature_2m_mean,
      precipitation_sum: d.precipitation_sum,
      wind_speed_10m_max: d.wind_speed_10m_max,
      relative_humidity_2m_mean: humMean,
      weather_code: d.weather_code,
      wind_gust_max: d.wind_gusts_10m_max,
      soil_temperature_0_to_10cm_mean: d.soil_temperature_0_to_7cm,
    },
  }
}

async function main() {
  const args = parseArgs()
  if (args.observationsOnly && args.forecastOnly) throw new Error("Use only one of --observations-only or --forecast-only")
  const reporter = await startCronRun(pool, "fetch-weather")
  let inserted = 0
  try {
  const forecastRunAt = new Date()
  const forecastRunDate = dateChina(forecastRunAt)
  const historicalStart = args.startDate ?? `${new Date().getFullYear()}-01-01`
  const historicalEnd = args.endDate ?? yesterdayUtc()
  const fields = (await pool.query("SELECT id, name, latitude, longitude FROM field")).rows as Field[]
  console.log(`Processing ${fields.length} field(s)...`)

  for (const f of fields) {
    console.log(`\nField #${f.id} ${f.name} (${f.latitude}, ${f.longitude})`)

    if (!args.forecastOnly) {
      if (historicalStart <= historicalEnd) {
        const ranges = await getMissingObservationRanges(f.id, historicalStart, historicalEnd)
        if (ranges.length) {
          try {
            console.log(`  Historical gaps: ${ranges.map(r => r.start === r.end ? r.start : `${r.start}→${r.end}`).join(", ")}`)
            let fieldInserted = 0
            for (const range of ranges) {
              const data = await fetchHistorical(f.latitude, f.longitude, range.start, range.end)
              fieldInserted += await upsertHistoricalRows(f.id, data)
            }
            inserted += fieldInserted
            console.log(`  ✅ Filled ${fieldInserted} observation row(s)`)
          } catch (e: unknown) { console.error(`  ❌ Historical failed:`, e instanceof Error ? e.message : e) }
        } else { console.log("  Historical: no gaps") }
      } else { console.log("  Historical: up to date") }
    }

    if (args.observationsOnly) continue
    try {
      const data = await fetchForecast(f.latitude, f.longitude)
      const dates = data.daily.time
      for (let i = 0; i < dates.length; i++) {
        const values = [
          f.id,
          dates[i],
          data.daily.temperature_2m_max[i],
          data.daily.temperature_2m_min[i],
          data.daily.temperature_2m_mean?.[i],
          data.daily.precipitation_sum[i],
          data.daily.wind_speed_10m_max[i],
          data.daily.relative_humidity_2m_mean?.[i],
          data.daily.weather_code[i],
          data.daily.wind_gust_max?.[i] ?? null,
          data.daily.soil_temperature_0_to_10cm_mean?.[i] ?? null,
        ]
        await pool.query(
          "INSERT INTO weather_forecast_history (field_id,forecast_run_at,forecast_date,lead_days,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,wind_gust,soil_temp,provider) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'openmeteo') ON CONFLICT (field_id,forecast_run_at,forecast_date) DO NOTHING",
          [f.id, forecastRunAt, dates[i], daysBetween(forecastRunDate, dates[i]), ...values.slice(2)])
        await pool.query(
          "INSERT INTO weather_forecast (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,wind_gust,soil_temp,fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) ON CONFLICT (field_id,date) DO UPDATE SET temp_max=$3,temp_min=$4,temp_mean=$5,precipitation=$6,wind_speed_max=$7,humidity=$8,weather_code=$9,wind_gust=$10,soil_temp=$11,fetched_at=NOW()",
          values)
      }
      inserted += dates.length
      console.log(`  ✅ Updated ${dates.length} forecast records and archived forecast snapshot`)
    } catch (e: unknown) { console.error(`  ❌ Forecast failed:`, e instanceof Error ? e.message : e) }
  }

  // ── Township / county members ──────────────────────────────────────────────
  interface TownshipMember { admin_code: string; latitude: number; longitude: number; township: string | null; county: string | null }
  const GRID = 0.25
  const roundToGrid = (v: number) => Math.round(v / GRID) * GRID
  const tGridKey = (lat: number, lon: number) => `${roundToGrid(lat).toFixed(2)}_${roundToGrid(lon).toFixed(2)}`

  const townshipRows = (await pool.query<TownshipMember>(
    `SELECT DISTINCT ON (admin_code) admin_code, latitude, longitude, township, county
     FROM zone_member
     WHERE member_type IN ('township','county')
       AND admin_code IS NOT NULL
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL`
  )).rows

  if (townshipRows.length > 0) {
    if (townshipRows.length > 50) console.warn(`[township] WARNING: ${townshipRows.length} members exceeds 50-member limit, processing all but monitor quota`)
    console.log(`\n── Township members: ${townshipRows.length} ──`)

    // ── Historical ERA5（按 0.25° 网格去重） ──
    if (!args.forecastOnly && historicalStart <= historicalEnd) {
      const gridMap = new Map<string, TownshipMember[]>()
      for (const m of townshipRows) {
        const key = tGridKey(m.latitude, m.longitude)
        gridMap.set(key, [...(gridMap.get(key) ?? []), m])
      }
      console.log(`  ERA5 grids: ${gridMap.size}`)

      for (const [key, members] of gridMap) {
        const { latitude, longitude } = members[0]
        // 检查该网格内任一 admin_code 的缺失日期范围
        // 取各 admin_code 已有日期的交集：只有所有成员都有某日期才算"已覆盖"
        // 这样新加成员也会被回填，即使同网格其他成员已有该日期
        const allDates = listDates(historicalStart, historicalEnd)
        const coveredByAll = new Set(allDates)
        for (const m of members) {
          const existing = await pool.query<{ date: string }>(
            `SELECT date FROM township_weather
             WHERE admin_code = $1 AND date BETWEEN $2 AND $3
               AND temp_max IS NOT NULL AND temp_min IS NOT NULL`,
            [m.admin_code, historicalStart, historicalEnd]
          )
          const memberCovered = new Set(existing.rows.map(r => r.date))
          for (const d of [...coveredByAll]) {
            if (!memberCovered.has(d)) coveredByAll.delete(d)
          }
        }
        const missing = contiguousRanges(allDates.filter(d => !coveredByAll.has(d)))
        if (!missing.length) { console.log(`  [${key}] ERA5: no gaps`); continue }

        try {
          console.log(`  [${key}] ERA5 gaps: ${missing.map(r => r.start === r.end ? r.start : `${r.start}→${r.end}`).join(", ")} → ${members.map(m => m.admin_code).join(",")}`)
          for (const range of missing) {
            const data = await fetchHistorical(latitude, longitude, range.start, range.end)
            const dates = data.daily.time as string[]
            for (let i = 0; i < dates.length; i++) {
              for (const m of members) {
                await pool.query(
                  `INSERT INTO township_weather
                   (admin_code,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,source,fetched_at)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'openmeteo-era5',NOW())
                   ON CONFLICT (admin_code,date) DO UPDATE SET
                     temp_max = COALESCE(township_weather.temp_max, EXCLUDED.temp_max),
                     temp_min = COALESCE(township_weather.temp_min, EXCLUDED.temp_min),
                     temp_mean = COALESCE(township_weather.temp_mean, EXCLUDED.temp_mean),
                     precipitation = COALESCE(township_weather.precipitation, EXCLUDED.precipitation),
                     wind_speed_max = COALESCE(township_weather.wind_speed_max, EXCLUDED.wind_speed_max),
                     humidity = COALESCE(township_weather.humidity, EXCLUDED.humidity),
                     weather_code = COALESCE(township_weather.weather_code, EXCLUDED.weather_code)`,
                  [m.admin_code, dates[i],
                   data.daily.temperature_2m_max[i], data.daily.temperature_2m_min[i],
                   data.daily.temperature_2m_mean?.[i],
                   data.daily.precipitation_sum[i], data.daily.wind_speed_10m_max[i],
                   data.daily.relative_humidity_2m_mean?.[i], data.daily.weather_code[i]]
                )
                inserted++
              }
            }
          }
          console.log(`  [${key}] ✅ ERA5 filled for ${members.length} admin_code(s)`)
        } catch (e: unknown) { console.error(`  [${key}] ❌ ERA5 failed:`, e instanceof Error ? e.message : e) }
      }
    }

    // ── Forecast Open-Meteo（每 admin_code 独立调用，不去重） ──
    if (!args.observationsOnly) {
      for (const m of townshipRows) {
        try {
          const data = await fetchForecast(m.latitude, m.longitude)
          const dates = data.daily.time
          for (let i = 0; i < dates.length; i++) {
            await pool.query(
              `INSERT INTO township_weather
               (admin_code,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,wind_gust,soil_temp,source,fetched_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'openmeteo',NOW())
               ON CONFLICT (admin_code,date) DO UPDATE SET
                 temp_max=$3,temp_min=$4,temp_mean=$5,precipitation=$6,
                 wind_speed_max=$7,humidity=$8,weather_code=$9,
                 wind_gust=$10,soil_temp=$11,source='openmeteo',fetched_at=NOW()`,
              [m.admin_code, dates[i],
               data.daily.temperature_2m_max[i], data.daily.temperature_2m_min[i],
               data.daily.temperature_2m_mean?.[i],
               data.daily.precipitation_sum[i], data.daily.wind_speed_10m_max[i],
               data.daily.relative_humidity_2m_mean?.[i], data.daily.weather_code[i],
               data.daily.wind_gust_max?.[i] ?? null,
               data.daily.soil_temperature_0_to_10cm_mean?.[i] ?? null]
            )
            inserted++
          }
          console.log(`  [${m.admin_code}] ${m.township ?? m.county ?? ""} ✅ forecast ${dates.length} days`)
        } catch (e: unknown) { console.error(`  [${m.admin_code}] ❌ Forecast failed:`, e instanceof Error ? e.message : e) }
      }
    }
  }

  console.log("\nDone!")
    await reporter.success(inserted)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
