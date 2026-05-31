import { Pool } from "pg"
import { startCronRun } from "./lib/cron-report"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

// Dynamically import to reuse existing logic
async function main() {
  const reporter = await startCronRun(pool, "generate-advice")
  let generated = 0
  try {
    const fields = (await pool.query("SELECT id, name, planting_date FROM field")).rows
    // 生成当前周和下一周
    const now = new Date()
    const dow = now.getDay() || 7
    const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - dow + 1)
    const nextMonday = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7)
    const weeks = [thisMonday, nextMonday].map(m => m.toISOString().slice(0, 10))

    console.log(`Generating advice for weeks ${weeks.join(", ")}, ${fields.length} field(s)...`)

    for (const weekStart of weeks) {
      const monday = new Date(weekStart + "T00:00:00")
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6)
      const weekEnd = sunday.toISOString().slice(0, 10)
      const isNextWeek = weekStart === weeks[1]

    for (const f of fields) {
      // Check if already exists (manual or auto)
      const existing = await pool.query("SELECT id, source FROM farming_advice_record WHERE field_id=$1 AND week_start=$2", [f.id, weekStart])
      if (existing.rows[0]?.source === "manual") {
        console.log(`  ⏭️ Field #${f.id} ${f.name} [${weekStart}]: manual advice exists, skip`)
        continue
      }

      // Use the same API endpoint logic — call the local chat API
      const plantingDate = f.planting_date ?? "2026-04-25"
      const dap = Math.floor((new Date(weekStart + "T00:00:00").getTime() - new Date(plantingDate + "T00:00:00").getTime()) / 86400000)
      let stage = "播前整地准备期"
      if (dap >= 0 && dap < 10) stage = "种薯处理/催芽期"
      else if (dap < 20) stage = "播种期"
      else if (dap < 35) stage = "播后管理期"
      else if (dap < 50) stage = "出苗期"
      else if (dap < 65) stage = "苗期"
      else if (dap < 78) stage = "现蕾期"
      else if (dap < 92) stage = "开花/块茎形成期"
      else if (dap < 113) stage = "块茎膨大期"
      else if (dap < 128) stage = "淀粉积累期"
      else if (dap < 143) stage = "成熟/杀秧期"
      else if (dap >= 143) stage = "收获期"

      // Get weather for the week (forecast for next week, daily for current)
      const weatherTable = isNextWeek ? "weather_forecast" : "weather_forecast"
      const weather = await pool.query(
        `SELECT temp_max,temp_min,temp_mean,precipitation,wind_speed_max FROM ${weatherTable} WHERE field_id=$1 AND date>=$2 ORDER BY date LIMIT 7`,
        [f.id, weekStart]
      )
      const days = weather.rows
      const avgTemp = days.length ? days.reduce((s: number, d: { temp_mean: number }) => s + (d.temp_mean ?? 0), 0) / days.length : 0
      const totalPrecip = days.reduce((s: number, d: { precipitation: number }) => s + (d.precipitation ?? 0), 0)
      const isDry = totalPrecip < 5
      const hasFrost = days.some((d: { temp_min: number }) => (d.temp_min ?? 99) < 0)

      let summary = `${stage}阶段，平均气温${avgTemp.toFixed(1)}°C。`
      if (hasFrost) summary += "注意霜冻风险。"
      if (isDry) summary += "降水偏少，注意灌溉。"
      if (isNextWeek) summary = `【下周预测】${summary}数据将于本周末更新。`

      await pool.query(
        `INSERT INTO farming_advice_record (field_id,week_start,week_end,growth_stage,source,summary,fertilizer,pesticide,irrigation,field_work,ai_model)
         VALUES ($1,$2,$3,$4,'auto',$5,$6,$7,$8,$9,NULL)
         ON CONFLICT (field_id,week_start) DO UPDATE SET
         week_end=EXCLUDED.week_end,growth_stage=EXCLUDED.growth_stage,summary=EXCLUDED.summary,
         fertilizer=EXCLUDED.fertilizer,pesticide=EXCLUDED.pesticide,irrigation=EXCLUDED.irrigation,
         field_work=EXCLUDED.field_work,source='auto',updated_at=NOW()
         WHERE farming_advice_record.source != 'manual'`,
        [f.id, weekStart, weekEnd, stage, summary,
         isDry ? "土壤干旱，适当追肥。" : "按当前阶段常规施肥。",
         hasFrost ? "注意防冻，暂缓用药。" : "常规病虫害预防。",
         isDry ? "及时灌溉补水。" : "土壤水分充足，正常管理。",
         hasFrost ? "覆膜防冻。" : "常规田间管理。"]
      )
      generated++
      console.log(`  ✅ Field #${f.id} ${f.name} [${weekStart}${isNextWeek ? " 预测" : ""}]: ${stage} (DAP ${dap})`)
    }
    } // end weeks loop

    console.log(`\nDone! Generated ${generated} advice records.`)
    await reporter.success(generated)
  } catch (e) {
    await reporter.fail(e)
    throw e
  } finally {
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
