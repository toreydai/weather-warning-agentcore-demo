"use client"
import { apiFetch } from "@/lib/api-fetch"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sprout, ArrowLeft, Plus, RotateCcw } from "lucide-react"
import Link from "next/link"

interface User { id: number; username: string; role: string; is_active: boolean; must_change_password: boolean; last_login_at: string | null; created_at: string }

const ROLES = ["farmer", "agronomist", "reviewer", "admin"]

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "farmer" })
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPwd, setResetPwd] = useState("")

  useEffect(() => { apiFetch("/api/admin/users").then(r => r.json()).then(setUsers) }, [])

  async function addUser() {
    const res = await apiFetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newUser) })
    if (res.ok) { const u = await res.json(); setUsers(prev => [...prev, u]); setShowAdd(false); setNewUser({ username: "", password: "", role: "farmer" }) }
    else { const e = await res.json(); alert(e.error) }
  }

  async function toggleActive(u: User) {
    const res = await apiFetch(`/api/admin/users/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !u.is_active }) })
    if (res.ok) { const updated = await res.json(); setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x)) }
  }

  async function changeRole(u: User, role: string) {
    const res = await apiFetch(`/api/admin/users/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) })
    if (res.ok) { const updated = await res.json(); setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ...updated } : x)) }
  }

  async function doReset(id: number) {
    if (!resetPwd || resetPwd.length < 6) { alert("密码至少6位"); return }
    const res = await apiFetch(`/api/admin/users/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: resetPwd }) })
    if (res.ok) { setResetId(null); setResetPwd(""); alert("密码已重置，用户下次登录需修改密码") }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-4xl px-4 py-5 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white"><Sprout className="h-6 w-6" /></div>
          <div>
            <h1 className="text-xl font-bold">用户管理</h1>
            <p className="text-sm text-muted-foreground">管理系统用户和角色</p>
          </div>
          <button onClick={() => setShowAdd(true)} className="ml-auto flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
            <Plus className="h-4 w-4" />新增用户
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        {showAdd && (
          <Card>
            <CardContent className="pt-4 flex flex-wrap items-end gap-3">
              <label className="space-y-1"><span className="text-xs">用户名</span><input value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} className="block rounded border px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="text-xs">密码</span><input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} className="block rounded border px-2 py-1 text-sm" /></label>
              <label className="space-y-1"><span className="text-xs">角色</span>
                <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} className="block rounded border px-2 py-1 text-sm">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <button onClick={addUser} className="rounded bg-green-600 px-3 py-1 text-sm text-white">创建</button>
              <button onClick={() => setShowAdd(false)} className="rounded bg-muted px-3 py-1 text-sm">取消</button>
            </CardContent>
          </Card>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-muted-foreground">
              <th className="py-2 px-3">用户名</th><th className="py-2 px-3">角色</th><th className="py-2 px-3">状态</th><th className="py-2 px-3">最后登录</th><th className="py-2 px-3">操作</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b">
                  <td className="py-2 px-3 font-medium">{u.username}</td>
                  <td className="py-2 px-3">
                    <select value={u.role} onChange={e => changeRole(u, e.target.value)} className="rounded border px-1 py-0.5 text-xs">
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-3">
                    <Badge className={u.is_active ? "bg-green-500" : "bg-gray-400"}>{u.is_active ? "启用" : "禁用"}</Badge>
                  </td>
                  <td className="py-2 px-3 text-muted-foreground text-xs">{u.last_login_at?.slice(0, 16) ?? "从未"}</td>
                  <td className="py-2 px-3 flex gap-2">
                    <button onClick={() => toggleActive(u)} className="text-xs text-blue-600 hover:underline">{u.is_active ? "禁用" : "启用"}</button>
                    {resetId === u.id ? (
                      <span className="flex items-center gap-1">
                        <input type="password" placeholder="新密码" value={resetPwd} onChange={e => setResetPwd(e.target.value)} className="w-24 rounded border px-1 py-0.5 text-xs" />
                        <button onClick={() => doReset(u.id)} className="text-xs text-green-600">确认</button>
                        <button onClick={() => setResetId(null)} className="text-xs text-gray-500">取消</button>
                      </span>
                    ) : (
                      <button onClick={() => { setResetId(u.id); setResetPwd("") }} className="flex items-center gap-0.5 text-xs text-orange-600 hover:underline"><RotateCcw className="h-3 w-3" />重置密码</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
