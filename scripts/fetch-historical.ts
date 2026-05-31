import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

async function getRegions(): Promise<{ region: string; lat: number; lon: number }[]> {
  const r = await pool.query("SELECT region, AVG(latitude)::float AS lat, AVG(longitude)::float AS lon FROM field GROUP BY region ORDER BY region")
  if (r.rows.length) return r.rows.map(row => ({ region: row.region, lat: row.lat, lon: row.lon }))
  return [{ region: "xilinhaote", lat: 43.95, lon: 116.07 }]
}

async function fetchDaily(lat: number, lon: number, start: string, end: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Archive API ${res.status}: ${await res.text()}`)
  return res.json()
}

async function main() {
  const reporter = await startCronRun(pool, "fetch-historical")
  let rowsWritten = 0
  try {
  const thisYear = new Date().getFullYear()
  const startYear = thisYear - 10
  const endYear = thisYear - 1
  const start = `${startYear}-01-01`
  const end = `${endYear}-12-31`
  console.log(`Computing historical monthly averages ${start} → ${end}`)

  const regions = await getRegions()
  for (const r of regions) {
    console.log(`\nRegion ${r.region} (${r.lat}, ${r.lon})`)
    const data = await fetchDaily(r.lat, r.lon, start, end)
    const dates: string[] = data.daily.time
    const tmax: (number | null)[] = data.daily.temperature_2m_max
    const tmin: (number | null)[] = data.daily.temperature_2m_min
    const tmean: (number | null)[] = data.daily.temperature_2m_mean
    const precip: (number | null)[] = data.daily.precipitation_sum
    const wind: (number | null)[] = data.daily.wind_speed_10m_max
    const hum: (number | null)[] = data.daily.relative_humidity_2m_mean

    const tmaxByMonth: number[][] = Array.from({ length: 12 }, () => [])
    const tminByMonth: number[][] = Array.from({ length: 12 }, () => [])
    const tmeanByMonth: number[][] = Array.from({ length: 12 }, () => [])
    const humByMonth: number[][] = Array.from({ length: 12 }, () => [])
    // Monthly totals/maxes per (year, month)
    const precipByYearMonth: Record<string, number> = {}
    const windMaxByYearMonth: Record<string, number> = {}

    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]
      const y = parseInt(d.slice(0, 4))
      const m = parseInt(d.slice(5, 7)) - 1
      if (tmax[i] != null) tmaxByMonth[m].push(tmax[i] as number)
      if (tmin[i] != null) tminByMonth[m].push(tmin[i] as number)
      if (tmean[i] != null) tmeanByMonth[m].push(tmean[i] as number)
      if (hum[i] != null) humByMonth[m].push(hum[i] as number)
      if (precip[i] != null) {
        const key = `${y}-${m}`
        precipByYearMonth[key] = (precipByYearMonth[key] ?? 0) + (precip[i] as number)
      }
      if (wind[i] != null) {
        const key = `${y}-${m}`
        windMaxByYearMonth[key] = Math.max(windMaxByYearMonth[key] ?? 0, wind[i] as number)
      }
    }

    // Average monthly aggregates across years
    const precipByMonth: number[][] = Array.from({ length: 12 }, () => [])
    for (const [key, total] of Object.entries(precipByYearMonth)) {
      const m = parseInt(key.split("-")[1])
      precipByMonth[m].push(total)
    }
    const windByMonth: number[][] = Array.from({ length: 12 }, () => [])
    for (const [key, mx] of Object.entries(windMaxByYearMonth)) {
      const m = parseInt(key.split("-")[1])
      windByMonth[m].push(mx)
    }

    const avg = (arr: number[]) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0
    const round1 = (n: number) => Math.round(n * 10) / 10

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      for (let m = 0; m < 12; m++) {
        const tmaxA = round1(avg(tmaxByMonth[m]))
        const tminA = round1(avg(tminByMonth[m]))
        const tmeanA = round1(avg(tmeanByMonth[m]))
        const precipA = round1(avg(precipByMonth[m]))
        const windA = round1(avg(windByMonth[m]))
        const humA = round1(avg(humByMonth[m]))
        await client.query(
          "INSERT INTO historical_monthly (region, month, avg_temp_max, avg_temp_min, avg_temp_mean, avg_precipitation, avg_wind_speed_max, avg_humidity) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (region, month) DO UPDATE SET avg_temp_max=$3, avg_temp_min=$4, avg_temp_mean=$5, avg_precipitation=$6, avg_wind_speed_max=$7, avg_humidity=$8",
          [r.region, m + 1, tmaxA, tminA, tmeanA, precipA, windA, humA]
        )
        rowsWritten++
        console.log(`  ${m + 1}月: tmax=${tmaxA} tmin=${tminA} tmean=${tmeanA} precip=${precipA}mm wind=${windA}km/h hum=${humA}%`)
      }
      await client.query("COMMIT")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }

    await reporter.success(rowsWritten)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
  console.log("\nDone!")
}

main().catch(e => { console.error(e); process.exit(1) })
