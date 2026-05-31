-- Remove duplicate alert_threshold rows, keep latest id per alert_type
DELETE FROM "alert_threshold" WHERE id NOT IN (
  SELECT MAX(id) FROM "alert_threshold" GROUP BY alert_type
);
--> statement-breakpoint
ALTER TABLE "alert_threshold" ADD COLUMN "label" text;
--> statement-breakpoint
UPDATE "alert_threshold" SET label = CASE alert_type
  WHEN 'frost'        THEN '霜冻'
  WHEN 'heavy_rain'   THEN '暴雨'
  WHEN 'strong_wind'  THEN '大风'
  WHEN 'strong_gust'  THEN '阵风'
  WHEN 'heat'         THEN '高温'
  WHEN 'drought'      THEN '干旱'
  ELSE alert_type
END WHERE label IS NULL;
--> statement-breakpoint
ALTER TABLE "alert_threshold" ALTER COLUMN "label" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "alert_threshold" ADD CONSTRAINT "alert_threshold_alert_type_unique" UNIQUE("alert_type");
