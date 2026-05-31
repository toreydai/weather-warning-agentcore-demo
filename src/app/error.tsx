"use client"

import { useEffect } from "react"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
      <p className="text-lg font-medium">页面出现错误，请刷新重试</p>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">
        重试
      </button>
    </div>
  )
}
