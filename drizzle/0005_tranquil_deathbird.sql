CREATE TABLE "rate_limit_bucket" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_rate_limit_bucket_reset_at" ON "rate_limit_bucket" USING btree ("reset_at");