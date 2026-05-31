import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = { title: "薯问 · AgentCore", description: "多Agent协作的马铃薯田间管理系统" }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 text-gray-900 min-h-screen">{children}</body>
    </html>
  )
}
