CREATE TABLE "township_weather" (
	"admin_code" text NOT NULL,
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
	"source" text DEFAULT 'openmeteo-era5' NOT NULL,
	"fetched_at" timestamp DEFAULT now(),
	CONSTRAINT "township_weather_admin_code_date_pk" PRIMARY KEY("admin_code","date")
);
--> statement-breakpoint
CREATE INDEX "idx_township_weather_admin_code" ON "township_weather" USING btree ("admin_code");