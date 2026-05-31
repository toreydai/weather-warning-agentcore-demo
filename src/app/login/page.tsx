"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(""); setLoading(true)
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) })
    if (res.ok) { router.push("/"); router.refresh() }
    else setError("用户名或密码错误")
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🥔</div>
          <h1 className="text-xl font-bold">薯问 · 登录</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="用户名" className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:outline-none" />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="密码" className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-green-500 focus:outline-none" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  )
}
