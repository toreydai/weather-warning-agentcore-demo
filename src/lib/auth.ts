import { NextRequest, NextResponse } from "next/server"
import { SignJWT, jwtVerify } from "jose"
import { randomBytes, createHash } from "crypto"
import { getDb } from "@/lib/db"
import { refreshToken } from "@/lib/db/schema"
import { and, eq, isNull, gt } from "drizzle-orm"
import { env, requireEnv } from "@/lib/env"

const authSecret = requireEnv("AUTH_SECRET")
if (authSecret.length < 16) throw new Error("AUTH_SECRET must be at least 16 characters")
const KEY = new TextEncoder().encode(authSecret)
const ACCESS_TTL = "24h"
const ACCESS_MAXAGE_S = 24 * 3600
const ACCESS_COOKIE = "auth_token"
const REFRESH_COOKIE = "refresh_token"
const REFRESH_TTL_MS = 30 * 24 * 3600 * 1000

export type Session = { username: string; role: string; userId?: number; mustChangePassword?: boolean }

export async function createAccessToken(username: string, role: string, userId?: number, mustChangePassword = false): Promise<string> {
  return new SignJWT({ role, userId, mustChangePassword })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(KEY)
}

export async function verifyAccessToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, KEY)
    if (!payload.sub || typeof payload.role !== "string") return null
    return {
      username: payload.sub,
      role: payload.role,
      userId: payload.userId as number | undefined,
      mustChangePassword: payload.mustChangePassword === true,
    }
  } catch {
    return null
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

export async function issueRefreshToken(userId: number): Promise<string> {
  const raw = randomBytes(32).toString("base64url")
  const expires_at = new Date(Date.now() + REFRESH_TTL_MS)
  await getDb().insert(refreshToken).values({ user_id: userId, token_hash: hashToken(raw), expires_at })
  return raw
}

export async function rotateRefreshToken(raw: string): Promise<{ userId: number } | null> {
  const h = hashToken(raw)
  const rows = await getDb().select().from(refreshToken)
    .where(and(eq(refreshToken.token_hash, h), isNull(refreshToken.revoked_at), gt(refreshToken.expires_at, new Date())))
  const row = rows[0]
  if (!row) return null
  await getDb().update(refreshToken).set({ revoked_at: new Date() }).where(eq(refreshToken.id, row.id))
  return { userId: row.user_id }
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const h = hashToken(raw)
  await getDb().update(refreshToken).set({ revoked_at: new Date() }).where(eq(refreshToken.token_hash, h))
}

export function setAuthCookies(res: NextResponse, accessToken: string, refreshTokenValue: string) {
  const secure = env.COOKIE_SECURE
  setAccessCookie(res, accessToken)
  res.cookies.set(REFRESH_COOKIE, refreshTokenValue, { httpOnly: true, maxAge: REFRESH_TTL_MS / 1000, path: "/api/auth", sameSite: "lax", secure })
}

export function setAccessCookie(res: NextResponse, accessToken: string) {
  const secure = env.COOKIE_SECURE
  res.cookies.set(ACCESS_COOKIE, accessToken, { httpOnly: true, maxAge: ACCESS_MAXAGE_S, path: "/", sameSite: "lax", secure })
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" })
  res.cookies.set(REFRESH_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/api/auth" })
}

export async function verifyAuth(req: NextRequest): Promise<Session | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value
  if (!token) return null
  return verifyAccessToken(token)
}

export async function auth(): Promise<{ user: { name: string; role: string } } | null> {
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  const token = cookieStore.get(ACCESS_COOKIE)?.value
  if (!token) return null
  const s = await verifyAccessToken(token)
  return s ? { user: { name: s.username, role: s.role } } : null
}

export async function requireAdmin(): Promise<{ name: string; role: string } | NextResponse> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (session.user.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 })
  return session.user
}

export async function requireReviewer(): Promise<{ name: string; role: string } | NextResponse> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["admin", "reviewer"].includes(session.user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  return session.user
}

export async function requireAgronomist(): Promise<{ name: string; role: string } | NextResponse> {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!["admin", "reviewer", "agronomist"].includes(session.user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  return session.user
}
