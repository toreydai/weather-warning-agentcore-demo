"use client"

import { useState } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Thermometer, Droplets, Wind, Sprout, FlaskConical, Bug, CloudRain, Shovel, ChevronDown, ChevronUp,
} from "lucide-react"
import { flattenObj, parseLocalDate } from "@/lib/utils"
import type { WeeklyReport } from "@/lib/weather-types"
import { getWeatherIcon, getWeatherDescription } from "@/lib/weather-types"
import type { FarmingAdvice } from "@/lib/services/advice"
import { AdviceEditor } from "@/components/advice-editor"

export function WeeklyReportCard({ report, fieldId, isNextWeek }: { report: WeeklyReport; fieldId?: number; isNextWeek?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [advice, setAdvice] = useState<FarmingAdvice & { id?: number; source?: string; reviewed_by?: string }>(report.farmingAdvice as FarmingAdvice & { id?: number; source?: string; reviewed_by?: string })

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">{report.weekLabel}</CardTitle>
              {isNextWeek && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  预测 · 本周末更新
                </span>
              )}
            </div>
            <CardDescription className="flex items-center gap-1">
              <Sprout className="h-4 w-4" />{advice.potatoGrowthStage}
            </CardDescription>
            {fieldId && <AdviceEditor fieldId={fieldId} weekStart={report.weekStart} advice={advice} onUpdate={setAdvice} />}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
              <span className="flex items-center gap-1 text-muted-foreground"><Thermometer className="h-3.5 w-3.5 text-orange-500" />{report.avgTemp.toFixed(1)}°C</span>
              <span className="flex items-center gap-1 text-muted-foreground"><Droplets className="h-3.5 w-3.5 text-blue-500" />{report.totalPrecip.toFixed(1)}mm</span>
              <span className="flex items-center gap-1 text-muted-foreground"><Wind className="h-3.5 w-3.5 text-gray-500" />{report.maxWind}km/h</span>
            </div>
            {expanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-5">
          <div>
            <h4 className="text-sm font-medium mb-3">每日天气</h4>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {report.days.map((day) => {
                const d = parseLocalDate(day.date)
                const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
                return (
                  <div key={day.date} className="flex flex-col items-center gap-1 rounded-lg border p-2 text-xs">
                    <span className="text-muted-foreground">{weekDays[d.getDay()]}</span>
                    <span className="text-muted-foreground">{d.getMonth() + 1}/{d.getDate()}</span>
                    <span className="text-xl">{getWeatherIcon(day.weatherCode)}</span>
                    <span className="text-muted-foreground">{getWeatherDescription(day.weatherCode)}</span>
                    <span className="font-medium">{day.tempMax.toFixed(0)}°/{day.tempMin.toFixed(0)}°</span>
                    {day.precipitation > 0 && <span className="text-blue-500">{day.precipitation}mm</span>}
                  </div>
                )
              })}
            </div>
          </div>

          <Separator />

          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="text-sm font-medium mb-2">综合评估</h4>
            <p className="text-sm text-muted-foreground">{formatAdviceContent(advice.summary)}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <AdviceItem icon={<FlaskConical className="h-4 w-4 text-green-600" />} title="施肥建议" content={advice.fertilizer} color="green" />
            <AdviceItem icon={<Bug className="h-4 w-4 text-red-600" />} title="病虫害防治" content={advice.pesticide} color="red" />
            <AdviceItem icon={<CloudRain className="h-4 w-4 text-blue-600" />} title="灌溉管理" content={advice.irrigation} color="blue" />
            <AdviceItem icon={<Shovel className="h-4 w-4 text-amber-600" />} title="田间管理" content={advice.fieldWork} color="amber" />
          </div>
        </CardContent>
      )}
    </Card>
  )
}

function formatAdviceContent(content: string): string {
  if (!content) return ""
  const trimmed = content.trim()
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try { return flattenObj(JSON.parse(trimmed)) } catch {}
  }
  return content
}

function AdviceItem({ icon, title, content, color }: { icon: React.ReactNode; title: string; content: string; color: string }) {
  const borderColors: Record<string, string> = { green: "border-l-green-600", red: "border-l-red-600", blue: "border-l-blue-600", amber: "border-l-amber-600" }
  return (
    <div className={`rounded-lg border border-l-4 ${borderColors[color]} p-3`}>
      <div className="flex items-center gap-2 mb-2">{icon}<h5 className="text-sm font-medium">{title}</h5></div>
      <p className="text-xs text-muted-foreground leading-relaxed">{formatAdviceContent(content)}</p>
    </div>
  )
}
