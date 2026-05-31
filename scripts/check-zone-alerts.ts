import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

interface ZoneAlertThreshold {
  id: number
  alert_type: string
  label: string
  category: string
  yellow_condition: string
  orange_condition: string
  red_condition: string
  min_members_for_coverage: number
}

interface MemberWeather {
  member_id: number
  label: string
  precipitation: number | null
  wind_speed_max: number | null
  temp_max: number | null
  temp_min: number | null
}

interface Condition {
  // intensity: checks max/min across members
  precip_max_gte?: number
  wind_max_gte?: number
  temp_max_gte?: number
  temp_min_lte?: number
  // coverage: checks % of members exceeding threshold
  member_pct_gte?: number
  precip_gte?: number
  wind_gte?: number
}

function evalCondition(cond: Condition, members: MemberWeather[], minMembers: number): {
  triggered: boolean
  severity_members: string[]
  max_value: number | null
  coverage_pct: number | null
} {
  const withData = members.filter(m =>
    m.precipitation != null || m.wind_speed_max != null || m.temp_max != null
  )
  if (!withData.length) return { triggered: false, severity_members: [], max_value: null, coverage_pct: null }

  // 强度型：单成员触发
  if (cond.precip_max_gte != null) {
    const triggered = withData.filter(m => (m.precipitation ?? 0) >= cond.precip_max_gte!)
    const maxVal = Math.max(...withData.map(m => m.precipitation ?? 0))
    return {
      triggered: triggered.length > 0,
      severity_members: triggered.map(m => m.label),
      max_value: maxVal,
      coverage_pct: triggered.length / withData.length,
    }
  }
  if (cond.wind_max_gte != null) {
    const triggered = withData.filter(m => (m.wind_speed_max ?? 0) >= cond.wind_max_gte!)
    const maxVal = Math.max(...withData.map(m => m.wind_speed_max ?? 0))
    return {
      triggered: triggered.length > 0,
      severity_members: triggered.map(m => m.label),
      max_value: maxVal,
      coverage_pct: triggered.length / withData.length,
    }
  }
  if (cond.temp_max_gte != null) {
    const triggered = withData.filter(m => (m.temp_max ?? -99) >= cond.temp_max_gte!)
    const maxVal = Math.max(...withData.map(m => m.temp_max ?? -99))
    return {
      triggered: triggered.length > 0,
      severity_members: triggered.map(m => m.label),
      max_value: maxVal,
      coverage_pct: triggered.length / withData.length,
    }
  }
  if (cond.temp_min_lte != null) {
    const triggered = withData.filter(m => (m.temp_min ?? 99) <= cond.temp_min_lte!)
    const minVal = Math.min(...withData.map(m => m.temp_min ?? 99))
    return {
      triggered: triggered.length > 0,
      severity_members: triggered.map(m => m.label),
      max_value: minVal,
      coverage_pct: triggered.length / withData.length,
    }
  }

  // 覆盖型：需要 min_members + 达到比例
  if (cond.member_pct_gte != null && withData.length >= minMembers) {
    const threshold = cond.precip_gte ?? cond.wind_gte ?? 0
    const field = cond.precip_gte != null ? "precipitation" : "wind_speed_max"
    const triggered = withData.filter(m => ((m[field as keyof MemberWeather] as number | null) ?? 0) >= threshold)
    const pct = triggered.length / withData.length
    const maxVal = Math.max(...withData.map(m => (m[field as keyof MemberWeather] as number | null) ?? 0))
    return {
      triggered: pct >= cond.member_pct_gte,
      severity_members: triggered.map(m => m.label),
      max_value: maxVal,
      coverage_pct: pct,
    }
  }

  return { triggered: false, severity_members: [], max_value: null, coverage_pct: null }
}

async function main() {
  const reporter = await startCronRun(pool, "check-zone-alerts")
  let created = 0
  try {
    const today = new Date().toISOString().slice(0, 10)

    // 删当天旧预警，全量刷新
    await pool.query("DELETE FROM zone_alert WHERE date = $1", [today])

    const thresholds = (await pool.query<ZoneAlertThreshold>(
      "SELECT * FROM zone_alert_threshold ORDER BY id"
    )).rows

    if (!thresholds.length) {
      console.log("No zone_alert_threshold rows, skipping")
      await reporter.success(0)
      return
    }

    const zones = (await pool.query<{ id: number; name: string }>(
      "SELECT id, name FROM zone ORDER BY id"
    )).rows

    for (const z of zones) {
      // 拉取当天成员气象（field 成员用 weather_forecast，township 成员用 township_weather）
      const weatherRows = (await pool.query<MemberWeather>(`
        SELECT
          zm.id as member_id,
          COALESCE(f.name, zm.township, zm.county, zm.admin_code) as label,
          COALESCE(wf.precipitation, tw.precipitation) as precipitation,
          COALESCE(wf.wind_speed_max, tw.wind_speed_max) as wind_speed_max,
          COALESCE(wf.temp_max, tw.temp_max) as temp_max,
          COALESCE(wf.temp_min, tw.temp_min) as temp_min
        FROM zone_member zm
        LEFT JOIN field f ON zm.field_id = f.id
        LEFT JOIN weather_forecast wf ON zm.member_type = 'field' AND wf.field_id = zm.field_id AND wf.date = $1
        LEFT JOIN township_weather tw ON zm.member_type != 'field' AND tw.admin_code = zm.admin_code AND tw.date = $1
        WHERE zm.zone_id = $2
      `, [today, z.id])).rows

      if (!weatherRows.length) continue

      for (const thr of thresholds) {
        const yellow = JSON.parse(thr.yellow_condition) as Condition
        const orange = JSON.parse(thr.orange_condition) as Condition
        const red = JSON.parse(thr.red_condition) as Condition

        // 从高到低检查，取最高级别
        for (const [severity, cond] of [["red", red], ["orange", orange], ["yellow", yellow]] as const) {
          const result = evalCondition(cond, weatherRows, thr.min_members_for_coverage)
          if (!result.triggered) continue

          const pctStr = result.coverage_pct != null
            ? `${Math.round(result.coverage_pct * 100)}% 成员受影响`
            : ""
          const memberStr = result.severity_members.slice(0, 3).join("、") +
            (result.severity_members.length > 3 ? `等 ${result.severity_members.length} 个` : "")

          const title = `${z.name} ${thr.label}${severity === "red" ? "（红色）" : severity === "orange" ? "（橙色）" : "（黄色）"}`
          const desc = [memberStr && `${memberStr}触发预警`, pctStr].filter(Boolean).join("，")

          await pool.query(
            `INSERT INTO zone_alert (zone_id, date, alert_type, category, severity, title, description, affected_members, max_value, coverage_pct)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [z.id, today, thr.alert_type, thr.category, severity, title, desc,
              JSON.stringify(result.severity_members), result.max_value,
              result.coverage_pct != null ? Math.round(result.coverage_pct * 100) / 100 : null]
          )
          created++
          break  // 只记录最高级别
        }
      }
    }

    await reporter.success(created)
    console.log(`zone-alerts created: ${created}`)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
}

main()
