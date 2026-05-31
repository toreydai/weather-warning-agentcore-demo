/**
 * Step 4 采收日期管理 — 端对端测试
 * 用法: npx tsx scripts/test-step4.ts
 */
import { getStageInfo } from "@/lib/services/advice"

const BASE = process.env.SMOKE_BASE_URL ?? "http://weather-warning-agentcore-alb-54329175.us-east-1.elb.amazonaws.com"
const USERNAME = process.env.SMOKE_USERNAME ?? "admin"
const PASSWORD = process.env.SMOKE_PASSWORD ?? "admin123"

let cookies = ""
let testFieldId: number | null = null

// ─── helpers ─────────────────────────────────────────────────────────────────

function cookiesFromResponse(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  const raw = headers.getSetCookie?.() ?? []
  const fallback = res.headers.get("set-cookie")
  const all = raw.length ? raw : fallback ? [fallback] : []
  return all.map(c => c.split(";")[0]).join("; ")
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: cookies, ...(init.headers ?? {}) },
  })
}

const pass = (name: string, ms: number) => console.log(`  ✅ ${name} (${ms}ms)`)
const fail = (name: string, reason: string) => { console.log(`  ❌ ${name}: ${reason}`); process.exitCode = 1 }

async function step(name: string, fn: () => Promise<void>) {
  const t = Date.now()
  try {
    await fn()
    pass(name, Date.now() - t)
  } catch (e) {
    fail(name, String(e))
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

async function login() {
  const res = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: USERNAME, password: PASSWORD }) })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  cookies = cookiesFromResponse(res)
}

async function createTestField(): Promise<number> {
  const res = await api("/api/fields", {
    method: "POST",
    body: JSON.stringify({
      name: "[TEST-STEP4] 采收测试地块",
      admin_code: "152502",
      county: "锡林浩特市",
      planting_date: "2026-04-01",
    }),
  })
  if (!res.ok) throw new Error(`创建地块失败: ${res.status} ${await res.text()}`)
  const f = await res.json() as { id: number }
  return f.id
}

async function deleteTestField(id: number) {
  await api(`/api/fields/${id}`, { method: "DELETE" })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runUnitTests() {
  console.log("\n── 单元测试: getStageInfo harvestInfo 逻辑 ──")

  await step("无采收信息 → 正常阶段判断", async () => {
    const s = getStageInfo("2026-06-10", "2026-04-01")
    if (s.main === "harvested") throw new Error(`期望非 harvested，got ${s.main}`)
    if (s.dap !== 70) throw new Error(`期望 dap=70，got ${s.dap}`)
  })

  await step("normal: harvest_date 当天 → harvested", async () => {
    const s = getStageInfo("2026-08-01", "2026-04-01", { date: "2026-08-01", type: "normal" })
    if (s.main !== "harvested") throw new Error(`期望 harvested，got ${s.main}`)
    if (s.mainLabel !== "已采收") throw new Error(`期望 已采收，got ${s.mainLabel}`)
  })

  await step("normal: harvest_date 之后 → harvested", async () => {
    const s = getStageInfo("2026-08-15", "2026-04-01", { date: "2026-08-01", type: "normal" })
    if (s.main !== "harvested") throw new Error(`期望 harvested，got ${s.main}`)
  })

  await step("normal: harvest_date 之前 → 正常阶段", async () => {
    const s = getStageInfo("2026-07-31", "2026-04-01", { date: "2026-08-01", type: "normal" })
    if (s.main === "harvested") throw new Error(`期望非 harvested，got ${s.main}`)
  })

  await step("early: harvest_date 到期 → harvested", async () => {
    const s = getStageInfo("2026-07-20", "2026-04-01", { date: "2026-07-20", type: "early" })
    if (s.main !== "harvested") throw new Error(`期望 harvested，got ${s.main}`)
  })

  await step("late: harvest_date 到期 → harvested", async () => {
    const s = getStageInfo("2026-09-01", "2026-04-01", { date: "2026-09-01", type: "late" })
    if (s.main !== "harvested") throw new Error(`期望 harvested，got ${s.main}`)
  })

  await step("harvestInfo 为空对象 → 正常阶段判断", async () => {
    const s = getStageInfo("2026-06-01", "2026-04-01", {})
    if (s.main === "harvested") throw new Error(`空 harvestInfo 不应触发 harvested`)
  })
}

async function runApiTests(fieldId: number) {
  console.log(`\n── API 测试: fieldId=${fieldId} ──`)

  // 场景1: 读取字段包含 harvest_*
  await step("GET /api/fields/:id 返回 harvest 字段", async () => {
    const res = await api(`/api/fields/${fieldId}`)
    if (!res.ok) throw new Error(`${res.status}`)
    const f = await res.json() as Record<string, unknown>
    if (!("harvest_date" in f)) throw new Error("缺少 harvest_date 字段")
    if (!("harvest_type" in f)) throw new Error("缺少 harvest_type 字段")
    if (!("notes" in f)) throw new Error("缺少 notes 字段")
    if (f.harvest_type !== "normal") throw new Error(`harvest_type 默认值应为 normal，got ${f.harvest_type}`)
  })

  // 场景2: 更新 normal 采收日期
  await step("PUT 设置 normal harvest_date", async () => {
    const res = await api(`/api/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify({ harvest_date: "2026-08-20", harvest_type: "normal", notes: "测试备注" }),
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    const f = await res.json() as Record<string, unknown>
    if (f.harvest_date !== "2026-08-20") throw new Error(`harvest_date 未更新，got ${f.harvest_date}`)
    if (f.notes !== "测试备注") throw new Error("notes 未更新")
  })

  // 场景3: harvest_type 无效值 → 400
  await step("PUT 无效 harvest_type → 400", async () => {
    const res = await api(`/api/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify({ harvest_type: "abandoned" }),
    })
    if (res.status !== 400) throw new Error(`期望 400，got ${res.status}`)
  })

  // 场景4: harvest_type=late → 成功
  await step("PUT harvest_type=late → 200", async () => {
    const res = await api(`/api/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify({ harvest_type: "late", harvest_date: "2026-09-05" }),
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    const f = await res.json() as Record<string, unknown>
    if (f.harvest_type !== "late") throw new Error(`harvest_type 应为 late，got ${f.harvest_type}`)
    if (f.harvest_date !== "2026-09-05") throw new Error("harvest_date 未更新")
  })

  // 场景5: 采收后 GET advice 返回系统已采收响应（设置一个过去的采收日期）
  await step("PUT 设置过去的 harvest_date（触发已采收状态）", async () => {
    const res = await api(`/api/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify({ harvest_type: "normal", harvest_date: "2026-05-01", harvest_started_at: null }),
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  })

  const week = "2026-05-12"
  await step(`GET /api/fields/:id/advice?week=${week} 已采收 → 系统响应`, async () => {
    const res = await api(`/api/fields/${fieldId}/advice?week=${week}`)
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    const body = await res.json() as Record<string, unknown>
    if (body.growth_stage !== "已采收") throw new Error(`期望 growth_stage='已采收'，got ${body.growth_stage}`)
    if (body.source !== "system") throw new Error(`期望 source='system'，got ${body.source}`)
  })

  await step(`POST /api/fields/:id/advice?week=${week} 已采收 → 系统响应`, async () => {
    const res = await api(`/api/fields/${fieldId}/advice?week=${week}`, { method: "POST" })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    const body = await res.json() as Record<string, unknown>
    if (body.growth_stage !== "已采收") throw new Error(`期望 growth_stage='已采收'，got ${body.growth_stage}`)
    if (body.source !== "system") throw new Error(`期望 source='system'，got ${body.source}`)
  })

  // 场景6: 采收前的 week 仍正常生成
  const weekBefore = "2026-04-21"
  await step(`GET /api/fields/:id/advice?week=${weekBefore} 采收前 → 正常建议`, async () => {
    const res = await api(`/api/fields/${fieldId}/advice?week=${weekBefore}`)
    if (!res.ok) throw new Error(`${res.status}`)
    const body = await res.json() as Record<string, unknown>
    if (body.source === "system") throw new Error("采收前不应返回 system 响应")
    if (!body.growth_stage || body.growth_stage === "已采收") throw new Error(`期望正常生育期，got ${body.growth_stage}`)
  })

  // 场景7: early 采收日期在过去 → 建议被拦截
  await step("PUT 设置 early harvest_date 在过去 → advice 被拦截", async () => {
    const putRes = await api(`/api/fields/${fieldId}`, {
      method: "PUT",
      body: JSON.stringify({ harvest_type: "early", harvest_date: "2026-05-01" }),
    })
    if (!putRes.ok) throw new Error(`PUT 失败: ${putRes.status}`)
    const advRes = await api(`/api/fields/${fieldId}/advice?week=2026-05-12`)
    if (!advRes.ok) throw new Error(`${advRes.status}`)
    const body = await advRes.json() as Record<string, unknown>
    if (body.source !== "system") throw new Error(`早收后期望 system 响应，got source=${body.source}`)
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Step 4 采收日期管理 — 端对端测试\nBase: ${BASE}\n`)

  // 单元测试（本地，无需网络）
  await runUnitTests()

  // API 测试
  console.log("\n── 登录 ──")
  await step("login", login)
  if (process.exitCode) { console.log("\n登录失败，跳过 API 测试"); process.exit(1) }

  try {
    console.log("\n── 创建测试地块 ──")
    testFieldId = await createTestField()
    console.log(`  → fieldId=${testFieldId}`)

    await runApiTests(testFieldId)
  } finally {
    if (testFieldId) {
      console.log("\n── 清理测试地块 ──")
      await step(`删除 field #${testFieldId}`, () => deleteTestField(testFieldId!))
    }
  }

  const exitCode = process.exitCode ?? 0
  console.log(`\n${"─".repeat(50)}`)
  console.log(exitCode === 0 ? "✅ 全部通过" : "❌ 存在失败项")
  process.exit(exitCode)
}

main().catch(e => { console.error(e); process.exit(1) })
