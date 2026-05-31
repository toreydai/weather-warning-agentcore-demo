CREATE TABLE "backfill_progress" (
	"grid_key" text PRIMARY KEY NOT NULL,
	"last_date" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "daily_weather" ADD COLUMN "source" text DEFAULT 'openmeteo-daily' NOT NULL;
