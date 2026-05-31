import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileText } from "lucide-react"
import { SwaggerPanel } from "./swagger-panel"

export const dynamic = "force-dynamic"

export default async function ApiDocsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "admin") redirect("/")

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-4 py-3 flex items-center gap-3">
        <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
          <FileText className="h-4 w-4" />
        </div>
        <div>
          <h1 className="font-semibold text-sm">Public API 文档</h1>
          <p className="text-xs text-muted-foreground">Weather Warning AgentCore · OpenAPI 3.1</p>
        </div>
      </header>
      <SwaggerPanel specUrl="/openapi.yaml" />
    </div>
  )
}
