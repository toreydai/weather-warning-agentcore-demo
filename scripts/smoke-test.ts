export {}

interface Args {
  base: string
  username: string
  password: string
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

  const base = get("base", process.env.SMOKE_BASE_URL)
  const username = get("username", process.env.SMOKE_USERNAME ?? "admin")
  const password = get("password", process.env.SMOKE_PASSWORD ?? "admin123")
  if (!base) throw new Error("Missing --base or SMOKE_BASE_URL")
  if (!username || !password) throw new Error("Missing smoke username/password")
  return { base: base.replace(/\/$/, ""), username, password }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`${init?.method ?? "GET"} ${path} returned ${res.status}: ${body.slice(0, 300)}`)
  }
  return res
}

function cookieHeader(res: Response): string {
  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = headers.getSetCookie?.() ?? []
  const fallback = res.headers.get("set-cookie")
  const all = cookies.length ? cookies : fallback ? [fallback] : []
  return all.map(c => c.split(";")[0]).join("; ")
}

async function main() {
  const args = parseArgs()
  const step = async (name: string, fn: () => Promise<void>) => {
    const started = Date.now()
    await fn()
    console.log(`ok ${name} ${Date.now() - started}ms`)
  }

  await step("health-deep", async () => {
    const res = await request(`${args.base}/api/health/deep`)
    const body = await res.json() as { ok?: boolean }
    if (body.ok !== true) throw new Error("health-deep returned ok=false")
  })

  let cookies = ""
  await step("login", async () => {
    const res = await request(`${args.base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: args.username, password: args.password }),
    })
    cookies = cookieHeader(res)
    if (!cookies.includes("auth_token=")) throw new Error("login did not set auth_token cookie")
  })

  let firstFieldId: number | null = null
  await step("fields", async () => {
    const res = await request(`${args.base}/api/fields`, { headers: { Cookie: cookies } })
    const fields = await res.json() as Array<{ id: number }>
    if (!Array.isArray(fields)) throw new Error("/api/fields did not return an array")
    if (!fields.length) throw new Error("/api/fields returned no fields")
    firstFieldId = fields[0].id
  })

  await step("field-alerts", async () => {
    if (!firstFieldId) throw new Error("missing first field id")
    const res = await request(`${args.base}/api/fields/${firstFieldId}/alerts`, { headers: { Cookie: cookies } })
    const alerts = await res.json()
    if (!Array.isArray(alerts)) throw new Error("field alerts did not return an array")
  })

  await step("field-forecast", async () => {
    if (!firstFieldId) throw new Error("missing first field id")
    const res = await request(`${args.base}/api/fields/${firstFieldId}/forecast`, { headers: { Cookie: cookies } })
    const forecast = await res.json()
    if (!Array.isArray(forecast)) throw new Error("field forecast did not return an array")
  })

  await step("field-daily-alert", async () => {
    if (!firstFieldId) throw new Error("missing first field id")
    const res = await fetch(`${args.base}/api/fields/${firstFieldId}/daily-alert`, { headers: { Cookie: cookies } })
    if (res.status === 404) return
    if (!res.ok) throw new Error(`GET daily-alert returned ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const body = await res.json()
    if (body !== null && typeof body !== "object") throw new Error("daily-alert did not return null or object")
  })
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
