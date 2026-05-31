import { ChatPanel } from "@/components/chat-panel"
import { getFieldById, getDailyWeather, getForecast, getWeeklyReports, getMonthComparisons, getHistoricalMonthly } from "@/lib/services/weather"
import { getAlerts, generateAlerts, getAllThresholds } from "@/lib/services/alert"
import type { TempThresholds } from "@/lib/weather-types"
import { generateFarmingAdvice, getStageInfo } from "@/lib/services/advice"
import { computeSeasonCumulative } from "@/lib/services/cumulative"
import { getCumulativeByYear } from "@/lib/services/cumulative-view"
import { potatoClimateScore, plantProtectionScore, fertilizerScore, irrigationScore } from "@/lib/services/suitability"
import { toClientWeekly, toClientAlert, toChartDay, toForecastDay, toHistOverlay } from "@/lib/weather-types"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Sprout, MapPin, ArrowLeft, Download } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { FieldDashboard } from "@/components/field-dashboard"
import { FieldActions } from "@/components/field-actions"
import { HarvestCard } from "@/components/harvest-card"
import { DailyAlertCard } from "@/components/daily-alert-card"
import { env } from "@/lib/env"
import { getPublishedDailyAlertForField } from "@/lib/services/daily-alert"
import { parseLocalDate } from "@/lib/utils"
import { SolarTermBanner } from "@/components/solar-term-banner"

export const dynamic = "force-dynamic"

export default async function FieldDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fieldId = parseInt(id)
  const field = await getFieldById(fieldId)
  if (!field) notFound()

  const plantingDate = field.planting_date ?? `${new Date().getFullYear()}-04-25`
  const adminLocation = [field.province, field.city, field.county, field.township].filter(Boolean).join(" ")

  const weeklyReportsRaw = getWeeklyReports(fieldId)
  const alertsRaw = getAlerts(fieldId)
  const dailyAlertRaw = env.FEATURE_DAILY_ALERT ? getPublishedDailyAlertForField(fieldId) : Promise.resolve(null)

  const [
    weeklyReports, alertsData, dailyAlert,
    cumulative, forecastData, allDailyData,
    historical, comparisons, cumulViewRows, thresholdRows,
  ] = await Promise.all([
    weeklyReportsRaw,
    alertsRaw,
    dailyAlertRaw,
    computeSeasonCumulative(fieldId, plantingDate).catch(() => null),
    getForecast(fieldId),
    getDailyWeather(fieldId, `${new Date().getFullYear() - 1}-01-01`),
    getHistoricalMonthly(field.region),
    getMonthComparisons(fieldId, field.region),
    getCumulativeByYear(fieldId, Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => 2015 + i)),
    getAllThresholds(),
  ])

  const tempThresholds = ((): TempThresholds => {
    const result: TempThresholds = {}
    for (const row of thresholdRows) {
      const t = row.alert_type as keyof TempThresholds
      if (!["frost", "heat", "cold_wave", "chilling"].includes(t)) continue
      if (result[t]) continue // use first row (default stage)
      const yellow = JSON.parse(row.yellow_condition) as { temp_min_lte?: number; temp_max_gte?: number }
      const orange = JSON.parse(row.orange_condition) as { temp_min_lte?: number; temp_max_gte?: number }
      const red = JSON.parse(row.red_condition) as { temp_min_lte?: number; temp_max_gte?: number }
      if (t === "heat") {
        result.heat = { yellow: yellow.temp_max_gte, orange: orange.temp_max_gte, red: red.temp_max_gte }
      } else {
        result[t] = { yellow: yellow.temp_min_lte, orange: orange.temp_min_lte, red: red.temp_min_lte }
      }
    }
    return result
  })()

  const today = new Date().toISOString().slice(0, 10)
  const harvestInfo = { date: field.harvest_date, type: field.harvest_type }
  const stageInfo = getStageInfo(today, plantingDate, harvestInfo)

  const harvestedAdvice = { summary: "本地块已完成采收，无农事建议。", fertilizer: "-", pesticide: "-", irrigation: "-", fieldWork: "-", potatoGrowthStage: "已采收" }
  const weeklyWithAdvice = weeklyReports.map(w => ({
    ...w,
    weekLabel: (() => { const s = parseLocalDate(w.week_start); const e = parseLocalDate(w.week_end); return `${s.getMonth() + 1}月${s.getDate()}日 - ${e.getMonth() + 1}月${e.getDate()}日` })(),
    farmingAdvice: getStageInfo(w.week_start, plantingDate, harvestInfo).main === "harvested"
      ? harvestedAdvice
      : generateFarmingAdvice(w.days, w.week_start, plantingDate),
  }))

  let alerts = alertsData
  if (!alerts.length) alerts = await generateAlerts(fieldId)

  const forecastForScore = forecastData.map(toForecastDay)
  const dailyForScore = allDailyData.filter(d => d.date >= new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10))

  const suitability = {
    climate: potatoClimateScore(dailyForScore, stageInfo.main),
    plantProtection: plantProtectionScore(forecastForScore.slice(0, 3)),
    fertilizer: fertilizerScore(forecastForScore.slice(0, 7)),
    irrigation: irrigationScore(forecastForScore.slice(0, 7), cumulative ?? { fromDate: plantingDate, toDate: today, dap: 0, gdd: 0, totalPrecip: 0, lastYear: null, gddDelta: null, precipDelta: null, gddTrend: "flat" as const, precipTrend: "flat" as const }, stageInfo.main),
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-600 text-white">
                <Sprout className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">{field.name}</h1>
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                  <MapPin className="h-3 w-3" />
                  {adminLocation || `${field.latitude.toFixed(2)}°N, ${field.longitude.toFixed(2)}°E`}
                  {adminLocation && <> · {field.latitude.toFixed(2)}°N, {field.longitude.toFixed(2)}°E</>}
                  {field.variety && <> · {field.variety}</>}
                  {field.planting_date && <> · 播种: {field.planting_date}</>}
                </p>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <div className="flex items-center justify-end gap-1.5 flex-wrap mb-1">
                <FieldActions field={{
                  id: fieldId,
                  name: field.name,
                  latitude: field.latitude,
                  longitude: field.longitude,
                  area_mu: field.area_mu,
                  variety: field.variety,
                  planting_date: field.planting_date,
                  province: field.province,
                  city: field.city,
                  county: field.county,
                  township: field.township,
                  admin_code: field.admin_code,
                  address: field.address,
                }} />
                <a href={`/api/fields/${fieldId}/export/weather`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                  <Download className="h-3 w-3" /><span className="hidden sm:inline">气象</span>CSV
                </a>
                <a href={`/api/fields/${fieldId}/export/alerts`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                  <Download className="h-3 w-3" /><span className="hidden sm:inline">预警</span>CSV
                </a>
              </div>
              <p className="hidden sm:block">{new Date().getFullYear()}年 生长季</p>
              <p>{field.area_mu ? `${field.area_mu} 亩` : ""}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <HarvestCard
          fieldId={fieldId}
          harvestDate={field.harvest_date}
          harvestType={field.harvest_type}
          notes={field.notes}
        />
        {dailyAlert && <DailyAlertCard alert={dailyAlert} />}
        <SolarTermBanner today={today} />

        <FieldDashboard
          fieldId={fieldId}
          weeklyReports={weeklyWithAdvice.map(toClientWeekly)}
          alerts={alerts.map(toClientAlert)}
          dailyData={allDailyData.filter(d => d.date >= `${new Date().getFullYear()}-01-01`).map(toChartDay)}
          forecast={forecastForScore}
          historical={historical.map(toHistOverlay)}
          comparisons={comparisons}
          stageInfo={stageInfo}
          cumulative={cumulative}
          suitability={suitability}
          allHistoricalData={allDailyData.filter(d => {
            const y = parseInt(d.date.slice(0, 4))
            return y >= new Date().getFullYear() - 1
          }).map(toChartDay)}
          plantingDate={plantingDate}
          cumulData={Object.fromEntries(
            Object.entries(cumulViewRows).map(([yr, rows]) => [
              yr,
              rows.filter(r => r.date >= plantingDate.replace(/^\d{4}/, yr))
            ])
          )}
          tempThresholds={tempThresholds}
        />

        <Separator />
        <footer className="pb-8 text-xs text-muted-foreground">
          <p>农艺指导仅供参考，具体操作请结合当地实际情况和农技专家建议。</p>
        </footer>
      </main>
      <ChatPanel fieldId={fieldId} />
    </div>
  )
}
