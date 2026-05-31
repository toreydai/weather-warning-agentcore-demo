import { TrendingUp, TrendingDown, Minus, Thermometer, Droplets } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { SeasonCumulative } from "@/lib/services/cumulative"

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-red-500" />
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-blue-500" />
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />
}

function DeltaText({ delta, unit, trend }: { delta: number | null; unit: string; trend: "up" | "down" | "flat" }) {
  if (delta == null) return <span className="text-xs text-muted-foreground">暂无去年数据</span>
  const color = trend === "up" ? "text-red-500" : trend === "down" ? "text-blue-500" : "text-muted-foreground"
  return (
    <span className={`text-xs font-medium ${color}`}>
      {delta > 0 ? "+" : ""}{delta}{unit}（{trend === "up" ? "升高" : trend === "down" ? "降低" : "持平"}）
    </span>
  )
}

export function SeasonCumulativeCard({ cumulative }: { cumulative: SeasonCumulative }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-950">
              <Thermometer className="h-5 w-5 text-orange-600" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="text-xs text-muted-foreground">有效积温（播种至今）</p>
              <p className="text-xl font-bold">{cumulative.gdd.toFixed(0)} <span className="text-sm font-normal">°C·d</span></p>
              {cumulative.lastYear && (
                <p className="text-xs text-muted-foreground">去年同期 {cumulative.lastYear.gdd.toFixed(0)}°C·d</p>
              )}
              <div className="flex items-center gap-1">
                <TrendIcon trend={cumulative.gddTrend} />
                <DeltaText delta={cumulative.gddDelta} unit="°C·d" trend={cumulative.gddTrend} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950">
              <Droplets className="h-5 w-5 text-blue-600" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="text-xs text-muted-foreground">累计降水（播种至今）</p>
              <p className="text-xl font-bold">{cumulative.totalPrecip.toFixed(1)} <span className="text-sm font-normal">mm</span></p>
              {cumulative.lastYear && (
                <p className="text-xs text-muted-foreground">去年同期 {cumulative.lastYear.totalPrecip.toFixed(1)}mm</p>
              )}
              <div className="flex items-center gap-1">
                <TrendIcon trend={cumulative.precipTrend} />
                <DeltaText delta={cumulative.precipDelta} unit="mm" trend={cumulative.precipTrend} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
