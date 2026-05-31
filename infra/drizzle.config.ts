import { defineConfig } from "drizzle-kit"

function migrationDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? ""
  if (!url || url.includes("sslmode=")) return url
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}uselibpqcompat=true&sslmode=require`
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationDatabaseUrl(),
  },
  strict: true,
  verbose: true,
})
