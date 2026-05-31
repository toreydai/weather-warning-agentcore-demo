import { describe, it, expect } from "vitest"
import { createFieldSchema, updateFieldSchema, updateThresholdSchema } from "@/lib/validators"

describe("createFieldSchema", () => {
  it("accepts a minimal valid payload", () => {
    const r = createFieldSchema.safeParse({ name: "田A", latitude: 43.95, longitude: 116.07 })
    expect(r.success).toBe(true)
  })

  it("accepts county-only coordinates for server-side county centroid fallback", () => {
    const r = createFieldSchema.safeParse({ name: "田A", county: "锡林浩特市", admin_code: "152502" })
    expect(r.success).toBe(true)
  })

  it("accepts a full payload", () => {
    const r = createFieldSchema.safeParse({
      name: "田B",
      latitude: 43.95,
      longitude: 116.07,
      area_mu: 120,
      variety: "荷兰15号",
      planting_date: "2026-04-25",
      region: "xilinhaote",
    })
    expect(r.success).toBe(true)
  })

  it("rejects empty name", () => {
    const r = createFieldSchema.safeParse({ name: "", latitude: 43, longitude: 116 })
    expect(r.success).toBe(false)
  })

  it("rejects out-of-range latitude", () => {
    expect(createFieldSchema.safeParse({ name: "x", latitude: 91, longitude: 0 }).success).toBe(false)
    expect(createFieldSchema.safeParse({ name: "x", latitude: -91, longitude: 0 }).success).toBe(false)
  })

  it("rejects out-of-range longitude", () => {
    expect(createFieldSchema.safeParse({ name: "x", latitude: 0, longitude: 181 }).success).toBe(false)
    expect(createFieldSchema.safeParse({ name: "x", latitude: 0, longitude: -181 }).success).toBe(false)
  })

  it("rejects a single coordinate without its pair", () => {
    expect(createFieldSchema.safeParse({ name: "x", county: "锡林浩特市", latitude: 43.9 }).success).toBe(false)
    expect(createFieldSchema.safeParse({ name: "x", county: "锡林浩特市", longitude: 116.1 }).success).toBe(false)
  })

  it("rejects negative area_mu", () => {
    const r = createFieldSchema.safeParse({ name: "x", latitude: 0, longitude: 0, area_mu: -1 })
    expect(r.success).toBe(false)
  })

  it("rejects malformed planting_date", () => {
    const r = createFieldSchema.safeParse({ name: "x", latitude: 0, longitude: 0, planting_date: "2026/04/25" })
    expect(r.success).toBe(false)
  })

  it("accepts null area_mu / variety / planting_date", () => {
    const r = createFieldSchema.safeParse({ name: "x", latitude: 0, longitude: 0, area_mu: null, variety: null, planting_date: null })
    expect(r.success).toBe(true)
  })
})

describe("updateFieldSchema", () => {
  it("accepts partial input", () => {
    expect(updateFieldSchema.safeParse({}).success).toBe(true)
    expect(updateFieldSchema.safeParse({ name: "new" }).success).toBe(true)
  })

  it("still rejects invalid latitude when provided", () => {
    expect(updateFieldSchema.safeParse({ latitude: 100 }).success).toBe(false)
  })
})

describe("updateThresholdSchema", () => {
  it("accepts valid JSON strings", () => {
    const r = updateThresholdSchema.safeParse({
      id: 1,
      yellow_condition: '{"temp_min_lte":2}',
      orange_condition: '{"temp_min_lte":0}',
      red_condition: '{"temp_min_lte":-3}',
    })
    expect(r.success).toBe(true)
  })

  it("rejects invalid JSON in any level", () => {
    const r = updateThresholdSchema.safeParse({
      id: 1,
      yellow_condition: "{not json",
      orange_condition: "{}",
      red_condition: "{}",
    })
    expect(r.success).toBe(false)
  })
})
