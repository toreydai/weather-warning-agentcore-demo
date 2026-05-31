import { NextRequest, NextResponse } from "next/server"
import { jwtVerify } from "jose/jwt/verify"
import type { JWTPayload } from "jose"

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") ?? []
const AUTH_SECRET = process.env.AUTH_SECRET ?? ""
const AUTH_COOKIE = "auth_token"
const KEY = AUTH_SECRET.length >= 16 ? new TextEncoder().encode(AUTH_SECRET) : null

// API paths that do NOT require cookie auth (pre-login, public OAuth, health checks)
function isPublicApiPath(pathname: string): boolean {
  if (pathname === "/api/auth/login") return true
  if (pathname === "/api/auth/refresh") return true
  if (pathname === "/api/health" || pathname === "/api/health/deep") return true
  if (pathname.startsWith("/api/v1/")) return true  // uses OAuth Bearer
  return false
}

async function verifyTokenPayload(token: string): Promise<JWTPayload | null> {
  if (!KEY) return null
  try {
    const { payload } = await jwtVerify(token, KEY)
    return payload
  } catch {
    return null
  }
}

export async function middleware(req: NextRequest) {
  const incoming = req.headers.get("x-request-id")
  const requestId = incoming ?? crypto.randomUUID()

  const requestHeaders = new Headers(req.headers)
  requestHeaders.set("x-request-id", requestId)

  // CORS preflight
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("origin") ?? ""
    const allowed = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": allowed ? origin : "",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "86400",
        "x-request-id": requestId,
      },
    })
  }

  const pathname = req.nextUrl.pathname

  // Enforce cookie auth on /api/* (except public-API allowlist).
  // Page routes are not gated here — they call auth() in their server components / use apiFetch which redirects on 401.
  if (pathname.startsWith("/api/") && !isPublicApiPath(pathname)) {
    const token = req.cookies.get(AUTH_COOKIE)?.value
    const payload = token ? await verifyTokenPayload(token) : null
    if (!payload) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: { "x-request-id": requestId } }
      )
    }
    if (payload.mustChangePassword === true && pathname !== "/api/auth/change-password") {
      return NextResponse.json(
        { error: "password change required" },
        { status: 403, headers: { "x-request-id": requestId } }
      )
    }
  } else if (!pathname.startsWith("/api/")) {
    // Page route: only handle the mustChangePassword redirect (auth itself is done in server components).
    if (pathname !== "/change-password") {
      const token = req.cookies.get(AUTH_COOKIE)?.value
      const payload = token ? await verifyTokenPayload(token) : null
      if (payload?.mustChangePassword === true) {
        const url = req.nextUrl.clone()
        url.pathname = "/change-password"
        url.search = ""
        const redirect = NextResponse.redirect(url)
        redirect.headers.set("x-request-id", requestId)
        return redirect
      }
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } })
  res.headers.set("x-request-id", requestId)

  // CORS response headers
  const origin = req.headers.get("origin") ?? ""
  if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin || "*")
  }

  return res
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
}
