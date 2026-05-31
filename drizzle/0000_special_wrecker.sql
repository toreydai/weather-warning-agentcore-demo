CREATE TABLE IF NOT EXISTS "agent_message" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"agent_name" text,
	"tokens_used" integer,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer,
	"field_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_session_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"date" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"emergency_plan" text,
	"start_date" text,
	"end_date" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_threshold" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_type" text NOT NULL,
	"yellow_condition" text NOT NULL,
	"orange_condition" text NOT NULL,
	"red_condition" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" integer,
	"detail" text,
	"ip" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cron_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"items_processed" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_weather" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"date" text NOT NULL,
	"temp_max" real,
	"temp_min" real,
	"temp_mean" real,
	"precipitation" real,
	"wind_speed_max" real,
	"humidity" real,
	"weather_code" integer,
	"wind_gust" real,
	"soil_temp" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_case" (
	"id" serial PRIMARY KEY NOT NULL,
	"input" text NOT NULL,
	"field_id" integer DEFAULT 1,
	"expected_signals" text NOT NULL,
	"category" text NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "eval_run" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"critical_failed" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" integer,
	"p95_latency_ms" integer,
	"results_json" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "farming_advice_record" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"week_start" text NOT NULL,
	"week_end" text NOT NULL,
	"growth_stage" text NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"summary" text,
	"fertilizer" text,
	"pesticide" text,
	"irrigation" text,
	"field_work" text,
	"ai_model" text,
	"ai_prompt_hash" text,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "field" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"latitude" real NOT NULL,
	"longitude" real NOT NULL,
	"area_mu" real,
	"variety" text,
	"planting_date" text,
	"region" text DEFAULT 'xilinhaote' NOT NULL,
	"province" text,
	"city" text,
	"county" text,
	"township" text,
	"admin_code" text,
	"address" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "region" text DEFAULT 'xilinhaote' NOT NULL;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "province" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "city" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "county" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "township" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "admin_code" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN IF NOT EXISTS "address" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "historical_monthly" (
	"id" serial PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"month" integer NOT NULL,
	"avg_temp_max" real,
	"avg_temp_min" real,
	"avg_temp_mean" real,
	"avg_precipitation" real,
	"avg_wind_speed_max" real,
	"avg_humidity" real
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "refresh_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'farmer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp,
	"password_expires_at" timestamp,
	"failed_login_count" integer DEFAULT 0,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weather_forecast" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"date" text NOT NULL,
	"temp_max" real,
	"temp_min" real,
	"temp_mean" real,
	"precipitation" real,
	"wind_speed_max" real,
	"humidity" real,
	"weather_code" integer,
	"wind_gust" real,
	"soil_temp" real,
	"fetched_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_weather" ADD COLUMN IF NOT EXISTS "wind_gust" real;--> statement-breakpoint
ALTER TABLE "daily_weather" ADD COLUMN IF NOT EXISTS "soil_temp" real;--> statement-breakpoint
ALTER TABLE "weather_forecast" ADD COLUMN IF NOT EXISTS "wind_gust" real;--> statement-breakpoint
ALTER TABLE "weather_forecast" ADD COLUMN IF NOT EXISTS "soil_temp" real;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "agent_session" ADD CONSTRAINT "agent_session_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "alert" ADD CONSTRAINT "alert_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "daily_weather" ADD CONSTRAINT "daily_weather_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "farming_advice_record" ADD CONSTRAINT "farming_advice_record_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "weather_forecast" ADD CONSTRAINT "weather_forecast_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
