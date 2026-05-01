-- bitemporal の現在有効な行を引きやすくするための view
-- (drizzle はテーブルしか管理しないので手書きの custom migration)

CREATE OR REPLACE VIEW "data_dimensions"."target_masters_current" AS
SELECT * FROM (
  SELECT DISTINCT ON (id) *
  FROM "data_dimensions"."target_masters"
  ORDER BY id, revision DESC
) t
WHERE deleted = false AND purged = false;

--> statement-breakpoint

CREATE OR REPLACE VIEW "data_dimensions"."mappings_current" AS
SELECT * FROM (
  SELECT DISTINCT ON (id) *
  FROM "data_dimensions"."mappings"
  ORDER BY id, revision DESC
) t
WHERE deleted = false AND purged = false;
