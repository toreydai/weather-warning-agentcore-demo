"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Pencil, Check, X } from "lucide-react"

interface Props {
  fieldId: number
  harvestDate: string | null
  harvestType: string | null
  notes: string | null
}

const TYPE_LABEL: Record<string, string> = { normal: "正常", early: "早收", late: "晚收" }

export function HarvestCard({ fieldId, harvestDate, harvestType, notes }: Props) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(harvestDate ?? "")
  const [type, setType] = useState(harvestType ?? "normal")
  const [noteVal, setNoteVal] = useState(notes ?? "")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function save() {
    setLoading(true)
    await fetch(`/api/fields/${fieldId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        harvest_date: date || null,
        harvest_type: type,
        notes: noteVal || null,
      }),
    })
    setLoading(false)
    setEditing(false)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">采收信息</CardTitle>
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded p-1 hover:bg-muted" title="编辑">
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">采收类型</span>
                <select
                  value={type}
                  onChange={e => setType(e.target.value)}
                  className="block w-full rounded border px-2 py-1.5 text-sm bg-background"
                >
                  <option value="normal">正常</option>
                  <option value="early">早收</option>
                  <option value="late">晚收</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">采收日期</span>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="block w-full rounded border px-2 py-1.5 text-sm bg-background"
                />
              </label>
            </div>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground">备注（可选）</span>
              <input
                value={noteVal}
                onChange={e => setNoteVal(e.target.value)}
                placeholder="如：天气原因提前、部分绝产等"
                className="block w-full rounded border px-2 py-1.5 text-sm bg-background"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={loading}
                className="flex items-center gap-1 rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />{loading ? "保存中..." : "保存"}
              </button>
              <button
                onClick={() => { setEditing(false); setDate(harvestDate ?? ""); setType(harvestType ?? "normal"); setNoteVal(notes ?? "") }}
                className="flex items-center gap-1 rounded border px-3 py-1.5 text-xs hover:bg-muted"
              >
                <X className="h-3 w-3" />取消
              </button>
            </div>
          </div>
        ) : harvestDate ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">采收日期：</span>
              <span className="font-medium">{harvestDate}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                {TYPE_LABEL[harvestType ?? "normal"] ?? harvestType}
              </span>
            </div>
            {notes && <p className="text-xs text-muted-foreground">{notes}</p>}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p>尚未记录采收信息</p>
            <button
              onClick={() => setEditing(true)}
              className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-700"
            >
              记录采收日期
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
