import { getDb } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { desc, like, eq, and, sql } from "drizzle-orm"

export async function logAudit(params: { userId?: number; username: string; action: string; targetType?: string; targetId?: number; detail?: string; ip?: string }) {
  await getDb().insert(auditLog).values({ user_id: params.userId, username: params.username, action: params.action, target_type: params.targetType, target_id: params.targetId, detail: params.detail, ip: params.ip })
}

export async function getAuditLogs(opts: { page?: number; user?: string; action?: string } = {}) {
  const page = opts.page ?? 1, limit = 50, offset = (page - 1) * limit
  const conditions = []
  if (opts.user) conditions.push(like(auditLog.username, `%${opts.user}%`))
  if (opts.action) conditions.push(eq(auditLog.action, opts.action))
  const where = conditions.length ? and(...conditions) : undefined
  const rows = await getDb().select().from(auditLog).where(where).orderBy(desc(auditLog.created_at)).limit(limit).offset(offset)
  const totalResult = await getDb().select({ count: sql<number>`count(*)` }).from(auditLog).where(where)
  return { rows, total: Number(totalResult[0]?.count ?? 0), page, pages: Math.ceil(Number(totalResult[0]?.count ?? 0) / limit) }
}
