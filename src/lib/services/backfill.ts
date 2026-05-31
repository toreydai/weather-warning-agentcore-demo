import { getPool } from "@/lib/db"

const GRID = 0.25
const ERA5_LAG_DAYS = 7
const CHUNK_DAYS = 365
const SLEEP_MS = 300
const START_DATE = "2015-01-01"

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function* chunkDateRange(start: string, end: string): Generator<{ start: string; end: string }> {
  let cur = start
  while (cur <= end) {
    const chunkEnd = addDays(cur, CHUNK_DAYS - 1)
    yield { start: cur, end: chunkEnd > end ? end : chunkEnd }
    cur = addDays(chunkEnd, 1)
    if (cur > end) break
  }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchArchive(lat: number, lon: number, start: string, end: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive` +
    `?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,weather_code` +
    `&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo archive ${res.status}`)
  return res.json() as Promise<{ daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; temperature_2m_mean: number[]; precipitation_sum: number[]; wind_speed_10m_max: number[]; relative_humidity_2m_mean: number[]; weather_code: number[] } }>
}

export async function backfillFieldHistory(fieldId: number, latitude: number, longitude: number): Promise<void> {
  const pool = getPool()
  const endDate = addDays(new Date().toISOString().slice(0, 10), -ERA5_LAG_DAYS)
  const gridKey = `${(Math.round(latitude / GRID) * GRID).toFixed(2)}_${(Math.round(longitude / GRID) * GRID).toFixed(2)}`

  // 检查断点续传进度
  const prog = await pool.query("SELECT last_date FROM backfill_progress WHERE grid_key=$1", [gridKey])
  const from = prog.rows[0]?.last_date ? addDays(prog.rows[0].last_date, 1) : START_DATE

  if (from > endDate) {
    // 网格已回填完毕，但当前 field 可能没有数据（同网格新地块）
    // 从同网格已有地块复制
    const existing = await pool.query(
      `SELECT DISTINCT field_id FROM daily_weather WHERE source='openmeteo-archive' AND field_id != $1 LIMIT 1`,
      [fieldId]
    )
    if (existing.rows.length) {
      const srcFieldId = existing.rows[0].field_id
      const check = await pool.query("SELECT 1 FROM daily_weather WHERE field_id=$1 AND source='openmeteo-archive' LIMIT 1", [fieldId])
      if (!check.rows.length) {
        await pool.query(
          `INSERT INTO daily_weather (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,source)
           SELECT $1,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,source
           FROM daily_weather WHERE field_id=$2 AND source='openmeteo-archive'
           ON CONFLICT (field_id,date) DO NOTHING`,
          [fieldId, srcFieldId]
        )
      }
    }
    return
  }

  for (const chunk of chunkDateRange(from, endDate)) {
    try {
      const data = await fetchArchive(latitude, longitude, chunk.start, chunk.end)
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
           WHERE daily_weather.source='openmeteo-archive'`,
          [fieldId, time[i],
            temperature_2m_max[i] ?? null, temperature_2m_min[i] ?? null, temperature_2m_mean[i] ?? null,
            precipitation_sum[i] ?? null, wind_speed_10m_max[i] ?? null,
            relative_humidity_2m_mean[i] ?? null, weather_code[i] ?? null]
        )
      }
      await pool.query(
        `INSERT INTO backfill_progress(grid_key,last_date,updated_at) VALUES($1,$2,NOW())
         ON CONFLICT(grid_key) DO UPDATE SET last_date=$2, updated_at=NOW()`,
        [gridKey, chunk.end]
      )
      await sleep(SLEEP_MS)
    } catch (e) {
      console.error(`[backfillFieldHistory] field=${fieldId} chunk=${chunk.start}~${chunk.end}:`, e)
      break // 失败时停止，下次从断点续传
    }
  }
}
