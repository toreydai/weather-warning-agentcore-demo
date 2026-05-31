import { z } from "zod"
import { compareSync } from "bcryptjs"
import { env } from "@/lib/env"

const PASSWORD_EXPIRE_DAYS = env.PASSWORD_EXPIRE_DAYS

export const passwordSchema = z.string()
  .min(8, "密码至少8位")
  .regex(/[a-z]/, "需要包含小写字母")
  .regex(/[A-Z]/, "需要包含大写字母")
  .regex(/[0-9]/, "需要包含数字")

export function checkPasswordHistory(newPassword: string, historyHashes: string[]): boolean {
  return !historyHashes.some(h => compareSync(newPassword, h))
}

export function getPasswordExpiresAt(): Date {
  return new Date(Date.now() + PASSWORD_EXPIRE_DAYS * 24 * 60 * 60 * 1000)
}
