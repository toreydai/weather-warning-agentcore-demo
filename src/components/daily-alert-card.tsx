import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { DailyFarmingAlert } from "@/lib/services/daily-alert"

export function DailyAlertCard({ alert }: { alert: DailyFarmingAlert }) {
  const content = alert.final_content ?? alert.draft_content
  return (
    <Card className="border-cyan-200 bg-cyan-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          今日农事预警
          <Badge className="bg-cyan-600">{alert.county_name}</Badge>
          {alert.focus && <Badge variant="secondary">{alert.focus}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{content}</div>
      </CardContent>
    </Card>
  )
}

