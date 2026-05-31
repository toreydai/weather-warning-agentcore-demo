#!/usr/bin/env npx tsx
/**
 * scripts/backfill-historical.ts
 * 回填 Open-Meteo ERA5 历史数据（2015-01-01 至 7 天前）
 * 特性：幂等、断点续传、指数退避重试、ERA5 网格去重
 *
 * 用法：
 *   npx tsx scripts/backfill-historical.ts              # 全量回填
 *   npx tsx scripts/backfill-historical.ts --field 1    # 只回填指定地块
 *   npx tsx scripts/backfill-historical.ts --dry-run    # 只打印计划，不写库
 */

import { Pool } from "pg"

const DB_URL = process.env.DATABASE_URL!
const START_DATE = "2015-01-01"
const ERA5_LAG_DAYS = 7      // ERA5 有 5-7 天滞后，跳过最近 7 天
const CHUNK_DAYS = 365        // 每次请求最多拉 365 天
const GRID = 0.25             // ERA5 网格分辨率（度）
const SLEEP_MS = 300          // 请求间隔，远低于 600/min 限额

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const FIELD_FILTER = (() => { const i = args.indexOf("--field"); return i >= 0 ? parseInt(args[i + 1]) : null })()

const pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function subDays(date: string, days: number): string { return addDays(date, -days) }

function roundToGrid(v: number): number { return Math.round(v / GRID) * GRID }

function gridKey(lat: number, lon: number): string {
  return `${roundToGrid(lat).toFixed(2)}_${roundToGrid(lon).toFixed(2)}`
}

function* chunkDateRange(start: string, end: string, chunkDays: number): Generator<{ start: string; end: string }> {
  let cur = start
  while (cur <= end) {
    const chunkEnd = addDays(cur, chunkDays - 1)
    yield { start: cur, end: chunkEnd > end ? end : chunkEnd }
    cur = addDays(chunkEnd, 1)
    if (cur > end) break
  }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 6): Promise<T> {
  let delay = 1000
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() }
    catch (e) {
      if (i === maxRetries) throw e
      console.warn(`  retry ${i + 1}/${maxRetries} after ${delay}ms: ${(e as Error).message}`)
      await sleep(delay)
      delay = Math.min(delay * 2, 30000)
    }
  }
  throw new Error("unreachable")
}

async function fetchArchive(lat: number, lon: number, start: string, end: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}` +
    `&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,weather_code` +
    `&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo archive ${res.status}: ${await res.text()}`)
  return res.json() as Promise<{ daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; temperature_2m_mean: number[]; precipitation_sum: number[]; wind_speed_10m_max: number[]; relative_humidity_2m_mean: number[]; weather_code: number[] } }>
}

async function getProgress(key: string): Promise<string | null> {
  const r = await pool.query("SELECT last_date FROM backfill_progress WHERE grid_key=$1", [key])
  return r.rows[0]?.last_date ?? null
}

async function saveProgress(key: string, lastDate: string) {
  await pool.query(
    `INSERT INTO backfill_progress(grid_key,last_date,updated_at) VALUES($1,$2,NOW())
     ON CONFLICT(grid_key) DO UPDATE SET last_date=$2, updated_at=NOW()`,
    [key, lastDate]
  )
}

async function upsertArchiveRows(fieldId: number, data: Awaited<ReturnType<typeof fetchArchive>>) {
  const { time, temperature_2m_max, temperature_2m_min, temperature_2m_mean,
    precipitation_sum, wind_speed_10m_max, relative_humidity_2m_mean, weather_code } = data.daily

  for (let i = 0; i < time.length; i++) {
    await pool.query(
      `INSERT INTO daily_weather
         (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'openmeteo-archive')
       ON CONFLICT (field_id,date) DO UPDATE SET
         temp_max=$3,temp_min=$4,temp_mean=$5,precipitation=$6,
         wind_speed_max=$7,humidity=$8,weather_code=$9,source='openmeteo-archive'
       WHERE daily_weather.source='openmeteo-archive'`,  // 不覆盖 openmeteo-daily 数据
      [fieldId, time[i],
        temperature_2m_max[i] ?? null, temperature_2m_min[i] ?? null, temperature_2m_mean[i] ?? null,
        precipitation_sum[i] ?? null, wind_speed_10m_max[i] ?? null,
        relative_humidity_2m_mean[i] ?? null, weather_code[i] ?? null]
    )
  }
}

async function reconcileCumulativeForField(fieldId: number) {
  console.log(`  computing cumulative for field ${fieldId}`)
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
}

async function main() {
  const endDate = subDays(new Date().toISOString().slice(0, 10), ERA5_LAG_DAYS)
  console.log(`Backfill: ${START_DATE} → ${endDate}${DRY_RUN ? " [DRY RUN]" : ""}`)

  const fieldsRes = await pool.query(
    FIELD_FILTER
      ? "SELECT id,latitude,longitude FROM field WHERE id=$1"
      : "SELECT id,latitude,longitude FROM field ORDER BY id",
    FIELD_FILTER ? [FIELD_FILTER] : []
  )
  const fields: { id: number; latitude: number; longitude: number }[] = fieldsRes.rows

  // 按 ERA5 网格去重
  const gridMap = new Map<string, typeof fields>()
  for (const f of fields) {
    const key = gridKey(f.latitude, f.longitude)
    gridMap.set(key, [...(gridMap.get(key) ?? []), f])
  }

  console.log(`Fields: ${fields.length}, ERA5 grids: ${gridMap.size}`)

  for (const [key, gridFields] of gridMap) {
    const { latitude, longitude } = gridFields[0]
    const progress = await getProgress(key)
    const from = progress ? addDays(progress, 1) : START_DATE

    if (from > endDate) {
      console.log(`[${key}] already up to date (${progress})`)
      if (!DRY_RUN) {
        for (const f of gridFields) {
          await reconcileCumulativeForField(f.id)
        }
      }
      continue
    }

    console.log(`\n[${key}] lat=${latitude} lon=${longitude} fields=[${gridFields.map(f => f.id).join(",")}]`)
    console.log(`  from=${from} to=${endDate}`)

    for (const chunk of chunkDateRange(from, endDate, CHUNK_DAYS)) {
      console.log(`  chunk ${chunk.start} → ${chunk.end}`)
      if (DRY_RUN) continue

      const data = await fetchWithRetry(() => fetchArchive(latitude, longitude, chunk.start, chunk.end))
      const rowCount = data.daily.time.length
      console.log(`  fetched ${rowCount} days`)

      for (const f of gridFields) {
        await upsertArchiveRows(f.id, data)
      }
      await saveProgress(key, chunk.end)
      await sleep(SLEEP_MS)
    }

    if (!DRY_RUN) {
      for (const f of gridFields) {
        await reconcileCumulativeForField(f.id)
      }
    }
  }

  console.log("\nBackfill complete.")
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
