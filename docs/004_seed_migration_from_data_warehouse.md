# data-warehouse seed → data-dimensions 移植

作成日: 2026-05-12
ステータス: SQL 用意済み（未投入）

---

## 背景

`data-warehouse` の `apps/transform/seeds/` 配下に dim 役のハードコード CSV が複数ある。これらは data-dimensions の責務範囲（classification / mapping）なので、本リポジトリの `services` / `target_masters` / `mappings` に移植する。

移植が完了したら data-warehouse 側の CSV は deprecate（dbt の dim_* / fct_* / rpt_* 廃止と同期）。

---

## 移植対象と非対象

### 移植対象（dim 役）

| CSV (data-warehouse) | data-dimensions schema での位置 |
|---|---|
| `seed_category_time_personal.csv` (10 行) | service=`toggl_personal_time` の **target_masters**（personal 階層） |
| `seed_category_time_personal_coarse.csv` (3 行) | 同 service の **target_masters**（coarse 親、`parent_id IS NULL`） |
| `seed_category_time_social.csv` (3 行) | service=`toggl_social_time` の **target_masters** |
| `seed_toggl_color_to_personal.csv` (14 行) | service=`toggl_personal_time` の **mappings**（source_type=`toggl_color`） |
| `seed_toggl_client_to_social.csv` (3 行) | service=`toggl_social_time` の **mappings**（source_type=`toggl_client`） |
| `seed_tag_definitions.csv` (2 行) | service=`toggl_tag_semantic` の **target_masters**（input/output）+ identity mapping |

### 非対象（data-warehouse に残す）

| CSV | 残置理由 |
|---|---|
| `seed_jp_holidays.csv` | カレンダーデータ（dim ではない） |
| `seed_project_definitions.csv` | description / examples 列が data-dimensions の schema に収まらない。enrichment metadata。data-warehouse の dim_time_projects で吸収するか、別 metadata store で扱う |
| `mst_time_targets.csv` / `mst_time_target_groups.csv` | 「目標」概念。dim とは別軸。将来的に goals アプリで扱う |

---

## マッピング規則

### 1. Services

3 つの service を作成：

| code | name | source_kind | 役割 |
|---|---|---|---|
| `toggl_personal_time` | 個人時間分類 | `toggl` | Toggl の color から personal category（Vitals/Sleep/Work/...）へ |
| `toggl_social_time` | 社会的時間分類 | `toggl` | Toggl の client から social category（PRIMARY/SECONDARY/TERTIARY）へ |
| `toggl_tag_semantic` | Toggl タグ意味付け | `toggl` | input / output の active recall vs passive input 軸 |

source_kind が同じ `toggl` でも、**異なる分類軸は別 service** にする（軸が orthogonal）。

### 2. Target masters

#### service: `toggl_personal_time`（10 + 3 = 13 行）

```
階層:
  Essentials (coarse, parent_id=NULL)
    ├─ Vitals
    ├─ Sleep
    └─ Exercise
  Obligation (coarse)
    ├─ Overhead
    ├─ Work
    └─ Education
  Leisure (coarse)
    ├─ Creative
    ├─ Social
    ├─ Meta
    └─ Pleasure
```

`parent_id` で 2 階層構造を表現（data-dimensions schema は `parent_id uuid` で再帰可）。

#### service: `toggl_social_time`（3 行、flat）

```
PRIMARY    (一次活動: 生理的必須)
SECONDARY  (二次活動: 義務的)
TERTIARY   (三次活動: 自由時間)
```

#### service: `toggl_tag_semantic`（2 行）

```
input  (パッシブインプット: 読む・聞く・受講)
output (アクティブリコール: 解く・書き出す・思い出す)
```

### 3. Mappings

#### service: `toggl_personal_time`（color → personal、14 行のうち 9 行が有効、5 行は NULL マッピング）

`seed_toggl_color_to_personal.csv` の `time_category_personal` が空欄の行（Teal, Gray, Olive, Brown）は **mapping を作らない**（未割り当て color）。空欄ではない 9 + 1 = 10 行を mapping 化。

実際の行（target name で参照）：
```
#0b83d9 Blue     → Overhead
#2da608 Green    → Education
#465bb3 Indigo   → Work
#990099 Magenta  → Pleasure
#9e5bd9 Purple   → Meta
#c7af14 Yellow   → Exercise
#c9806b Peach    → Vitals
#d92b2b Red      → Creative
#d94182 Pink     → Social
#e36a00 Orange   → Sleep
```

10 行（NULL 5 行を除く）。

#### service: `toggl_social_time`（client → social、3 行）

```
PRIMARY   → PRIMARY    target
SECONDARY → SECONDARY  target
TERTIARY  → TERTIARY   target
```

恒等的だが、将来 client 名と target 名が乖離する可能性を考慮して mapping 化しておく。

#### service: `toggl_tag_semantic`（tag → semantic、2 行）

```
input  → input  target
output → output target
```

これも恒等的。target 名が変わる可能性に備えた間接化。

---

## UUID 採番方針

seed の再現性を担保するため、**deterministic UUID を hardcoded** する：

| プレフィックス | 用途 |
|---|---|
| `11111111-1111-1111-...` | service `toggl_personal_time` 関連 |
| `22222222-2222-2222-...` | service `toggl_social_time` 関連 |
| `33333333-3333-3333-...` | service `toggl_tag_semantic` 関連 |

第 4 セグメントで内訳：
- `xxxx-xxxx-xxxx-2222-yyyyyyyyyyyy` = coarse parent target_master
- `xxxx-xxxx-xxxx-3333-yyyyyyyyyyyy` = leaf target_master
- `xxxx-xxxx-xxxx-4444-yyyyyyyyyyyy` = mapping

通常運用での新規 entity は `gen_random_uuid()` で採番。seed UUID とは衝突しない（version 4 と異なるパターン）。

---

## valid_from と revision

すべての初期投入は：
- `revision = 1`
- `valid_from = '2023-11-01T00:00+09:00'`（DWH の最古 Toggl データ 2023-11-16 より前）
- `created_at = now()`（投入時刻）

これにより「2023-11 以降のすべての時間データが、この classification の下で評価される」状態が成立。

将来カテゴリの **rename / 追加** が必要になったら、新 `revision` を append（bitemporal）。

---

## 適用手順

### Step 1: data-dimensions が指す DB を確認

`.dev.vars` の `DATABASE_URL` が Supabase か Neon（移行済み）かで投入先が変わる。**現在の primary DB に投入**。

### Step 2: schema が apply されていることを確認

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'data_dimensions' 
  AND table_name IN ('services', 'target_masters', 'mappings');
-- 3 行返ることを確認
```

### Step 3: seed SQL を実行

```bash
psql <connection_string> -f docs/seed/004_initial_dim_seed.sql
```

### Step 4: 検証

```sql
-- service 3 件
SELECT code, name, source_kind FROM data_dimensions.services ORDER BY code;

-- target_masters 計 18 件（personal 10 + coarse 3 + social 3 + tag 2）
SELECT s.code, count(*) as targets
FROM data_dimensions.target_masters tm
JOIN data_dimensions.services s ON s.id = tm.service_id
WHERE tm.deleted = false
GROUP BY s.code ORDER BY s.code;

-- mappings 計 15 件（color→personal 10 + client→social 3 + tag→semantic 2）
SELECT s.code, m.source_type, count(*) as mappings
FROM data_dimensions.mappings m
JOIN data_dimensions.services s ON s.id = m.service_id
WHERE m.deleted = false
GROUP BY s.code, m.source_type ORDER BY s.code, m.source_type;
```

期待値：
- services: 3 件
- target_masters: 18 件（10 + 3 + 3 + 2）
- mappings: 15 件（10 + 3 + 2）

### Step 5: アプリで動作確認

`/services` 画面で 3 service が見える、各 service のマッピングエディタで target / mapping が表示される。

---

## 移植後の data-warehouse 側

### deprecate するもの

| 対象 | アクション |
|---|---|
| `seed_category_time_personal.csv` | dbt seed として残置だが「廃止予定」コメント追加 |
| `seed_category_time_personal_coarse.csv` | 同上 |
| `seed_category_time_social.csv` | 同上 |
| `seed_toggl_color_to_personal.csv` | 同上 |
| `seed_toggl_client_to_social.csv` | 同上 |
| `seed_tag_definitions.csv` | 同上 |
| `dim_category_time_personal` 等 dbt view | data-dimensions HTTP API 公開 (Phase 3) 後に DROP |
| `fct_toggl_time_entries`, `rpt_*` | 同上、または各 consumer 自前 JOIN へ移行 |

→ data-dimensions Phase 3（HTTP API 公開）完了が、上記 deprecate の前提条件。それまでは CSV / dbt 両方の運用が継続。

### 残置するもの

- `seed_jp_holidays.csv` — calendar、dim ではない
- `seed_project_definitions.csv` — description metadata、data-dimensions の現 schema には収まらない
- `mst_time_target_groups.csv`, `mst_time_targets.csv` — 目標管理（別 domain）

---

## 関連ドキュメント

- `docs/001_implementation_plan.md` — Phase 別計画
- `docs/002_handover_from_data_warehouse.md` — 設計知見の総まとめ
- `docs/003_supabase_to_neon_migration.md` — DB 物理移行手順
- `docs/seed/004_initial_dim_seed.sql` — 本ドキュメントに対応する SQL
- `data-warehouse/apps/transform/seeds/` — 移植元 CSV 群
