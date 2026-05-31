#!/usr/bin/env npx tsx
import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })
async function main() {
  console.log("Refreshing field_daily_cumulative...")
  await pool.query("REFRESH MATERIALIZED VIEW CONCURRENTLY field_daily_cumulative")
  console.log("Done.")
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
