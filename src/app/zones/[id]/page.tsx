"use client"
import { apiFetch } from "@/lib/api-fetch"
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Sprout, RefreshCw, CloudRain, Thermometer, Wind, AlertTriangle } from "lucide-react"
import Link from "next/link"
import dynamic from "next/dynamic"

const ZoneScatterChart = dynamic(() => import("@/components/charts/zone-scatter"), { ssr: false })
const ZoneForecastChart = dynamic(() => import("@/components/charts/zone-forecast"), { ssr: false })

interface MemberWeather {
  id: number; member_type: string; field_id: number | null
  admin_code: string | null; township: string | null; county: string | null
  field_name: string | null; latitude: number | null; longitude: number | null
  temp_max: number | null; temp_min: number | null; precipitation: number | null
  wind_speed_max: number | null; humidity: number | null; weather_code: number | null
  has_data: boolean
}

interface Forecast7d { date: string; max_precip: number | null; avg_precip: number | null; member_count: number }

interface ZoneWeather {
  date: string; zone_id: number; zone_name: string; scope_type: string
  members: MemberWeather[]
  aggregate: { temp_max: number | null; temp_min: number | null; precip_max: number | null; precip_mean: number | null; wind_max: number | null }
  forecast_7d: Forecast7d[]
}

interface ZoneAlertItem {
  id: number; alert_type: string; category: string; severity: string
  title: string; description: string | null
  affected_members: string | null; max_value: number | null; coverage_pct: number | null
  date: string
}

function precipLevel(mm: number | null): { label: string; color: string; bg: string } {
  if (mm == null) return { label: "暂无", color: "#9ca3af", bg: "bg-gray-100" }
  if (mm < 0.1) return { label: "无雨", color: "#9ca3af", bg: "bg-gray-100" }
  if (mm < 10) return { label: "小雨", color: "#60a5fa", bg: "bg-blue-100" }
  if (mm < 25) return { label: "中雨", color: "#3b82f6", bg: "bg-blue-200" }
  if (mm < 50) return { label: "大雨", color: "#1d4ed8", bg: "bg-blue-300" }
  return { label: "暴雨", color: "#dc2626", bg: "bg-red-200" }
}

function memberLabel(m: MemberWeather) {
  if (m.member_type === "field") return m.field_name ?? `地块#${m.field_id}`
  return m.township ?? m.county ?? m.admin_code ?? "–"
}

export default function ZoneDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [zoneId, setZoneId] = useState<string>("")
  const [data, setData] = useState<ZoneWeather | null>(null)
  const [alerts, setAlerts] = useState<ZoneAlertItem[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()))
  const [error, setError] = useState("")

  useEffect(() => { params.then(p => setZoneId(p.id)) }, [params])

  const load = useCallback(async (d: string) => {
    if (!zoneId) return
    setLoading(true); setError("")
    const [weatherRes, alertRes] = await Promise.all([
      apiFetch(`/api/zones/${zoneId}/weather?date=${d}`),
      apiFetch(`/api/zones/${zoneId}/alerts?from=${d}&to=${d}`),
    ])
    if (weatherRes.ok) { setData(await weatherRes.json()) }
    else { const e = await weatherRes.json(); setError(e.error ?? "加载失败") }
    if (alertRes.ok) { const a = await alertRes.json(); setAlerts(a.alerts ?? []) }
    setLoading(false)
  }, [zoneId])

  useEffect(() => { if (zoneId) load(date) }, [zoneId, date, load])

  const withData = data?.members.filter(m => m.has_data && m.latitude && m.longitude) ?? []
  const sorted = [...withData].sort((a, b) => (b.precipitation ?? 0) - (a.precipitation ?? 0))

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-3">
          <Link href="/" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-600 text-white">
            <Sprout className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{data?.zone_name ?? "产区详情"}</h1>
            <p className="text-xs text-muted-foreground">{data?.members.length ?? 0} 个成员</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="rounded border px-2 py-1 text-sm" />
            <button onClick={() => load(date)} disabled={loading}
              className="rounded border p-1.5 hover:bg-muted disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {error && <div className="mx-auto max-w-6xl px-4 py-3 text-sm text-red-600">{error}</div>}

      <main className="mx-auto max-w-6xl px-4 py-5 space-y-5">
        {/* 预警卡片 */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map(a => {
              const colors = a.severity === "red"
                ? "border-red-400 bg-red-50 text-red-800"
                : a.severity === "orange"
                ? "border-orange-400 bg-orange-50 text-orange-800"
                : "border-yellow-400 bg-yellow-50 text-yellow-800"
              const badge = a.severity === "red" ? "bg-red-500 text-white"
                : a.severity === "orange" ? "bg-orange-500 text-white"
                : "bg-yellow-400 text-yellow-900"
              return (
                <div key={a.id} className={`flex items-start gap-3 rounded-lg border-l-4 p-3 ${colors}`}>
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{a.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${badge}`}>
                        {a.severity === "red" ? "红色" : a.severity === "orange" ? "橙色" : "黄色"}
                      </span>
                      <span className="text-xs opacity-70">{a.category === "intensity" ? "强度型" : "覆盖型"}</span>
                    </div>
                    {a.description && <p className="text-xs mt-0.5 opacity-80">{a.description}</p>}
                    {a.max_value != null && (
                      <p className="text-xs mt-0.5 opacity-70">
                        最大值 {a.max_value.toFixed(1)}{a.alert_type.includes("rain") || a.alert_type === "rain_coverage" ? " mm" : a.alert_type === "strong_wind" ? " m/s" : "°C"}
                        {a.coverage_pct != null && `，${Math.round(a.coverage_pct * 100)}% 成员受影响`}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 汇总卡片 */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-orange-500 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">气温范围</p>
                  <p className="text-sm font-semibold">
                    {data.aggregate.temp_min != null ? `${data.aggregate.temp_min}°` : "–"} ~ {data.aggregate.temp_max != null ? `${data.aggregate.temp_max}°C` : "–"}
                  </p>
                </div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <CloudRain className="h-4 w-4 text-blue-500 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">降水（最大/均值）</p>
                  <p className="text-sm font-semibold">
                    {data.aggregate.precip_max != null ? `${data.aggregate.precip_max}` : "–"} / {data.aggregate.precip_mean != null ? `${data.aggregate.precip_mean} mm` : "–"}
                  </p>
                </div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2">
                <Wind className="h-4 w-4 text-cyan-500 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">最大风速</p>
                  <p className="text-sm font-semibold">{data.aggregate.wind_max != null ? `${data.aggregate.wind_max} km/h` : "–"}</p>
                </div>
              </div>
            </CardContent></Card>
            <Card><CardContent className="pt-3 pb-3">
              <div>
                <p className="text-xs text-muted-foreground">有数据成员</p>
                <p className="text-sm font-semibold">{withData.length} / {data.members.length}</p>
              </div>
            </CardContent></Card>
          </div>
        )}

        {/* 散点地图 + 排名表 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">成员分布与降水（{date}）</CardTitle></CardHeader>
            <CardContent>
              {loading
                ? <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">加载中...</div>
                : withData.length === 0
                  ? <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">暂无位置数据</div>
                  : <ZoneScatterChart members={withData} />
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">降水排名</CardTitle></CardHeader>
            <CardContent>
              {sorted.length === 0
                ? <p className="text-xs text-muted-foreground">暂无数据</p>
                : <div className="space-y-2">
                    {sorted.map((m, i) => {
                      const lvl = precipLevel(m.precipitation)
                      return (
                        <div key={m.id} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                          <span className="text-sm flex-1 truncate">{memberLabel(m)}</span>
                          <Badge className={`text-xs shrink-0 ${lvl.bg} border-0`} style={{ color: lvl.color }}>
                            {m.precipitation != null ? `${m.precipitation} mm` : "–"}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
              }
            </CardContent>
          </Card>
        </div>

        {/* 7 天预报柱状图 */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">未来 7 天最大降水预报</CardTitle></CardHeader>
          <CardContent>
            {data
              ? <ZoneForecastChart forecast={data.forecast_7d} />
              : <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">加载中...</div>
            }
          </CardContent>
        </Card>

        {/* 成员明细表 */}
        {data && data.members.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">成员气象明细</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 px-2">成员</th>
                    <th className="py-2 px-2">类型</th>
                    <th className="py-2 px-2 text-right">最高温</th>
                    <th className="py-2 px-2 text-right">最低温</th>
                    <th className="py-2 px-2 text-right">降水</th>
                    <th className="py-2 px-2 text-right">风速</th>
                    <th className="py-2 px-2 text-right">湿度</th>
                    <th className="py-2 px-2">等级</th>
                  </tr></thead>
                  <tbody>
                    {data.members.map(m => {
                      const lvl = precipLevel(m.precipitation)
                      return (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="py-2 px-2 font-medium">{memberLabel(m)}</td>
                          <td className="py-2 px-2 text-muted-foreground text-xs">
                            {m.member_type === "field" ? "地块" : m.member_type === "township" ? "镇/乡" : "县/区"}
                          </td>
                          <td className="py-2 px-2 text-right">{m.temp_max != null ? `${m.temp_max}°C` : "–"}</td>
                          <td className="py-2 px-2 text-right">{m.temp_min != null ? `${m.temp_min}°C` : "–"}</td>
                          <td className="py-2 px-2 text-right">{m.precipitation != null ? `${m.precipitation} mm` : "–"}</td>
                          <td className="py-2 px-2 text-right">{m.wind_speed_max != null ? `${m.wind_speed_max} km/h` : "–"}</td>
                          <td className="py-2 px-2 text-right">{m.humidity != null ? `${m.humidity}%` : "–"}</td>
                          <td className="py-2 px-2">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${lvl.bg}`} style={{ color: lvl.color }}>
                              {lvl.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
