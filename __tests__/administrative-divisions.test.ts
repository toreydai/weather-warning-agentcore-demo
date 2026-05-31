import { describe, expect, it } from "vitest"
import { findCountyDivision, resolveCountyCoordinates } from "@/lib/data/administrative-divisions"
import { getCities, getCounties, getAreasByProvince } from "@/lib/data/china-divisions"

describe("administrative division coordinates", () => {
  it("resolves county coordinates by admin code", () => {
    expect(resolveCountyCoordinates({ code: "152502" })).toEqual({
      latitude: 43.9334,
      longitude: 116.0861,
    })
  })

  it("resolves county coordinates by name", () => {
    expect(resolveCountyCoordinates({ name: "正蓝旗" })).toEqual({
      latitude: 42.2459,
      longitude: 116.0033,
    })
  })

  it("keeps every county coordinate inside the local operating region", () => {
    const counties = ["152502", "152522", "152523", "152524", "152525", "152526", "152527", "152528", "152529", "152530", "152531"]
      .map(code => findCountyDivision({ code }))
    expect(counties).toHaveLength(11)
    for (const county of counties) {
      expect(county).toBeDefined()
      expect(county!.latitude).toBeGreaterThan(41)
      expect(county!.latitude).toBeLessThan(46)
      expect(county!.longitude).toBeGreaterThan(112)
      expect(county!.longitude).toBeLessThan(118)
    }
  })

  it("returns fallback coordinates for counties outside the hardcoded set", () => {
    // 武汉市洪山区 (420111) – precise coords not in countyCoords, falls back to 湖北省会
    const result = resolveCountyCoordinates({ code: "420111" })
    expect(result).toBeDefined()
    expect(result!.latitude).toBeGreaterThan(0)
    expect(result!.longitude).toBeGreaterThan(100)
  })
})

describe("china-divisions completeness sampling (1 city per province)", () => {
  const samples: Array<{ province: string; cityName: string; expectedCityPrefix: string }> = [
    { province: "13", cityName: "石家庄市", expectedCityPrefix: "01" },       // 河北
    { province: "14", cityName: "太原市", expectedCityPrefix: "01" },         // 山西
    { province: "15", cityName: "呼和浩特市", expectedCityPrefix: "01" },     // 内蒙古
    { province: "21", cityName: "沈阳市", expectedCityPrefix: "01" },         // 辽宁
    { province: "22", cityName: "长春市", expectedCityPrefix: "01" },         // 吉林
    { province: "23", cityName: "哈尔滨市", expectedCityPrefix: "01" },       // 黑龙江
    { province: "32", cityName: "南京市", expectedCityPrefix: "01" },         // 江苏
    { province: "33", cityName: "杭州市", expectedCityPrefix: "01" },         // 浙江
    { province: "34", cityName: "合肥市", expectedCityPrefix: "01" },         // 安徽
    { province: "35", cityName: "福州市", expectedCityPrefix: "01" },         // 福建
    { province: "36", cityName: "南昌市", expectedCityPrefix: "01" },         // 江西
    { province: "37", cityName: "济南市", expectedCityPrefix: "01" },         // 山东
    { province: "41", cityName: "郑州市", expectedCityPrefix: "01" },         // 河南
    { province: "42", cityName: "武汉市", expectedCityPrefix: "01" },         // 湖北
    { province: "43", cityName: "长沙市", expectedCityPrefix: "01" },         // 湖南
    { province: "44", cityName: "广州市", expectedCityPrefix: "01" },         // 广东
    { province: "45", cityName: "南宁市", expectedCityPrefix: "01" },         // 广西
    { province: "46", cityName: "海口市", expectedCityPrefix: "01" },         // 海南
    { province: "51", cityName: "成都市", expectedCityPrefix: "01" },         // 四川
    { province: "52", cityName: "贵阳市", expectedCityPrefix: "01" },         // 贵州
    { province: "53", cityName: "昆明市", expectedCityPrefix: "01" },         // 云南
    { province: "54", cityName: "拉萨市", expectedCityPrefix: "01" },         // 西藏
    { province: "61", cityName: "西安市", expectedCityPrefix: "01" },         // 陕西
    { province: "62", cityName: "兰州市", expectedCityPrefix: "01" },         // 甘肃
    { province: "63", cityName: "西宁市", expectedCityPrefix: "01" },         // 青海
    { province: "64", cityName: "银川市", expectedCityPrefix: "01" },         // 宁夏
    { province: "65", cityName: "乌鲁木齐市", expectedCityPrefix: "01" },     // 新疆
  ]

  for (const { province, cityName } of samples) {
    it(`province ${province} has city "${cityName}"`, () => {
      const cities = getCities(province)
      expect(cities.length).toBeGreaterThan(0)
      const found = cities.find(c => c.name === cityName)
      expect(found).toBeDefined()
    })
  }

  it("each sampled city has at least one county", () => {
    for (const { province, expectedCityPrefix } of samples) {
      const counties = getCounties(province, expectedCityPrefix)
      expect(counties.length, `province ${province} city 01 has no counties`).toBeGreaterThan(0)
    }
  })

  // Direct-controlled municipalities have no city layer but do have counties
  for (const [province, name] of [["11", "北京"], ["12", "天津"], ["31", "上海"], ["50", "重庆"]]) {
    it(`${name} has counties without a city layer`, () => {
      const cities = getCities(province)
      expect(cities.length).toBe(0)
      const areas = getAreasByProvince(province)
      expect(areas.length).toBeGreaterThan(0)
    })
  }
})
