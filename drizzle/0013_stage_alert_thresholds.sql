ALTER TABLE "alert_threshold" DROP CONSTRAINT IF EXISTS "alert_threshold_alert_type_unique";--> statement-breakpoint
ALTER TABLE "alert_threshold" ADD COLUMN IF NOT EXISTS "stage" text;--> statement-breakpoint
ALTER TABLE "alert" ADD COLUMN IF NOT EXISTS "stage" text;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_stage_check" CHECK (
  "stage" IS NULL OR "stage" IN ('preplant','seedling','vegetative','budding','flowering','bulking','maturation','harvested')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_threshold_alert_type_stage_unique"
  ON "alert_threshold" ("alert_type", COALESCE("stage", '__default__'));--> statement-breakpoint
INSERT INTO "alert_threshold" ("alert_type", "stage", "label", "yellow_condition", "orange_condition", "red_condition") VALUES
  ('frost', 'seedling', '霜冻', '{"temp_min_lte":3}', '{"temp_min_lte":1}', '{"temp_min_lte":-1}'),
  ('frost', 'vegetative', '霜冻', '{"temp_min_lte":1}', '{"temp_min_lte":0}', '{"temp_min_lte":-2}'),
  ('frost', 'budding', '霜冻', '{"temp_min_lte":1}', '{"temp_min_lte":0}', '{"temp_min_lte":-2}'),
  ('frost', 'flowering', '霜冻', '{"temp_min_lte":2}', '{"temp_min_lte":0}', '{"temp_min_lte":-2}'),
  ('frost', 'bulking', '霜冻', '{"match_mode":"all","temp_min_lte":2,"gdd_gte":700}', '{"match_mode":"all","temp_min_lte":0,"gdd_gte":700}', '{"match_mode":"all","temp_min_lte":-2,"gdd_gte":700}'),
  ('heavy_rain', 'seedling', '暴雨', '{"precip_gte":30}', '{"precip_gte":50}', '{"precip_gte":80}'),
  ('heavy_rain', 'vegetative', '暴雨', '{"precip_gte":25}', '{"precip_gte":40}', '{"precip_gte":70}'),
  ('heavy_rain', 'flowering', '暴雨', '{"precip_gte":20}', '{"precip_gte":35}', '{"precip_gte":60}'),
  ('heavy_rain', 'bulking', '暴雨', '{"precip_gte":18}', '{"precip_gte":30}', '{"precip_gte":50}'),
  ('heavy_rain', 'maturation', '暴雨', '{"precip_gte":15}', '{"precip_gte":25}', '{"precip_gte":40}'),
  ('heat', 'seedling', '高温', '{"temp_max_gte":32}', '{"temp_max_gte":35}', '{"temp_max_gte":38}'),
  ('heat', 'vegetative', '高温', '{"temp_max_gte":33}', '{"temp_max_gte":36}', '{"temp_max_gte":39}'),
  ('heat', 'flowering', '高温', '{"temp_max_gte":30}', '{"temp_max_gte":33}', '{"temp_max_gte":36}'),
  ('heat', 'bulking', '高温', '{"match_mode":"all","temp_max_gte":30,"gdd_gte":700}', '{"match_mode":"all","temp_max_gte":33,"gdd_gte":700}', '{"match_mode":"all","temp_max_gte":36,"gdd_gte":700}'),
  ('heat', 'maturation', '高温', '{"temp_max_gte":32}', '{"temp_max_gte":35}', '{"temp_max_gte":38}')
ON CONFLICT DO NOTHING;
