import { parseLocalDate } from "@/lib/utils"

export interface FarmingAdvice {
  summary: string; fertilizer: string; pesticide: string; irrigation: string; fieldWork: string; potatoGrowthStage: string
}

export type MainStage =
  | "preplant" | "seedling" | "vegetative" | "budding" | "flowering" | "bulking" | "maturation" | "harvested"

const MAIN_STAGES: { stage: MainStage; label: string; minDap: number; maxDap: number }[] = [
  { stage: "preplant",    label: "播前准备",   minDap: -999, maxDap: 0   },
  { stage: "seedling",    label: "播种-出苗",  minDap: 0,    maxDap: 35  },
  { stage: "vegetative",  label: "发棵期",     minDap: 35,   maxDap: 65  },
  { stage: "budding",     label: "现蕾期",     minDap: 65,   maxDap: 78  },
  { stage: "flowering",   label: "开花结薯",   minDap: 78,   maxDap: 92  },
  { stage: "bulking",     label: "块茎膨大",   minDap: 92,   maxDap: 128 },
  { stage: "maturation",  label: "成熟收获",   minDap: 128,  maxDap: 999 },
]

export interface HarvestInfo {
  date?: string | null
  type?: string | null
}

export interface StageInfo {
  main: MainStage
  mainLabel: string
  substage: string
  dap: number
  daysInStage: number
  nextStage: MainStage | null
  nextStageLabel: string | null
  nextStageDaysLeft: number | null
}

function daysBetween(from: string, to: string): number {
  return Math.floor((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86400000)
}

function isHarvested(date: string, h: HarvestInfo): boolean {
  return Boolean(h.date && date >= h.date)
}

export function getStageInfo(date: string, plantingDate: string, harvestInfo?: HarvestInfo): StageInfo {
  const dap = daysBetween(plantingDate, date)
  if (harvestInfo && isHarvested(date, harvestInfo)) {
    return { main: "harvested", mainLabel: "已采收", substage: "已采收", dap, daysInStage: 0, nextStage: null, nextStageLabel: null, nextStageDaysLeft: null }
  }
  const cur = MAIN_STAGES.find(s => dap >= s.minDap && dap < s.maxDap) ?? MAIN_STAGES[MAIN_STAGES.length - 1]
  const nextIdx = MAIN_STAGES.indexOf(cur) + 1
  const next = nextIdx < MAIN_STAGES.length ? MAIN_STAGES[nextIdx] : null

  return {
    main: cur.stage,
    mainLabel: cur.label,
    substage: getPotatoGrowthStage(date, plantingDate),
    dap,
    daysInStage: dap - Math.max(0, cur.minDap),
    nextStage: next?.stage ?? null,
    nextStageLabel: next?.label ?? null,
    nextStageDaysLeft: next ? next.minDap - dap : null,
  }
}

export function getPotatoGrowthStage(weekStart: string, plantingDate: string): string {
  const dap = daysBetween(plantingDate, weekStart)
  if (dap < 0) return "播前整地准备期"
  if (dap < 10) return "种薯处理/催芽期"
  if (dap < 20) return "播种期"
  if (dap < 35) return "播后管理期"
  if (dap < 50) return "出苗期"
  if (dap < 65) return "苗期"
  if (dap < 78) return "现蕾期"
  if (dap < 92) return "开花/块茎形成期"
  if (dap < 113) return "块茎膨大期"
  if (dap < 128) return "淀粉积累期"
  if (dap < 143) return "成熟/杀秧期"
  if (dap < 155) return "收获期"
  return "收获收尾/入窖期"
}

interface DayData { temp_max?: number | null; temp_min?: number | null; temp_mean?: number | null; precipitation?: number | null; wind_speed_max?: number | null }

export function generateFarmingAdvice(days: DayData[], weekStart: string, plantingDate: string): FarmingAdvice {
  const stage = getPotatoGrowthStage(weekStart, plantingDate)
  if (!days.length) {
    return {
      summary: `${stage}阶段，暂无本周气象数据。`,
      fertilizer: "按当前阶段常规施肥。",
      pesticide: "注意巡田观察病虫害发生情况。",
      irrigation: "结合土壤墒情决定是否补水。",
      fieldWork: "补齐气象数据后再细化田间操作。",
      potatoGrowthStage: stage,
    }
  }
  const avgTemp = days.reduce((s, d) => s + (d.temp_mean ?? 0), 0) / days.length
  const totalPrecip = days.reduce((s, d) => s + (d.precipitation ?? 0), 0)
  const isDry = totalPrecip < 5
  const hasFrost = days.some(d => (d.temp_min ?? 99) < 0)
  const isHot = days.some(d => (d.temp_max ?? 0) > 32)
  const hasStrongWind = Math.max(...days.map(d => d.wind_speed_max ?? 0)) > 40

  let summary = `${stage}阶段，平均气温${avgTemp.toFixed(1)}°C。`
  if (hasFrost) summary += "注意霜冻风险。"
  if (isDry) summary += "降水偏少，注意灌溉。"
  if (isHot) summary += "高温天气，注意防暑。"
  if (hasStrongWind) summary += "大风天气，注意防风。"

  const fertilizer = stage.includes("苗期") ? "苗高15厘米追施尿素10-15公斤/亩。" : stage.includes("现蕾") ? "追施硫酸钾15-20公斤/亩+尿素5-8公斤/亩。" : "按当前阶段常规施肥。"
  const pesticide = isDry ? "干旱天气蚜虫易发，用10%吡虫啉2000倍液喷雾。" : "注意预防晚疫病，用72%霜脲·锰锌600倍液喷雾。"
  const irrigation = isDry ? "土壤干旱，及时灌溉补水。" : "土壤水分充足，正常管理。"
  const fieldWork = hasFrost ? "做好防冻措施，覆盖地膜或秸秆。" : "常规田间管理，清除杂草。"

  return { summary, fertilizer, pesticide, irrigation, fieldWork, potatoGrowthStage: stage }
}
