import { NextRequest } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { authenticatePublic, okResponse, errResponse, logApiCall } from "@/lib/public-api"
import { getAlerts } from "@/lib/services/alert"
import { getFieldById } from "@/lib/services/weather"

function todayChina() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date())
}

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const start = Date.now()
    const auth = await authenticatePublic(req, "alert:read")
    if (!("session" in auth)) return auth

    const { session, requestId } = auth
    const sp = req.nextUrl.searchParams
    const fieldId = Number(sp.get("field_id"))
    if (!fieldId || !Number.isInteger(fieldId) || fieldId <= 0) {
      return errResponse("invalid_param", "field_id is required and must be a positive integer", requestId, 400)
    }

    if (session.fieldIds !== null && !session.fieldIds.includes(fieldId)) {
      logApiCall(session.clientId, req.nextUrl.pathname, "GET", 403, start)
      return errResponse("forbidden", "this client is not authorized to access this field", requestId, 403)
    }

    const fieldRecord = await getFieldById(fieldId)
    if (!fieldRecord) {
      logApiCall(session.clientId, req.nextUrl.pathname, "GET", 404, start)
      return errResponse("not_found", "field not found", requestId, 404)
    }

    const today = todayChina()
    const allAlerts = await getAlerts(fieldId)
    // "active" = today's alerts only (regenerated daily by check-alerts cron)
    const active = allAlerts.filter(a => a.date === today).map(a => ({
      id: a.id,
      date: a.date,
      type: a.type,
      severity: a.severity,
      title: a.title,
      description: a.description,
      stage: a.stage,
    }))

    const res = okResponse({ field_id: fieldId, date: today, alerts: active }, requestId)
    logApiCall(session.clientId, req.nextUrl.pathname, "GET", 200, start)
    return res
  })
}
