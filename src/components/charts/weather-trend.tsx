"use client"

import ReactEChartsCore from "echarts-for-react/lib/core"
import * as echarts from "echarts/core"
import { LineChart, BarChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { ChartDay, HistOverlay } from "@/lib/weather-types"
import { parseLocalDate } from "@/lib/utils"

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer])

const TBASE = 7
const TUPPER = 30

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

// 将去年数据按 MM-DD 对齐到今年日期列表
function alignLastYear(current: ChartDay[], lastYear: ChartDay[]): (ChartDay | null)[] {
  const lyMap = new Map(lastYear.map(d => [d.date.slice(5), d]))
  return current.map(d => lyMap.get(d.date.slice(5)) ?? null)
}

// ── 图1：气温对比（最高/最低/平均/昼夜温差 + 去年同期 + 历史均值）──
export function TempTrendChart({ data, lastYear, historical }: {
  data: ChartDay[]
  lastYear?: ChartDay[]
  historical?: HistOverlay[]
}) {
  const dates = data.map(d => d.date.slice(5))

  const series: any[] = [
    { name: "最高气温", type: "line", data: data.map(d => d.temp_max), smooth: true, symbol: "none", lineStyle: { color: "#f97316", width: 2 }, itemStyle: { color: "#f97316" } },
    { name: "最低气温", type: "line", data: data.map(d => d.temp_min), smooth: true, symbol: "none", lineStyle: { color: "#06b6d4", width: 2 }, itemStyle: { color: "#06b6d4" } },
    { name: "平均气温", type: "line", data: data.map(d => d.temp_mean), smooth: true, symbol: "none", lineStyle: { color: "#8b5cf6", width: 1.5, type: "dashed" }, itemStyle: { color: "#8b5cf6" } },
    {
      name: "昼夜温差", type: "line",
      data: data.map(d => d.temp_max != null && d.temp_min != null ? parseFloat((d.temp_max - d.temp_min).toFixed(1)) : null),
      smooth: true, symbol: "none", lineStyle: { color: "#f59e0b", width: 1.5 }, itemStyle: { color: "#f59e0b" },
    },
  ]

  if (lastYear?.length) {
    const lyAligned = alignLastYear(data, lastYear)
    series.push({
      name: "去年最高气温", type: "line",
      data: lyAligned.map(d => d?.temp_max ?? null),
      smooth: true, symbol: "none",
      lineStyle: { color: "#f97316", width: 1, type: "dashed", opacity: 0.5 }, itemStyle: { color: "#f97316" },
    }, {
      name: "去年最低气温", type: "line",
      data: lyAligned.map(d => d?.temp_min ?? null),
      smooth: true, symbol: "none",
      lineStyle: { color: "#06b6d4", width: 1, type: "dashed", opacity: 0.5 }, itemStyle: { color: "#06b6d4" },
    })
  }

  if (historical?.length) {
    const histMap = new Map(historical.map(h => [h.month, h]))
    series.push(
      { name: "历史高温均值", type: "line", data: data.map(d => histMap.get(parseLocalDate(d.date).getMonth() + 1)?.avg_temp_max ?? null), smooth: true, symbol: "none", lineStyle: { color: "#f97316", width: 1, type: "dotted", opacity: 0.35 } },
      { name: "历史低温均值", type: "line", data: data.map(d => histMap.get(parseLocalDate(d.date).getMonth() + 1)?.avg_temp_min ?? null), smooth: true, symbol: "none", lineStyle: { color: "#06b6d4", width: 1, type: "dotted", opacity: 0.35 } },
    )
  }

  return <ReactEChartsCore echarts={echarts} notMerge style={{ height: 300 }} option={{
    tooltip: { trigger: "axis" as const },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    grid: { left: 50, right: 20, top: 50, bottom: 60 },
    dataZoom: [{ type: "slider" as const, start: 0, end: 100, bottom: 5 }],
    xAxis: { type: "category" as const, data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
    yAxis: { type: "value" as const, name: "°C" },
    series,
  }} />
}

// ── 图2：降水对比（日降水柱 + 去年同期柱 + 历史均值折线）──
export function PrecipTrendChart({ data, lastYear, historical }: {
  data: ChartDay[]
  lastYear?: ChartDay[]
  historical?: HistOverlay[]
}) {
  const dates = data.map(d => d.date.slice(5))

  const series: any[] = [
    { name: "日降雨量", type: "bar", data: data.map(d => d.precipitation), itemStyle: { color: "rgba(59,130,246,0.7)" }, barMaxWidth: 10 },
  ]

  if (lastYear?.length) {
    const lyAligned = alignLastYear(data, lastYear)
    series.push({
      name: "去年同期", type: "bar",
      data: lyAligned.map(d => d?.precipitation ?? null),
      itemStyle: { color: "rgba(16,185,129,0.6)" }, barMaxWidth: 10,
    })
  }

  if (historical?.length) {
    const histMap = new Map(historical.map(h => [h.month, h]))
    series.push({
      name: "历史同期均值", type: "line",
      data: data.map(d => {
        const dt = parseLocalDate(d.date)
        const h = histMap.get(dt.getMonth() + 1)
        if (h?.avg_precipitation == null) return null
        return parseFloat((h.avg_precipitation / getDaysInMonth(dt.getFullYear(), dt.getMonth() + 1)).toFixed(2))
      }),
      smooth: true, symbol: "none",
      lineStyle: { color: "#f59e0b", width: 2 }, itemStyle: { color: "#f59e0b" },
    })
  }

  return <ReactEChartsCore echarts={echarts} notMerge style={{ height: 300 }} option={{
    tooltip: { trigger: "axis" as const },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    grid: { left: 50, right: 20, top: 50, bottom: 60 },
    dataZoom: [{ type: "slider" as const, start: 0, end: 100, bottom: 5 }],
    xAxis: { type: "category" as const, data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
    yAxis: { type: "value" as const, name: "mm", minInterval: 1 },
    series,
  }} />
}

// ── 图3：积温/累计降水对比（物化视图数据，多年多选，聚合切换，最大值）──

type Granularity = "day" | "week" | "month"

function aggregateData(rows: { date: string; value: number }[], gran: Granularity): { x: string; value: number }[] {
  if (gran === "day") return rows.map(r => ({ x: r.date.slice(5), value: r.value }))
  const buckets = new Map<string, number>()
  for (const r of rows) {
    const key = gran === "month"
      ? r.date.slice(5, 7)  // "MM"
      : (() => {
          const d = new Date(r.date + "T00:00:00")
          const jan1 = new Date(d.getFullYear(), 0, 1)
          const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
          return `W${String(week).padStart(2, "0")}`
        })()
    buckets.set(key, r.value) // 累计值取最后一个（最大）
  }
  return Array.from(buckets.entries()).map(([x, value]) => ({ x, value }))
}

export function CumulativeChart({ cumulData, plantingDate, compareYears }: {
  cumulData: Record<number, { date: string; gdd_cumulative: number; precip_cumulative: number }[]>
  plantingDate: string
  compareYears?: number[]
}) {
  const currentYear = new Date().getFullYear()
  const [metric, setMetric] = React.useState<"gdd" | "precip">("gdd")
  const [gran, setGran] = React.useState<Granularity>("day")
  const [showMax, setShowMax] = React.useState(false)

  const allYears = React.useMemo(() => [currentYear, ...(compareYears ?? [])], [currentYear, compareYears])

  const unit = metric === "gdd" ? "°C·d" : "mm"
  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

  // 先算当年聚合数据确定 x 轴
  const thisYearRows = cumulData[currentYear] ?? []
  const currentPlanting = plantingDate
  const currentFiltered = thisYearRows.filter(r => r.date >= currentPlanting)
  const currentRaw = currentFiltered.map(r => ({ date: r.date, value: metric === "gdd" ? r.gdd_cumulative : r.precip_cumulative }))
  const currentAgg = aggregateData(currentRaw, gran)
  const xAxis = currentAgg.map(r => r.x)

  const series: any[] = allYears.map((year, i) => {
    const rows = cumulData[year] ?? []
    const yearPlanting = plantingDate.replace(/^\d{4}/, String(year))
    const filtered = rows.filter(r => r.date >= yearPlanting)
    const raw = filtered.map(r => ({ date: r.date, value: metric === "gdd" ? r.gdd_cumulative : r.precip_cumulative }))
    const agg = aggregateData(raw, gran)
    // 按 x 轴对齐
    const aggMap = new Map(agg.map(r => [r.x, r.value]))
    const data = xAxis.map(x => aggMap.get(x) ?? null)
    const maxVal = agg.length ? Math.max(...agg.map(r => r.value)) : 0

    return {
      name: year === currentYear ? `${year}年（今年）` : `${year}年`,
      type: "line",
      data: showMax ? data.map(v => v != null ? parseFloat(maxVal.toFixed(1)) : null) : data,
      smooth: !showMax,
      symbol: "none",
      lineStyle: { color: COLORS[i % COLORS.length], width: year === currentYear ? 2.5 : 1.5, type: year === currentYear ? "solid" : "dashed" },
      itemStyle: { color: COLORS[i % COLORS.length] },
      ...(year === currentYear ? { areaStyle: { color: `${COLORS[0]}15` } } : {}),
    }
  })

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["gdd", "precip"] as const).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${metric === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted"}`}>
              {m === "gdd" ? "📈 有效积温" : "🌧️ 累计降水"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 ml-auto">
          {(["day", "week", "month"] as const).map(g => (
            <button key={g} onClick={() => setGran(g)}
              className={`rounded px-2 py-1 text-xs transition-colors ${gran === g ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {g === "day" ? "日" : g === "week" ? "周" : "月"}
            </button>
          ))}
          <button onClick={() => setShowMax(!showMax)}
            className={`rounded px-2 py-1 text-xs transition-colors ${showMax ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
            {showMax ? "恢复" : "最大值"}
          </button>
        </div>
      </div>
      {!Object.keys(cumulData).length ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">暂无数据</div>
      ) : xAxis.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
          当年播种日后暂无数据
        </div>
      ) : (
        <ReactEChartsCore echarts={echarts} notMerge style={{ height: 280 }} option={{
          tooltip: { trigger: "axis" as const, formatter: (params: any[]) => params.map((p: any) => `${p.seriesName}: ${p.value ?? "-"} ${unit}`).join("<br/>") },
          legend: { top: 0, textStyle: { fontSize: 10 } },
          grid: { left: 55, right: 20, top: 40, bottom: 60 },
          dataZoom: [{ type: "slider" as const, start: 0, end: 100, bottom: 5 }],
          xAxis: { type: "category" as const, data: xAxis, axisLabel: { fontSize: 10, rotate: 45 } },
          yAxis: { type: "value" as const, name: unit },
          series,
        }} />
      )}
    </div>
  )
}

import React from "react"

// 兼容旧导出
export function WeatherTrendChart({ data, historical }: { data: ChartDay[]; historical?: HistOverlay[] }) {
  return (
    <div className="space-y-6">
      <TempTrendChart data={data} historical={historical} />
      <PrecipTrendChart data={data} historical={historical} />
    </div>
  )
}
