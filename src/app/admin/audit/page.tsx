"use client"

import { useState, useEffect } from "react"
import { Sprout, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface AuditEntry { id: number; username: string; action: string; target_type: string | null; target_id: number | null; detail: string | null; ip: string | null; created_at: string }

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)

  useEffect(() => {
    fetch(`/api/admin/audit?page=${page}`).then(r => r.json()).then(d => { setLogs(d.rows); setPages(d.pages) })
  }, [page])

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white"><Sprout className="h-6 w-6" /></div>
          <h1 className="text-xl font-bold">操作审计日志</h1>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground text-xs">
              <th className="py-2 px-2">时间</th><th className="py-2 px-2">用户</th><th className="py-2 px-2">操作</th><th className="py-2 px-2">目标</th><th className="py-2 px-2">详情</th>
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b">
                  <td className="py-1.5 px-2 text-xs text-muted-foreground whitespace-nowrap">{l.created_at?.slice(0, 19)}</td>
                  <td className="py-1.5 px-2 font-medium">{l.username}</td>
                  <td className="py-1.5 px-2">{l.action}</td>
                  <td className="py-1.5 px-2 text-muted-foreground">{l.target_type ? `${l.target_type}#${l.target_id}` : "-"}</td>
                  <td className="py-1.5 px-2 text-xs text-muted-foreground max-w-xs truncate">{l.detail ?? "-"}</td>
                </tr>
              ))}
              {!logs.length && <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">暂无记录</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="rounded border px-3 py-1 text-sm disabled:opacity-30">上一页</button>
            <span className="text-sm text-muted-foreground py-1">{page} / {pages}</span>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="rounded border px-3 py-1 text-sm disabled:opacity-30">下一页</button>
          </div>
        )}
      </main>
    </div>
  )
}
