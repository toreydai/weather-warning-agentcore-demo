import { getSolarTermContext } from "@/lib/data/solar-terms"
import { Leaf } from "lucide-react"

export function SolarTermBanner({ today }: { today: string }) {
  const { current, next, daysToNext } = getSolarTermContext(today)

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 shrink-0">
        <Leaf className="h-4 w-4 text-amber-600" />
        <span className="font-semibold text-amber-800">{current.name}</span>
        <span className="text-amber-500 text-xs">· 节气</span>
      </div>
      <p className="flex-1 text-amber-700 italic leading-snug">&ldquo;{current.proverb}&rdquo;</p>
      <div className="shrink-0 text-xs text-amber-500 whitespace-nowrap">
        距{next.name} {daysToNext} 天
      </div>
    </div>
  )
}
