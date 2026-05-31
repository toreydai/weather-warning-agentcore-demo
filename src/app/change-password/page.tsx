"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Sprout } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    const res = await fetch("/api/auth/change-password", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: newPwd }),
    })
    setLoading(false)
    if (!res.ok) { const d = await res.json(); setError(d.error); return }
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-green-600 text-white mb-2">
            <Sprout className="h-7 w-7" />
          </div>
          <CardTitle>修改密码</CardTitle>
          <p className="text-sm text-muted-foreground">首次登录请修改密码</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">当前密码</label>
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="text-sm font-medium">新密码（至少6位）</label>
              <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" required minLength={6} />
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button type="submit" disabled={loading} className="w-full rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
              {loading ? "提交中..." : "确认修改"}
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
