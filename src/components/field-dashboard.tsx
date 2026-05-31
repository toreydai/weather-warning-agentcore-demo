"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Thermometer, Droplets, Wind, AlertTriangle, CalendarDays, CloudSun } from "lucide-react"
import { WeeklyReportCard } from "@/components/weekly-report-card"
import { AlertCard } from "@/components/alert-card"
import { HistoryComparison } from "@/components/history-comparison"
import { ForecastCard } from "@/components/forecast-card"
import { GrowthStageProgress } from "@/components/growth-stage-progress"
import { SeasonCumulativeCard } from "@/components/season-cumulative-card"
import { DataNote } from "@/components/data-note"
import { SuitabilityScores } from "@/components/suitability-scores"
import type { WeeklyReport, ExtremeWeatherAlert, ChartDay, ForecastDay, HistOverlay, TempThresholds } from "@/lib/weather-types"
import type { MonthComparison } from "@/lib/weather-types"
import type { StageInfo } from "@/lib/services/advice"
import type { SeasonCumulative } from "@/lib/services/cumulative"

const ChartSkeleton = () => <Skeleton className="h-[300px] w-full" />
const CumulSkeleton = () => <Skeleton className="h-[320px] w-full" />

// ECharts 懒加载，不参与 SSR，减少首屏 JS bundle
const TempTrendChart = dynamic(() => import("@/components/charts/weather-trend").then(m => ({ default: m.TempTrendChart })), { ssr: false, loading: ChartSkeleton })
const PrecipTrendChart = dynamic(() => import("@/components/charts/weather-trend").then(m => ({ default: m.PrecipTrendChart })), { ssr: false, loading: ChartSkeleton })
const CumulativeChart = dynamic(() => import("@/components/charts/weather-trend").then(m => ({ default: m.CumulativeChart })), { ssr: false, loading: CumulSkeleton })
const TempAlertTimeline = dynamic(() => import("@/components/charts/temp-alert-timeline").then(m => ({ default: m.TempAlertTimeline })), { ssr: false, loading: ChartSkeleton })
import type { SuitabilityScore } from "@/lib/services/suitability"
import { parseLocalDate } from "@/lib/utils"
import { getWeatherIcon, getWeatherDescription } from "@/lib/weather-types"

// Generate only months covered by the 45-day forecast window
function buildMonthOptions() {
  const now = new Date()
  const cutoff = new Date(now.getTime() + 44 * 86400000)
  const items: { value: string; label: string }[] = [{ value: "all", label: "全部" }]
  for (let i = 0; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    if (d > cutoff) break
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const label = d.getFullYear() !== now.getFullYear() ? `${d.getMonth() + 1}月(${d.getFullYear()})` : `${d.getMonth() + 1}月`
    items.push({ value, label })
  }
  return items
}

type MonthValue = string

function filterByMonth<T>(items: T[], getDate: (item: T) => string, month: MonthValue): T[] {
  if (month === "all") return items
  return items.filter(item => getDate(item).slice(0, 7) === month)
}

export function FieldDashboard({
  fieldId,
  weeklyReports,
  alerts,
  dailyData,
  forecast,
  historical,
  comparisons,
  stageInfo,
  cumulative,
  suitability,
  allHistoricalData,
  plantingDate,
  cumulData,
  tempThresholds,
}: {
  fieldId: number
  weeklyReports: WeeklyReport[]
  alerts: ExtremeWeatherAlert[]
  dailyData: ChartDay[]
  forecast: ForecastDay[]
  historical: HistOverlay[]
  comparisons: MonthComparison[]
  stageInfo: StageInfo | null
  cumulative: SeasonCumulative | null
  suitability: { climate: SuitabilityScore; plantProtection: SuitabilityScore; fertilizer: SuitabilityScore; irrigation: SuitabilityScore } | null
  allHistoricalData?: ChartDay[]
  plantingDate?: string
  cumulData?: Record<number, { date: string; gdd_cumulative: number; precip_cumulative: number }[]>
  tempThresholds?: TempThresholds
}) {
  const currentYear = new Date().getFullYear()
  const [selectedMonth, setSelectedMonth] = useState<MonthValue>("all")
  const [tempCompareYear, setTempCompareYear] = useState<number>(currentYear - 1)
  const [precipCompareYear, setPrecipCompareYear] = useState<number>(currentYear - 1)
  const [cumulCompareYears, setCumulCompareYears] = useState<number[]>([currentYear - 1])
  const [cumulCompareYear, setCumulCompareYear] = useState<number>(currentYear - 1) // kept for compat
  const monthOptions = useMemo(() => buildMonthOptions(), [])

  const [localCumulData, setLocalCumulData] = useState(cumulData ?? {})
  const cumulEmpty = Object.keys(localCumulData).length === 0
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (!cumulEmpty) return
    const years = Array.from({ length: currentYear - 2014 }, (_, i) => 2015 + i).join(",")
    const poll = () => {
      fetch(`/api/fields/${fieldId}/cumulative?years=${years}`)
        .then(r => r.json())
        .then((data: Record<string, { date: string; gdd_cumulative: number; precip_cumulative: number }[]>) => {
          if (Object.keys(data).length > 0) {
            setLocalCumulData(data as Record<number, { date: string; gdd_cumulative: number; precip_cumulative: number }[]>)
            if (pollRef.current) clearInterval(pollRef.current)
          }
        })
        .catch(() => {/* ignore */})
    }
    pollRef.current = setInterval(poll, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [cumulEmpty, fieldId, currentYear])

  const window6 = useMemo(() => {
    const now = new Date()
    // 从本周一开始，和周报保持一致
    const dow = now.getDay() || 7
    const monday = new Date(now)
    monday.setDate(now.getDate() + (1 - dow))
    monday.setHours(0, 0, 0, 0)
    const end = new Date(now.getTime() + 44 * 86400000)
    return { start: monday, end }
  }, [])
  const inWindow = (dateStr: string) => {
    const d = parseLocalDate(dateStr)
    return d >= window6.start && d < window6.end
  }

  const windowedReports = useMemo(() => weeklyReports.filter(r => inWindow(r.weekStart)), [weeklyReports, window6])
  const windowedAlerts = useMemo(() => alerts.filter(a => inWindow(a.date)), [alerts, window6])
  const windowedDaily = useMemo(() => dailyData.filter(d => inWindow(d.date)), [dailyData, window6])

  // 趋势图：从今天起的历史实况 + 预报拼接（日期去重，实况优先）
  const trendData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const dailyDates = new Set(dailyData.map(d => d.date))
    const forecastAsChartDay = forecast
      .filter(f => !dailyDates.has(f.date))
      .map(f => ({ date: f.date, temp_max: f.temp_max, temp_min: f.temp_min, temp_mean: f.temp_mean, precipitation: f.precipitation }))
    return [...dailyData.filter(d => d.date >= today), ...forecastAsChartDay].sort((a, b) => a.date.localeCompare(b.date))
  }, [dailyData, forecast])
  const filteredTrend = useMemo(() => filterByMonth(trendData, d => d.date, selectedMonth), [trendData, selectedMonth])

  // 对比年数据：从 allHistoricalData 里取指定年的数据，日期偏移到今年对齐
  const makeCompareData = (year: number) => {
    if (!allHistoricalData?.length) return undefined
    const yearDiff = currentYear - year
    return allHistoricalData
      .filter(d => d.date.startsWith(`${year}-`))
      .map(d => {
        const shifted = new Date(d.date + "T00:00:00")
        shifted.setFullYear(shifted.getFullYear() + yearDiff)
        return { ...d, date: shifted.toISOString().slice(0, 10) }
      })
  }
  const tempCompareData = useMemo(() => makeCompareData(tempCompareYear), [allHistoricalData, tempCompareYear])
  const precipCompareData = useMemo(() => makeCompareData(precipCompareYear), [allHistoricalData, precipCompareYear])
  const cumulCompareData = useMemo(() => makeCompareData(cumulCompareYear), [allHistoricalData, cumulCompareYear])

  const tempTimelineData = useMemo(() => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const hist = dailyData.filter(d => d.date >= sixtyDaysAgo && d.date <= today)
    const histDates = new Set(hist.map(d => d.date))
    const fc = forecast
      .filter(f => f.date > today && f.date <= sevenDaysLater && !histDates.has(f.date))
      .map(f => ({ date: f.date, temp_max: f.temp_max, temp_min: f.temp_min, temp_mean: f.temp_mean, precipitation: f.precipitation }))
    return [...hist, ...fc].sort((a, b) => a.date.localeCompare(b.date))
  }, [dailyData, forecast])

  const tempAlerts = useMemo(() =>
    alerts.filter(a => ["frost", "heat", "cold_wave", "chilling"].includes(a.type)),
    [alerts]
  )

  const filteredReports = useMemo(() => filterByMonth(windowedReports, r => r.weekStart, selectedMonth), [windowedReports, selectedMonth])
  const filteredAlerts = useMemo(() => filterByMonth(windowedAlerts, a => a.date, selectedMonth), [windowedAlerts, selectedMonth])
  const filteredDaily = useMemo(() => filterByMonth(windowedDaily, d => d.date, selectedMonth), [windowedDaily, selectedMonth])

  const todayWeather = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    // 优先用实况，没有则用预报
    const daily = dailyData.find(d => d.date === today)
    if (daily) return { tmax: daily.temp_max, tmin: daily.temp_min, code: null }
    const fc = forecast.find(f => f.date === today)
    if (fc) return { tmax: fc.temp_max, tmin: fc.temp_min, code: fc.weather_code }
    return null
  }, [dailyData, forecast])

  const currentMonthStr = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  }, [])

  const stats = useMemo(() => {
    const data = filteredDaily
    const avgTemp = data.length ? data.reduce((s, d) => s + (d.temp_mean ?? 0), 0) / data.length : 0
    // 本月累计降水：始终用当月实况数据，不受月份筛选器影响
    const monthPrecip = dailyData
      .filter(d => d.date.slice(0, 7) === currentMonthStr)
      .reduce((s, d) => s + (d.precipitation ?? 0), 0)
    return { avgTemp, totalPrecip: monthPrecip }
  }, [filteredDaily, dailyData, currentMonthStr])

  const alertCounts = useMemo(() => ({
    red: filteredAlerts.filter(a => a.severity === "red").length,
    orange: filteredAlerts.filter(a => a.severity === "orange").length,
    yellow: filteredAlerts.filter(a => a.severity === "yellow").length,
  }), [filteredAlerts])

  return (
    <>
      {/* 生育进程进度条 */}
      {stageInfo && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <GrowthStageProgress info={stageInfo} />
            <DataNote source="播种日期 + 阶段积温阈值" method="DAP（播后天数）推算当前生育阶段" updateFreq="每日（页面加载时计算）" />
          </CardContent>
        </Card>
      )}

      {/* 播种至今累计指标 */}
      {cumulative && cumulative.dap > 0 && (
        <div className="space-y-1">
          <SeasonCumulativeCard cumulative={cumulative} />
          <DataNote source="Open-Meteo ERA5 历史再分析 + Open-Meteo 预报" method="GDD=Σmax(0,(min(Tmax,30)+max(Tmin,7))/2−7)，基温7°C" updateFreq="每日 22:00" />
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950">
                <Thermometer className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{selectedMonth === "all" ? "季" : `${selectedMonth}月`}平均气温</p>
                <p className="text-xl font-bold">{stats.avgTemp.toFixed(1)}°C</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
                <Droplets className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">本月累计降水</p>
                <p className="text-xl font-bold">{stats.totalPrecip.toFixed(1)}mm</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100 dark:bg-cyan-950 text-2xl">
                {todayWeather?.code != null ? getWeatherIcon(todayWeather.code) : "🌤️"}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">今日天气</p>
                {todayWeather ? (
                  <p className="text-xl font-bold">
                    {todayWeather.tmax?.toFixed(0)}°<span className="text-sm font-normal text-muted-foreground">/{todayWeather.tmin?.toFixed(0)}°</span>
                  </p>
                ) : (
                  <p className="text-xl font-bold text-muted-foreground">--</p>
                )}
                {todayWeather?.code != null && (
                  <p className="text-xs text-muted-foreground">{getWeatherDescription(todayWeather.code)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 dark:bg-red-950">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">未来7天极端天气预警</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xl font-bold">{filteredAlerts.length} 次</p>
                  <div className="flex gap-1">
                    {alertCounts.red > 0 && <Badge variant="destructive" className="text-xs px-1.5 py-0">{alertCounts.red}红</Badge>}
                    {alertCounts.orange > 0 && <Badge className="text-xs px-1.5 py-0 bg-orange-500">{alertCounts.orange}橙</Badge>}
                    {alertCounts.yellow > 0 && <Badge className="text-xs px-1.5 py-0 bg-yellow-500 text-yellow-900">{alertCounts.yellow}黄</Badge>}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <DataNote source="Open-Meteo ERA5 历史再分析 + Open-Meteo 预报" method="平均气温=日均温均值；累计降水=当月日降水累加；预警基于Open-Meteo 预报阈值判断" updateFreq="每日 22:00" />

      {/* Forecast */}
      {forecast.length > 0 && (
        <div className="space-y-1">
          <ForecastCard forecast={forecast} />
          <DataNote source="Open-Meteo（open-meteo.com）" method="7天精细预报；8-15天趋势预报；16-45天延伸期预报（不确定性较大）" updateFreq="每日 22:00" />
        </div>
      )}

      {/* 适宜度评分 */}
      {suitability && (
        <div className="space-y-1">
          <SuitabilityScores {...suitability} />
          <DataNote source="Open-Meteo 预报" method="温度/水分/昼夜温差加权评分（0-100），按生育阶段调整权重；v1 参数参考 FAO 马铃薯种植指南，待 QX/T 229-2014 标准采购后升级" updateFreq="每日 22:00" />
        </div>
      )}

      {/* Month filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">筛选月份：</span>
        {monthOptions.map(item => (
          <button key={item.value} onClick={() => setSelectedMonth(item.value)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${selectedMonth === item.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList className="h-auto p-1 gap-1 flex-wrap">
          <TabsTrigger value="weekly" className="gap-2 px-4 py-2.5 text-sm">
            <CalendarDays className="h-4 w-4" />每周田间管理报告
            <Badge variant="secondary" className="ml-1">{filteredReports.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="alerts" className="gap-2 px-4 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4" />未来7天极端天气预警
            <Badge variant="destructive" className="ml-1">{filteredAlerts.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="temp-timeline" className="gap-2 px-4 py-2.5 text-sm">
            <Thermometer className="h-4 w-4" />温度预警时间线
          </TabsTrigger>
        </TabsList>
        <TabsContent value="weekly" className="space-y-4">
          {filteredReports.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">暂无数据</CardContent></Card>
          ) : filteredReports.map((r, i) => <WeeklyReportCard key={r.weekStart} report={r} fieldId={fieldId} isNextWeek={i === 1} />)}
        </TabsContent>
        <TabsContent value="alerts" className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">该时段无未来7天极端天气预警</CardContent></Card>
          ) : filteredAlerts.map(a => <AlertCard key={a.id} alert={a} />)}
        </TabsContent>
        <TabsContent value="temp-timeline">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">温度预警时间线</CardTitle>
              <p className="text-xs text-muted-foreground">60天历史回顾 + 7天预测；阈值横线参考数据库配置；彩色圆点标记已触发预警</p>
            </CardHeader>
            <CardContent>
              {tempTimelineData.length === 0 ? (
                <div className="h-[360px] flex items-center justify-center text-muted-foreground text-sm">暂无数据</div>
              ) : (
                <TempAlertTimeline
                  data={tempTimelineData}
                  todayDate={new Date().toISOString().slice(0, 10)}
                  alerts={tempAlerts}
                  thresholds={tempThresholds}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Charts */}
      {(() => {
        const availableYears = Array.from({ length: currentYear - 2015 }, (_, i) => currentYear - 1 - i)
        return (
          <>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">气温趋势</CardTitle>
                  <YearSelector years={availableYears} selectedYear={tempCompareYear} onChange={setTempCompareYear} />
                </div>
              </CardHeader>
              <CardContent>
                <TempTrendChart data={filteredTrend} lastYear={tempCompareData} historical={historical} />
                <DataNote source="历史实况：Open-Meteo ERA5 再分析；预报：Open-Meteo" method="日最高/最低/平均气温，昼夜温差=最高−最低；历史均值为锡林浩特气候参考值（来源待确认）" updateFreq="每日 22:00" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-base">降水趋势</CardTitle>
                  <YearSelector years={availableYears} selectedYear={precipCompareYear} onChange={setPrecipCompareYear} />
                </div>
              </CardHeader>
              <CardContent>
                <PrecipTrendChart data={filteredTrend} lastYear={precipCompareData} historical={historical} />
                <DataNote source="历史实况：Open-Meteo ERA5 再分析；预报：Open-Meteo" method="日累计降水量（mm）；历史均值为月均降水按天展开" updateFreq="每日 22:00" />
              </CardContent>
            </Card>
            {plantingDate && (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base">积温 / 累计降水对比</CardTitle>
                    <YearSelector years={availableYears} selectedYear={cumulCompareYear} onChange={setCumulCompareYear} multi onMultiChange={setCumulCompareYears} selectedYears={cumulCompareYears} />
                  </div>
                </CardHeader>
                <CardContent>
                  {cumulEmpty ? (
                    <div className="h-[320px] flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <Skeleton className="h-[200px] w-full" />
                      <p className="text-sm">历史数据回填中，请稍候 5-10 分钟…</p>
                    </div>
                  ) : (
                    <>
                      <CumulativeChart cumulData={localCumulData} plantingDate={plantingDate} compareYears={cumulCompareYears} />
                      <DataNote source="Open-Meteo ERA5 历史再分析 + Open-Meteo 预报" method="有效积温 GDD=Σmax(0,(min(Tmax,30)+max(Tmin,7))/2−7)，基温7°C；累计降水从播种日起累加" updateFreq="每日 22:00" />
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )
      })()}

      {/* History comparison */}
      <div className="space-y-1">
        <HistoryComparison comparisons={comparisons.filter(c => {
          const validMonths = new Set(monthOptions.slice(1).map(o => parseInt(o.value.split("-")[1])))
          return validMonths.has(c.month)
        })} />
        <DataNote source="Open-Meteo ERA5 历史再分析（当年）+ 锡林浩特气候参考值（历史均值，来源待确认）" method="当年月均值与历史月均值对比，差值=当年−历史均值" updateFreq="每日 22:00" />
      </div>
    </>
  )
}

function YearSelector({ years, selectedYear, onChange, multi, selectedYears, onMultiChange }: {
  years: number[]
  selectedYear: number
  onChange: (y: number) => void
  multi?: boolean
  selectedYears?: number[]
  onMultiChange?: (ys: number[]) => void
}) {
  if (multi && selectedYears && onMultiChange) {
    return (
      <div className="flex items-center gap-1 text-xs flex-wrap">
        <span className="text-muted-foreground">对比年份：</span>
        {years.slice(0, 6).map(y => {
          const selected = selectedYears.includes(y)
          return (
            <button key={y} onClick={() => {
              if (selected) onMultiChange(selectedYears.filter(v => v !== y))
              else onMultiChange([...selectedYears, y].sort((a, b) => b - a).slice(0, 4))
            }}
              className={`rounded px-1.5 py-0.5 transition-colors ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {y}
            </button>
          )
        })}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">对比年份：</span>
      <select value={selectedYear} onChange={e => onChange(parseInt(e.target.value))}
        className="rounded border bg-background px-1.5 py-0.5 text-xs">
        {years.map(y => <option key={y} value={y}>{y}年</option>)}
      </select>
    </div>
  )
}
