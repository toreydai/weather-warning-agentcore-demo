"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Thermometer,
  Droplets,
  Wind,
  CloudRain,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import type { MonthComparison } from "@/lib/weather-types"

function DeltaBadge({ value, unit, invert }: { value: number; unit: string; invert?: boolean }) {
  const isUp = invert ? value < 0 : value > 0
  const isDown = invert ? value > 0 : value < 0
  const Icon = value === 0 ? Minus : isUp ? TrendingUp : TrendingDown
  const color = value === 0
    ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
    : isUp
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
      : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"

  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      <Icon className="h-3 w-3" />
      {value > 0 ? "+" : ""}{value}{unit}
    </span>
  )
}

function MetricRow({
  icon,
  label,
  current,
  historical,
  delta,
  unit,
  invert,
}: {
  icon: React.ReactNode
  label: string
  current: string
  historical: string
  delta: number
  unit: string
  invert?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium">{current}</span>
        <span className="text-muted-foreground">/ {historical}</span>
        <DeltaBadge value={delta} unit={unit} invert={invert} />
      </div>
    </div>
  )
}

export function HistoryComparison({ comparisons }: { comparisons: MonthComparison[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          与历史同期对比
          <Badge variant="secondary" className="text-xs">{new Date().getFullYear() - 10}-{new Date().getFullYear() - 1} 十年均值</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {comparisons.map((c) => (
            <div key={c.month} className="rounded-lg border p-4 space-y-1">
              <h4 className="text-sm font-medium mb-3">{c.label}</h4>
              <MetricRow
                icon={<Thermometer className="h-4 w-4 text-orange-500" />}
                label="均温"
                current={`${c.current.avgTemp.toFixed(1)}°C`}
                historical={`${c.historical.avg_temp_mean}°C`}
                delta={c.delta.temp}
                unit="°C"
              />
              <MetricRow
                icon={<CloudRain className="h-4 w-4 text-blue-500" />}
                label="降水"
                current={`${c.current.totalPrecip.toFixed(1)}mm`}
                historical={`${c.historical.avg_precipitation}mm`}
                delta={c.delta.precip}
                unit="mm"
              />
              <MetricRow
                icon={<Wind className="h-4 w-4 text-gray-500" />}
                label="最大风速"
                current={`${c.current.maxWind}km/h`}
                historical={c.historical.avg_wind_speed_max != null ? `${c.historical.avg_wind_speed_max}km/h` : "N/A"}
                delta={c.delta.wind}
                unit="km/h"
              />
              <MetricRow
                icon={<Droplets className="h-4 w-4 text-cyan-500" />}
                label="湿度"
                current={`${c.current.avgHumidity.toFixed(0)}%`}
                historical={c.historical.avg_humidity != null ? `${c.historical.avg_humidity}%` : "N/A"}
                delta={c.delta.humidity}
                unit="%"
              />
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-muted-foreground flex items-center gap-4 justify-center">
          <span>格式：<span className="font-medium">今年</span> / <span className="text-muted-foreground">历史均值</span></span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />偏高</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />偏低</span>
        </div>
      </CardContent>
    </Card>
  )
}
