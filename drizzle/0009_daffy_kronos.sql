DROP MATERIALIZED VIEW IF EXISTS field_daily_cumulative CASCADE;
--> statement-breakpoint
CREATE TABLE "field_daily_cumulative" (
	"field_id" integer NOT NULL,
	"date" text NOT NULL,
	"year" integer NOT NULL,
	"doy" integer NOT NULL,
	"gdd_cumulative" real DEFAULT 0 NOT NULL,
	"precip_cumulative" real DEFAULT 0 NOT NULL,
	CONSTRAINT "field_daily_cumulative_field_id_date_pk" PRIMARY KEY("field_id","date")
);
--> statement-breakpoint
ALTER TABLE "field_daily_cumulative" ADD CONSTRAINT "field_daily_cumulative_field_id_field_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."field"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO field_daily_cumulative (field_id, date, year, doy, gdd_cumulative, precip_cumulative)
SELECT
  field_id,
  date,
  EXTRACT(YEAR FROM date::date)::int AS year,
  EXTRACT(DOY FROM date::date)::int AS doy,
  SUM(GREATEST(0, (COALESCE(temp_max, 0) + COALESCE(temp_min, 0)) / 2.0 - 4))
    OVER (PARTITION BY field_id, EXTRACT(YEAR FROM date::date)::int ORDER BY date)::real AS gdd_cumulative,
  SUM(COALESCE(precipitation, 0))
    OVER (PARTITION BY field_id, EXTRACT(YEAR FROM date::date)::int ORDER BY date)::real AS precip_cumulative
FROM daily_weather
ORDER BY field_id, date
ON CONFLICT (field_id, date) DO NOTHING;