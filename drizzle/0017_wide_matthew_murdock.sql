CREATE TABLE "zone_alert" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"date" text NOT NULL,
	"alert_type" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"affected_members" text,
	"max_value" real,
	"coverage_pct" real,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zone_alert_threshold" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_type" text NOT NULL,
	"label" text NOT NULL,
	"category" text DEFAULT 'intensity' NOT NULL,
	"yellow_condition" text NOT NULL,
	"orange_condition" text NOT NULL,
	"red_condition" text NOT NULL,
	"min_members_for_coverage" integer DEFAULT 3 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zone_alert" ADD CONSTRAINT "zone_alert_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_zone_alert_zone_date" ON "zone_alert" USING btree ("zone_id","date");