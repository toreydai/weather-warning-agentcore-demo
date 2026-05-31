"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2, X, Check } from "lucide-react"

interface Props {
  field: {
    id: number
    name: string
    latitude: number
    longitude: number
    area_mu: number | null
    variety: string | null
    planting_date: string | null
    province?: string | null
    city?: string | null
    county?: string | null
    township?: string | null
    admin_code?: string | null
    address?: string | null
  }
}

export function FieldActions({ field }: Props) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState(field)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSave() {
    setLoading(true)
    await fetch(`/api/fields/${field.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setLoading(false)
    setEditing(false)
    router.refresh()
  }

  async function handleDelete() {
    setLoading(true)
    await fetch(`/api/fields/${field.id}`, { method: "DELETE" })
    router.push("/")
  }

  if (deleting) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-red-600">确认删除？所有数据将丢失</span>
        <button onClick={handleDelete} disabled={loading} className="rounded bg-red-600 px-3 py-1 text-white text-xs hover:bg-red-700 disabled:opacity-50">
          {loading ? "删除中..." : "确认"}
        </button>
        <button onClick={() => setDeleting(false)} className="rounded bg-muted px-3 py-1 text-xs"><X className="h-3 w-3" /></button>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">名称</span>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="block w-32 rounded border px-2 py-1 text-xs" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">面积(亩)</span>
          <input type="number" value={form.area_mu ?? ""} onChange={e => setForm({ ...form, area_mu: e.target.value ? +e.target.value : null })} className="block w-20 rounded border px-2 py-1 text-xs" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">品种</span>
          <input value={form.variety ?? ""} onChange={e => setForm({ ...form, variety: e.target.value || null })} className="block w-24 rounded border px-2 py-1 text-xs" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">播种日期</span>
          <input type="date" value={form.planting_date ?? ""} onChange={e => setForm({ ...form, planting_date: e.target.value || null })} className="block rounded border px-2 py-1 text-xs" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">县/旗</span>
          <input value={form.county ?? ""} onChange={e => setForm({ ...form, county: e.target.value || null })} className="block w-24 rounded border px-2 py-1 text-xs" /></label>
        <label className="space-y-1"><span className="text-xs text-muted-foreground">乡镇</span>
          <input value={form.township ?? ""} onChange={e => setForm({ ...form, township: e.target.value || null })} className="block w-28 rounded border px-2 py-1 text-xs" /></label>
        <button onClick={handleSave} disabled={loading} className="rounded bg-green-600 p-1.5 text-white hover:bg-green-700 disabled:opacity-50"><Check className="h-3 w-3" /></button>
        <button onClick={() => setEditing(false)} className="rounded bg-muted p-1.5"><X className="h-3 w-3" /></button>
      </div>
    )
  }

  return (
    <div className="flex gap-1">
      <button onClick={() => setEditing(true)} className="rounded p-1.5 hover:bg-muted" title="编辑"><Pencil className="h-4 w-4 text-muted-foreground" /></button>
      <button onClick={() => setDeleting(true)} className="rounded p-1.5 hover:bg-muted" title="删除"><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
    </div>
  )
}
