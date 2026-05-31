"use client"
import "leaflet/dist/leaflet.css"
import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, CircleMarker, Tooltip, GeoJSON } from "react-leaflet"
import * as turf from "@turf/turf"
import type { Feature, Polygon, MultiPolygon, Geometry } from "geojson"

interface Member {
  admin_code: string | null; township: string | null; county: string | null
  field_name: string | null; member_type: string
  latitude: number | null; longitude: number | null
  precipitation: number | null; temp_max: number | null; temp_min: number | null
}

function memberLabel(m: Member) {
  if (m.member_type === "field") return m.field_name ?? "地块"
  return m.township ?? m.county ?? m.admin_code ?? "–"
}

function precipColor(p: number | null): string {
  if (p == null || p < 0.1) return "#94a3b8"
  if (p < 10) return "#60a5fa"
  if (p < 25) return "#3b82f6"
  if (p < 50) return "#1d4ed8"
  return "#dc2626"
}

// 尝试从 /boundaries/{name}.json 加载静态 GeoJSON，否则返回小 buffer 圆
async function loadBoundary(name: string, lon: number, lat: number): Promise<Feature<Geometry>> {
  try {
    const res = await fetch(`/boundaries/${encodeURIComponent(name)}.json`, { cache: "force-cache" })
    if (res.ok) {
      const geom = await res.json()
      if (geom?.type === "Polygon" || geom?.type === "MultiPolygon") {
        return { type: "Feature", properties: { name, source: "osm" }, geometry: geom }
      }
    }
  } catch { /* ignore */ }
  // 退回：8km buffer 圆
  return turf.buffer(turf.point([lon, lat]), 8, { units: "kilometers" }) as Feature<Polygon>
}

const BUFFER_KM = 20

export default function ZoneScatterChart({ members }: { members: Member[] }) {
  const data = useMemo(() => members
    .filter(m => m.latitude != null && m.longitude != null)
    .map(m => ({
      name: memberLabel(m),
      lat: m.latitude!,
      lon: m.longitude!,
      precip: m.precipitation,
      temp_max: m.temp_max,
      temp_min: m.temp_min,
    })), [members])

  const [memberBoundaries, setMemberBoundaries] = useState<Feature<Geometry>[]>([])
  const [boundaryReady, setBoundaryReady] = useState(false)

  useEffect(() => {
    if (!data.length) return
    let cancelled = false
    Promise.all(data.map(d => loadBoundary(d.name, d.lon, d.lat))).then(results => {
      if (cancelled) return
      setMemberBoundaries(results)
      setBoundaryReady(true)
    })
    return () => { cancelled = true }
  }, [data])

  // buffer union 作为加载中的占位
  const bufferUnion = useMemo(() => {
    if (!data.length) return null
    type U = Feature<Polygon | MultiPolygon> | null
    const bufs = data.map(d =>
      turf.buffer(turf.point([d.lon, d.lat]), BUFFER_KM, { units: "kilometers" }) as Feature<Polygon>
    )
    return bufs.reduce<U>((acc, b) => acc ? (turf.union(turf.featureCollection([acc, b])) ?? acc) : b, null)
  }, [data])

  if (!data.length) return (
    <div style={{ height: 320 }} className="flex items-center justify-center text-sm text-gray-400">
      暂无坐标数据
    </div>
  )

  const maxPrecip = Math.max(...data.map(d => d.precip ?? 0), 1)
  const centerLat = (Math.min(...data.map(d => d.lat)) + Math.max(...data.map(d => d.lat))) / 2
  const centerLon = (Math.min(...data.map(d => d.lon)) + Math.max(...data.map(d => d.lon))) / 2
  const tk = process.env.NEXT_PUBLIC_TIANDITU_KEY

  return (
    <MapContainer
      center={[centerLat, centerLon]}
      zoom={9}
      style={{ height: 320, borderRadius: 8 }}
      scrollWheelZoom={false}
    >
      <TileLayer
        url={`https://t{s}.tianditu.gov.cn/DataServer?T=vec_w&X={x}&Y={y}&L={z}&tk=${tk}`}
        subdomains={["0","1","2","3","4","5","6","7"]}
        attribution='&copy; <a href="https://www.tianditu.gov.cn">天地图</a>'
        maxZoom={18}
      />
      <TileLayer
        url={`https://t{s}.tianditu.gov.cn/DataServer?T=cva_w&X={x}&Y={y}&L={z}&tk=${tk}`}
        subdomains={["0","1","2","3","4","5","6","7"]}
        maxZoom={18}
      />

      {/* 加载中显示 buffer union 占位 */}
      {!boundaryReady && bufferUnion && (
        <GeoJSON
          key="placeholder"
          data={bufferUnion as GeoJSON.Feature}
          style={() => ({ color: "#6366f1", fillColor: "#6366f1", fillOpacity: 0.08, weight: 1, dashArray: "5,3" })}
        />
      )}

      {/* 各镇独立边界（真实轮廓 or 8km 圆） */}
      {boundaryReady && memberBoundaries.map((f, i) => {
        const isReal = f.properties?.source === "osm"
        return (
          <GeoJSON
            key={`${data[i]?.name}-${i}`}
            data={f as GeoJSON.Feature}
            style={() => ({
              color: "#6366f1",
              fillColor: "#6366f1",
              fillOpacity: isReal ? 0.12 : 0.06,
              weight: isReal ? 1.5 : 1,
              dashArray: isReal ? undefined : "4,4",
            })}
          />
        )
      })}

      {data.map((d, i) => {
        const color = precipColor(d.precip)
        const radius = d.precip && d.precip >= 0.1
          ? Math.max(10, Math.min(26, 10 + (d.precip / maxPrecip) * 16))
          : 10
        return (
          <CircleMarker
            key={i}
            center={[d.lat, d.lon]}
            radius={radius}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1.5 }}
          >
            <Tooltip permanent direction="top" offset={[0, -radius]}>
              <span style={{ fontSize: 11, fontWeight: 500, color: "#1f2937" }}>
                {d.name}
                {d.precip != null && (
                  <span style={{ color, marginLeft: 4 }}>{d.precip} mm</span>
                )}
              </span>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
