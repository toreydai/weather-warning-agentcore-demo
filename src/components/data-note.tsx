import { Info } from "lucide-react"

interface DataNoteProps {
  source: string
  method?: string
  updateFreq?: string
}

export function DataNote({ source, method, updateFreq }: DataNoteProps) {
  return (
    <div className="mt-2 flex items-start gap-1 text-[10px] text-muted-foreground/70 leading-relaxed">
      <Info className="h-3 w-3 mt-0.5 shrink-0" />
      <span>
        <span className="font-medium">数据来源：</span>{source}
        {method && <><span className="mx-1">·</span><span className="font-medium">计算：</span>{method}</>}
        {updateFreq && <><span className="mx-1">·</span><span className="font-medium">更新：</span>{updateFreq}</>}
      </span>
    </div>
  )
}
