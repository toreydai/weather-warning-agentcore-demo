"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import { Bot, LogOut, RotateCcw, Send, Square, Trash2, X } from "lucide-react"

interface Message { role: "user" | "assistant"; content: string }

function storageKey(fieldId?: number) {
  return `chat_${fieldId ?? "global"}`
}

function sessionKey(fieldId?: number) {
  return `chat_session_${fieldId ?? "global"}`
}

function references(content: string): string[] {
  const refs: string[] = []
  if (/地块|播种|品种|面积/.test(content)) refs.push("地块")
  if (/实况|预报|天气|气温|温度|降水|风速/.test(content)) refs.push("天气")
  if (/知识库|病虫害|晚疫|早疫|蚜虫|农药|防治/.test(content)) refs.push("知识库")
  if (/阈值|预警|风险|霜冻|暴雨|大风|高温/.test(content)) refs.push("预警")
  return refs
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="rounded bg-black/5 px-1 py-0.5 text-[0.92em]">{part.slice(1, -1)}</code>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.split("\n")
  return (
    <div className="space-y-1 leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim()
        if (!trimmed) return <div key={i} className="h-2" />
        if (trimmed.startsWith("### ")) return <div key={i} className="pt-1 text-sm font-semibold"><InlineMarkdown text={trimmed.slice(4)} /></div>
        if (trimmed.startsWith("## ")) return <div key={i} className="pt-1 text-sm font-semibold"><InlineMarkdown text={trimmed.slice(3)} /></div>
        if (/^[-*]\s+/.test(trimmed)) return <div key={i} className="pl-3 before:mr-2 before:content-['-']"><InlineMarkdown text={trimmed.replace(/^[-*]\s+/, "")} /></div>
        if (/^\d+\.\s+/.test(trimmed)) return <div key={i}><InlineMarkdown text={trimmed} /></div>
        return <div key={i}><InlineMarkdown text={line} /></div>
      })}
    </div>
  )
}

export function ChatPanel({ fieldId }: { fieldId?: number }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>()
  const [needLogin, setNeedLogin] = useState(false)
  const [loginUser, setLoginUser] = useState("")
  const [loginPass, setLoginPass] = useState("")
  const [loginError, setLoginError] = useState("")
  const [restoreState, setRestoreState] = useState<"idle" | "loading" | "done">("idle")
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages, loading])

  useEffect(() => {
    const key = storageKey(fieldId)
    const saved = sessionStorage.getItem(key)
    const savedSession = localStorage.getItem(sessionKey(fieldId)) ?? undefined
    if (saved) {
      try {
        const { messages: m, sessionId: s } = JSON.parse(saved)
        if (Array.isArray(m) && m.length) setMessages(m)
        setSessionId(s ?? savedSession)
      } catch {
        setSessionId(savedSession)
      }
    } else {
      setSessionId(savedSession)
    }
  }, [fieldId])

  useEffect(() => {
    if (!sessionId || restoreState !== "idle") return
    setRestoreState("loading")
    fetch(`/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages?.length) {
          setMessages(data.messages)
          sessionStorage.setItem(storageKey(fieldId), JSON.stringify({ messages: data.messages, sessionId }))
        }
      })
      .catch(() => {})
      .finally(() => setRestoreState("done"))
  }, [fieldId, restoreState, sessionId])

  useEffect(() => {
    if (messages.length) sessionStorage.setItem(storageKey(fieldId), JSON.stringify({ messages, sessionId }))
    if (sessionId) localStorage.setItem(sessionKey(fieldId), sessionId)
  }, [messages, sessionId, fieldId])

  async function login() {
    setLoginError("")
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: loginUser, password: loginPass }) })
    if (res.ok) { setNeedLogin(false); setLoginUser(""); setLoginPass(""); setLoginError(""); setRestoreState("idle") }
    else setLoginError("用户名或密码错误")
  }

  const clearChat = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setSessionId(undefined)
    setRestoreState("done")
    sessionStorage.removeItem(storageKey(fieldId))
    localStorage.removeItem(sessionKey(fieldId))
  }, [fieldId])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }, [])

  const send = useCallback(async (override?: string) => {
    const msg = (override ?? input).trim()
    if (!msg || loading) return
    if (!override) setInput("")
    setMessages(prev => [...prev, { role: "user", content: msg }, { role: "assistant", content: "" }])
    setLoading(true)

    const controller = new AbortController()
    abortRef.current = controller
    const timeout = setTimeout(() => controller.abort(), 120000)
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, fieldId, sessionId }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.status === 401) {
        setNeedLogin(true)
        setMessages(prev => prev.slice(0, -1))
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "请求失败" }))
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: "assistant", content: data.error ?? "请求失败" }
          return updated
        })
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantMsg = ""

      if (reader) {
        let buffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.text) {
                assistantMsg += data.text
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: "assistant", content: assistantMsg }
                  return updated
                })
              }
              if (data.sessionId) setSessionId(data.sessionId)
              if (data.error) {
                setMessages(prev => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: "assistant", content: data.error }
                  return updated
                })
              }
            } catch { /* skip malformed event */ }
          }
        }
      }
    } catch (e) {
      const errMsg = e instanceof DOMException && e.name === "AbortError" ? "已停止生成" : "连接失败，请重试"
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: "assistant", content: errMsg }
        return updated
      })
    } finally {
      clearTimeout(timeout)
      abortRef.current = null
      setLoading(false)
    }
  }, [fieldId, input, loading, sessionId])

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find(m => m.role === "user")?.content
    if (lastUser) send(lastUser)
  }, [messages, send])

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700" title="智能助手">
        <Bot size={24} />
      </button>
    )
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 flex h-[100dvh] w-full flex-col border bg-white shadow-2xl sm:bottom-6 sm:right-6 sm:h-[560px] sm:w-[420px] sm:rounded-lg">
      <div className="flex items-center justify-between bg-green-700 px-4 py-3 text-white sm:rounded-t-lg">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><Bot size={17} />薯问智能助手</div>
          <div className="mt-0.5 text-xs text-green-100">{fieldId ? `当前地块 #${fieldId}` : "全局问答"} · {sessionId ? "已连接历史" : "新会话"}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={retryLast} disabled={loading || !messages.some(m => m.role === "user")} className="rounded p-1.5 hover:bg-green-800 disabled:opacity-40" title="重试上一问"><RotateCcw size={16} /></button>
          <button onClick={clearChat} className="rounded p-1.5 hover:bg-green-800" title="清空对话"><Trash2 size={16} /></button>
          <button onClick={async () => { await fetch("/api/auth/login", { method: "DELETE" }); setNeedLogin(true); clearChat() }} className="rounded p-1.5 hover:bg-green-800" title="退出登录"><LogOut size={16} /></button>
          <button onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-green-800" title="关闭"><X size={16} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !needLogin && (
          <div className="mt-8 space-y-2 text-center text-sm text-gray-500">
            <p>可以问天气、预警、农事建议和病虫害防治。</p>
            <button onClick={() => send("这周综合分析一下")} className="rounded border px-3 py-1.5 text-green-700 hover:bg-green-50">这周综合分析一下</button>
          </div>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => {
            const refs = m.role === "assistant" ? references(m.content) : []
            return (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[84%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                  {m.content ? <MarkdownMessage content={m.content} /> : <span className="animate-pulse text-gray-500">正在分析中...</span>}
                  {refs.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-gray-200 pt-2">
                      {refs.map(ref => <span key={ref} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-gray-500">{ref}</span>)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div ref={bottomRef} />
      </div>

      {needLogin ? (
        <div className="space-y-2 border-t p-3">
          <p className="text-sm text-gray-600">请先登录：</p>
          <input value={loginUser} onChange={e => setLoginUser(e.target.value)} placeholder="用户名" className="w-full rounded border px-3 py-1.5 text-sm" />
          <input value={loginPass} onChange={e => setLoginPass(e.target.value)} type="password" placeholder="密码"
            className="w-full rounded border px-3 py-1.5 text-sm" onKeyDown={e => e.key === "Enter" && login()} />
          {loginError && <p className="text-xs text-red-500">{loginError}</p>}
          <button onClick={login} className="w-full rounded bg-green-600 py-1.5 text-sm text-white hover:bg-green-700">登录</button>
        </div>
      ) : (
        <div className="flex gap-2 border-t p-3">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()}
            placeholder="输入问题..." className="min-w-0 flex-1 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" disabled={loading} />
          {loading ? (
            <button onClick={stop} className="flex h-10 w-10 items-center justify-center rounded bg-gray-700 text-white hover:bg-gray-800" title="停止生成"><Square size={16} /></button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()} className="flex h-10 w-10 items-center justify-center rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50" title="发送"><Send size={16} /></button>
          )}
        </div>
      )}
    </div>
  )
}
