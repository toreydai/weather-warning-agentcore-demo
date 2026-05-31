"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CloudSun } from "lucide-react"
import { getWeatherIcon, getWeatherDescription } from "@/lib/weather-types"
import type { ForecastDay } from "@/lib/weather-types"
import { parseLocalDate } from "@/lib/utils"

export function ForecastCard({ forecast }: { forecast: ForecastDay[] }) {
  const [days, setDays] = useState(7)
  const visibleForecast = forecast.slice(0, days)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CloudSun className="h-5 w-5 text-cyan-600" />
            未来天气预报
          </CardTitle>
          <div className="flex gap-1 rounded-md bg-muted p-1 text-xs">
            {[7, 15, 45].map(option => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded px-2 py-1 transition-colors ${days === option ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {option} 天
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-9 gap-2">
          {visibleForecast.map((day, index) => {
            const d = parseLocalDate(day.date)
            const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
            const isExtended = index >= 15
            const isTrend = index >= 7 && index < 15
            return (
              <div key={day.date} className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs ${isExtended ? "bg-amber-50/70 border-amber-200" : ""}`}>
                <span className="text-muted-foreground">{weekDays[d.getDay()]}</span>
                <span className="text-muted-foreground">{d.getMonth() + 1}/{d.getDate()}</span>
                <span className="text-xl">{getWeatherIcon(day.weather_code ?? 0)}</span>
                <span className="text-muted-foreground">{getWeatherDescription(day.weather_code ?? 0)}</span>
                <span className="font-medium">{(day.temp_max ?? 0).toFixed(0)}°/{(day.temp_min ?? 0).toFixed(0)}°</span>
                {(day.precipitation ?? 0) > 0 && <span className="text-blue-500">{day.precipitation}mm</span>}
                {isTrend && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">趋势</span>}
                {isExtended && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">延伸期</span>}
              </div>
            )
          })}
        </div>
        {days > 15 && (
          <p className="mt-3 text-xs text-amber-700">
            15 天后为延伸期预报，不确定性较大，仅用于月度趋势判断，不建议直接作为具体农事作业窗口。
          </p>
        )}
      </CardContent>
    </Card>
  )
}
