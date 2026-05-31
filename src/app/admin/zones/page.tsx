"use client"
import { apiFetch } from "@/lib/api-fetch"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sprout, ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, X } from "lucide-react"
import Link from "next/link"

interface Zone {
  id: number
  name: string
  description: string | null
  scope_type: string
  created_at: string
  member_count: number
}

interface ZoneMember {
  id: number
  zone_id: number
  member_type: string
  field_id: number | null
  admin_code: string | null
  township: string | null
  county: string | null
  latitude: number | null
  longitude: number | null
  field_name: string | null
}

interface ZoneDetail extends Zone {
  members: ZoneMember[]
}

interface Field { id: number; name: string; county: string | null; township: string | null }

const SCOPE_LABELS: Record<string, string> = { fields: "地块集合", admin: "行政集合", mixed: "混合" }
const SCOPE_COLORS: Record<string, string> = { fields: "bg-green-100 text-green-800", admin: "bg-blue-100 text-blue-800", mixed: "bg-purple-100 text-purple-800" }

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [role, setRole] = useState<string>("")
  const [fields, setFields] = useState<Field[]>([])
  const [expanded, setExpanded] = useState<Record<number, ZoneDetail | null>>({})
  const [loadingDetail, setLoadingDetail] = useState<Record<number, boolean>>({})

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: "", description: "", scope_type: "fields" })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ name: "", description: "" })
  const [saving, setSaving] = useState(false)

  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [addMemberZoneId, setAddMemberZoneId] = useState<number | null>(null)
  const [memberForm, setMemberForm] = useState({ member_type: "field", field_id: "", admin_code: "", township: "", county: "", latitude: "", longitude: "" })
  const [addingMember, setAddingMember] = useState(false)
  const [memberError, setMemberError] = useState("")

  const [removingMemberId, setRemovingMemberId] = useState<number | null>(null)

  useEffect(() => {
    apiFetch("/api/auth/me").then(r => r.json()).then(d => setRole(d.role ?? ""))
    apiFetch("/api/zones").then(r => r.json()).then(setZones)
    apiFetch("/api/fields").then(r => r.json()).then(setFields)
  }, [])

  const isAdmin = role === "admin"
  const canEdit = role === "admin" || role === "reviewer"

  async function toggleExpand(zoneId: number) {
    if (expanded[zoneId] !== undefined) {
      setExpanded(prev => { const n = { ...prev }; delete n[zoneId]; return n })
      return
    }
    setLoadingDetail(prev => ({ ...prev, [zoneId]: true }))
    const detail: ZoneDetail = await apiFetch(`/api/zones/${zoneId}`).then(r => r.json())
    setExpanded(prev => ({ ...prev, [zoneId]: detail }))
    setLoadingDetail(prev => ({ ...prev, [zoneId]: false }))
  }

  async function createZone() {
    if (!createForm.name.trim()) { setCreateError("名称不能为空"); return }
    setCreating(true); setCreateError("")
    const res = await apiFetch("/api/zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...createForm, description: createForm.description || null }),
    })
    setCreating(false)
    if (res.ok) {
      const z = await res.json()
      setZones(prev => [...prev, { ...z, member_count: 0 }])
      setShowCreate(false)
      setCreateForm({ name: "", description: "", scope_type: "fields" })
    } else {
      const e = await res.json()
      setCreateError(typeof e.error === "string" ? e.error : "创建失败")
    }
  }

  async function saveEdit(zoneId: number) {
    setSaving(true)
    const res = await apiFetch(`/api/zones/${zoneId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editForm.name, description: editForm.description || null }),
    })
    setSaving(false)
    if (res.ok) {
      const z = await res.json()
      setZones(prev => prev.map(x => x.id === zoneId ? { ...x, name: z.name, description: z.description } : x))
      setEditingId(null)
    } else {
      alert("保存失败")
    }
  }

  async function deleteZone(zoneId: number) {
    if (!confirm("确定删除该产区及其所有成员？")) return
    setDeletingId(zoneId)
    const res = await apiFetch(`/api/zones/${zoneId}`, { method: "DELETE" })
    setDeletingId(null)
    if (res.ok) {
      setZones(prev => prev.filter(z => z.id !== zoneId))
      setExpanded(prev => { const n = { ...prev }; delete n[zoneId]; return n })
    } else {
      alert("删除失败")
    }
  }

  async function addMember(zoneId: number) {
    setAddingMember(true); setMemberError("")
    const body: Record<string, unknown> = { member_type: memberForm.member_type }
    if (memberForm.member_type === "field") {
      body.field_id = Number(memberForm.field_id)
    } else {
      body.admin_code = memberForm.admin_code
      body.township = memberForm.township || undefined
      body.county = memberForm.county || undefined
      if (memberForm.latitude) body.latitude = Number(memberForm.latitude)
      if (memberForm.longitude) body.longitude = Number(memberForm.longitude)
    }
    const res = await apiFetch(`/api/zones/${zoneId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    setAddingMember(false)
    if (res.ok) {
      const m = await res.json()
      const fieldInfo = memberForm.member_type === "field" ? fields.find(f => f.id === Number(memberForm.field_id)) : null
      const newMember: ZoneMember = { ...m, field_name: fieldInfo?.name ?? null }
      setExpanded(prev => {
        const detail = prev[zoneId]
        if (!detail) return prev
        return { ...prev, [zoneId]: { ...detail, members: [...detail.members, newMember] } }
      })
      setZones(prev => prev.map(z => z.id === zoneId ? { ...z, member_count: z.member_count + 1 } : z))
      setAddMemberZoneId(null)
      setMemberForm({ member_type: "field", field_id: "", admin_code: "", township: "", county: "", latitude: "", longitude: "" })
    } else {
      const e = await res.json()
      setMemberError(typeof e.error === "string" ? e.error : "添加失败")
    }
  }

  async function removeMember(zoneId: number, memberId: number) {
    setRemovingMemberId(memberId)
    const res = await apiFetch(`/api/zones/${zoneId}/members/${memberId}`, { method: "DELETE" })
    setRemovingMemberId(null)
    if (res.ok) {
      setExpanded(prev => {
        const detail = prev[zoneId]
        if (!detail) return prev
        return { ...prev, [zoneId]: { ...detail, members: detail.members.filter(m => m.id !== memberId) } }
      })
      setZones(prev => prev.map(z => z.id === zoneId ? { ...z, member_count: Math.max(0, z.member_count - 1) } : z))
    } else {
      alert("删除失败")
    }
  }

  function memberLabel(m: ZoneMember) {
    if (m.member_type === "field") return m.field_name ?? `地块#${m.field_id}`
    return [m.county, m.township, m.admin_code].filter(Boolean).join(" · ")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white"><Sprout className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold">产区管理</h1>
            <p className="text-sm text-muted-foreground">最多 5 个产区，每产区最多 50 个成员</p>
          </div>
          {canEdit && (
            <button
              onClick={() => { setShowCreate(true); setCreateError("") }}
              className="ml-auto flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />新建产区
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        {showCreate && (
          <Card>
            <CardHeader><CardTitle className="text-base">新建产区</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">名称 *</span>
                  <input
                    value={createForm.name}
                    onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="如：湖北中部产区"
                    className="block rounded border px-2 py-1 text-sm w-48"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">类型</span>
                  <select
                    value={createForm.scope_type}
                    onChange={e => setCreateForm({ ...createForm, scope_type: e.target.value })}
                    className="block rounded border px-2 py-1 text-sm"
                  >
                    <option value="fields">地块集合</option>
                    <option value="admin">行政集合</option>
                    <option value="mixed">混合</option>
                  </select>
                </label>
                <label className="space-y-1 flex-1 min-w-48">
                  <span className="text-xs text-muted-foreground">描述</span>
                  <input
                    value={createForm.description}
                    onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                    placeholder="可选"
                    className="block rounded border px-2 py-1 text-sm w-full"
                  />
                </label>
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button onClick={createZone} disabled={creating} className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50">
                  {creating ? "创建中..." : "创建"}
                </button>
                <button onClick={() => { setShowCreate(false); setCreateError("") }} className="rounded bg-muted px-3 py-1 text-sm">取消</button>
              </div>
            </CardContent>
          </Card>
        )}

        {zones.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">暂无产区</div>
        )}

        {zones.map(z => (
          <Card key={z.id}>
            <CardContent className="pt-4">
              {editingId === z.id ? (
                <div className="flex flex-wrap items-end gap-3 mb-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">名称</span>
                    <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="block rounded border px-2 py-1 text-sm w-48" />
                  </label>
                  <label className="space-y-1 flex-1 min-w-48">
                    <span className="text-xs text-muted-foreground">描述</span>
                    <input value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} className="block rounded border px-2 py-1 text-sm w-full" />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(z.id)} disabled={saving} className="rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50">{saving ? "保存中..." : "保存"}</button>
                    <button onClick={() => setEditingId(null)} className="rounded bg-muted px-3 py-1 text-sm">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleExpand(z.id)} className="mt-0.5 text-muted-foreground hover:text-foreground">
                    {expanded[z.id] !== undefined ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/zones/${z.id}`} className="font-medium hover:text-green-700 hover:underline">{z.name}</Link>
                      <Badge className={`text-xs ${SCOPE_COLORS[z.scope_type] ?? ""}`}>{SCOPE_LABELS[z.scope_type] ?? z.scope_type}</Badge>
                      <span className="text-xs text-muted-foreground">{z.member_count} 个成员</span>
                    </div>
                    {z.description && <p className="text-sm text-muted-foreground mt-0.5">{z.description}</p>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setEditingId(z.id); setEditForm({ name: z.name, description: z.description ?? "" }) }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => deleteZone(z.id)}
                        disabled={deletingId === z.id}
                        className="text-xs text-red-600 hover:underline disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  )}
                </div>
              )}

              {loadingDetail[z.id] && <div className="mt-3 text-sm text-muted-foreground pl-7">加载中...</div>}

              {expanded[z.id] !== undefined && !loadingDetail[z.id] && (
                <div className="mt-3 pl-7 space-y-2">
                  {isAdmin && addMemberZoneId !== z.id && (
                    <button
                      onClick={() => { setAddMemberZoneId(z.id); setMemberError("") }}
                      className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                    >
                      <Plus className="h-3 w-3" />添加成员
                    </button>
                  )}

                  {addMemberZoneId === z.id && (
                    <div className="rounded border bg-muted/30 p-3 space-y-2">
                      <div className="flex flex-wrap gap-3">
                        <label className="space-y-1">
                          <span className="text-xs text-muted-foreground">成员类型</span>
                          <select
                            value={memberForm.member_type}
                            onChange={e => setMemberForm({ ...memberForm, member_type: e.target.value })}
                            className="block rounded border px-2 py-1 text-xs"
                          >
                            <option value="field">地块</option>
                            <option value="township">镇/乡</option>
                            <option value="county">县/区</option>
                          </select>
                        </label>
                        {memberForm.member_type === "field" ? (
                          <label className="space-y-1">
                            <span className="text-xs text-muted-foreground">选择地块</span>
                            <select
                              value={memberForm.field_id}
                              onChange={e => setMemberForm({ ...memberForm, field_id: e.target.value })}
                              className="block rounded border px-2 py-1 text-xs w-48"
                            >
                              <option value="">请选择</option>
                              {fields.map(f => (
                                <option key={f.id} value={f.id}>
                                  {f.name}{f.county ? `（${f.county}）` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">行政区划码 *</span>
                              <input value={memberForm.admin_code} onChange={e => setMemberForm({ ...memberForm, admin_code: e.target.value })} placeholder="如 420921" className="block rounded border px-2 py-1 text-xs w-28" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">县/区</span>
                              <input value={memberForm.county} onChange={e => setMemberForm({ ...memberForm, county: e.target.value })} placeholder="如 孝昌县" className="block rounded border px-2 py-1 text-xs w-24" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">镇/乡</span>
                              <input value={memberForm.township} onChange={e => setMemberForm({ ...memberForm, township: e.target.value })} placeholder="如 周巷镇" className="block rounded border px-2 py-1 text-xs w-24" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">纬度</span>
                              <input value={memberForm.latitude} onChange={e => setMemberForm({ ...memberForm, latitude: e.target.value })} placeholder="31.23" className="block rounded border px-2 py-1 text-xs w-20" />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs text-muted-foreground">经度</span>
                              <input value={memberForm.longitude} onChange={e => setMemberForm({ ...memberForm, longitude: e.target.value })} placeholder="113.95" className="block rounded border px-2 py-1 text-xs w-20" />
                            </label>
                          </>
                        )}
                      </div>
                      {memberError && <p className="text-xs text-red-600">{memberError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => addMember(z.id)} disabled={addingMember} className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-50">
                          {addingMember ? "添加中..." : "确认添加"}
                        </button>
                        <button onClick={() => { setAddMemberZoneId(null); setMemberError("") }} className="rounded bg-muted px-2 py-1 text-xs">取消</button>
                      </div>
                    </div>
                  )}

                  {expanded[z.id]?.members.length === 0 && (
                    <p className="text-xs text-muted-foreground">暂无成员</p>
                  )}

                  <div className="space-y-1">
                    {expanded[z.id]?.members.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-xs shrink-0">
                          {m.member_type === "field" ? "地块" : m.member_type === "township" ? "镇/乡" : "县/区"}
                        </Badge>
                        <span className="flex-1">{memberLabel(m)}</span>
                        {m.latitude && m.longitude && (
                          <span className="text-xs text-muted-foreground">{m.latitude.toFixed(3)}, {m.longitude.toFixed(3)}</span>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => removeMember(z.id, m.id)}
                            disabled={removingMemberId === m.id}
                            className="text-red-500 hover:text-red-700 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </main>
    </div>
  )
}
