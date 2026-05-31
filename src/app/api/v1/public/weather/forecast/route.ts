import { NextRequest } from "next/server"
import { withHandler } from "@/lib/with-handler"
import { authenticatePublic, okResponse, errResponse, logApiCall } from "@/lib/public-api"
import { getForecast, getFieldById } from "@/lib/services/weather"

export async function GET(req: NextRequest) {
  return withHandler(req.nextUrl.pathname, async () => {
    const start = Date.now()
    const auth = await authenticatePublic(req, "weather:read")
    if (!("session" in auth)) return auth

    const { session, requestId } = auth
    const sp = req.nextUrl.searchParams
    const fieldId = Number(sp.get("field_id"))
    if (!fieldId || !Number.isInteger(fieldId) || fieldId <= 0) {
      return errResponse("invalid_param", "field_id is required and must be a positive integer", requestId, 400)
    }

    const days = Math.min(45, Math.max(1, Number(sp.get("days") ?? "7") || 7))

    // resource scope check: null = all fields allowed
    if (session.fieldIds !== null && !session.fieldIds.includes(fieldId)) {
      logApiCall(session.clientId, req.nextUrl.pathname, "GET", 403, start)
      return errResponse("forbidden", "this client is not authorized to access this field", requestId, 403)
    }

    const fieldRecord = await getFieldById(fieldId)
    if (!fieldRecord) {
      logApiCall(session.clientId, req.nextUrl.pathname, "GET", 404, start)
      return errResponse("not_found", "field not found", requestId, 404)
    }

    const rows = await getForecast(fieldId, days)

    const data = rows.map(r => ({
      date: r.date,
      temp_max: r.temp_max,
      temp_min: r.temp_min,
      precipitation: r.precipitation,
      wind_speed_max: r.wind_speed_max,
      humidity: r.humidity,
      weather_code: r.weather_code,
    }))

    const res = okResponse({ field_id: fieldId, days: data.length, forecast: data }, requestId)
    logApiCall(session.clientId, req.nextUrl.pathname, "GET", 200, start)
    return res
  })
}
