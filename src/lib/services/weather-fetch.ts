import { getPool } from "@/lib/db"

interface FieldCoords { id: number; latitude: number; longitude: number }

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function yesterdayUtc(): string {
  return addDays(new Date().toISOString().slice(0, 10), -1)
}

async function fetchHistorical(lat: number, lon: number, start: string, end: string) {
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,wind_speed_10m_max,relative_humidity_2m_mean,weather_code&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo ${res.status}`)
  return res.json()
}

async function fetchForecast(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,` +
    `wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_max,relative_humidity_2m_min,` +
    `weather_code,soil_temperature_0_to_7cm&forecast_days=16&timezone=Asia/Shanghai`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`open-meteo forecast ${res.status}`)
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
  return d.time.map((date, i) => {
    const humMax = d.relative_humidity_2m_max[i]
    const humMin = d.relative_humidity_2m_min[i]
    return {
      date,
      tmax: d.temperature_2m_max[i],
      tmin: d.temperature_2m_min[i],
      tmean: d.temperature_2m_mean[i],
      precip: d.precipitation_sum[i],
      wind: d.wind_speed_10m_max[i],
      hum: humMax != null && humMin != null ? +((humMax + humMin) / 2).toFixed(1) : null,
      code: d.weather_code[i],
      gust: d.wind_gusts_10m_max[i],
      soil: d.soil_temperature_0_to_7cm[i],
    }
  })
}

export async function initFieldWeather(field: FieldCoords): Promise<void> {
  const pool = getPool()
  const start = `${new Date().getFullYear()}-01-01`
  const end = yesterdayUtc()

  // 历史观测数据
  try {
    const data = await fetchHistorical(field.latitude, field.longitude, start, end)
    const dates: string[] = data.daily.time
    for (let i = 0; i < dates.length; i++) {
      await pool.query(
        `INSERT INTO daily_weather (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (field_id,date) DO NOTHING`,
        [field.id, dates[i], data.daily.temperature_2m_max[i], data.daily.temperature_2m_min[i],
         data.daily.temperature_2m_mean?.[i], data.daily.precipitation_sum[i],
         data.daily.wind_speed_10m_max[i], data.daily.relative_humidity_2m_mean?.[i], data.daily.weather_code[i]]
      )
    }
  } catch (e) {
    console.error(`[initFieldWeather] historical fetch failed for field ${field.id}:`, e)
  }

  // 天气预报
  try {
    const forecastRows = await fetchForecast(field.latitude, field.longitude)
    const now = new Date()
    for (const r of forecastRows) {
      await pool.query(
        `INSERT INTO weather_forecast (field_id,date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity,weather_code,wind_gust,soil_temp,fetched_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (field_id,date) DO UPDATE SET
           temp_max=$3,temp_min=$4,temp_mean=$5,precipitation=$6,wind_speed_max=$7,
           humidity=$8,weather_code=$9,wind_gust=$10,soil_temp=$11,fetched_at=NOW()`,
        [field.id, r.date, r.tmax, r.tmin, r.tmean, r.precip, r.wind, r.hum, r.code, r.gust, r.soil]
      )
    }
    void now // suppress unused warning
  } catch (e) {
    console.error(`[initFieldWeather] forecast fetch failed for field ${field.id}:`, e)
  }
}
