"use client"
import ReactEChartsCore from "echarts-for-react/lib/core"
import * as echarts from "echarts/core"
import { BarChart, LineChart } from "echarts/charts"
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from "echarts/components"
import { CanvasRenderer } from "echarts/renderers"

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer])

interface Forecast7d { date: string; max_precip: number | null; avg_precip: number | null; member_count: number }

export default function ZoneForecastChart({ forecast }: { forecast: Forecast7d[] }) {
  const dates = forecast.map(f => f.date.slice(5))

  const option = {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: { seriesName: string; value: number | null; name: string }[]) => {
        const date = params[0]?.name ?? ""
        return params.map(p => `${p.seriesName}：${p.value != null ? p.value + " mm" : "–"}`).join("<br/>")
          ? `<b>${date}</b><br/>` + params.map(p => `${p.seriesName}：${p.value != null ? p.value + " mm" : "–"}`).join("<br/>")
          : date
      },
    },
    legend: { top: 0, textStyle: { fontSize: 10 } },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: "category" as const, data: dates, axisLabel: { fontSize: 10 } },
    yAxis: { type: "value" as const, name: "mm", nameTextStyle: { fontSize: 10 }, minInterval: 5 },
    series: [
      {
        name: "最大降水",
        type: "bar",
        data: forecast.map(f => f.max_precip),
        itemStyle: {
          color: (p: { value: number }) => {
            const v = p.value ?? 0
            if (v >= 50) return "#dc2626"
            if (v >= 25) return "#1d4ed8"
            if (v >= 10) return "#3b82f6"
            if (v >= 0.1) return "#60a5fa"
            return "#d1d5db"
          },
        },
        markLine: {
          silent: true,
          lineStyle: { type: "dashed" as const },
          data: [
            { yAxis: 10, name: "中雨", label: { formatter: "中雨 10mm", fontSize: 9 }, lineStyle: { color: "#3b82f6" } },
            { yAxis: 25, name: "大雨", label: { formatter: "大雨 25mm", fontSize: 9 }, lineStyle: { color: "#1d4ed8" } },
            { yAxis: 50, name: "暴雨", label: { formatter: "暴雨 50mm", fontSize: 9 }, lineStyle: { color: "#dc2626" } },
          ],
        },
      },
      {
        name: "均值降水",
        type: "line",
        data: forecast.map(f => f.avg_precip),
        smooth: true,
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: "#8b5cf6", width: 1.5, type: "dashed" as const },
        itemStyle: { color: "#8b5cf6" },
      },
    ],
  }

  return <ReactEChartsCore echarts={echarts} notMerge style={{ height: 220 }} option={option} />
}
