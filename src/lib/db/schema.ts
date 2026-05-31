import { pgTable, text, integer, real, serial, boolean, timestamp, index, unique, primaryKey } from "drizzle-orm/pg-core"

export const field = pgTable("field", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  area_mu: real("area_mu"),
  variety: text("variety"),
  planting_date: text("planting_date"),
  region: text("region").notNull().default("xilinhaote"),
  province: text("province"),
  city: text("city"),
  county: text("county"),
  township: text("township"),
  admin_code: text("admin_code"),
  address: text("address"),
  harvest_date: text("harvest_date"),
  harvest_type: text("harvest_type").default("normal"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
})

export const dailyWeather = pgTable("daily_weather", {
  id: serial("id").primaryKey(),
  field_id: integer("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  temp_max: real("temp_max"),
  temp_min: real("temp_min"),
  temp_mean: real("temp_mean"),
  precipitation: real("precipitation"),
  wind_speed_max: real("wind_speed_max"),
  humidity: real("humidity"),
  weather_code: integer("weather_code"),
  wind_gust: real("wind_gust"),
  soil_temp: real("soil_temp"),
  source: text("source").notNull().default("openmeteo-daily"),
}, (table) => ({
  fieldDateUnique: unique("daily_weather_field_id_date_unique").on(table.field_id, table.date),
}))

export const weatherForecast = pgTable("weather_forecast", {
  id: serial("id").primaryKey(),
  field_id: integer("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  temp_max: real("temp_max"),
  temp_min: real("temp_min"),
  temp_mean: real("temp_mean"),
  precipitation: real("precipitation"),
  wind_speed_max: real("wind_speed_max"),
  humidity: real("humidity"),
  weather_code: integer("weather_code"),
  wind_gust: real("wind_gust"),
  soil_temp: real("soil_temp"),
  fetched_at: timestamp("fetched_at").defaultNow(),
}, (table) => ({
  fieldDateUnique: unique("weather_forecast_field_id_date_unique").on(table.field_id, table.date),
}))

export const weatherForecastHistory = pgTable("weather_forecast_history", {
  id: serial("id").primaryKey(),
  field_id: integer("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  forecast_run_at: timestamp("forecast_run_at").notNull(),
  forecast_date: text("forecast_date").notNull(),
  lead_days: integer("lead_days").notNull(),
  temp_max: real("temp_max"),
  temp_min: real("temp_min"),
  temp_mean: real("temp_mean"),
  precipitation: real("precipitation"),
  wind_speed_max: real("wind_speed_max"),
  humidity: real("humidity"),
  weather_code: integer("weather_code"),
  wind_gust: real("wind_gust"),
  soil_temp: real("soil_temp"),
  provider: text("provider").notNull().default("openmeteo"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  fieldRunDateUnique: unique("weather_forecast_history_field_run_date_unique").on(table.field_id, table.forecast_run_at, table.forecast_date),
  fieldDateIdx: index("idx_weather_forecast_history_field_date").on(table.field_id, table.forecast_date),
  runIdx: index("idx_weather_forecast_history_run").on(table.forecast_run_at),
}))

export const alert = pgTable("alert", {
  id: serial("id").primaryKey(),
  field_id: integer("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  emergency_plan: text("emergency_plan"),
  start_date: text("start_date"),
  end_date: text("end_date"),
  stage: text("stage"),
})

export const alertThreshold = pgTable("alert_threshold", {
  id: serial("id").primaryKey(),
  alert_type: text("alert_type").notNull(),
  stage: text("stage"),
  label: text("label").notNull(),
  yellow_condition: text("yellow_condition").notNull(),
  orange_condition: text("orange_condition").notNull(),
  red_condition: text("red_condition").notNull(),
  reference_source: text("reference_source"),
  reference_note: text("reference_note"),
})

export const dailyFarmingAlert = pgTable("daily_farming_alert", {
  id: serial("id").primaryKey(),
  county_code: text("county_code").notNull(),
  county_name: text("county_name").notNull(),
  date: text("date").notNull(),
  stage: text("stage"),
  focus: text("focus"),
  signals_json: text("signals_json"),
  draft_content: text("draft_content").notNull(),
  draft_model: text("draft_model"),
  draft_prompt_hash: text("draft_prompt_hash"),
  final_content: text("final_content"),
  status: text("status").notNull().default("draft"),
  needs_review: boolean("needs_review").notNull().default(false),
  reviewed_by: text("reviewed_by"),
  reviewed_at: timestamp("reviewed_at"),
  published_at: timestamp("published_at"),
  archived_month: text("archived_month"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  countyDateUnique: unique("daily_farming_alert_county_code_date_unique").on(table.county_code, table.date),
}))

export const kbDocument = pgTable("kb_document", {
  id: serial("id").primaryKey(),
  s3_key: text("s3_key").notNull().unique(),
  filename: text("filename").notNull(),
  content_type: text("content_type"),
  size_bytes: integer("size_bytes"),
  uploaded_by: text("uploaded_by").notNull(),
  uploaded_at: timestamp("uploaded_at").defaultNow(),
  deleted_at: timestamp("deleted_at"),
  last_ingestion_job_id: text("last_ingestion_job_id"),
}, (table) => ({
  s3KeyIdx: index("idx_kb_document_s3_key").on(table.s3_key),
}))

export const historicalMonthly = pgTable("historical_monthly", {
  id: serial("id").primaryKey(),
  region: text("region").notNull(),
  month: integer("month").notNull(),
  avg_temp_max: real("avg_temp_max"),
  avg_temp_min: real("avg_temp_min"),
  avg_temp_mean: real("avg_temp_mean"),
  avg_precipitation: real("avg_precipitation"),
  avg_wind_speed_max: real("avg_wind_speed_max"),
  avg_humidity: real("avg_humidity"),
}, (table) => ({
  regionMonthUnique: unique("historical_monthly_region_month_unique").on(table.region, table.month),
}))

export const user = pgTable("user", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  role: text("role").notNull().default("farmer"),
  is_active: boolean("is_active").notNull().default(true),
  must_change_password: boolean("must_change_password").notNull().default(true),
  last_login_at: timestamp("last_login_at"),
  password_expires_at: timestamp("password_expires_at"),
  failed_login_count: integer("failed_login_count").default(0),
  locked_until: timestamp("locked_until"),
  created_at: timestamp("created_at").defaultNow(),
})

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id"),
  username: text("username").notNull(),
  action: text("action").notNull(),
  target_type: text("target_type"),
  target_id: integer("target_id"),
  detail: text("detail"),
  ip: text("ip"),
  created_at: timestamp("created_at").defaultNow(),
})

export const passwordHistory = pgTable("password_history", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  password_hash: text("password_hash").notNull(),
  created_at: timestamp("created_at").defaultNow(),
})

export const farmingAdviceRecord = pgTable("farming_advice_record", {
  id: serial("id").primaryKey(),
  field_id: integer("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  week_start: text("week_start").notNull(),
  week_end: text("week_end").notNull(),
  growth_stage: text("growth_stage").notNull(),
  source: text("source").notNull().default("auto"),
  summary: text("summary"),
  fertilizer: text("fertilizer"),
  pesticide: text("pesticide"),
  irrigation: text("irrigation"),
  field_work: text("field_work"),
  ai_model: text("ai_model"),
  ai_prompt_hash: text("ai_prompt_hash"),
  reviewed_by: text("reviewed_by"),
  reviewed_at: timestamp("reviewed_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  fieldWeekUnique: unique("farming_advice_record_field_id_week_start_unique").on(table.field_id, table.week_start),
}))

export const backfillProgress = pgTable("backfill_progress", {
  grid_key: text("grid_key").primaryKey(),  // "lat_lon" rounded to 0.25°
  last_date: text("last_date").notNull(),
  updated_at: timestamp("updated_at").defaultNow(),
})

export const cronRun = pgTable("cron_run", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  started_at: timestamp("started_at").notNull().defaultNow(),
  finished_at: timestamp("finished_at"),
  status: text("status").notNull().default("running"),
  error: text("error"),
  items_processed: integer("items_processed"),
}, (table) => ({
  nameStartedIdx: index("idx_cron_run_name_started").on(table.name, table.started_at),
}))

export const refreshToken = pgTable("refresh_token", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull().unique(),
  expires_at: timestamp("expires_at").notNull(),
  revoked_at: timestamp("revoked_at"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("idx_refresh_token_user").on(table.user_id),
}))

export const rateLimitBucket = pgTable("rate_limit_bucket", {
  bucket_key: text("bucket_key").primaryKey(),
  count: integer("count").notNull().default(0),
  reset_at: timestamp("reset_at").notNull(),
  updated_at: timestamp("updated_at").defaultNow(),
}, (table) => ({
  resetAtIdx: index("idx_rate_limit_bucket_reset_at").on(table.reset_at),
}))

export const agentSession = pgTable("agent_session", {
  id: serial("id").primaryKey(),
  session_id: text("session_id").notNull().unique(),
  user_id: integer("user_id").references(() => user.id),
  field_id: integer("field_id").references(() => field.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
})

export const agentMessage = pgTable("agent_message", {
  id: serial("id").primaryKey(),
  session_id: text("session_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  agent_name: text("agent_name"),
  tokens_used: integer("tokens_used"),
  latency_ms: integer("latency_ms"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  sessionCreatedIdx: index("idx_agent_message_session_created").on(table.session_id, table.created_at),
}))

export const evalCase = pgTable("eval_case", {
  id: serial("id").primaryKey(),
  input: text("input").notNull(),
  field_id: integer("field_id").default(1),
  expected_signals: text("expected_signals").notNull(),
  category: text("category").notNull(),
  critical: boolean("critical").notNull().default(false),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  inputUnique: unique("eval_case_input_unique").on(table.input),
}))

export const evalRun = pgTable("eval_run", {
  id: serial("id").primaryKey(),
  started_at: timestamp("started_at").notNull().defaultNow(),
  finished_at: timestamp("finished_at"),
  total: integer("total").notNull().default(0),
  passed: integer("passed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  critical_failed: integer("critical_failed").notNull().default(0),
  avg_latency_ms: integer("avg_latency_ms"),
  p95_latency_ms: integer("p95_latency_ms"),
  results_json: text("results_json"),
})

export const townshipWeather = pgTable("township_weather", {
  admin_code: text("admin_code").notNull(),
  date: text("date").notNull(),
  temp_max: real("temp_max"),
  temp_min: real("temp_min"),
  temp_mean: real("temp_mean"),
  precipitation: real("precipitation"),
  wind_speed_max: real("wind_speed_max"),
  humidity: real("humidity"),
  weather_code: integer("weather_code"),
  wind_gust: real("wind_gust"),
  soil_temp: real("soil_temp"),
  source: text("source").notNull().default("openmeteo-era5"),
  fetched_at: timestamp("fetched_at").defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.admin_code, table.date] }),
  adminCodeIdx: index("idx_township_weather_admin_code").on(table.admin_code),
}))

export const zone = pgTable("zone", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  scope_type: text("scope_type").notNull().default("fields"), // 'fields' | 'admin' | 'mixed'
  created_by: integer("created_by").references(() => user.id),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
})

export const zoneMember = pgTable("zone_member", {
  id: serial("id").primaryKey(),
  zone_id: integer("zone_id").notNull().references(() => zone.id, { onDelete: "cascade" }),
  member_type: text("member_type").notNull(), // 'field' | 'township' | 'county'
  field_id: integer("field_id").references(() => field.id, { onDelete: "cascade" }),
  admin_code: text("admin_code"),
  township: text("township"),
  county: text("county"),
  latitude: real("latitude"),
  longitude: real("longitude"),
}, (table) => ({
  zoneMemberIdx: index("idx_zone_member_zone_id").on(table.zone_id),
}))

export const zoneAlertThreshold = pgTable("zone_alert_threshold", {
  id: serial("id").primaryKey(),
  alert_type: text("alert_type").notNull(),
  label: text("label").notNull(),
  category: text("category").notNull().default("intensity"), // 'intensity' | 'coverage'
  yellow_condition: text("yellow_condition").notNull(),
  orange_condition: text("orange_condition").notNull(),
  red_condition: text("red_condition").notNull(),
  min_members_for_coverage: integer("min_members_for_coverage").notNull().default(3),
})

export const zoneAlert = pgTable("zone_alert", {
  id: serial("id").primaryKey(),
  zone_id: integer("zone_id").notNull().references(() => zone.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  alert_type: text("alert_type").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(), // 'yellow' | 'orange' | 'red'
  title: text("title").notNull(),
  description: text("description"),
  affected_members: text("affected_members"), // JSON array of member names
  max_value: real("max_value"),
  coverage_pct: real("coverage_pct"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  zoneAlertIdx: index("idx_zone_alert_zone_date").on(table.zone_id, table.date),
}))

export const oauthClient = pgTable("oauth_client", {
  id: serial("id").primaryKey(),
  client_id: text("client_id").notNull().unique(),
  client_secret_hash: text("client_secret_hash").notNull(),
  name: text("name").notNull(),
  scopes: text("scopes").notNull().default('["read"]'),
  field_ids: text("field_ids"),   // JSON number[] | null = all fields allowed
  zone_ids: text("zone_ids"),    // JSON number[] | null = all zones allowed
  rate_limit: integer("rate_limit").notNull().default(60),
  is_active: boolean("is_active").notNull().default(true),
  revoked_at: timestamp("revoked_at"),
  created_by: integer("created_by").references(() => user.id),
  created_at: timestamp("created_at").defaultNow(),
})

export const oauthToken = pgTable("oauth_token", {
  id: serial("id").primaryKey(),
  client_id: text("client_id").notNull(),
  token_hash: text("token_hash").notNull().unique(),
  scopes: text("scopes").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  revoked_at: timestamp("revoked_at"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  clientIdx: index("idx_oauth_token_client").on(table.client_id),
}))

export const apiCallLog = pgTable("api_call_log", {
  id: serial("id").primaryKey(),
  client_id: text("client_id").notNull(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull().default("GET"),
  status_code: integer("status_code"),
  latency_ms: integer("latency_ms"),
  created_at: timestamp("created_at").defaultNow(),
}, (table) => ({
  clientCreatedIdx: index("idx_api_call_log_client_created").on(table.client_id, table.created_at),
}))

export const fieldDailyCumulative = pgTable("field_daily_cumulative", {
  field_id: integer("field_id").notNull().references(() => field.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  year: integer("year").notNull(),
  doy: integer("doy").notNull(),
  gdd_cumulative: real("gdd_cumulative").notNull().default(0),
  precip_cumulative: real("precip_cumulative").notNull().default(0),
}, (table) => ({
  pk: primaryKey({ columns: [table.field_id, table.date] }),
}))
