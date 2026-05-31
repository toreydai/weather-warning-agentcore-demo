import { notFound } from "next/navigation"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export default function KnowledgeLayout({ children }: { children: React.ReactNode }) {
  if (!env.FEATURE_KB_UPLOAD) notFound()
  return <>{children}</>
}
