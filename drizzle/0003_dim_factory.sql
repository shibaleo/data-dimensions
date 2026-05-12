-- 0003_dim_factory.sql
-- =============================================================================
-- Adopt the data-warehouse Pattern 2 boilerplate for dim tables:
--   - create_dim_functions(tbl) factory → <tbl>_at(biz_t, tx_t) + tombstone + purge
--   - <tbl>_current views become thin wrappers over <tbl>_at()
--
-- Fixes the as-of-T ORDER BY bug in the original 0001_views.sql:
--   Old: ORDER BY id, revision DESC          ❌ retroactive で誤回答
--   New: ORDER BY id, valid_from DESC, revision DESC  ✅
--
-- 参照: data-warehouse/migrations/013, 016 (このリポでは schema を hardcode で
-- data_dimensions にしている)。
-- =============================================================================

-- 旧 (buggy) view を一旦 drop
DROP VIEW IF EXISTS "data_dimensions"."target_masters_current";
--> statement-breakpoint
DROP VIEW IF EXISTS "data_dimensions"."mappings_current";
--> statement-breakpoint

-- Factory procedure: mints <tbl>_at, <tbl>_tombstone, <tbl>_purge
CREATE OR REPLACE PROCEDURE data_dimensions.create_dim_functions(tbl text)
LANGUAGE plpgsql AS $proc$
BEGIN
  -- <tbl>_at(biz_t, tx_t) — bitemporal as-of-T projection
  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION data_dimensions.%1$I_at(
      biz_t timestamptz DEFAULT now(),
      tx_t  timestamptz DEFAULT now()
    )
    RETURNS SETOF data_dimensions.%1$I
    LANGUAGE SQL STABLE AS $func$
      SELECT DISTINCT ON (id) *
      FROM data_dimensions.%1$I
      WHERE created_at <= tx_t AND valid_from <= biz_t
      ORDER BY id, valid_from DESC, revision DESC;
    $func$;
  $sql$, tbl);

  -- <tbl>_tombstone(id, valid_from) — soft delete (append deleted=true)
  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION data_dimensions.%1$I_tombstone(
      target_id uuid,
      valid_from_t timestamptz DEFAULT now()
    )
    RETURNS void LANGUAGE plpgsql AS $func$
    DECLARE
      next_rev int;
      already_deleted boolean;
    BEGIN
      SELECT revision + 1, deleted
        INTO next_rev, already_deleted
      FROM data_dimensions.%1$I
      WHERE id = target_id
      ORDER BY revision DESC LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'tombstone: id %% not found in data_dimensions.%%',
          target_id, %1$L;
      END IF;
      IF already_deleted THEN
        RAISE NOTICE 'tombstone: id %% already deleted', target_id;
        RETURN;
      END IF;

      INSERT INTO data_dimensions.%1$I
      SELECT (jsonb_populate_record(
        NULL::data_dimensions.%1$I,
        to_jsonb(prev) || jsonb_build_object(
          'revision',   next_rev,
          'created_at', now(),
          'valid_from', valid_from_t,
          'deleted',    true,
          'purged',     false
        )
      )).*
      FROM data_dimensions.%1$I prev
      WHERE prev.id = target_id
      ORDER BY prev.revision DESC LIMIT 1;
    END $func$;
  $sql$, tbl);

  -- <tbl>_purge(id) — final logical purge (append purged=true)
  EXECUTE format($sql$
    CREATE OR REPLACE FUNCTION data_dimensions.%1$I_purge(target_id uuid)
    RETURNS void LANGUAGE plpgsql AS $func$
    DECLARE
      next_rev int;
      already_purged boolean;
    BEGIN
      SELECT revision + 1, purged
        INTO next_rev, already_purged
      FROM data_dimensions.%1$I
      WHERE id = target_id
      ORDER BY revision DESC LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'purge: id %% not found in data_dimensions.%%',
          target_id, %1$L;
      END IF;
      IF already_purged THEN
        RAISE NOTICE 'purge: id %% already purged', target_id;
        RETURN;
      END IF;

      INSERT INTO data_dimensions.%1$I
      SELECT (jsonb_populate_record(
        NULL::data_dimensions.%1$I,
        to_jsonb(prev) || jsonb_build_object(
          'revision',   next_rev,
          'created_at', now(),
          'valid_from', now(),
          'deleted',    true,
          'purged',     true
        )
      )).*
      FROM data_dimensions.%1$I prev
      WHERE prev.id = target_id
      ORDER BY prev.revision DESC LIMIT 1;
    END $func$;
  $sql$, tbl);
END $proc$;
--> statement-breakpoint

-- Generate _at / _tombstone / _purge for the two Pattern 2 tables
CALL data_dimensions.create_dim_functions('target_masters');
--> statement-breakpoint
CALL data_dimensions.create_dim_functions('mappings');
--> statement-breakpoint

-- Thin _current views over _at()
CREATE VIEW "data_dimensions"."target_masters_current" AS
SELECT * FROM data_dimensions.target_masters_at()
WHERE deleted = false AND purged = false;
--> statement-breakpoint

CREATE VIEW "data_dimensions"."mappings_current" AS
SELECT * FROM data_dimensions.mappings_at()
WHERE deleted = false AND purged = false;
--> statement-breakpoint

-- Indexes optimized for the _at() ORDER BY pattern
CREATE INDEX IF NOT EXISTS "target_masters_id_validfrom_revision_desc"
  ON data_dimensions.target_masters (id, valid_from DESC, revision DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mappings_id_validfrom_revision_desc"
  ON data_dimensions.mappings (id, valid_from DESC, revision DESC);
