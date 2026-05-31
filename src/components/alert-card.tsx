"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CloudRain,
  Wind,
  CloudHail,
  Flame,
  Snowflake,
  CloudDrizzle,
  Thermometer,
  CloudLightning,
  CloudSnow,
} from "lucide-react"
import type { ExtremeWeatherAlert } from "@/lib/weather-types"
import { parseLocalDate } from "@/lib/utils"

const typeConfig: Record<
  ExtremeWeatherAlert["type"],
  { label: string; icon: React.ReactNode }
> = {
  frost: { label: "霜冻", icon: <Snowflake className="h-4 w-4" /> },
  heavy_rain: { label: "暴雨", icon: <CloudRain className="h-4 w-4" /> },
  hail: { label: "冰雹", icon: <CloudHail className="h-4 w-4" /> },
  drought: { label: "干旱", icon: <CloudDrizzle className="h-4 w-4" /> },
  strong_wind: { label: "大风", icon: <Wind className="h-4 w-4" /> },
  strong_gust: { label: "阵风", icon: <Wind className="h-4 w-4" /> },
  heat: { label: "高温", icon: <Flame className="h-4 w-4" /> },
  cold_wave: { label: "寒潮", icon: <Thermometer className="h-4 w-4" /> },
  heavy_snow: { label: "暴雪", icon: <CloudSnow className="h-4 w-4" /> },
  typhoon: { label: "台风", icon: <CloudLightning className="h-4 w-4" /> },
  chilling: { label: "低温冷害", icon: <Snowflake className="h-4 w-4" /> },
}

const severityConfig: Record<
  ExtremeWeatherAlert["severity"],
  { label: string; className: string; dotClass: string; iconBg: string; badgeClass: string }
> = {
  red: {
    label: "红色",
    className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
    dotClass: "bg-red-500",
    iconBg: "bg-red-200 dark:bg-red-900",
    badgeClass: "border-red-400 text-red-700 dark:text-red-300",
  },
  orange: {
    label: "橙色",
    className: "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
    dotClass: "bg-orange-500",
    iconBg: "bg-orange-200 dark:bg-orange-900",
    badgeClass: "border-orange-400 text-orange-700 dark:text-orange-300",
  },
  yellow: {
    label: "黄色",
    className: "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
    dotClass: "bg-yellow-500",
    iconBg: "bg-yellow-200 dark:bg-yellow-900",
    badgeClass: "border-yellow-400 text-yellow-700 dark:text-yellow-300",
  },
}

export function AlertCard({ alert }: { alert: ExtremeWeatherAlert }) {
  const [expanded, setExpanded] = useState(false)
  const type = typeConfig[alert.type]
  const severity = severityConfig[alert.severity]

  return (
    <Card className={`border ${severity.className} transition-shadow hover:shadow-md`}>
      <CardHeader
        className="cursor-pointer py-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full ${severity.iconBg}`}>
              {type.icon}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {alert.title}
                <Badge variant="outline" className={`text-xs ${severity.badgeClass}`}>
                  <span className={`inline-block h-2 w-2 rounded-full ${severity.dotClass} mr-1`} />
                  {severity.label}预警
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {parseLocalDate(alert.date).toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </p>
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          <p className="text-sm">{alert.description}</p>

          <div className="rounded-lg border bg-background/50 p-4">
            <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" />
              应急预案
            </h4>
            <ol className="space-y-2">
              {alert.emergencyPlan.map((step, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      )}
    </Card>
  )
}
