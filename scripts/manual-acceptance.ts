export {}

interface Args {
  base: string
  username: string
  password: string
  write: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const get = (name: string, fallback?: string) => {
    const prefix = `--${name}=`
    const inline = args.find(a => a.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const i = args.indexOf(`--${name}`)
    return i >= 0 ? args[i + 1] : fallback
  }
  const has = (name: string) => args.includes(`--${name}`)

  const base = get("base", process.env.MANUAL_BASE_URL ?? process.env.SMOKE_BASE_URL)
  const username = get("username", process.env.MANUAL_USERNAME ?? process.env.SMOKE_USERNAME ?? "admin")
  const password = get("password", process.env.MANUAL_PASSWORD ?? process.env.SMOKE_PASSWORD ?? "admin123")
  if (!base) throw new Error("Missing --base or MANUAL_BASE_URL")
  if (!username || !password) throw new Error("Missing manual acceptance username/password")
  return {
    base: base.replace(/\/$/, ""),
    username,
    password,
    write: has("write") || process.env.MANUAL_WRITE === "1",
  }
}

function cookieHeader(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = headers.getSetCookie?.() ?? []
  const fallback = res.headers.get("set-cookie")
  const all = cookies.length ? cookies : fallback ? [fallback] : []
  return all.map(c => c.split(";")[0]).join("; ")
}

async function readBody(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 500)
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} returned ${res.status}: ${await readBody(res)}`)
  return await res.json() as T
}

async function requestText(url: string, init?: RequestInit): Promise<{ status: number; text: string; contentType: string }> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} returned ${res.status}: ${await readBody(res)}`)
  return { status: res.status, text: await res.text(), contentType: res.headers.get("content-type") ?? "" }
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms).unref()
  return controller.signal
}

function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} did not return an array`)
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} did not return an object`)
}

async function main() {
  const args = parseArgs()
  let cookies = ""
  let firstFieldId: number | null = null
  let tempFieldId: number | null = null
  let tempUserId: number | null = null
  const passed: string[] = []

  const step = async (name: string, fn: () => Promise<void>) => {
    const started = Date.now()
    try {
      await fn()
      passed.push(name)
      console.log(`ok ${name} ${Date.now() - started}ms`)
    } catch (e) {
      console.error(`failed ${name} ${Date.now() - started}ms`)
      throw e
    }
  }

  try {
    await step("health-deep", async () => {
      const body = await request<{ ok?: boolean }>(`${args.base}/api/health/deep`)
      if (body.ok !== true) throw new Error("health-deep returned ok=false")
    })

    await step("login", async () => {
      const res = await fetch(`${args.base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: args.username, password: args.password }),
      })
      if (!res.ok) throw new Error(`login returned ${res.status}: ${await readBody(res)}`)
      cookies = cookieHeader(res)
      if (!cookies.includes("auth_token=")) throw new Error("login did not set auth_token cookie")
    })

    await step("field-list", async () => {
      const fields = await request<Array<{ id: number }>>(`${args.base}/api/fields`, { headers: { Cookie: cookies } })
      assertArray(fields, "fields")
      if (!fields.length) throw new Error("fields returned no rows")
      firstFieldId = fields[0].id
    })

    await step("field-detail", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const field = await request<unknown>(`${args.base}/api/fields/${firstFieldId}`, { headers: { Cookie: cookies } })
      assertObject(field, "field-detail")
    })

    await step("field-weather", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const weather = await request<unknown>(`${args.base}/api/fields/${firstFieldId}/weather`, { headers: { Cookie: cookies } })
      assertArray(weather, "field-weather")
    })

    await step("field-forecast-45d", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const forecast = await request<unknown>(`${args.base}/api/fields/${firstFieldId}/forecast`, { headers: { Cookie: cookies } })
      assertArray(forecast, "field-forecast")
      if (forecast.length < 45) throw new Error(`field-forecast returned ${forecast.length} rows, expected >= 45`)
    })

    await step("field-alerts", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const alerts = await request<unknown>(`${args.base}/api/fields/${firstFieldId}/alerts`, { headers: { Cookie: cookies } })
      assertArray(alerts, "field-alerts")
    })

    await step("field-daily-alert", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const res = await fetch(`${args.base}/api/fields/${firstFieldId}/daily-alert`, { headers: { Cookie: cookies } })
      if (res.status === 404) return
      if (!res.ok) throw new Error(`daily-alert returned ${res.status}: ${await readBody(res)}`)
      const body = await res.json()
      if (body !== null) assertObject(body, "field-daily-alert")
    })

    await step("export-weather-csv", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const res = await requestText(`${args.base}/api/fields/${firstFieldId}/export/weather`, { headers: { Cookie: cookies } })
      if (!res.text.trim()) throw new Error("weather csv is empty")
    })

    await step("export-alerts-csv", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const res = await requestText(`${args.base}/api/fields/${firstFieldId}/export/alerts`, { headers: { Cookie: cookies } })
      if (!res.text.trim()) throw new Error("alerts csv is empty")
    })

    await step("chat-weather", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const reply = await request<{ reply?: string }>(`${args.base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ message: "最近天气怎么样", fieldId: firstFieldId }),
        signal: withTimeout(90_000),
      })
      if (!reply.reply || reply.reply.length < 10) throw new Error("chat-weather reply is too short")
    })

    await step("chat-disease-kb", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const reply = await request<{ reply?: string }>(`${args.base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ message: "晚疫病怎么防治", fieldId: firstFieldId }),
        signal: withTimeout(120_000),
      })
      if (!reply.reply || reply.reply.length < 10) throw new Error("chat-disease-kb reply is too short")
    })

    await step("admin-dashboard", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/dashboard`, { headers: { Cookie: cookies } })
      assertObject(body, "admin-dashboard")
    })

    await step("admin-users", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/users`, { headers: { Cookie: cookies } })
      assertArray(body, "admin-users")
    })

    await step("admin-thresholds", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/thresholds`, { headers: { Cookie: cookies } })
      assertArray(body, "admin-thresholds")
    })

    await step("admin-audit", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/audit`, { headers: { Cookie: cookies } })
      assertObject(body, "admin-audit")
    })

    await step("admin-cron", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/cron`, { headers: { Cookie: cookies } })
      assertObject(body, "admin-cron")
    })

    await step("admin-eval", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/eval`, { headers: { Cookie: cookies } })
      assertArray(body, "admin-eval")
    })

    await step("admin-knowledge", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/knowledge`, { headers: { Cookie: cookies } })
      assertArray(body, "admin-knowledge")
    })

    await step("admin-daily-alerts", async () => {
      const body = await request<unknown>(`${args.base}/api/admin/daily-alerts`, { headers: { Cookie: cookies } })
      assertArray(body, "admin-daily-alerts")
    })

    await step("chat-global", async () => {
      const reply = await request<{ reply?: string }>(`${args.base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookies },
        body: JSON.stringify({ message: "你好" }),
        signal: withTimeout(30_000),
      })
      if (!reply.reply || reply.reply.length < 2) throw new Error("chat-global reply is too short")
    })

    await step("export-weather-csv-columns", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const res = await requestText(`${args.base}/api/fields/${firstFieldId}/export/weather`, { headers: { Cookie: cookies } })
      const header = res.text.split("\n")[0].replace(/^﻿/, "")
      const expected = ["日期", "最高温", "最低温", "均温", "降水", "风速", "湿度", "天气代码"]
      for (const col of expected) {
        if (!header.includes(col)) throw new Error(`weather csv missing column: ${col}`)
      }
    })

    await step("export-alerts-csv-columns", async () => {
      if (!firstFieldId) throw new Error("missing first field id")
      const res = await requestText(`${args.base}/api/fields/${firstFieldId}/export/alerts`, { headers: { Cookie: cookies } })
      const header = res.text.split("\n")[0].replace(/^﻿/, "")
      const expected = ["日期", "类型", "级别", "标题", "描述"]
      for (const col of expected) {
        if (!header.includes(col)) throw new Error(`alerts csv missing column: ${col}`)
      }
    })

    await step("admin-audit-fields", async () => {
      const body = await request<{ rows?: Array<Record<string, unknown>> }>(`${args.base}/api/admin/audit`, { headers: { Cookie: cookies } })
      assertObject(body, "admin-audit-fields")
      if (!body.rows || !Array.isArray(body.rows)) throw new Error("admin-audit missing rows array")
      if (body.rows.length > 0) {
        const entry = body.rows[0]
        for (const field of ["username", "action", "created_at"]) {
          if (!(field in entry)) throw new Error(`audit log entry missing field: ${field}`)
        }
      }
    })

    if (args.write) {
      await step("field-create-temp", async () => {
        const name = `acceptance-temp-${Date.now()}`
        const body = await request<{ id?: number }>(`${args.base}/api/fields`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({
            name,
            latitude: 43.94,
            longitude: 116.08,
            area_mu: 1,
            variety: "acceptance",
            planting_date: "2026-04-25",
            region: "xilinhaote",
            province: "Inner Mongolia",
            city: "Xilingol",
            county: "Xilinhot",
            township: "Acceptance",
            admin_code: "152502",
            address: "acceptance temporary field",
          }),
        })
        if (!body.id) throw new Error("field create did not return an id")
        tempFieldId = body.id
      })

      await step("field-edit", async () => {
        if (!tempFieldId) throw new Error("missing temp field id")
        const newName = `acceptance-edited-${Date.now()}`
        const updated = await request<{ name?: string }>(`${args.base}/api/fields/${tempFieldId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({ name: newName }),
        })
        if (updated.name !== newName) throw new Error(`field-edit name not updated: got ${updated.name}`)
        const fetched = await request<{ name?: string }>(`${args.base}/api/fields/${tempFieldId}`, { headers: { Cookie: cookies } })
        if (fetched.name !== newName) throw new Error(`field-edit GET after PUT returned wrong name: ${fetched.name}`)
      })

      await step("field-delete-temp", async () => {
        if (!tempFieldId) throw new Error("missing temp field id")
        const body = await request<{ ok?: boolean }>(`${args.base}/api/fields/${tempFieldId}`, {
          method: "DELETE",
          headers: { Cookie: cookies },
        })
        if (body.ok !== true) throw new Error("field delete returned ok=false")
        tempFieldId = null
      })

      await step("threshold-json-invalid", async () => {
        const thresholds = await request<Array<{ id: number }>>(`${args.base}/api/admin/thresholds`, { headers: { Cookie: cookies } })
        assertArray(thresholds, "thresholds-list")
        if (!thresholds.length) return
        const id = thresholds[0].id
        const res = await fetch(`${args.base}/api/admin/thresholds`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({ id, yellow_condition: "not-json{{", orange_condition: "{}", red_condition: "{}" }),
        })
        if (res.status !== 400) throw new Error(`threshold-json-invalid expected 400, got ${res.status}`)
      })

      await step("user-create-temp", async () => {
        const username = `acceptance-tmp-${Date.now()}`
        const body = await request<{ id?: number }>(`${args.base}/api/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({ username, password: "TempPass123", role: "farmer" }),
        })
        if (!body.id) throw new Error("user create did not return id")
        tempUserId = body.id
      })

      await step("user-reset-must-change-password", async () => {
        if (!tempUserId) throw new Error("missing temp user id")
        const res = await request<{ ok?: boolean }>(`${args.base}/api/admin/users/${tempUserId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({ password: "NewPass456" }),
        })
        if (res.ok !== true) throw new Error("reset_password did not return ok=true")
        const users = await request<Array<{ id: number; must_change_password?: boolean }>>(`${args.base}/api/admin/users`, { headers: { Cookie: cookies } })
        const u = users.find(x => x.id === tempUserId)
        if (!u) throw new Error("temp user not found in user list")
        if (u.must_change_password !== true) throw new Error(`expected must_change_password=true, got ${u.must_change_password}`)
      })

      await step("user-disable-temp", async () => {
        if (!tempUserId) throw new Error("missing temp user id")
        await request<unknown>(`${args.base}/api/admin/users/${tempUserId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: cookies },
          body: JSON.stringify({ is_active: false }),
        })
        tempUserId = null
      })
    }

    console.log(`manual acceptance passed: ${passed.length} checks`)
  } catch (e) {
    if (tempFieldId) {
      await fetch(`${args.base}/api/fields/${tempFieldId}`, { method: "DELETE", headers: { Cookie: cookies } }).catch(() => {})
    }
    if (tempUserId) {
      await fetch(`${args.base}/api/admin/users/${tempUserId}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: cookies }, body: JSON.stringify({ is_active: false }) }).catch(() => {})
    }
    throw e
  }
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
