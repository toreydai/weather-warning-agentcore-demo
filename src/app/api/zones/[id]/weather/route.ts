import { NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { withHandler } from "@/lib/with-handler"
import { getZoneWithMembers } from "@/lib/services/zone"
import { getDb } from "@/lib/db"
import { dailyWeather, weatherForecast, townshipWeather } from "@/lib/db/schema"
import { eq, and, gte, lte, inArray } from "drizzle-orm"

function dateChina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function mode(arr: (number | null)[]): number | null {
  const counts = new Map<number, number>()
  for (const v of arr) { if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1) }
  if (!counts.size) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withHandler(req.nextUrl.pathname, async () => {
    const auth = await verifyAuth(req)
    if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { id } = await params
    const zone = await getZoneWithMembers(Number(id))
    if (!zone) return NextResponse.json({ error: "not found" }, { status: 404 })

    const dateParam = req.nextUrl.searchParams.get("date") ?? dateChina()
    const today = dateChina()
    const forecast7End = addDays(today, 6)

    const db = getDb()
    const members = zone.members

    // ── 当日气象：field 成员 ──
    const fieldMembers = members.filter(m => m.member_type === "field" && m.field_id != null)
    const fieldIds = fieldMembers.map(m => m.field_id!)

    const fieldDayWeather = fieldIds.length
      ? dateParam < today
        ? await db.select().from(dailyWeather)
            .where(and(inArray(dailyWeather.field_id, fieldIds), eq(dailyWeather.date, dateParam)))
        : await db.select().from(weatherForecast)
            .where(and(inArray(weatherForecast.field_id, fieldIds), eq(weatherForecast.date, dateParam)))
      : []

    const fieldWeatherMap = new Map(fieldDayWeather.map(r => [("field_id" in r ? r.field_id : 0), r]))

    // ── 7 天预报：field 成员 ──
    const fieldForecast7 = fieldIds.length
      ? await db.select().from(weatherForecast)
          .where(and(inArray(weatherForecast.field_id, fieldIds), gte(weatherForecast.date, today), lte(weatherForecast.date, forecast7End)))
      : []

    // ── 当日气象 + 7天：township/county 成员 ──
    const adminMembers = members.filter(m => m.member_type !== "field" && m.admin_code)
    const adminCodes = adminMembers.map(m => m.admin_code!)

    const [adminDayWeather, adminForecast7] = adminCodes.length
      ? await Promise.all([
          db.select().from(townshipWeather)
            .where(and(inArray(townshipWeather.admin_code, adminCodes), eq(townshipWeather.date, dateParam))),
          db.select().from(townshipWeather)
            .where(and(inArray(townshipWeather.admin_code, adminCodes), gte(townshipWeather.date, today), lte(townshipWeather.date, forecast7End))),
        ])
      : [[], []]

    const adminWeatherMap = new Map(adminDayWeather.map(r => [r.admin_code, r]))

    // ── 组合成员当日数据 ──
    interface MemberWeather {
      id: number; member_type: string; field_id: number | null
      admin_code: string | null; township: string | null; county: string | null
      field_name: string | null; latitude: number | null; longitude: number | null
      temp_max: number | null; temp_min: number | null; temp_mean: number | null
      precipitation: number | null; wind_speed_max: number | null
      humidity: number | null; weather_code: number | null
      has_data: boolean
    }

    const memberWeather: MemberWeather[] = members.map(m => {
      const w = m.member_type === "field"
        ? fieldWeatherMap.get(m.field_id ?? 0)
        : adminWeatherMap.get(m.admin_code ?? "")
      // field 成员的经纬度来自 field 表（zone_member 上为 null）
      const lat = m.member_type === "field" ? (m as { field_latitude?: number | null }).field_latitude ?? null : m.latitude
      const lon = m.member_type === "field" ? (m as { field_longitude?: number | null }).field_longitude ?? null : m.longitude
      // field 成员的县/镇名从 field 表补充
      const county = m.county ?? (m as { field_county?: string | null }).field_county ?? null
      const township = m.township ?? (m as { field_township?: string | null }).field_township ?? null
      return {
        id: m.id, member_type: m.member_type,
        field_id: m.field_id, admin_code: m.admin_code,
        township, county,
        field_name: m.field_name,
        latitude: lat, longitude: lon,
        temp_max: w?.temp_max ?? null,
        temp_min: w?.temp_min ?? null,
        temp_mean: w?.temp_mean ?? null,
        precipitation: w?.precipitation ?? null,
        wind_speed_max: w?.wind_speed_max ?? null,
        humidity: w?.humidity ?? null,
        weather_code: w?.weather_code ?? null,
        has_data: !!w,
      }
    })

    // ── 聚合统计 ──
    const withData = memberWeather.filter(m => m.has_data)
    const aggregate = {
      temp_max: withData.length ? Math.max(...withData.map(m => m.temp_max ?? -Infinity).filter(v => v !== -Infinity)) : null,
      temp_min: withData.length ? Math.min(...withData.map(m => m.temp_min ?? Infinity).filter(v => v !== Infinity)) : null,
      precip_max: withData.length ? Math.max(...withData.map(m => m.precipitation ?? 0)) : null,
      precip_mean: withData.length ? parseFloat((withData.reduce((s, m) => s + (m.precipitation ?? 0), 0) / withData.length).toFixed(1)) : null,
      wind_max: withData.length ? Math.max(...withData.map(m => m.wind_speed_max ?? 0)) : null,
      weather_code: mode(withData.map(m => m.weather_code)),
    }

    // ── 7 天预报聚合（按日期）──
    const forecastByDate = new Map<string, number[]>()
    for (const r of [...fieldForecast7, ...adminForecast7]) {
      const p = r.precipitation ?? 0
      const arr = forecastByDate.get(r.date) ?? []
      arr.push(p)
      forecastByDate.set(r.date, arr)
    }
    const forecast7d = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(today, i)
      const vals = forecastByDate.get(date) ?? []
      return {
        date,
        max_precip: vals.length ? parseFloat(Math.max(...vals).toFixed(1)) : null,
        avg_precip: vals.length ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1)) : null,
        member_count: vals.length,
      }
    })

    return NextResponse.json({
      date: dateParam,
      zone_id: zone.id,
      zone_name: zone.name,
      scope_type: zone.scope_type,
      members: memberWeather,
      aggregate,
      forecast_7d: forecast7d,
    })
  })
}
