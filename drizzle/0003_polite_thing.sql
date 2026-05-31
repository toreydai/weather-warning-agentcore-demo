CREATE TABLE IF NOT EXISTS "kb_document" (
	"id" serial PRIMARY KEY NOT NULL,
	"s3_key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now(),
	"deleted_at" timestamp,
	"last_ingestion_job_id" text,
	CONSTRAINT "kb_document_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kb_document_s3_key" ON "kb_document" USING btree ("s3_key");
