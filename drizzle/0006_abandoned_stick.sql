CREATE TABLE "weather_forecast_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"forecast_run_at" timestamp NOT NULL,
	"forecast_date" text NOT NULL,
	"lead_days" integer NOT NULL,
	"temp_max" real,
	"temp_min" real,
	"temp_mean" real,
	"precipitation" real,
	"wind_speed_max" real,
	"humidity" real,
	"weather_code" integer,
	"wind_gust" real,
	"soil_temp" real,
	"provider" text DEFAULT 'tjweather' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "weather_forecast_history_field_run_date_unique" UNIQUE("field_id","forecast_run_at","forecast_date")
);
--> statement-breakpoint
ALTER TABLE "weather_forecast_history" ADD CONSTRAINT "weather_forecast_history_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_weather_forecast_history_field_date" ON "weather_forecast_history" USING btree ("field_id","forecast_date");--> statement-breakpoint
CREATE INDEX "idx_weather_forecast_history_run" ON "weather_forecast_history" USING btree ("forecast_run_at");