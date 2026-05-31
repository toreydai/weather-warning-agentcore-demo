"use client"
import { apiFetch } from "@/lib/api-fetch"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Database, RefreshCw, Trash2, Upload } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface KnowledgeDocument {
  key: string
  size: number
  lastModified: string | null
  document?: {
    filename: string
    uploaded_by: string
    uploaded_at: string | null
    last_ingestion_job_id: string | null
  }
}

export default function KnowledgePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function load() {
    setError("")
    const res = await apiFetch("/api/admin/knowledge")
    if (!res.ok) {
      setError(res.status === 404 ? "知识库上传功能未开启" : "加载失败")
      return
    }
    setDocs(await res.json())
  }

  async function upload() {
    if (!file) {
      setError("请先选择 .md / .txt / .pdf 文件")
      fileInputRef.current?.click()
      return
    }
    setLoading(true)
    setError("")
    setMessage("")
    const fd = new FormData()
    fd.append("file", file)
    const res = await apiFetch("/api/admin/knowledge", { method: "POST", body: fd })
    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "上传失败")
      return
    }
    const body = await res.json()
    setMessage(`上传成功，ingestion job: ${body.ingestionJobId ?? "未触发"}`)
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    await load()
  }

  async function remove(key: string) {
    if (!confirm(`确认删除 ${key}？`)) return
    setLoading(true)
    const res = await apiFetch(`/api/admin/knowledge/${encodeURIComponent(key)}`, { method: "DELETE" })
    setLoading(false)
    if (!res.ok) {
      setError("删除失败")
      return
    }
    await load()
  }

  async function sync() {
    setLoading(true)
    setError("")
    setMessage("")
    const res = await apiFetch("/api/admin/knowledge/sync", { method: "POST" })
    setLoading(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? "同步失败")
      return
    }
    const body = await res.json()
    setMessage(`已触发同步，ingestion job: ${body.ingestionJobId}`)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-white"><Database className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold">知识库文档</h1>
            <p className="text-sm text-muted-foreground">上传 .md / .txt / .pdf 到 Bedrock Knowledge Base 数据源</p>
          </div>
          <button onClick={sync} disabled={loading} className="ml-auto flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50">
            <RefreshCw className="h-4 w-4" />手动同步
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-4">
        <Card>
          <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf"
              onChange={e => {
                const selected = e.target.files?.[0] ?? null
                setFile(selected)
                setError("")
                setMessage("")
              }}
              className="hidden"
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading} className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
              选择文件
            </button>
            <div className="min-w-0 flex-1 text-sm text-muted-foreground">
              {file ? (
                <span className="block truncate">{file.name} · {Math.ceil(file.size / 1024)} KB</span>
              ) : (
                <span>支持 .md / .txt / .pdf，单文件不超过 10MB</span>
              )}
            </div>
            <button type="button" onClick={upload} disabled={loading} className="flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50">
              <Upload className="h-4 w-4" />{loading ? "处理中..." : "上传并同步"}
            </button>
          </CardContent>
        </Card>

        {error && <Card><CardContent className="py-4 text-sm text-red-600">{error}</CardContent></Card>}
        {message && <Card><CardContent className="py-4 text-sm text-green-700">{message}</CardContent></Card>}

        <div className="space-y-3">
          {docs.length === 0 && !error ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">暂无上传文档</CardContent></Card>
          ) : docs.map(doc => (
            <Card key={doc.key}>
              <CardContent className="py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{doc.document?.filename ?? doc.key.split("/").pop()}</p>
                    <Badge variant="secondary">{Math.ceil(doc.size / 1024)} KB</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground break-all">{doc.key}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    上传人：{doc.document?.uploaded_by ?? "-"} · 更新时间：{doc.lastModified?.slice(0, 16) ?? "-"}
                  </p>
                </div>
                <button onClick={() => remove(doc.key)} disabled={loading} className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">
                  <Trash2 className="h-4 w-4" />删除
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  )
}
