"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Plus } from "lucide-react"
import { provinces, getCities, getCounties, getAreasByProvince, getCountyCoords, getTownships } from "@/lib/data/china-divisions"
import corpsData from "@/lib/data/xinjiang-corps.json"

const XPCC_PROVINCE = { code: "XPCC-00", name: "新疆生产建设兵团", province: "XPCC" }
const allProvinces = [...provinces, XPCC_PROVINCE]

const DEFAULT_PROVINCE = allProvinces.find(p => p.name === "内蒙古自治区") ?? allProvinces[0]
const DEFAULT_CITIES = getCities(DEFAULT_PROVINCE.province)
const DEFAULT_CITY = DEFAULT_CITIES[0]
const DEFAULT_COUNTIES = DEFAULT_CITY ? getCounties(DEFAULT_PROVINCE.province, DEFAULT_CITY.city) : []
const DEFAULT_COUNTY = DEFAULT_COUNTIES.find(c => c.code === "152502") ?? DEFAULT_COUNTIES[0]

function getXpccDivisions() {
  return corpsData.divisions.map(d => ({ code: d.code, name: d.name, city: d.code.split("-")[1] }))
}

function getXpccRegiments(divisionCode: string) {
  return corpsData.divisions.find(d => d.code === divisionCode)?.regiments ?? []
}

function getXpccCoords(divisionCode: string): { latitude: number; longitude: number } | null {
  const d = corpsData.divisions.find(d => d.code === divisionCode)
  return d ? { latitude: d.latitude, longitude: d.longitude } : null
}

export function AddFieldForm() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [provincePrefix, setProvincePrefix] = useState(DEFAULT_PROVINCE.province)
  const [provinceName, setProvinceName] = useState(DEFAULT_PROVINCE.name)
  const [cityPrefix, setCityPrefix] = useState(DEFAULT_CITY?.city ?? "")
  const [cityName, setCityName] = useState(DEFAULT_CITY?.name ?? "")
  const [countyCode, setCountyCode] = useState(DEFAULT_COUNTY?.code ?? "")
  const [countyName, setCountyName] = useState(DEFAULT_COUNTY?.name ?? "")
  const [townshipName, setTownshipName] = useState("")
  const [coordinates, setCoordinates] = useState(
    getCountyCoords(DEFAULT_COUNTY?.code ?? "") ?? { latitude: 43.9334, longitude: 116.0861 }
  )

  const router = useRouter()

  const isXpcc = provincePrefix === "XPCC"

  // City / county options
  const cities = isXpcc ? getXpccDivisions() : getCities(provincePrefix)
  const hasNoCityLayer = !isXpcc && cities.length === 0
  const counties = isXpcc
    ? getXpccRegiments(cityPrefix).map(r => ({ code: r.code, name: r.name }))
    : hasNoCityLayer
      ? getAreasByProvince(provincePrefix)
      : getCounties(provincePrefix, cityPrefix)

  // Township options (only for standard areas, not XPCC)
  const townships = isXpcc ? [] : getTownships(countyCode)

  function selectProvince(code: string) {
    const p = allProvinces.find(p => p.province === code)
    if (!p) return
    setProvincePrefix(p.province)
    setProvinceName(p.name)
    setTownshipName("")

    if (p.province === "XPCC") {
      const divs = getXpccDivisions()
      const firstDiv = divs[0]
      if (firstDiv) {
        setCityPrefix(firstDiv.code)
        setCityName(firstDiv.name)
        const regs = getXpccRegiments(firstDiv.code)
        const firstReg = regs[0]
        setCountyCode(firstReg?.code ?? "")
        setCountyName(firstReg?.name ?? "")
        const coords = getXpccCoords(firstDiv.code)
        if (coords) setCoordinates(coords)
      }
      return
    }

    const nextCities = getCities(p.province)
    if (nextCities.length > 0) {
      const nextCity = nextCities[0]
      setCityPrefix(nextCity.city)
      setCityName(nextCity.name)
      const nextCounties = getCounties(p.province, nextCity.city)
      const nextCounty = nextCounties[0]
      setCountyCode(nextCounty?.code ?? "")
      setCountyName(nextCounty?.name ?? "")
      const coords = nextCounty ? getCountyCoords(nextCounty.code) : null
      if (coords) setCoordinates(coords)
    } else {
      setCityPrefix("")
      setCityName("")
      const nextCounties = getAreasByProvince(p.province)
      const nextCounty = nextCounties[0]
      setCountyCode(nextCounty?.code ?? "")
      setCountyName(nextCounty?.name ?? "")
      const coords = nextCounty ? getCountyCoords(nextCounty.code) : null
      if (coords) setCoordinates(coords)
    }
  }

  function selectCity(cityCode: string) {
    setTownshipName("")
    if (isXpcc) {
      const div = corpsData.divisions.find(d => d.code === cityCode)
      if (!div) return
      setCityPrefix(div.code)
      setCityName(div.name)
      const firstReg = div.regiments[0]
      setCountyCode(firstReg?.code ?? "")
      setCountyName(firstReg?.name ?? "")
      setCoordinates({ latitude: div.latitude, longitude: div.longitude })
      return
    }
    const c = cities.find(c => c.city === cityCode)
    if (!c) return
    setCityPrefix(c.city)
    setCityName(c.name)
    const nextCounties = getCounties(provincePrefix, c.city)
    const nextCounty = nextCounties[0]
    setCountyCode(nextCounty?.code ?? "")
    setCountyName(nextCounty?.name ?? "")
    const coords = nextCounty ? getCountyCoords(nextCounty.code) : null
    if (coords) setCoordinates(coords)
  }

  function selectCounty(code: string) {
    setTownshipName("")
    const c = counties.find(c => c.code === code)
    if (!c) return
    setCountyCode(c.code)
    setCountyName(c.name)
    if (!isXpcc) {
      const coords = getCountyCoords(c.code)
      if (coords) setCoordinates(coords)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const fd = new FormData(e.currentTarget)
    const str = (k: string): string | null => {
      const v = fd.get(k)
      if (typeof v !== "string") return null
      const t = v.trim()
      return t === "" ? null : t
    }
    const num = (k: string): number | null => {
      const v = str(k)
      if (v === null) return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const body = {
      name: str("name"),
      latitude: num("latitude"),
      longitude: num("longitude"),
      area_mu: num("area_mu"),
      variety: str("variety"),
      planting_date: str("planting_date"),
      province: provinceName || null,
      city: cityName || null,
      county: countyName || null,
      township: townshipName || str("township_manual") || null,
      admin_code: countyCode || null,
      address: str("address"),
    }
    const res = await fetch("/api/fields", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    setLoading(false)
    if (!res.ok) {
      if (res.status === 401) {
        setError("请先登录后再添加地块")
        return
      }
      const fieldLabel: Record<string, string> = {
        name: "地块名称", latitude: "纬度", longitude: "经度", area_mu: "面积",
        variety: "品种", planting_date: "播种日期", province: "省份", city: "城市",
        county: "县/旗", township: "乡镇", admin_code: "行政区划代码", address: "详细地址",
      }
      try {
        const data = await res.json()
        if (data && typeof data.error === "object" && data.error !== null) {
          const entries = Object.entries(data.error as Record<string, string[]>)
          if (entries.length > 0) {
            const [k, msgs] = entries[0]
            setError(`${fieldLabel[k] ?? k}：${Array.isArray(msgs) ? msgs[0] : String(msgs)}`)
            return
          }
        }
        if (typeof data?.error === "string") { setError(data.error); return }
      } catch { /* ignore */ }
      setError("保存失败，请检查输入后重试")
      return
    }
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <Card className="transition-shadow hover:shadow-lg cursor-pointer border-dashed h-full flex items-center justify-center min-h-[160px]" onClick={() => setOpen(true)}>
        <CardContent className="flex flex-col items-center gap-2 text-muted-foreground">
          <Plus className="h-8 w-8" />
          <span className="text-sm">添加新地块</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <input name="name" placeholder="地块名称 *" required className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={provincePrefix}
              onChange={e => selectProvince(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm bg-background"
            >
              {allProvinces.map(p => <option key={p.code} value={p.province}>{p.name}</option>)}
            </select>
            {hasNoCityLayer ? (
              <select disabled className="rounded-md border px-3 py-1.5 text-sm bg-muted text-muted-foreground">
                <option>（直辖市）</option>
              </select>
            ) : (
              <select
                value={cityPrefix}
                onChange={e => selectCity(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm bg-background"
              >
                {cities.map(c => <option key={c.code} value={isXpcc ? c.code : c.city}>{c.name}</option>)}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={countyCode}
              onChange={e => selectCounty(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-sm bg-background"
            >
              {counties.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
            {townships.length > 0 ? (
              <select
                value={townshipName}
                onChange={e => setTownshipName(e.target.value)}
                className="rounded-md border px-3 py-1.5 text-sm bg-background"
              >
                <option value="">乡镇/街道（可选）</option>
                {townships.map(t => <option key={t.town} value={t.name}>{t.name}</option>)}
              </select>
            ) : (
              <input name="township_manual" placeholder="乡镇/街道（可选）" className="rounded-md border px-3 py-1.5 text-sm bg-background" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="latitude"
              type="number"
              step="0.0001"
              placeholder="纬度 *"
              required
              value={coordinates.latitude}
              onChange={e => setCoordinates({ ...coordinates, latitude: Number(e.target.value) })}
              className="rounded-md border px-3 py-1.5 text-sm bg-background"
            />
            <input
              name="longitude"
              type="number"
              step="0.0001"
              placeholder="经度 *"
              required
              value={coordinates.longitude}
              onChange={e => setCoordinates({ ...coordinates, longitude: Number(e.target.value) })}
              className="rounded-md border px-3 py-1.5 text-sm bg-background"
            />
          </div>
          <input name="address" placeholder="详细地址（可选）" className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
          <input name="area_mu" type="number" step="any" placeholder="面积(亩)" className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
          <input name="variety" placeholder="品种" className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
          <input name="planting_date" type="date" placeholder="播种日期" className="w-full rounded-md border px-3 py-1.5 text-sm bg-background" />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? "保存中..." : "保存"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-4 py-1.5 text-sm hover:bg-muted">取消</button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
