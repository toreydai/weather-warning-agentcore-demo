CREATE TABLE "api_call_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"method" text DEFAULT 'GET' NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_hash" text NOT NULL,
	"name" text NOT NULL,
	"scopes" text DEFAULT '["read"]' NOT NULL,
	"field_ids" text,
	"zone_ids" text,
	"rate_limit" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_call_log_client_created" ON "api_call_log" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_oauth_token_client" ON "oauth_token" USING btree ("client_id");