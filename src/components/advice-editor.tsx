"use client"
import { useState } from "react"
import { Pencil, Check, X, Sparkles, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { flattenObj } from "@/lib/utils"

interface Advice {
  id?: number; source?: string; reviewed_by?: string
  summary: string; fertilizer: string; pesticide: string; irrigation: string
  fieldWork?: string; field_work?: string; potatoGrowthStage?: string; growth_stage?: string
}

function flattenValue(v: string): string {
  if (!v) return ""
  const t = v.trim()
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try { return flattenObj(JSON.parse(t)) } catch {}
  }
  return v
}

export function AdviceEditor({ fieldId, weekStart, advice, onUpdate }: { fieldId: number; weekStart: string; advice: Advice; onUpdate?: (a: any) => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    summary: flattenValue(advice.summary), fertilizer: flattenValue(advice.fertilizer),
    pesticide: flattenValue(advice.pesticide), irrigation: flattenValue(advice.irrigation),
    field_work: flattenValue(advice.fieldWork ?? advice.field_work ?? ""),
  })
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState(advice)

  function updateAll(d: Record<string, unknown>) {
    const a: Advice = {
      id: d.id as number, source: d.source as string, reviewed_by: d.reviewed_by as string,
      summary: flattenValue(String(d.summary ?? "")), fertilizer: flattenValue(String(d.fertilizer ?? "")),
      pesticide: flattenValue(String(d.pesticide ?? "")), irrigation: flattenValue(String(d.irrigation ?? "")),
      fieldWork: flattenValue(String(d.field_work ?? d.fieldWork ?? "")),
      field_work: flattenValue(String(d.field_work ?? d.fieldWork ?? "")),
      potatoGrowthStage: String(d.growth_stage ?? d.potatoGrowthStage ?? ""),
      growth_stage: String(d.growth_stage ?? d.potatoGrowthStage ?? ""),
    } as Advice
    setCurrent(a)
    setForm({ summary: a.summary, fertilizer: a.fertilizer, pesticide: a.pesticide, irrigation: a.irrigation, field_work: a.fieldWork ?? "" })
    onUpdate?.(a)
  }

  const sourceLabel = current.source === "agentcore" ? (
    <Badge className="bg-indigo-600 text-white text-xs gap-1">🤖 Agent生成</Badge>
  ) : current.source === "auto" ? (
    <Badge className="bg-purple-500 text-white text-xs gap-1"><Sparkles className="h-3 w-3" />AI 生成</Badge>
  ) : current.source === "manual" ? (
    <Badge className="bg-blue-500 text-white text-xs gap-1"><Pencil className="h-3 w-3" />人工编辑</Badge>
  ) : current.source === "code" ? (
    <Badge className="bg-gray-500 text-white text-xs gap-1">⚙️ 系统生成</Badge>
  ) : null

  const reviewLabel = current.reviewed_by ? (
    <Badge className="bg-green-500 text-white text-xs gap-1"><CheckCircle className="h-3 w-3" />已审核 by {current.reviewed_by}</Badge>
  ) : current.id && (current.source === "auto" || current.source === "agentcore") ? (
    <button onClick={handleReview} className="text-xs text-green-600 hover:underline">审核通过</button>
  ) : null

  async function handleSave() {
    setLoading(true)
    if (current.id) {
      const res = await fetch(`/api/fields/${fieldId}/advice/${current.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (res.ok) updateAll(await res.json())
    }
    setLoading(false); setEditing(false)
  }

  async function handleGenerate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/fields/${fieldId}/advice?week=${weekStart}`)
      if (res.ok) updateAll(await res.json())
    } catch {}
    setLoading(false)
  }

  async function handleAIGenerate() {
    setLoading(true)
    try {
      const res = await fetch(`/api/fields/${fieldId}/advice?week=${weekStart}`, { method: "POST" })
      if (res.ok) updateAll(await res.json())
    } catch {}
    setLoading(false)
  }

  async function handleReview() {
    if (!current.id) return
    const res = await fetch(`/api/fields/${fieldId}/advice/${current.id}/review`, { method: "POST" })
    if (res.ok) updateAll(await res.json())
  }

  if (editing) {
    return (
      <div className="space-y-2 border rounded-lg p-3 bg-muted/30" onClick={e => e.stopPropagation()}>
        {(["summary", "fertilizer", "pesticide", "irrigation", "field_work"] as const).map(key => (
          <div key={key}>
            <label className="text-xs font-medium text-muted-foreground">{{ summary: "总结", fertilizer: "施肥", pesticide: "防治", irrigation: "灌溉", field_work: "田间管理" }[key]}</label>
            <textarea value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="w-full rounded border px-2 py-1 text-sm mt-0.5" rows={2} />
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={loading} className="flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-50"><Check className="h-3 w-3" />{loading ? "保存中..." : "保存"}</button>
          <button onClick={() => setEditing(false)} className="flex items-center gap-1 rounded bg-muted px-3 py-1 text-xs"><X className="h-3 w-3" />取消</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
      {sourceLabel} {reviewLabel}
      {current.id && <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">编辑</button>}
      <button onClick={handleGenerate} disabled={loading} className="text-xs text-green-600 hover:underline disabled:opacity-50">
        {loading ? "生成中..." : "⚙️ 规则生成"}
      </button>
      <button onClick={handleAIGenerate} disabled={loading} className="text-xs text-purple-600 hover:underline disabled:opacity-50">
        {loading ? "AI分析中..." : "🤖 AI智能生成"}
      </button>
    </div>
  )
}
