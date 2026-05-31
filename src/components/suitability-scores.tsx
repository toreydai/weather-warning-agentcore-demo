import { Card, CardContent } from "@/components/ui/card"
import type { SuitabilityScore } from "@/lib/services/suitability"

const LEVEL_COLORS: Record<SuitabilityScore["level"], string> = {
  excellent: "bg-green-500",
  good: "bg-lime-500",
  fair: "bg-yellow-500",
  poor: "bg-red-500",
}

const LEVEL_TEXT: Record<SuitabilityScore["level"], string> = {
  excellent: "text-green-700 dark:text-green-400",
  good: "text-lime-700 dark:text-lime-400",
  fair: "text-yellow-700 dark:text-yellow-400",
  poor: "text-red-700 dark:text-red-400",
}

function ScoreBar({ score, level }: { score: number; level: SuitabilityScore["level"] }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all ${LEVEL_COLORS[level]}`} style={{ width: `${score}%` }} />
    </div>
  )
}

function ScoreItem({ title, score }: { title: string; score: SuitabilityScore }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{title}</span>
        <span className={`text-xs font-semibold ${LEVEL_TEXT[score.level]}`}>
          {score.score} · {score.label}
        </span>
      </div>
      <ScoreBar score={score.score} level={score.level} />
    </div>
  )
}

export function SuitabilityScores({
  climate, plantProtection, fertilizer, irrigation,
}: {
  climate: SuitabilityScore
  plantProtection: SuitabilityScore
  fertilizer: SuitabilityScore
  irrigation: SuitabilityScore
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 space-y-3">
        <p className="text-sm font-medium">气象适宜度</p>
        <ScoreItem title="🌱 马铃薯气候适宜度（播种至今）" score={climate} />
        <ScoreItem title="🌿 植保适宜度（未来 3 天）" score={plantProtection} />
        <ScoreItem title="🌾 施肥适宜度（未来 7 天）" score={fertilizer} />
        <ScoreItem title="💧 灌溉适宜度（未来 7 天）" score={irrigation} />
      </CardContent>
    </Card>
  )
}
