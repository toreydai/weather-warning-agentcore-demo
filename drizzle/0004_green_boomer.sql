-- Deduplicate existing rows (keep the latest id per region+month)
DELETE FROM "historical_monthly" WHERE id NOT IN (SELECT MAX(id) FROM "historical_monthly" GROUP BY region, month);
-- Add unique constraint
ALTER TABLE "historical_monthly" ADD CONSTRAINT "historical_monthly_region_month_unique" UNIQUE("region","month");
