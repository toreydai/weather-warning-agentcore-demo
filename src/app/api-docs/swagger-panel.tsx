"use client"

import { useEffect } from "react"

export function SwaggerPanel({ specUrl }: { specUrl: string }) {
  useEffect(() => {
    const link = document.createElement("link")
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    document.head.appendChild(link)

    const script = document.createElement("script")
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).SwaggerUIBundle({
        url: specUrl,
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).SwaggerUIBundle.presets.apis,
        ],
      })
    }
    document.body.appendChild(script)

    return () => {
      try { document.head.removeChild(link) } catch { /* already removed */ }
      try { document.body.removeChild(script) } catch { /* already removed */ }
    }
  }, [specUrl])

  return <div id="swagger-ui" className="min-h-screen" />
}
