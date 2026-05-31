CREATE INDEX IF NOT EXISTS "idx_agent_message_session_created" ON "agent_message" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cron_run_name_started" ON "cron_run" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_token_user" ON "refresh_token" USING btree ("user_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "daily_weather" ADD CONSTRAINT "daily_weather_field_id_date_unique" UNIQUE("field_id","date");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "eval_case" ADD CONSTRAINT "eval_case_input_unique" UNIQUE("input");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "farming_advice_record" ADD CONSTRAINT "farming_advice_record_field_id_week_start_unique" UNIQUE("field_id","week_start");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "weather_forecast" ADD CONSTRAINT "weather_forecast_field_id_date_unique" UNIQUE("field_id","date");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
