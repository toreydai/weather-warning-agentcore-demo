import { Pool } from "pg"
import { SignJWT } from "jose"
import { fastRoute } from "../src/lib/services/router"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })
const BASE = process.env.EVAL_BASE_URL ?? "http://weather-warning-agentcore-alb-54329175.us-east-1.elb.amazonaws.com"
const SECRET = process.env.AUTH_SECRET ?? ""
const TIMEOUT = 60_000
const CASE_DELAY_MS = Number(process.env.EVAL_CASE_DELAY_MS ?? "1000")
const RATE_LIMIT_RETRY_MS = Number(process.env.EVAL_RATE_LIMIT_RETRY_MS ?? "65000")

interface EvalCase { id: number; input: string; field_id: number; expected_signals: string; category: string; critical: boolean }
interface QualityChecks {
  signal_score: number
  evidence_score: number
  dosage_specific: boolean
  cited_context: boolean
}
interface CaseResult {
  id: number
  input: string
  category: string
  critical: boolean
  passed: boolean
  latency_ms: number
  expected_route: string[]
  observed_route: string[]
  route_matched: boolean
  quality_score: number
  quality_checks: QualityChecks
  matched: string[]
  missed: string[]
  reply_snippet: string
}

const GREETING_RE = /^(你好|hi|hello|嗨|hey|您好|早上好|下午好|晚上好|在吗)/i

function expectedRoute(c: EvalCase): string[] {
  if (GREETING_RE.test(c.input.trim()) || c.category === "greeting") return ["greeting"]
  if (/综合/.test(c.input)) return ["weather-analyst", "alert-analyst", "farming-advisor"]
  if (c.category === "weather") return ["weather-analyst"]
  if (c.category === "farming") return ["farming-advisor"]
  if (c.category === "alert") return ["alert-analyst"]
  return ["farming-advisor"]
}

function observedRoute(input: string): string[] {
  if (GREETING_RE.test(input.trim())) return ["greeting"]
  return fastRoute(input)?.agents ?? ["supervisor"]
}

function sameRoute(expected: string[], observed: string[]): boolean {
  return expected.length === observed.length && expected.every(a => observed.includes(a))
}

function evidenceTerms(category: string): string[] {
  if (category === "weather") return ["温度", "降水", "风", "预报", "历史", "℃", "mm"]
  if (category === "farming") return ["地块", "播种", "施肥", "灌溉", "用药", "天气", "阶段", "亩"]
  if (category === "alert") return ["风险", "预警", "阈值", "温度", "降水", "风速", "建议"]
  return ["助手", "天气", "农事", "预警"]
}

function quality(reply: string, category: string, signalScore: number): { score: number; checks: QualityChecks } {
  const terms = evidenceTerms(category)
  const evidenceHits = terms.filter(t => reply.includes(t)).length
  const evidenceScore = terms.length ? evidenceHits / terms.length : 0
  const dosageSpecific = category !== "farming" || /\d+\s*(倍液|克|g|毫升|ml|公斤|kg|亩|次|%)/i.test(reply)
  const citedContext = /地块|天气|预报|实况|知识库|历史|阈值|数据/.test(reply)
  const score = Math.round(100 * (
    signalScore * 0.5 +
    evidenceScore * 0.3 +
    (dosageSpecific ? 0.1 : 0) +
    (citedContext ? 0.1 : 0)
  ))
  return {
    score,
    checks: { signal_score: signalScore, evidence_score: evidenceScore, dosage_specific: dosageSpecific, cited_context: citedContext },
  }
}

function requiredQuality(c: EvalCase): number {
  const base = c.category === "greeting" ? 35 : c.category === "farming" ? 55 : 50
  return c.critical ? base + 5 : base
}

async function getToken(): Promise<string> {
  if (!SECRET) throw new Error("AUTH_SECRET required")
  const key = new TextEncoder().encode(SECRET)
  return new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setSubject("admin").setExpirationTime("1h").sign(key)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function postChat(c: EvalCase, token: string): Promise<Response> {
  const body = JSON.stringify({ message: c.input, fieldId: c.field_id })
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT)
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `auth_token=${token}` },
      body,
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (res.status !== 429 || attempt === 1) return res
    console.log(`  rate limited; waiting ${RATE_LIMIT_RETRY_MS}ms before retry`)
    await sleep(RATE_LIMIT_RETRY_MS)
  }
  throw new Error("unreachable")
}

async function runCase(c: EvalCase, token: string): Promise<CaseResult> {
  const signals: string[] = JSON.parse(c.expected_signals)
  const expRoute = expectedRoute(c)
  const obsRoute = observedRoute(c.input)
  const routeMatched = sameRoute(expRoute, obsRoute)
  const t0 = Date.now()
  try {
    const res = await postChat(c, token)
    const data = await res.json()
    const reply: string = data.reply ?? data.error ?? ""
    const lower = reply.toLowerCase()
    const matched = signals.filter(s => lower.includes(s.toLowerCase()))
    const missed = signals.filter(s => !lower.includes(s.toLowerCase()))
    const signalScore = signals.length ? matched.length / signals.length : 1
    const q = quality(reply, c.category, signalScore)
    const passed = signalScore >= 0.5 && routeMatched && q.score >= requiredQuality(c)
    return {
      id: c.id, input: c.input, category: c.category, critical: c.critical, passed,
      latency_ms: Date.now() - t0, expected_route: expRoute, observed_route: obsRoute,
      route_matched: routeMatched, quality_score: q.score, quality_checks: q.checks,
      matched, missed, reply_snippet: reply.slice(0, 120),
    }
  } catch (e: unknown) {
    return {
      id: c.id, input: c.input, category: c.category, critical: c.critical, passed: false,
      latency_ms: Date.now() - t0, expected_route: expRoute, observed_route: obsRoute,
      route_matched: routeMatched, quality_score: 0,
      quality_checks: { signal_score: 0, evidence_score: 0, dosage_specific: false, cited_context: false },
      matched: [], missed: signals, reply_snippet: `ERROR: ${e instanceof Error ? e.message : e}`,
    }
  }
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  return values[Math.min(values.length - 1, Math.floor(values.length * p))]
}

async function main() {
  const token = await getToken()
  const cases = (await pool.query("SELECT * FROM eval_case ORDER BY id")).rows as EvalCase[]
  console.log(`\n🧪 Running ${cases.length} eval cases against ${BASE}\n`)

  const results: CaseResult[] = []
  for (const c of cases) {
    const r = await runCase(c, token)
    results.push(r)
    const icon = r.passed ? "PASS" : "FAIL"
    const crit = r.critical ? " [CRITICAL]" : ""
    console.log(`  ${icon} #${r.id} [${r.category}]${crit} "${r.input}" (${r.latency_ms}ms) route=${r.observed_route.join("+")} quality=${r.quality_score} signals=${r.matched.length}/${r.matched.length + r.missed.length}`)
    if (!r.passed) console.log(`     missed=${r.missed.join(", ") || "-"} routeMatched=${r.route_matched} requiredQuality=${requiredQuality(c)}`)
    if (CASE_DELAY_MS > 0) await sleep(CASE_DELAY_MS)
  }

  const passed = results.filter(r => r.passed).length
  const failed = results.length - passed
  const critFailed = results.filter(r => !r.passed && r.critical).length
  const latencies = results.map(r => r.latency_ms).sort((a, b) => a - b)
  const avg = Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length)
  const p95 = percentile(latencies, 0.95)
  const routePassed = results.filter(r => r.route_matched).length
  const qualityAvg = Math.round(results.reduce((s, r) => s + r.quality_score, 0) / results.length)
  const byRoute = Object.fromEntries(
    [...new Set(results.map(r => r.observed_route.join("+")))].map(route => {
      const rows = results.filter(r => r.observed_route.join("+") === route)
      const xs = rows.map(r => r.latency_ms).sort((a, b) => a - b)
      return [route, {
        total: rows.length,
        passed: rows.filter(r => r.passed).length,
        avg_latency_ms: Math.round(xs.reduce((s, v) => s + v, 0) / xs.length),
        p50_latency_ms: percentile(xs, 0.5),
        p95_latency_ms: percentile(xs, 0.95),
      }]
    })
  )

  const resultsJson = {
    summary: {
      total: results.length,
      passed,
      failed,
      critical_failed: critFailed,
      route_accuracy: routePassed / results.length,
      avg_quality_score: qualityAvg,
      avg_latency_ms: avg,
      p95_latency_ms: p95,
      by_route: byRoute,
    },
    results,
  }

  await pool.query(
    "INSERT INTO eval_run (total,passed,failed,critical_failed,avg_latency_ms,p95_latency_ms,finished_at,results_json) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)",
    [results.length, passed, failed, critFailed, avg, p95, JSON.stringify(resultsJson)]
  )

  console.log(`\n📊 Results: ${passed}/${results.length} passed | ${failed} failed | ${critFailed} critical failed`)
  console.log(`Routes: ${routePassed}/${results.length} matched | Quality avg=${qualityAvg}`)
  console.log(`Latency: avg=${avg}ms p95=${p95}ms`)
  console.log(`By route: ${JSON.stringify(byRoute)}\n`)

  await pool.end()
  if (critFailed > 0) { console.error(`💥 ${critFailed} critical case(s) failed!`); process.exit(1) }
}

main().catch(e => { console.error(e); process.exit(1) })
