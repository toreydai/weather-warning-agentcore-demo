"use client"
import { apiFetch } from "@/lib/api-fetch"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CloudSun, Plus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DailyAlert {
  id: number
  county_name: string
  date: string
  stage: string | null
  focus: string | null
  status: string
  needs_review: boolean
  reviewed_by: string | null
  published_at: string | null
}

export default function DailyAlertsPage() {
  const [alerts, setAlerts] = useState<DailyAlert[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function load() {
    setError("")
    const res = await apiFetch("/api/admin/daily-alerts")
    if (!res.ok) {
      setError(res.status === 404 ? "每日县级预警功能未开启" : "加载失败")
      return
    }
    setAlerts(await res.json())
  }

  async function generate() {
    setLoading(true)
    setError("")
    const res = await apiFetch("/api/admin/daily-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
    setLoading(false)
    if (!res.ok) {
      setError("生成失败")
      return
    }
    await load()
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600 text-white"><CloudSun className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold">每日县级农事预警</h1>
            <p className="text-sm text-muted-foreground">生成、审核并发布每日县级指导预警</p>
          </div>
          <button onClick={generate} disabled={loading} className="ml-auto flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-1.5 text-sm text-white hover:bg-cyan-700 disabled:opacity-50">
            <Plus className="h-4 w-4" />{loading ? "生成中..." : "生成今日草稿"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-3">
        {error && <Card><CardContent className="py-4 text-sm text-red-600">{error}</CardContent></Card>}
        {alerts.length === 0 && !error ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">暂无每日预警草稿，点击右上角生成。</CardContent></Card>
        ) : alerts.map(alert => (
          <Link key={alert.id} href={`/admin/daily-alerts/${alert.id}`} className="block">
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold">{alert.county_name}</h2>
                    <Badge className={alert.status === "published" ? "bg-green-600" : alert.status === "reviewed" ? "bg-blue-600" : "bg-gray-500"}>{alert.status}</Badge>
                    {alert.needs_review && <Badge className="bg-yellow-500">有新地块，建议复核</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{alert.date} · {alert.stage ?? "未识别阶段"} · 关注：{alert.focus ?? "-"}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  {alert.published_at ? `已发布 ${alert.published_at.slice(0, 16)}` : alert.reviewed_by ? `已审核 by ${alert.reviewed_by}` : "待审核"}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </main>
    </div>
  )
}

