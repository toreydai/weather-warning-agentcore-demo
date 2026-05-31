"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Check, Send } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DailyAlert {
  id: number
  county_name: string
  county_code: string
  date: string
  stage: string | null
  focus: string | null
  status: string
  draft_content: string
  final_content: string | null
}

export default function DailyAlertEditorPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [alert, setAlert] = useState<DailyAlert | null>(null)
  const [content, setContent] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/admin/daily-alerts/${params.id}`).then(async res => {
      if (!res.ok) {
        setError(res.status === 404 ? "预警不存在或功能未开启" : "加载失败")
        return
      }
      const data = await res.json() as DailyAlert
      setAlert(data)
      setContent(data.final_content ?? data.draft_content)
    })
  }, [params.id])

  async function save(status: "draft" | "reviewed" = "reviewed") {
    setLoading(true)
    const res = await fetch(`/api/admin/daily-alerts/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ final_content: content, status }),
    })
    setLoading(false)
    if (res.ok) setAlert(await res.json())
    else setError("保存失败")
  }

  async function publish() {
    setLoading(true)
    await save("reviewed")
    const res = await fetch(`/api/admin/daily-alerts/${params.id}/publish`, { method: "POST" })
    setLoading(false)
    if (res.ok) {
      setAlert(await res.json())
      router.refresh()
    } else {
      setError("发布失败")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center gap-3">
          <Link href="/admin/daily-alerts" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <h1 className="text-xl font-bold">{alert ? `${alert.county_name} 每日预警审核` : "每日预警审核"}</h1>
            {alert && <p className="text-sm text-muted-foreground">{alert.date} · {alert.stage ?? "-"} · {alert.focus ?? "-"}</p>}
          </div>
          {alert && <Badge className={`ml-auto ${alert.status === "published" ? "bg-green-600" : alert.status === "reviewed" ? "bg-blue-600" : "bg-gray-500"}`}>{alert.status}</Badge>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {error ? <Card><CardContent className="py-4 text-sm text-red-600">{error}</CardContent></Card> : null}
        {alert ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">预警内容（Markdown）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea value={content} onChange={e => setContent(e.target.value)} className="min-h-[520px] w-full rounded-md border bg-background px-3 py-2 font-mono text-sm" />
              <div className="flex gap-2">
                <button onClick={() => save("reviewed")} disabled={loading} className="flex items-center gap-1 rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
                  <Check className="h-4 w-4" />保存为审核稿
                </button>
                <button onClick={publish} disabled={loading} className="flex items-center gap-1 rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50">
                  <Send className="h-4 w-4" />发布
                </button>
              </div>
            </CardContent>
          </Card>
        ) : !error ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">加载中...</CardContent></Card>
        ) : null}
      </main>
    </div>
  )
}

