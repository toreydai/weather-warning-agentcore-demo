"use client"

import type { StageInfo } from "@/lib/services/advice"

const STAGES = [
  { key: "seedling",   label: "出苗" },
  { key: "vegetative", label: "发棵" },
  { key: "budding",    label: "现蕾" },
  { key: "flowering",  label: "开花" },
  { key: "bulking",    label: "膨大" },
  { key: "maturation", label: "成熟" },
]

export function GrowthStageProgress({ info }: { info: StageInfo }) {
  const harvested = info.main === "harvested"
  const currentIdx = harvested ? STAGES.length : STAGES.findIndex(s => s.key === info.main)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>播种 {info.dap > 0 ? `· 已播后 ${info.dap} 天` : ""}</span>
        {!harvested && info.nextStageLabel && info.nextStageDaysLeft != null && info.nextStageDaysLeft > 0 && (
          <span>距{info.nextStageLabel} <span className="font-medium text-foreground">{info.nextStageDaysLeft}</span> 天</span>
        )}
        {harvested && <span className="text-amber-600 font-medium">已完成采收</span>}
      </div>

      {/* 进度条 */}
      <div className="flex items-center gap-1">
        {STAGES.map((s, i) => {
          const isPast = harvested || i < currentIdx
          const isCurrent = !harvested && i === currentIdx
          return (
            <div key={s.key} className="flex flex-1 flex-col items-center gap-1">
              <div className={`h-2 w-full rounded-full transition-colors ${
                isPast ? "bg-green-500" : isCurrent ? "bg-green-400" : "bg-green-100 dark:bg-green-950"
              }`} />
              <span className={`text-[10px] ${isCurrent ? "font-semibold text-green-700 dark:text-green-400" : harvested ? "text-green-600" : "text-muted-foreground"}`}>
                {s.label}
              </span>
            </div>
          )
        })}
        {/* 采收节点 */}
        <div className="flex flex-col items-center gap-1">
          <div className={`h-2 w-6 rounded-full transition-colors ${harvested ? "bg-amber-500" : "bg-amber-100"}`} />
          <span className={`text-[10px] ${harvested ? "font-semibold text-amber-600" : "text-muted-foreground"}`}>采收</span>
        </div>
      </div>

      {/* 当前阶段详情 */}
      <div className="text-xs text-muted-foreground">
        {harvested ? (
          <span className="text-amber-700 font-medium">本季生长周期已结束（采收完成）</span>
        ) : (
          <>
            当前：<span className="font-medium text-foreground">{info.mainLabel}</span>
            {info.daysInStage > 0 && <span>（已过 {info.daysInStage} 天）</span>}
            <span className="ml-2 text-[10px] text-muted-foreground/70">{info.substage}</span>
          </>
        )}
      </div>
    </div>
  )
}
