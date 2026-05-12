# Supabase → Neon 移行手順

作成日: 2026-05-12
ステータス: 計画段階（未実施）

---

## 目的と効果

data-dimensions の primary DB を Supabase から Neon (`data-warehouse` project) に移す。**狙いは「cross-DB アクセスの解消 + 1 DB 統合運用」**。

| 効果 | 値 |
|---|---|
| `dimensions → raw` の HTTP/PostgreSQL 往復解消 | 同 DB 内 cross-schema JOIN で済む |
| 接続管理（CF Worker） | 1 接続で完結（neon.ts と db.ts の二重管理を削除可） |
| backup / snapshot / 監視 | 1 系統に統合 |
| データの責務分離 | schema 名（`data_dimensions`）で維持 |

**重要：移行は DB の物理位置だけの話**。data-warehouse から見た「data-dimensions は外部 API で raw を提供する service」という関係は不変。HTTP API 経由の取り込みパターンは維持される（cross-schema JOIN は内部最適化のみ）。

---

## 移行 scope と非 scope

### scope
- [ ] Supabase `data_dimensions` schema を Neon に複製
- [ ] data-dimensions の `DATABASE_URL` を Neon に向ける
- [ ] Drizzle migration を Neon で適用（既存 schema を再現）
- [ ] 既存データの移行（services / target_masters / mappings / user / api_key / 並べ替え系）
- [ ] `.env` / `.dev.vars` / `wrangler.toml` の secrets 更新
- [ ] 動作確認（CRUD smoke test + bitemporal 検証）

### 非 scope（別タスク）
- ❌ schema 構造の変更（テーブル定義は変えない、純粋に DB 引っ越し）
- ❌ Pattern 2 ロジックの修正
- ❌ data-warehouse 側の dbt 拡張（dim を JOIN するかどうかは別議論）
- ❌ HTTP API（Phase 3）の前倒し実装

---

## Neon project 構成

既存の `data-warehouse` Neon project に **schema を追加**する形が最小コスト。

```
Neon project: data-warehouse
└── neondb database
    ├── data_warehouse_v2 schema   ← raw（既存）
    ├── data_dimensions    schema  ← 本移行で追加
    ├── data_presentation  schema  ← dbt fct/rpt（既存、将来 deprecate 予定）
    └── public schema
        └── dwh_config / dwh_cfg() （既存、cross-schema accessor）
```

新 project を作る必要なし。**同 DB 内に schema を 1 つ足すだけ**。

---

## 事前準備

### 1. Neon connection 情報の取得

data-warehouse の `.env` ですでに使っている DATABASE_URL を流用するか、専用 user / role を切る：

| 案 | 評価 |
|---|---|
| 既存 `neondb_owner` を流用 | 簡単。当面 1-user 運用なら OK |
| 専用 `data_dimensions_app` role を発行 | 将来的に好ましい。schema_level の GRANT が綺麗 |

→ **当面は既存 role 流用**、本格運用時に role 分離検討。

### 2. Supabase 側の既存データ snapshot

念のため Supabase から `pg_dump` で全データを取得：

```bash
pg_dump \
  --host=<supabase_host> \
  --port=5432 \
  --username=<supabase_user> \
  --schema=data_dimensions \
  --data-only \
  --column-inserts \
  --file=data_dimensions_snapshot_$(date +%Y%m%d).sql \
  <supabase_db>
```

`--data-only` でデータだけ、`--column-inserts` で INSERT 文として出力（schema 互換性確認しやすい）。

---

## 移行ステップ

### Step 1: Neon に schema を作成

Drizzle migration を Neon で apply。本リポジトリの `drizzle/0000_polite_the_twelve.sql` 等が `CREATE SCHEMA "data_dimensions"` から始まっているので、そのまま流用可能。

```bash
# .env / .dev.vars の DATABASE_URL を Neon に一時的に切り替える、または別途 NEON_TARGET_URL を用意
DATABASE_URL="postgresql://neondb_owner:<password>@ep-rapid-wind-a147le6e.ap-southeast-1.aws.neon.tech/neondb?sslmode=require" \
  pnpm drizzle-kit push
```

または migration ファイルを `psql` で直接適用：

```bash
PGPASSWORD=<neon_password> psql \
  -h ep-rapid-wind-a147le6e.ap-southeast-1.aws.neon.tech \
  -U neondb_owner \
  -d neondb \
  --set=sslmode=require \
  -f drizzle/0000_polite_the_twelve.sql

PGPASSWORD=<...> psql ... -f drizzle/0001_views.sql
PGPASSWORD=<...> psql ... -f drizzle/0002_mature_vampiro.sql
```

確認：
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'data_dimensions' ORDER BY table_name;
-- 期待: api_key, mappings, services, source_order, target_master_order, 
--      target_masters, target_masters_current view, mappings_current view, user
```

### Step 2: Supabase からデータを export

Step 1 で取った snapshot（`--data-only`）を Neon に流し込む準備をする。

注意点：
- `services.id`, `target_masters.id`, `mappings.id` 等の UUID は **そのまま維持**（FK 整合のため）
- timestamp 列は timezone offset 付きで export されているはず（DEFAULT now() の関係で）→ Neon でもそのまま動く
- `gen_random_uuid()` の DEFAULT が動くのは新規 INSERT 時のみ、export 時の既存 UUID は明示値で INSERT される

### Step 3: Neon にデータを import

```bash
PGPASSWORD=<neon_password> psql \
  -h ep-rapid-wind-a147le6e.ap-southeast-1.aws.neon.tech \
  -U neondb_owner \
  -d neondb \
  --set=sslmode=require \
  -f data_dimensions_snapshot_<date>.sql
```

検証：
```sql
SELECT 'services',       count(*) FROM data_dimensions.services
UNION ALL SELECT 'target_masters', count(*) FROM data_dimensions.target_masters
UNION ALL SELECT 'mappings',       count(*) FROM data_dimensions.mappings
UNION ALL SELECT 'user',           count(*) FROM data_dimensions.user
UNION ALL SELECT 'api_key',        count(*) FROM data_dimensions.api_key;
```

Supabase 側の同じクエリと突合し、行数完全一致を確認。

### Step 4: bitemporal の動作確認

新環境で `_current` view が機能するか：

```sql
-- target_masters_current の出力
SELECT id, revision, name, valid_from, deleted, purged 
FROM data_dimensions.target_masters_current
ORDER BY service_id, name LIMIT 10;

-- 適当な entity の revision 履歴
SELECT id, revision, valid_from, name, deleted
FROM data_dimensions.target_masters
WHERE id = (SELECT id FROM data_dimensions.target_masters LIMIT 1)
ORDER BY revision;
```

期待：Supabase 環境と同じ結果。

### Step 5: アプリの接続切替

`.dev.vars` と CF Worker secrets を更新：

```bash
# .dev.vars（ローカル開発用）
DATABASE_URL=postgresql://neondb_owner:<password>@ep-rapid-wind-a147le6e.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

CF Worker 用 secrets：
```bash
pnpm wrangler secret put DATABASE_URL
# 入力に Neon URL を貼り付ける
```

`scripts/set-cf-secrets.sh` があるならそれを使用。

### Step 6: 動作確認（ローカル）

```bash
pnpm dev
```

ブラウザで：
- `/services` がリストされる
- 適当な service を開いて mapping editor が表示される
- target master / mapping の追加・編集が動く
- ページリロード後も保持されている

API 経由でも動作確認：
```bash
curl http://localhost:8788/api/v1/health
curl http://localhost:8788/api/v1/services
```

### Step 7: 動作確認（CF Worker / Pages）

```bash
pnpm build
pnpm wrangler deploy
```

deploy 後、本番 URL で同じ確認。

### Step 8: Neon connection の整理

これまで二重管理だった `src/lib/db/index.ts` (Supabase) と `src/lib/db/neon.ts` (Neon for raw) を統合可能：

| 旧 | 新 |
|---|---|
| `index.ts` → Supabase 接続（Drizzle）| `index.ts` → Neon 接続（Drizzle） |
| `neon.ts` → Neon 接続（raw SQL via postgres）| 同上の Drizzle 接続を再利用、または raw SQL 用に別途残す |

**当面：`neon.ts` を残す**（raw SQL での Neon raw 参照に使う、Drizzle の schema は data_dimensions 限定）。
**将来：Drizzle で data_warehouse_v2 の `_current` view も schema 化**して 1 接続に統合。

### Step 9: Supabase project の処遇

| 案 | 評価 |
|---|---|
| Supabase project を残置（読み取りのみ可能） | rollback の保険、月額 0 円なら問題なし |
| Supabase project を削除 | 完全移行の決意、復旧コスト発生 |
| Supabase の data_dimensions schema だけ DROP | project は残し schema だけ消す。中間案 |

→ **1〜2 週間は残置**、Neon で安定運用が確認できたら削除。

---

## Rollback 手順

問題発生時の戻し方：

1. CF Worker secrets の `DATABASE_URL` を Supabase に戻す
2. `.dev.vars` を Supabase に戻す
3. Supabase 側のデータがそのままなら、それ以降は元の状態で稼働
4. Neon 側に書き込まれた変更があれば、`pg_dump` で取って Supabase に流し込む

Step 9 で Supabase を残置している限り、復旧は数分で完了。

---

## チェックリスト

実施前：

- [ ] Neon `data-warehouse` project への書き込み権限を確認
- [ ] Supabase からの `pg_dump --data-only` 成功
- [ ] Drizzle migration ファイルが最新状態（`drizzle/` に差分がない）

実施中：

- [ ] Step 1: Neon に schema 作成、テーブル一覧確認
- [ ] Step 2-3: データ移行、行数突合
- [ ] Step 4: `_current` view 動作確認、bitemporal クエリで期待結果
- [ ] Step 5: `.dev.vars` / CF secrets 更新
- [ ] Step 6: ローカル動作確認
- [ ] Step 7: 本番動作確認
- [ ] Step 8: connection コードの整理（任意）

実施後：

- [ ] 1 週間運用、問題なし
- [ ] Step 9: Supabase project 削除 or 残置の判断

---

## 移行後に変わらないこと

- **data-dimensions の API 仕様**（Phase 3 で公開予定の HTTP API）は不変
- **bitemporal schema 構造**（services / target_masters / mappings / `_current` view）も不変
- data-warehouse 側からの **「外部 API service として扱う」関係**も不変
- Drizzle / Hono / CF Workers のスタックも不変

**変わるのは DB のホスト**だけ。

---

## 移行後に新たに可能になること

| 効果 | 内容 |
|---|---|
| dbt が data_dimensions を読める | 同 DB なので cross-schema JOIN 可。fct/rpt 復活も選択肢に（別議論） |
| mcpist / 簡易 BI が dim を読みやすい | data-warehouse 接続 1 本で raw + dim 両方アクセス可能 |
| connection 数の削減 | CF Worker から 1 DB 接続で完結（Neon Hyperdrive 経由） |
| 単一 backup 戦略 | Neon の自動 backup で dim と raw が同時 point-in-time recovery 可能 |

ただし「data-dimensions の HTTP API 公開」(Phase 3) は引き続き必要。**外部 consumer は API 経由**、内部 dbt / 分析は cross-schema、という二経路を持つことになる。

---

## 関連ドキュメント

- 本リポジトリ `README.md` — アーキテクチャ概要
- 本リポジトリ `docs/001_implementation_plan.md` — Phase 別の実装計画
- 本リポジトリ `docs/002_handover_from_data_warehouse.md` — 設計知見（bitemporal の落とし穴等）
- `data-warehouse/docs/001_append_only_redesign.md` — append-only の設計判断
- `data-warehouse/CLAUDE.md` — プロジェクト規約
