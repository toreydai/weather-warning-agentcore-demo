"use client"
import { apiFetch } from "@/lib/api-fetch"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sprout, ArrowLeft, Users, MapPin, AlertTriangle, CloudSun, CheckCircle2, XCircle, Loader2 } from "lucide-react"
import Link from "next/link"

interface DashboardData {
  fields: number; users: number; alerts: number; lastFetch: string | null
  alertsByType: { type: string; severity: string; count: number }[]
  recentAlerts: { date: string; type: string; severity: string; title: string; field_id: number }[]
  alertTrend: { date: string; count: number; red: number; orange: number; yellow: number }[]
}

interface CronRun {
  id: number; name: string; started_at: string; finished_at: string | null
  status: string; error: string | null; items_processed: number | null
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [cron, setCron] = useState<CronRun[] | null>(null)

  useEffect(() => {
    apiFetch("/api/admin/dashboard").then(r => r.json()).then(setData).catch(e => console.error("dashboard fetch failed", e))
  }, [])
  useEffect(() => {
    apiFetch("/api/admin/cron").then(r => r.json()).then(j => setCron(j.runs ?? [])).catch(e => console.error("cron fetch failed", e))
  }, [])

  if (!data) return <div className="min-h-screen flex items-center justify-center">加载中...</div>

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white"><Sprout className="h-6 w-6" /></div>
          <h1 className="text-xl font-bold">数据看板</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100"><MapPin className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">地块总数</p><p className="text-2xl font-bold">{data.fields}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-xs text-muted-foreground">预警总数</p><p className="text-2xl font-bold">{data.alerts}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100"><Users className="h-5 w-5 text-blue-600" /></div>
            <div><p className="text-xs text-muted-foreground">用户数</p><p className="text-2xl font-bold">{data.users}</p></div>
          </CardContent></Card>
          <Card><CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-100"><CloudSun className="h-5 w-5 text-cyan-600" /></div>
            <div><p className="text-xs text-muted-foreground">最新数据</p><p className="text-sm font-bold">{data.lastFetch ?? "N/A"}</p></div>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">数据管道（最近 7 次 / 每任务）</CardTitle></CardHeader>
          <CardContent>
            {cron === null ? (
              <p className="text-sm text-muted-foreground">加载中...</p>
            ) : cron.length === 0 ? (
              <p className="text-sm text-muted-foreground">暂无记录</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(cron.reduce<Record<string, CronRun[]>>((acc, r) => { (acc[r.name] ??= []).push(r); return acc }, {})).map(([name, runs]) => (
                  <div key={name} className="space-y-1">
                    <div className="text-sm font-medium">{name}</div>
                    <div className="flex gap-1 flex-wrap">
                      {runs.map(r => {
                        const icon = r.status === "success" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : r.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                        const dur = r.finished_at ? Math.round((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000) : null
                        const title = `${new Date(r.started_at).toLocaleString()}${dur !== null ? ` · ${dur}s` : ""}${r.items_processed !== null ? ` · ${r.items_processed} items` : ""}${r.error ? ` · ${r.error}` : ""}`
                        return (
                          <div key={r.id} title={title} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                            {icon}
                            <span className="text-muted-foreground">{new Date(r.started_at).toLocaleDateString([], { month: "numeric", day: "numeric" })}</span>
                            {r.items_processed !== null && <span>· {r.items_processed}</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">预警分布</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.alertsByType.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span>{a.type}</span>
                    <Badge className={a.severity === "red" ? "bg-red-500" : a.severity === "orange" ? "bg-orange-500" : "bg-yellow-500"}>{a.severity} × {a.count}</Badge>
                  </div>
                ))}
                {!data.alertsByType.length && <p className="text-sm text-muted-foreground">暂无预警</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">最近预警</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.recentAlerts.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">{a.date}</span>
                    <span className="truncate mx-2">{a.title}</span>
                    <Badge className={a.severity === "red" ? "bg-red-500" : a.severity === "orange" ? "bg-orange-500" : "bg-yellow-500"} variant="secondary">{a.severity}</Badge>
                  </div>
                ))}
                {!data.recentAlerts.length && <p className="text-sm text-muted-foreground">暂无预警</p>}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
