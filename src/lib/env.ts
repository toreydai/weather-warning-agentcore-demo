import { z } from "zod"

const booleanFromString = z.preprocess(value => {
  if (typeof value !== "string") return value
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false
  return value
}, z.boolean())

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),

  AWS_REGION: z.string().default("us-east-1"),
  KNOWLEDGE_BASE_BUCKET: z.string().optional(),

  APP_BASE_URL: z.url().optional(),
  EVAL_BASE_URL: z.url().optional(),
  SMOKE_BASE_URL: z.url().optional(),
  SMOKE_USERNAME: z.string().optional(),
  SMOKE_PASSWORD: z.string().optional(),

  CORS_ORIGINS: z.string().optional(),
  COOKIE_SECURE: booleanFromString.default(false),
  LOG_LEVEL: z.string().default("info"),
  RATE_LIMIT_STORE: z.enum(["pg", "memory"]).default("pg"),
  PASSWORD_EXPIRE_DAYS: z.coerce.number().int().positive().default(90),

  USE_AGENTCORE_FARMING: booleanFromString.default(false),
  FARMING_ADVISOR_FAST_ARN: z.string().optional(),
  FARMING_ADVISOR_DEEP_ARN: z.string().optional(),
  CHAT_MEMORY_ID: z.string().optional(),
  CHAT_PG_TRANSCRIPT_MODE: z.enum(["fallback", "dual", "off"]).default("fallback"),

  WECOM_WEBHOOK_URL: z.url().optional(),
  CRON_ALERT_SNS_TOPIC_ARN: z.string().optional(),

  FEATURE_DAILY_ALERT: booleanFromString.default(false),
  FEATURE_WECOM_PUSH: booleanFromString.default(false),
  FEATURE_FORECAST_45D: booleanFromString.default(false),
  FEATURE_KB_UPLOAD: booleanFromString.default(false),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const details = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")
  throw new Error(`Invalid environment: ${details}`)
}

export const env = parsed.data
export type Env = z.infer<typeof envSchema>

export function requireEnv(name: keyof Env): string {
  const value = process.env[name]
  if (typeof value !== "string" || value.length === 0) throw new Error(`${name} required`)
  return value
}

export function assertRequiredEnv(names: Array<keyof Env>) {
  const missing = names.filter(name => {
    const value = process.env[name]
    return typeof value !== "string" || value.length === 0
  })
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
}
