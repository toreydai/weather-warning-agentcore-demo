#!/usr/bin/env npx tsx
/**
 * scripts/backfill-recent.ts
 * 补填最近 7-14 天的 ERA5 数据（ERA5 有 5-7 天滞后，需定期追补）
 * 建议每天 cron 执行一次
 *
 * 用法：npx tsx scripts/backfill-recent.ts
 */

import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })
const GRID = 0.25

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let delay = 1000
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn() }
    catch (e) {
      if (i === maxRetries) throw e
      await sleep(delay); delay = Math.min(delay * 2, 30000)
    }
  }
  throw new Error("unreachable")
}

async function fetchArchive(lat: number, lon: number, start: string, end: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,weather_code` +
    `&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  return res.json() as Promise<{ daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; temperature_2m_mean: number[]; precipitation_sum: number[]; wind_speed_10m_max: number[]; relative_humidity_2m_mean: number[]; weather_code: number[] } }>
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  const endDate = addDays(today, -7)   // ERA5 滞后 7 天
  const startDate = addDays(today, -21) // 回填最近 21 天（覆盖上次可能遗漏的窗口）

  console.log(`Rolling backfill: ${startDate} → ${endDate}`)

  const fieldsRes = await pool.query("SELECT id, latitude, longitude FROM field ORDER BY id")
  const fields: { id: number; latitude: number; longitude: number }[] = fieldsRes.rows

  // 按 ERA5 网格去重
  const gridMap = new Map<string, typeof fields>()
  for (const f of fields) {
    const key = `${(Math.round(f.latitude / GRID) * GRID).toFixed(2)}_${(Math.round(f.longitude / GRID) * GRID).toFixed(2)}`
    gridMap.set(key, [...(gridMap.get(key) ?? []), f])
  }

  for (const [key, gridFields] of gridMap) {
    const { latitude, longitude } = gridFields[0]
    console.log(`[${key}] fields=[${gridFields.map(f => f.id).join(",")}]`)
    const data = await fetchWithRetry(() => fetchArchive(latitude, longitude, startDate, endDate))
    const { time, temperature_2m_max, temperature_2m_min, temperature_2m_mean,
      precipitation_sum, wind_speed_10m_max, relative_humidity_2m_mean, weather_code } = data.daily

    for (const f of gridFields) {
      for (let i = 0; i < time.length; i++) {
        await pool.query(
          `INSERT INTO daily_weather
             (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'openmeteo-archive')
           ON CONFLICT (field_id,date) DO UPDATE SET
             temp_max=$3,temp_min=$4,temp_mean=$5,precipitation=$6,
             wind_speed_max=$7,humidity=$8,weather_code=$9,source='openmeteo-archive'
           WHERE daily_weather.source='openmeteo-archive'`,
          [f.id, time[i],
            temperature_2m_max[i] ?? null, temperature_2m_min[i] ?? null, temperature_2m_mean[i] ?? null,
            precipitation_sum[i] ?? null, wind_speed_10m_max[i] ?? null,
            relative_humidity_2m_mean[i] ?? null, weather_code[i] ?? null]
        )
      }
    }
    await sleep(300)
  }

  console.log("Done.")
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
