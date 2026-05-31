ALTER TABLE "alert_threshold" ADD COLUMN IF NOT EXISTS "reference_source" text;--> statement-breakpoint
ALTER TABLE "alert_threshold" ADD COLUMN IF NOT EXISTS "reference_note" text;--> statement-breakpoint

-- Replace the engineering draft stage-specific values from 0013 with
-- source-traceable default thresholds. Public standards found so far classify
-- potato hazards by disaster type, not by every growth stage, so stage-specific
-- numeric overrides are removed until agronomy review supplies local values.
DELETE FROM "alert_threshold"
WHERE "alert_type" IN ('frost', 'heavy_rain', 'heat') AND "stage" IS NOT NULL;--> statement-breakpoint

INSERT INTO "alert_threshold" ("alert_type", "stage", "label", "yellow_condition", "orange_condition", "red_condition", "reference_source", "reference_note") VALUES
  ('frost', NULL, '霜冻',
   '{"match_mode":"all","temp_min_lte":5,"temp_min_lte_days_gte":3}',
   '{"match_mode":"all","temp_min_lte":2,"temp_min_lte_days_gte":4}',
   '{"match_mode":"all","temp_min_lte":1,"temp_min_lte_days_gte":5}',
   'DB15/T 4315-2026 表2 霜冻',
   '按持续日数下限折算为连续预报天数；适用于出苗后至收获前'),
  ('heavy_rain', NULL, '洪涝',
   '{"precip_3d_gte":200}',
   '{"precip_3d_gte":250}',
   '{"precip_3d_gte":300}',
   'DB15/T 4315-2026 表2 洪涝',
   '3日累计降水量；适用于全生育期，块茎形成至成熟期需重点关注'),
  ('strong_wind', NULL, '风灾',
   '{"wind_gte":50}',
   '{"wind_gte":62}',
   '{"wind_gte":103}',
   'DB15/T 4315-2026 表2 风灾',
   '按日最大风力7级/8级/11级近似换算为km/h'),
  ('dry_hot_wind', NULL, '干热风',
   '{"match_mode":"all","temp_max_gte":30,"humidity_lte":30,"wind_gte":10.8}',
   '{"match_mode":"all","temp_max_gte":33,"humidity_lte":25,"wind_gte":14.4}',
   '{"temp_max_gte":999}',
   'DB15/T 4315-2026 表2 干热风',
   '风速由m/s换算为km/h；标准仅轻度/重度两级，红色禁用；适用于发棵期至成熟期'),
  ('heat', NULL, '高温',
   '{"temp_max_gte":30}',
   '{"temp_max_gte":999}',
   '{"temp_max_gte":999}',
   'FAO Crop Information: Potato',
   'FAO指出块茎生长在>30℃明显受抑制；公开资料未给三色分级，橙/红禁用；适用于开花结薯至块茎膨大期')
ON CONFLICT ("alert_type", (COALESCE("stage", '__default__'))) DO UPDATE SET
  "label" = EXCLUDED."label",
  "yellow_condition" = EXCLUDED."yellow_condition",
  "orange_condition" = EXCLUDED."orange_condition",
  "red_condition" = EXCLUDED."red_condition",
  "reference_source" = EXCLUDED."reference_source",
  "reference_note" = EXCLUDED."reference_note";
