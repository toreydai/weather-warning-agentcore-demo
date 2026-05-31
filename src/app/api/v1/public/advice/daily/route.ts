import { NextRequest } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { authenticatePublic, okResponse, errResponse, logApiCall } from "@/lib/public-api"
import { getDb } from "@/lib/db"
import { dailyFarmingAlert } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

function todayChina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date())
}

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const start = Date.now()
    const auth = await authenticatePublic(req, "advice:read")
    if (!("session" in auth)) return auth

    const { session, requestId } = auth
    const sp = req.nextUrl.searchParams
    const countyCode = sp.get("county_code")?.trim()
    if (!countyCode) {
      return errResponse("invalid_param", "county_code is required", requestId, 400)
    }

    const date = sp.get("date")?.trim() || todayChina()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return errResponse("invalid_param", "date must be YYYY-MM-DD", requestId, 400)
    }

    const rows = await getDb().select().from(dailyFarmingAlert)
      .where(and(
        eq(dailyFarmingAlert.county_code, countyCode),
        eq(dailyFarmingAlert.date, date),
        eq(dailyFarmingAlert.status, "published")
      ))
    const row = rows[0]

    if (!row) {
      logApiCall(session.clientId, req.nextUrl.pathname, "GET", 404, start)
      return errResponse("not_found", "no published advice found for this county and date", requestId, 404)
    }

    const data = {
      county_code: row.county_code,
      county_name: row.county_name,
      date: row.date,
      stage: row.stage,
      focus: row.focus,
      content: row.final_content ?? row.draft_content,
      published_at: row.published_at,
    }

    const res = okResponse(data, requestId)
    logApiCall(session.clientId, req.nextUrl.pathname, "GET", 200, start)
    return res
  })
}
