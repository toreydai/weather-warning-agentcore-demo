CREATE TABLE "zone" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope_type" text DEFAULT 'fields' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "zone_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"zone_id" integer NOT NULL,
	"member_type" text NOT NULL,
	"field_id" integer,
	"admin_code" text,
	"township" text,
	"county" text,
	"latitude" real,
	"longitude" real
);
--> statement-breakpoint
ALTER TABLE "zone" ADD CONSTRAINT "zone_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_member" ADD CONSTRAINT "zone_member_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_member" ADD CONSTRAINT "zone_member_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_zone_member_zone_id" ON "zone_member" USING btree ("zone_id");