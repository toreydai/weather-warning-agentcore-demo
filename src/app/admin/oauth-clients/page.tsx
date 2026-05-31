"use client"
import { apiFetch } from "@/lib/api-fetch"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, Copy, Check, KeyRound } from "lucide-react"
import Link from "next/link"

interface OAuthClient {
  id: number; client_id: string; name: string; scopes: string
  field_ids: string | null; zone_ids: string | null
  rate_limit: number; is_active: boolean; revoked_at: string | null; created_at: string
}

interface CallLog {
  id: number; client_id: string; endpoint: string; method: string
  status_code: number | null; latency_ms: number | null; created_at: string
}

function StatusBadge({ client }: { client: OAuthClient }) {
  if (client.revoked_at) return <Badge className="bg-red-100 text-red-700 border-0">已撤销</Badge>
  if (client.is_active) return <Badge className="bg-green-100 text-green-700 border-0">活跃</Badge>
  return <Badge className="bg-gray-100 text-gray-600 border-0">停用</Badge>
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="ml-1 p-0.5 rounded hover:bg-gray-200" title="复制">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
    </button>
  )
}

export default function OAuthClientsPage() {
  const [clients, setClients] = useState<OAuthClient[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newSecret, setNewSecret] = useState<{ client_id: string; secret: string; name: string } | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [logs, setLogs] = useState<Record<number, CallLog[]>>({})
  const [form, setForm] = useState({ name: "", scopes: "read", rate_limit: "60", field_ids: "", zone_ids: "" })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const r = await apiFetch("/api/admin/oauth-clients")
    if (r.ok) setClients(await r.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function create() {
    setSaving(true); setErr("")
    const fieldIds = form.field_ids.trim() ? form.field_ids.split(",").map(s => Number(s.trim())).filter(Boolean) : null
    const zoneIds = form.zone_ids.trim() ? form.zone_ids.split(",").map(s => Number(s.trim())).filter(Boolean) : null
    const scopes = form.scopes.split(",").map(s => s.trim()).filter(Boolean)
    const r = await apiFetch("/api/admin/oauth-clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, scopes, rate_limit: Number(form.rate_limit), field_ids: fieldIds, zone_ids: zoneIds }),
    })
    const data = await r.json()
    if (!r.ok) { setErr(data.error ?? "创建失败"); setSaving(false); return }
    setNewSecret({ client_id: data.client_id, secret: data.client_secret, name: data.name })
    setShowCreate(false)
    setForm({ name: "", scopes: "read", rate_limit: "60", field_ids: "", zone_ids: "" })
    await load()
    setSaving(false)
  }

  async function revoke(client: OAuthClient) {
    if (!confirm(`确定撤销「${client.name}」？所有活跃 token 将立即失效，且不可恢复。`)) return
    await apiFetch(`/api/admin/oauth-clients/${client.id}`, { method: "DELETE" })
    await load()
  }

  async function loadLogs(id: number) {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (logs[id]) return
    const r = await apiFetch(`/api/admin/oauth-clients/${id}/logs?limit=50`)
    if (r.ok) { const d = await r.json(); setLogs(prev => ({ ...prev, [id]: d.logs })) }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold">OAuth 客户端管理</h1>
            <p className="text-xs text-muted-foreground">管理 Public API 接入凭证</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" /> 新建客户端
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 space-y-4">
        {/* 一次性密钥展示 */}
        {newSecret && (
          <div className="rounded-lg border border-yellow-400 bg-yellow-50 p-4">
            <p className="text-sm font-semibold text-yellow-800 mb-2">⚠️ 客户端 Secret 仅显示一次，请立即保存</p>
            <div className="space-y-1.5 font-mono text-xs bg-white rounded p-3 border">
              <div className="flex items-center gap-1">
                <span className="text-gray-500 w-28">client_id</span>
                <span className="font-medium">{newSecret.client_id}</span>
                <CopyButton text={newSecret.client_id} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-500 w-28">client_secret</span>
                <span className="font-medium">{newSecret.secret}</span>
                <CopyButton text={newSecret.secret} />
              </div>
            </div>
            <button onClick={() => setNewSecret(null)} className="mt-2 text-xs text-yellow-700 underline">我已保存，关闭</button>
          </div>
        )}

        {/* 创建表单 */}
        {showCreate && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">新建 OAuth 客户端</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">名称 *</label>
                  <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" placeholder="如：外部数据平台"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Scopes（逗号分隔）</label>
                  <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" placeholder="read"
                    value={form.scopes} onChange={e => setForm(f => ({ ...f, scopes: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">限速（次/分钟）</label>
                  <input type="number" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" min={1} max={1000}
                    value={form.rate_limit} onChange={e => setForm(f => ({ ...f, rate_limit: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">允许 field_ids（逗号分隔，空=全部）</label>
                  <input className="mt-1 w-full rounded border px-2 py-1.5 text-sm" placeholder="1,2,3"
                    value={form.field_ids} onChange={e => setForm(f => ({ ...f, field_ids: e.target.value }))} />
                </div>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2">
                <button onClick={create} disabled={saving || !form.name.trim()}
                  className="rounded bg-violet-600 px-3 py-1.5 text-sm text-white hover:bg-violet-700 disabled:opacity-50">
                  {saving ? "创建中…" : "创建"}
                </button>
                <button onClick={() => { setShowCreate(false); setErr("") }}
                  className="rounded border px-3 py-1.5 text-sm hover:bg-muted">取消</button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 客户端列表 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">客户端列表（{clients.length}）</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">加载中…</p> : clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无客户端，点击右上角「新建」</p>
            ) : (
              <div className="space-y-2">
                {clients.map(c => (
                  <div key={c.id} className="rounded-lg border">
                    <div className="flex items-center gap-3 p-3">
                      <button onClick={() => loadLogs(c.id)} className="text-muted-foreground hover:text-foreground">
                        {expandedId === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{c.name}</span>
                          <StatusBadge client={c} />
                          <span className="text-xs text-muted-foreground font-mono">{c.client_id}</span>
                        </div>
                        <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                          <span>scopes: {JSON.parse(c.scopes).join(", ")}</span>
                          <span>限速: {c.rate_limit}/min</span>
                          {c.field_ids && <span>fields: {JSON.parse(c.field_ids).join(", ")}</span>}
                          <span>创建: {new Date(c.created_at).toLocaleDateString("zh-CN")}</span>
                        </div>
                      </div>
                      {!c.revoked_at && (
                        <button onClick={() => revoke(c)} title="撤销"
                          className="rounded p-1.5 text-red-500 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    {/* 调用日志展开区 */}
                    {expandedId === c.id && (
                      <div className="border-t bg-muted/30 px-3 py-2">
                        <p className="text-xs font-medium text-muted-foreground mb-2">最近 50 条调用记录</p>
                        {!logs[c.id] ? <p className="text-xs text-muted-foreground">加载中…</p>
                          : logs[c.id].length === 0 ? <p className="text-xs text-muted-foreground">暂无调用记录</p>
                          : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead><tr className="text-left text-muted-foreground border-b">
                                  <th className="py-1 pr-3">时间</th>
                                  <th className="py-1 pr-3">端点</th>
                                  <th className="py-1 pr-3">状态</th>
                                  <th className="py-1">耗时</th>
                                </tr></thead>
                                <tbody>
                                  {logs[c.id].map(l => (
                                    <tr key={l.id} className="border-b last:border-0">
                                      <td className="py-1 pr-3 text-muted-foreground whitespace-nowrap">
                                        {new Date(l.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                      </td>
                                      <td className="py-1 pr-3 font-mono">{l.endpoint.replace("/api/v1/public/", "")}</td>
                                      <td className="py-1 pr-3">
                                        <span className={`px-1 rounded ${(l.status_code ?? 0) < 300 ? "bg-green-100 text-green-700" : (l.status_code ?? 0) < 500 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                                          {l.status_code ?? "–"}
                                        </span>
                                      </td>
                                      <td className="py-1">{l.latency_ms != null ? `${l.latency_ms}ms` : "–"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
