import { NextRequest, NextResponse } from "next/server"
import { verifyOAuthToken, checkOAuthRateLimit, type OAuthSession } from "@/lib/oauth"
import { getDb } from "@/lib/db"
import { apiCallLog } from "@/lib/db/schema"

export type PublicMeta = { request_id: string; as_of: string }

export type PublicOkResponse<T> = { ok: true; data: T; meta: PublicMeta }
export type PublicErrResponse = { ok: false; errors: Array<{ code: string; message: string }>; meta: PublicMeta }
export type PublicResponse<T> = PublicOkResponse<T> | PublicErrResponse

function nowIso() { return new Date().toISOString() }

export function okResponse<T>(data: T, requestId: string, status = 200): NextResponse {
  const body: PublicOkResponse<T> = { ok: true, data, meta: { request_id: requestId, as_of: nowIso() } }
  return NextResponse.json(body, { status })
}

export function errResponse(code: string, message: string, requestId: string, status: number): NextResponse {
  const body: PublicErrResponse = { ok: false, errors: [{ code, message }], meta: { request_id: requestId, as_of: nowIso() } }
  return NextResponse.json(body, { status })
}

export async function authenticatePublic(
  req: NextRequest,
  requiredScope?: string
): Promise<{ session: OAuthSession; requestId: string } | NextResponse> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()

  const session = await verifyOAuthToken(req)
  if (!session) return errResponse("unauthorized", "valid Bearer token required", requestId, 401)

  if (requiredScope && !session.scopes.includes(requiredScope)) {
    return errResponse("insufficient_scope", `token missing required scope: ${requiredScope}`, requestId, 403)
  }

  const rl = await checkOAuthRateLimit(session.clientId, session.rateLimit)
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, errors: [{ code: "rate_limit_exceeded", message: "too many requests" }], meta: { request_id: requestId, as_of: nowIso() } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 60) } }
    )
  }

  return { session, requestId }
}

export function logApiCall(clientId: string, endpoint: string, method: string, statusCode: number, startMs: number) {
  const latencyMs = Date.now() - startMs
  getDb().insert(apiCallLog).values({ client_id: clientId, endpoint, method, status_code: statusCode, latency_ms: latencyMs })
    .catch(() => {})
}
