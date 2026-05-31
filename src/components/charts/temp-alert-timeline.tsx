"use client"

import ReactEChartsCore from "echarts-for-react/lib/core"
import * as echarts from "echarts/core"
import { LineChart } from "echarts/charts"
import {
  GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkPointComponent, DataZoomComponent,
} from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"
import type { ChartDay, ExtremeWeatherAlert, TempThresholds } from "@/lib/weather-types"

echarts.use([
  LineChart, GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkPointComponent, DataZoomComponent, CanvasRenderer,
])

const SEV_COLOR = { yellow: "#eab308", orange: "#f97316", red: "#ef4444" } as const
const LOW_TYPES = ["frost", "cold_wave", "chilling"]
const TYPE_LABEL: Record<string, string> = {
  frost: "霜冻", cold_wave: "寒潮", chilling: "低温冷害", heat: "高温",
}

function sevOrder(s: "yellow" | "orange" | "red") {
  return s === "red" ? 3 : s === "orange" ? 2 : 1
}

function buildThresholdLines(
  vals: { yellow?: number; orange?: number; red?: number } | undefined,
  label: string,
  arr: unknown[]
) {
  if (!vals) return
  for (const sev of ["yellow", "orange", "red"] as const) {
    const v = vals[sev]
    if (v == null) continue
    const sevLabel = sev === "yellow" ? "黄" : sev === "orange" ? "橙" : "红"
    arr.push({
      yAxis: v,
      name: `${label}(${sevLabel}): ${v}°C`,
      lineStyle: { color: SEV_COLOR[sev], type: "dashed", width: 1 },
      label: {
        show: true,
        position: "end",
        formatter: (p: { name: string }) => p.name,
        fontSize: 9,
        color: SEV_COLOR[sev],
      },
    })
  }
}

export function TempAlertTimeline({
  data,
  todayDate,
  alerts,
  thresholds,
}: {
  data: ChartDay[]
  todayDate: string
  alerts: ExtremeWeatherAlert[]
  thresholds?: TempThresholds
}) {
  const dates = data.map(d => d.date.slice(5))
  const todayMMDD = todayDate.slice(5)

  const maxLines: unknown[] = []
  const minLines: unknown[] = []

  if (dates.includes(todayMMDD)) {
    maxLines.push({
      xAxis: todayMMDD,
      name: "今日",
      lineStyle: { color: "#9ca3af", type: "solid", width: 1 },
      label: { show: true, position: "insideStartTop", formatter: "今日", fontSize: 9, color: "#6b7280" },
    })
  }

  buildThresholdLines(thresholds?.heat, "高温", maxLines)
  buildThresholdLines(thresholds?.frost, "霜冻", minLines)
  buildThresholdLines(thresholds?.cold_wave, "寒潮", minLines)
  buildThresholdLines(thresholds?.chilling, "低温", minLines)

  const alertsByMMDD = new Map<string, ExtremeWeatherAlert[]>()
  for (const a of alerts) {
    const k = a.date.slice(5)
    alertsByMMDD.set(k, [...(alertsByMMDD.get(k) ?? []), a])
  }

  const maxPoints: unknown[] = []
  const minPoints: unknown[] = []

  for (const [mmdd, dayAlerts] of alertsByMMDD.entries()) {
    const di = dates.indexOf(mmdd)
    if (di < 0) continue

    const heatAlerts = dayAlerts.filter(a => a.type === "heat")
    if (heatAlerts.length && data[di].temp_max != null) {
      const worst = heatAlerts.reduce((w, a) => sevOrder(a.severity) > sevOrder(w.severity) ? a : w)
      maxPoints.push({
        coord: [mmdd, data[di].temp_max],
        symbolSize: 14,
        itemStyle: { color: SEV_COLOR[worst.severity] },
        label: { show: false },
        name: `${TYPE_LABEL[worst.type] ?? worst.type}: ${worst.title}`,
      })
    }

    const lowAlerts = dayAlerts.filter(a => LOW_TYPES.includes(a.type))
    if (lowAlerts.length && data[di].temp_min != null) {
      const worst = lowAlerts.reduce((w, a) => sevOrder(a.severity) > sevOrder(w.severity) ? a : w)
      minPoints.push({
        coord: [mmdd, data[di].temp_min],
        symbolSize: 14,
        itemStyle: { color: SEV_COLOR[worst.severity] },
        label: { show: false },
        name: `${TYPE_LABEL[worst.type] ?? worst.type}: ${worst.title}`,
      })
    }
  }

  const startPct = dates.length > 30
    ? Math.round((1 - 30 / dates.length) * 100)
    : 0

  return (
    <ReactEChartsCore
      echarts={echarts}
      notMerge
      style={{ height: 360 }}
      option={{
        tooltip: {
          trigger: "axis",
          formatter: (params: { dataIndex: number; value: number | null; marker: string; seriesName: string }[]) => {
            const di = params[0]?.dataIndex ?? 0
            const date = data[di]?.date ?? ""
            const lines: string[] = params
              .filter(p => p.value != null)
              .map(p => `${p.marker}${p.seriesName}: <b>${p.value}°C</b>`)
            const dayAlerts = alertsByMMDD.get(date.slice(5)) ?? []
            if (dayAlerts.length) {
              lines.push("&mdash;")
              for (const a of dayAlerts) {
                lines.push(`<span style="color:${SEV_COLOR[a.severity]}">●</span> ${a.title}`)
              }
            }
            return `<div style="font-size:12px">${date}<br/>${lines.join("<br/>")}</div>`
          },
        },
        legend: { top: 0, textStyle: { fontSize: 10 } },
        grid: { left: 50, right: 150, top: 50, bottom: 60 },
        dataZoom: [{ type: "slider", start: startPct, end: 100, bottom: 5 }],
        xAxis: { type: "category", data: dates, axisLabel: { fontSize: 10, rotate: 45 } },
        yAxis: { type: "value", name: "°C", axisLabel: { fontSize: 10 } },
        series: [
          {
            name: "最高气温",
            type: "line",
            data: data.map(d => d.temp_max),
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#f97316", width: 2 },
            itemStyle: { color: "#f97316" },
            markLine: { silent: true, symbol: ["none", "none"], data: maxLines },
            markPoint: { symbol: "circle", data: maxPoints },
          },
          {
            name: "最低气温",
            type: "line",
            data: data.map(d => d.temp_min),
            smooth: true,
            symbol: "none",
            lineStyle: { color: "#06b6d4", width: 2 },
            itemStyle: { color: "#06b6d4" },
            markLine: { silent: true, symbol: ["none", "none"], data: minLines },
            markPoint: { symbol: "circle", data: minPoints },
          },
        ],
      }}
    />
  )
}
