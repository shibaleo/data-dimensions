-- 004_initial_dim_seed.sql
-- =============================================================================
-- Initial dim seed for data-dimensions, ported from data-warehouse CSVs.
-- See docs/004_seed_migration_from_data_warehouse.md for the mapping rules
-- and rationale.
--
-- Idempotency: uses ON CONFLICT DO NOTHING with deterministic UUIDs so the
-- script can be re-run safely. To "re-seed from scratch", DELETE the rows
-- first (UUIDs are stable).
--
-- UUID convention:
--   11111111-...  → toggl_personal_time service + target_masters + mappings
--   22222222-...  → toggl_social_time
--   33333333-...  → toggl_tag_semantic
--
-- All initial revisions are revision=1, valid_from='2023-11-01T00:00+09:00'.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Services (3 件)
-- =============================================================================

INSERT INTO data_dimensions.services (id, code, name, source_kind, sort_order)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'toggl_personal_time', '個人時間分類',     'toggl', 1),
  ('22222222-2222-2222-2222-222222222222', 'toggl_social_time',   '社会的時間分類',   'toggl', 2),
  ('33333333-3333-3333-3333-333333333333', 'toggl_tag_semantic',  'Toggl タグ意味付け', 'toggl', 3)
ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 2. target_masters
-- =============================================================================

-- ---- 2a. toggl_personal_time: coarse parents (3) -----------------------------

INSERT INTO data_dimensions.target_masters
  (id, revision, service_id, valid_from, name, parent_id, deleted, purged)
VALUES
  ('11111111-1111-1111-2222-000000000001', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Essentials', NULL, false, false),
  ('11111111-1111-1111-2222-000000000002', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Obligation', NULL, false, false),
  ('11111111-1111-1111-2222-000000000003', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Leisure',    NULL, false, false)
ON CONFLICT (id, revision) DO NOTHING;

-- ---- 2b. toggl_personal_time: leaves (10) -----------------------------------

INSERT INTO data_dimensions.target_masters
  (id, revision, service_id, valid_from, name, parent_id, deleted, purged)
VALUES
  -- Essentials
  ('11111111-1111-1111-3333-000000000001', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Vitals',    '11111111-1111-1111-2222-000000000001', false, false),
  ('11111111-1111-1111-3333-000000000002', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Sleep',     '11111111-1111-1111-2222-000000000001', false, false),
  ('11111111-1111-1111-3333-000000000003', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Exercise',  '11111111-1111-1111-2222-000000000001', false, false),
  -- Obligation
  ('11111111-1111-1111-3333-000000000004', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Overhead',  '11111111-1111-1111-2222-000000000002', false, false),
  ('11111111-1111-1111-3333-000000000005', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Work',      '11111111-1111-1111-2222-000000000002', false, false),
  ('11111111-1111-1111-3333-000000000006', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Education', '11111111-1111-1111-2222-000000000002', false, false),
  -- Leisure
  ('11111111-1111-1111-3333-000000000007', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Creative',  '11111111-1111-1111-2222-000000000003', false, false),
  ('11111111-1111-1111-3333-000000000008', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Social',    '11111111-1111-1111-2222-000000000003', false, false),
  ('11111111-1111-1111-3333-000000000009', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Meta',      '11111111-1111-1111-2222-000000000003', false, false),
  ('11111111-1111-1111-3333-00000000000a', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'Pleasure',  '11111111-1111-1111-2222-000000000003', false, false)
ON CONFLICT (id, revision) DO NOTHING;

-- ---- 2c. toggl_social_time: flat (3) ----------------------------------------

INSERT INTO data_dimensions.target_masters
  (id, revision, service_id, valid_from, name, parent_id, deleted, purged)
VALUES
  ('22222222-2222-2222-3333-000000000001', 1, '22222222-2222-2222-2222-222222222222',
   '2023-11-01T00:00+09:00', 'PRIMARY',   NULL, false, false),
  ('22222222-2222-2222-3333-000000000002', 1, '22222222-2222-2222-2222-222222222222',
   '2023-11-01T00:00+09:00', 'SECONDARY', NULL, false, false),
  ('22222222-2222-2222-3333-000000000003', 1, '22222222-2222-2222-2222-222222222222',
   '2023-11-01T00:00+09:00', 'TERTIARY',  NULL, false, false)
ON CONFLICT (id, revision) DO NOTHING;

-- ---- 2d. toggl_tag_semantic: input/output (2) -------------------------------

INSERT INTO data_dimensions.target_masters
  (id, revision, service_id, valid_from, name, parent_id, deleted, purged)
VALUES
  ('33333333-3333-3333-3333-000000000001', 1, '33333333-3333-3333-3333-333333333333',
   '2023-11-01T00:00+09:00', 'input',  NULL, false, false),
  ('33333333-3333-3333-3333-000000000002', 1, '33333333-3333-3333-3333-333333333333',
   '2023-11-01T00:00+09:00', 'output', NULL, false, false)
ON CONFLICT (id, revision) DO NOTHING;


-- =============================================================================
-- 3. mappings
-- =============================================================================

-- ---- 3a. toggl_personal_time: toggl_color → personal target (10) ------------
-- Skipped 4 NULL-mapped colors from seed_toggl_color_to_personal.csv:
--   #06a893 Teal, #525266 Gray, #566614 Olive, #bf7000 Brown

INSERT INTO data_dimensions.mappings
  (id, revision, service_id, valid_from, source_type, source_value, target_id, deleted, purged)
VALUES
  ('11111111-1111-1111-4444-000000000001', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#0b83d9',
   '11111111-1111-1111-3333-000000000004', false, false),  -- Blue   → Overhead
  ('11111111-1111-1111-4444-000000000002', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#2da608',
   '11111111-1111-1111-3333-000000000006', false, false),  -- Green  → Education
  ('11111111-1111-1111-4444-000000000003', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#465bb3',
   '11111111-1111-1111-3333-000000000005', false, false),  -- Indigo → Work
  ('11111111-1111-1111-4444-000000000004', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#990099',
   '11111111-1111-1111-3333-00000000000a', false, false),  -- Magenta→ Pleasure
  ('11111111-1111-1111-4444-000000000005', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#9e5bd9',
   '11111111-1111-1111-3333-000000000009', false, false),  -- Purple → Meta
  ('11111111-1111-1111-4444-000000000006', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#c7af14',
   '11111111-1111-1111-3333-000000000003', false, false),  -- Yellow → Exercise
  ('11111111-1111-1111-4444-000000000007', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#c9806b',
   '11111111-1111-1111-3333-000000000001', false, false),  -- Peach  → Vitals
  ('11111111-1111-1111-4444-000000000008', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#d92b2b',
   '11111111-1111-1111-3333-000000000007', false, false),  -- Red    → Creative
  ('11111111-1111-1111-4444-000000000009', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#d94182',
   '11111111-1111-1111-3333-000000000008', false, false),  -- Pink   → Social
  ('11111111-1111-1111-4444-00000000000a', 1, '11111111-1111-1111-1111-111111111111',
   '2023-11-01T00:00+09:00', 'toggl_color', '#e36a00',
   '11111111-1111-1111-3333-000000000002', false, false)   -- Orange → Sleep
ON CONFLICT (id, revision) DO NOTHING;

-- ---- 3b. toggl_social_time: toggl_client → social target (3) ----------------

INSERT INTO data_dimensions.mappings
  (id, revision, service_id, valid_from, source_type, source_value, target_id, deleted, purged)
VALUES
  ('22222222-2222-2222-4444-000000000001', 1, '22222222-2222-2222-2222-222222222222',
   '2023-11-01T00:00+09:00', 'toggl_client', 'PRIMARY',
   '22222222-2222-2222-3333-000000000001', false, false),
  ('22222222-2222-2222-4444-000000000002', 1, '22222222-2222-2222-2222-222222222222',
   '2023-11-01T00:00+09:00', 'toggl_client', 'SECONDARY',
   '22222222-2222-2222-3333-000000000002', false, false),
  ('22222222-2222-2222-4444-000000000003', 1, '22222222-2222-2222-2222-222222222222',
   '2023-11-01T00:00+09:00', 'toggl_client', 'TERTIARY',
   '22222222-2222-2222-3333-000000000003', false, false)
ON CONFLICT (id, revision) DO NOTHING;

-- ---- 3c. toggl_tag_semantic: toggl_tag → input/output target (2) ------------

INSERT INTO data_dimensions.mappings
  (id, revision, service_id, valid_from, source_type, source_value, target_id, deleted, purged)
VALUES
  ('33333333-3333-3333-4444-000000000001', 1, '33333333-3333-3333-3333-333333333333',
   '2023-11-01T00:00+09:00', 'toggl_tag', 'input',
   '33333333-3333-3333-3333-000000000001', false, false),
  ('33333333-3333-3333-4444-000000000002', 1, '33333333-3333-3333-3333-333333333333',
   '2023-11-01T00:00+09:00', 'toggl_tag', 'output',
   '33333333-3333-3333-3333-000000000002', false, false)
ON CONFLICT (id, revision) DO NOTHING;

COMMIT;


-- =============================================================================
-- Verification queries (run after COMMIT)
-- =============================================================================
--
-- -- Services: 3 件
-- SELECT code, name, source_kind FROM data_dimensions.services ORDER BY sort_order;
--
-- -- target_masters per service:
-- --   toggl_personal_time: 13 (coarse 3 + leaves 10)
-- --   toggl_social_time:    3
-- --   toggl_tag_semantic:   2
-- SELECT s.code, count(*) AS targets
-- FROM data_dimensions.target_masters tm
-- JOIN data_dimensions.services s ON s.id = tm.service_id
-- WHERE tm.deleted = false AND tm.purged = false
-- GROUP BY s.code ORDER BY s.code;
--
-- -- mappings per (service, source_type):
-- --   toggl_personal_time / toggl_color:  10
-- --   toggl_social_time   / toggl_client:  3
-- --   toggl_tag_semantic  / toggl_tag:     2
-- SELECT s.code, m.source_type, count(*) AS mappings
-- FROM data_dimensions.mappings m
-- JOIN data_dimensions.services s ON s.id = m.service_id
-- WHERE m.deleted = false AND m.purged = false
-- GROUP BY s.code, m.source_type ORDER BY s.code, m.source_type;
--
-- -- _current views should reflect the same counts
-- SELECT count(*) FROM data_dimensions.target_masters_current;  -- 18
-- SELECT count(*) FROM data_dimensions.mappings_current;        -- 15
-- =============================================================================
