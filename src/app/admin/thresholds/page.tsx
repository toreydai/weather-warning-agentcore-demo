"use client"
import { apiFetch } from "@/lib/api-fetch"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sprout, ArrowLeft, Save, Plus, Trash2, X } from "lucide-react"
import Link from "next/link"

interface Threshold {
  id: number
  alert_type: string
  stage: string | null
  label: string
  yellow_condition: string
  orange_condition: string
  red_condition: string
  reference_source: string | null
  reference_note: string | null
}

const EMPTY_CONDITIONS = { yellow_condition: "{}", orange_condition: "{}", red_condition: "{}" }
const CONDITION_HINT = `可用字段：\nmatch_mode              any/all\ntemp_min_lte            最低气温≤\ntemp_min_lte_days_gte   连续低温天数≥\ntemp_max_gte            最高气温≥\nprecip_gte              单日降水量≥\nprecip_3d_gte           3日累计降水≥\nprecip_sum_gte          N日累计降水≥\nwindow_days             统计窗口天数\nrain_days_gte           窗口内降水日数≥\nwind_gte                风速≥(km/h)\ngust_gte                阵风≥(km/h)\nhumidity_lte            相对湿度≤\ngdd_gte                 累计积温≥`
const STAGE_OPTIONS = [
  { value: "", label: "默认" },
  { value: "preplant", label: "播前准备" },
  { value: "seedling", label: "播种-出苗" },
  { value: "vegetative", label: "发棵期" },
  { value: "budding", label: "现蕾期" },
  { value: "flowering", label: "开花结薯" },
  { value: "bulking", label: "块茎膨大" },
  { value: "maturation", label: "成熟收获" },
  { value: "harvested", label: "已采收" },
]
const stageLabel = (stage: string | null) => STAGE_OPTIONS.find(s => s.value === (stage ?? ""))?.label ?? stage ?? "默认"

export default function ThresholdsPage() {
  const [thresholds, setThresholds] = useState<Threshold[]>([])
  const [editing, setEditing] = useState<Record<number, Threshold>>({})
  const [saving, setSaving] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [newForm, setNewForm] = useState({ alert_type: "", stage: "", label: "", reference_source: "", reference_note: "", ...EMPTY_CONDITIONS })

  useEffect(() => {
    apiFetch("/api/admin/thresholds").then(r => r.json()).then(setThresholds)
  }, [])

  function startEdit(t: Threshold) {
    setEditing(prev => ({ ...prev, [t.id]: { ...t } }))
  }

  function cancelEdit(id: number) {
    setEditing(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  function updateLocal(id: number, level: "yellow_condition" | "orange_condition" | "red_condition", value: string) {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], [level]: value } }))
  }

  function updateStage(id: number, value: string) {
    setEditing(prev => ({ ...prev, [id]: { ...prev[id], stage: value || null } }))
  }

  async function save(id: number) {
    const t = editing[id]
    if (!t) return
    try { JSON.parse(t.yellow_condition); JSON.parse(t.orange_condition); JSON.parse(t.red_condition) }
    catch { alert("JSON 格式错误"); return }
    setSaving(id)
    const res = await apiFetch("/api/admin/thresholds", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, stage: t.stage ?? null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setThresholds(prev => prev.map(x => x.id === id ? updated : x))
      cancelEdit(id)
    }
    setSaving(null)
  }

  async function remove(id: number, label: string) {
    if (!confirm(`确认删除「${label}」阈值？`)) return
    setDeleting(id)
    const res = await apiFetch("/api/admin/thresholds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setThresholds(prev => prev.filter(x => x.id !== id))
    setDeleting(null)
  }

  async function addThreshold() {
    setAddError("")
    try { JSON.parse(newForm.yellow_condition); JSON.parse(newForm.orange_condition); JSON.parse(newForm.red_condition) }
    catch { setAddError("条件 JSON 格式错误"); return }
    if (!newForm.alert_type || !newForm.label) { setAddError("类型标识和名称不能为空"); return }
    setAdding(true)
    const res = await apiFetch("/api/admin/thresholds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newForm, stage: newForm.stage || null }),
    })
    if (res.ok) {
      const created = await res.json()
      setThresholds(prev => [...prev, created])
      setShowAdd(false)
      setNewForm({ alert_type: "", stage: "", label: "", reference_source: "", reference_note: "", ...EMPTY_CONDITIONS })
    } else {
      const err = await res.json()
      setAddError(err.error ?? "创建失败")
    }
    setAdding(false)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white">
            <Sprout className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">预警阈值管理</h1>
            <p className="text-sm text-muted-foreground">修改后即时生效，无需重启</p>
          </div>
          <button
            onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
          >
            <Plus className="h-4 w-4" />新增阈值
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        {/* 新增表单 */}
        {showAdd && (
          <Card className="border-green-300 bg-green-50/50">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">新增自定义阈值</CardTitle>
              <button onClick={() => setShowAdd(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">类型标识（英文+下划线）</label>
                  <input
                    value={newForm.alert_type}
                    onChange={e => setNewForm(f => ({ ...f, alert_type: e.target.value }))}
                    placeholder="如 cold_wave"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">显示名称</label>
                  <input
                    value={newForm.label}
                    onChange={e => setNewForm(f => ({ ...f, label: e.target.value }))}
                    placeholder="如 寒潮"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">生育期</label>
                  <select
                    value={newForm.stage}
                    onChange={e => setNewForm(f => ({ ...f, stage: e.target.value }))}
                    className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  >
                    {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre">{CONDITION_HINT}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">参考标准</label>
                  <input
                    value={newForm.reference_source}
                    onChange={e => setNewForm(f => ({ ...f, reference_source: e.target.value }))}
                    placeholder="如 DB15/T 4315-2026 表2"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">备注</label>
                  <input
                    value={newForm.reference_note}
                    onChange={e => setNewForm(f => ({ ...f, reference_note: e.target.value }))}
                    placeholder="如 风速已由 m/s 换算为 km/h"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(["yellow_condition", "orange_condition", "red_condition"] as const).map(level => {
                  const color = level.startsWith("yellow") ? "bg-yellow-500" : level.startsWith("orange") ? "bg-orange-500" : "bg-red-500"
                  const lbl = level.startsWith("yellow") ? "黄色" : level.startsWith("orange") ? "橙色" : "红色"
                  return (
                    <div key={level}>
                      <Badge className={`${color} text-white mb-2`}>{lbl}</Badge>
                      <textarea
                        value={newForm[level]}
                        onChange={e => setNewForm(f => ({ ...f, [level]: e.target.value }))}
                        className="w-full rounded border px-2 py-1 text-xs font-mono h-16"
                      />
                    </div>
                  )
                })}
              </div>
              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <button
                onClick={addThreshold}
                disabled={adding}
                className="rounded-md bg-green-600 px-4 py-1.5 text-sm text-white hover:bg-green-700 disabled:opacity-50"
              >
                {adding ? "创建中..." : "创建"}
              </button>
            </CardContent>
          </Card>
        )}

        {/* 阈值列表 */}
        {thresholds.map(t => {
          const isEditing = !!editing[t.id]
          const current = editing[t.id] ?? t
          return (
            <Card key={t.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.label}</CardTitle>
                <div className="flex gap-3 items-center">
                  {!isEditing && (
                    <>
                      <button onClick={() => startEdit(t)} className="text-sm text-blue-600 hover:underline">编辑</button>
                      <button
                        onClick={() => remove(t.id, t.label)}
                        disabled={deleting === t.id}
                        className="text-muted-foreground hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button onClick={() => save(t.id)} disabled={saving === t.id}
                        className="flex items-center gap-1 text-sm text-green-600 hover:underline disabled:opacity-50">
                        <Save className="h-3 w-3" />{saving === t.id ? "保存中..." : "保存"}
                      </button>
                      <button onClick={() => cancelEdit(t.id)} className="text-sm text-muted-foreground hover:underline">取消</button>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>类型标识：{t.alert_type}</span>
                  <Badge variant="outline">{stageLabel(t.stage)}</Badge>
                  {isEditing && (
                    <select
                      value={current.stage ?? ""}
                      onChange={e => updateStage(t.id, e.target.value)}
                      className="rounded border bg-background px-2 py-1 text-xs"
                    >
                      {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  )}
                </div>
                <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {isEditing ? (
                    <>
                      <input
                        value={current.reference_source ?? ""}
                        onChange={e => setEditing(prev => ({ ...prev, [t.id]: { ...prev[t.id], reference_source: e.target.value } }))}
                        placeholder="参考标准"
                        className="rounded border bg-background px-2 py-1"
                      />
                      <input
                        value={current.reference_note ?? ""}
                        onChange={e => setEditing(prev => ({ ...prev, [t.id]: { ...prev[t.id], reference_note: e.target.value } }))}
                        placeholder="备注"
                        className="rounded border bg-background px-2 py-1"
                      />
                    </>
                  ) : (
                    <>
                      <span>参考：{t.reference_source ?? "未标注"}</span>
                      {t.reference_note && <span>备注：{t.reference_note}</span>}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(["yellow_condition", "orange_condition", "red_condition"] as const).map(level => {
                    const color = level.startsWith("yellow") ? "bg-yellow-500" : level.startsWith("orange") ? "bg-orange-500" : "bg-red-500"
                    const label = level.startsWith("yellow") ? "黄色" : level.startsWith("orange") ? "橙色" : "红色"
                    return (
                      <div key={level}>
                        <Badge className={`${color} text-white mb-2`}>{label}</Badge>
                        {isEditing ? (
                          <textarea value={current[level]} onChange={e => updateLocal(t.id, level, e.target.value)}
                            className="w-full rounded border px-2 py-1 text-xs font-mono h-16" />
                        ) : (
                          <pre className="text-xs bg-muted rounded p-2">{current[level]}</pre>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </main>
    </div>
  )
}
