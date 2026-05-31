ALTER TABLE "field" ADD COLUMN "harvest_date" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN "harvest_started_at" text;--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN "harvest_type" text DEFAULT 'normal';--> statement-breakpoint
ALTER TABLE "field" ADD COLUMN "notes" text;