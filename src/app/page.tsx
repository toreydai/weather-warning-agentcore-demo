import Link from "next/link"
import { ChatPanel } from "@/components/chat-panel"
import { AddFieldForm } from "@/components/add-field-form"
import { getAllFields } from "@/lib/services/weather"
import { getAllZones } from "@/lib/services/zone"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export default async function Home() {
  const [fields, zones] = await Promise.all([getAllFields(), getAllZones()])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">🥔 薯问 · AgentCore</h1>
            <p className="text-gray-500 mt-1">多Agent协作的马铃薯田间管理系统</p>
          </div>
          <div className="flex flex-col gap-1.5 items-end text-sm">
            <div className="flex gap-2">
              <Link href="/admin/dashboard" className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">📊 数据看板</Link>
              <Link href="/admin/thresholds" className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">⚙️ 预警阈值</Link>
              {env.FEATURE_DAILY_ALERT && <Link href="/admin/daily-alerts" className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">🌤️ 每日预警</Link>}
              {env.FEATURE_KB_UPLOAD && <Link href="/admin/knowledge" className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">📚 知识库</Link>}
              <Link href="/admin/zones" className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200">🗺️ 产区管理</Link>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/users" className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">👥 用户管理</Link>
              <Link href="/admin/oauth-clients" className="px-3 py-1.5 bg-violet-100 text-violet-700 rounded hover:bg-violet-200">🔑 API 客户端</Link>
              <Link href="/admin/audit" className="px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200">📋 审计日志</Link>
              <Link href="/api-docs" className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">📄 API 文档</Link>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Supervisor Agent</span>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">气象分析 Agent</span>
          <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">农事建议 Agent</span>
          <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">预警分析 Agent</span>
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Knowledge Base</span>
        </div>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-4">地块列表</h2>
        {fields.length === 0 ? (
          <p className="text-gray-400">暂无地块数据，请先运行 db:init 和 db:fetch</p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {fields.map((f) => {
            const today = new Date().toISOString().slice(0, 10)
            const harvested = Boolean(f.harvest_date && today >= f.harvest_date)
            return (
              <Link key={f.id} href={`/fields/${f.id}`} className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-lg">{f.name}</h3>
                  {harvested && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                      已采收{f.harvest_type === "early" ? "（早收）" : f.harvest_type === "late" ? "（晚收）" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-500 space-y-1">
                  <p>品种: {f.variety ?? "未设置"}</p>
                  <p>播种日期: {f.planting_date ?? "未设置"}</p>
                  {harvested && <p>采收日期: {f.harvest_date}</p>}
                  <p>面积: {f.area_mu ?? "-"} 亩</p>
                  <p>位置: {[f.county, f.township].filter(Boolean).join(" ") || "未设置"}</p>
                  <p>坐标: {f.latitude.toFixed(2)}°N, {f.longitude.toFixed(2)}°E</p>
                </div>
              </Link>
            )
          })}
          <AddFieldForm />
        </div>
      </section>

      {zones.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">产区列表</h2>
            <Link href="/admin/zones" className="text-sm text-indigo-600 hover:underline">管理产区 →</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {zones.map(z => (
              <Link key={z.id} href={`/zones/${z.id}`} className="block p-4 bg-white rounded-lg shadow hover:shadow-md transition-shadow border-l-4 border-indigo-400">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{z.name}</h3>
                  <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded">{z.scope_type}</span>
                </div>
                {z.description && <p className="mt-1 text-sm text-gray-500 line-clamp-1">{z.description}</p>}
                <p className="mt-2 text-sm text-gray-400">{z.member_count} 个成员</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-12 text-center text-xs text-gray-400">
        <p>气象数据来源: Open-Meteo API | AI 模型: GLM 5 (Z.ai) | 知识库: pgvector</p>
      </footer>

      <ChatPanel />
    </div>
  )
}
