import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"
import { requireEnv } from "@/lib/env"

let pool: Pool | null = null
let db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function getDb() {
  if (!db) {
    pool = new Pool({ connectionString: requireEnv("DATABASE_URL"), max: 10, ssl: { rejectUnauthorized: false }, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
    db = drizzle(pool, { schema })
  }
  return db
}

export function getPool() {
  if (!pool) getDb()
  return pool!
}
