# 引き継ぎ：data-warehouse 側設計議論からの知見

作成日: 2026-05-12
引き継ぎ元: data-warehouse repository（2026-04-30 〜 2026-05-12 の設計議論）

---

## このドキュメントの目的

data-warehouse 側で Pattern 1 (raw) と Pattern 2 (bitemporal) のボイラープレートを構築する過程で出てきた **設計知見・落とし穴・確定済みの判断** を data-dimensions に申し送る。本リポジトリの実装 (Drizzle + Supabase) はそれらを踏まえて進めれば、data-warehouse での失敗を繰り返さずに済む。

target audience: 本リポジトリの将来の開発者 / Claude セッション。

---

## アーキテクチャ：data-dimensions の位置づけ

```
┌─────────────────────────────────────────────────────┐
│ data-dimensions（このリポ）                         │
│  - 内部 DB: Supabase (or Neon) `data_dimensions` schema │
│  - Pattern 2 (bitemporal) で dim を保持             │
│  - HTTP API で外部公開（Phase 3）                    │
└──────────────┬──────────────────────────────────────┘
               │ HTTP /api/v1/<service_code>/list
               ▼
┌─────────────────────────────────────────────────────┐
│ data-warehouse（別リポ、Neon）                       │
│  - HTTP API 出力を `raw_data_dimensions__*` として取り込む │
│  - data-dimensions も Toggl / Fitbit と同列の        │
│    「外部 API source」として扱う                       │
└─────────────────────────────────────────────────────┘
               ▲
               │
┌──────────────┴──────────────────────────────────────┐
│ 他 consumer (mcpist / 簡易 BI / 将来の app)         │
│  - data-dimensions の HTTP API を直接叩く（最新 dim 取得） │
│  - data-warehouse の raw を直接 SELECT（生データ取得） │
└─────────────────────────────────────────────────────┘
```

### 重要な含意

- data-warehouse から見ると **data-dimensions は外部サービス**。内部実装（Supabase / Pattern 2 / Drizzle）は不可視
- data-dimensions の DB を Supabase に置くか Neon に置くかは **本リポジトリの内部判断**で、外部世界に影響しない
- 「data-warehouse と data-dimensions の cross-DB JOIN」問題は本来発生しない。両者を JOIN したい consumer は HTTP API 経由で dim 取得 + raw を直接読む

---

## Pattern 2 (bitemporal) の設計知見

本リポジトリの schema は data-warehouse 側で議論したものと同一形。以下、その背景にある決定理由。

### テーブル shape

```sql
CREATE TABLE <dim_name> (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  revision     int         NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),  -- transaction time
  valid_from   timestamptz NOT NULL DEFAULT now(),  -- business time
  -- <typed content columns>
  deleted      boolean     NOT NULL DEFAULT false,
  purged       boolean     NOT NULL DEFAULT false,
  PRIMARY KEY (id, revision)
);
```

### 確定済みの判断

| 論点 | 採用 | 理由 |
|---|---|---|
| `valid_from` の DEFAULT | `now()` | 省略 INSERT は uni-temporal と等価動作。bitemporal は opt-in per row |
| `valid_to` 物理列 | **作らない** | append-only を破る（INSERT 時に前 revision を UPDATE 必要）。`LEAD(valid_from)` で derive |
| ID 型 | uuid (`gen_random_uuid()`) | app-mintable。Pattern 1 raw の TEXT source_id と区別 |
| content 形式 | typed columns | app-authored で schema 制御できるので JSONB より型安全 |
| `purged` の semantics | 論理マーカーのみ、物理削除なし | append-only を守る。GDPR 要件は app 側で別途対応 |
| ライフサイクル | create → update → tombstone → restore → purge | UPDATE は禁止、すべて INSERT で表現 |
| `purged=true` の単一性 | partial unique index で enforce | `CREATE UNIQUE INDEX ... WHERE purged = true` |

### `valid_from` の運用ガイド

| シナリオ | INSERT 時の valid_from |
|---|---|
| 通常の編集（「今からこう」） | 省略（DEFAULT now()） |
| retroactive 訂正（「実は X 日前からこうだった」） | 過去日付を明示 |
| future-dated 予約（「来月から有効」） | 未来日付を明示 |

---

## 最重要：as-of-T クエリの `ORDER BY` 正しさ

data-warehouse 側で **最初に間違えて修正した部分**。Drizzle で as-of クエリを書くときも同じ罠がある。

### 誤り（よくやる）

```sql
SELECT DISTINCT ON (id) *
FROM <dim>
WHERE created_at <= tx_t AND valid_from <= biz_t
ORDER BY id, revision DESC  -- ❌ 間違い
```

### 正しい

```sql
SELECT DISTINCT ON (id) *
FROM <dim>
WHERE created_at <= tx_t AND valid_from <= biz_t
ORDER BY id, valid_from DESC, revision DESC  -- ✅
```

### なぜ `revision DESC` だけだとダメか

retroactive 訂正があると、revision の順序と business 時間の順序が乖離する。

例：
| rev | created_at | valid_from | name |
|---|---|---|---|
| 1 | 2026-01-01 | 2026-01-01 | A |
| 2 | 2026-03-01 | 2026-03-01 | B |
| 3 | **2026-05-01** | **2026-02-15** | X（retroactive: 2/15 から X だったと 5/1 に追記） |

`at(biz_t='2026-04-01')` の正解は **B**（Mar 1 から始まった rev 2 が biz=Apr 1 時点で最新の business 境界）。

- `ORDER BY revision DESC` → rev 3 (X) を返す ❌
- `ORDER BY valid_from DESC, revision DESC` → rev 2 (B) を返す ✅

タイブレーカーの `revision DESC` は「同じ valid_from に対し最新の知識を採用」という意味で必要。

### Drizzle での書き方

```ts
const result = await db
  .selectDistinctOn([targetMasters.id])
  .from(targetMasters)
  .where(and(
    lte(targetMasters.createdAt, txT),
    lte(targetMasters.validFrom, bizT)
  ))
  .orderBy(
    targetMasters.id,
    desc(targetMasters.validFrom),
    desc(targetMasters.revision),
  );
```

`_current` view（biz_t = tx_t = now() 固定）も同じ ORDER BY を適用。

---

## Volatile field の問題

data-warehouse で Toggl masters を同期したとき、**全 project が無駄に revision=2 になった事件**があった。原因は Toggl API レスポンスに含まれる aggregate field (`total_count`, `actual_hours`, `actual_seconds`) が他項目の変動で勝手に値が変わるため。

### 教訓：取り込み前に volatile field を strip すべき

外部 API から dim にデータを取り込む際、または外部に raw 同期する HTTP API レスポンスを設計する際、**ユーザの本当の編集と無関係に変動するフィールドを除外**する。

| 含めない方が良いフィールド例 |
|---|
| 集計値（`<entity>_count`, `total_seconds` 等） |
| 「最終更新」timestamp で内容と関係なく変動するもの |
| auto-generated audit fields（updated_by_system_at 等） |
| キャッシュ系 field |

content_hash を計算する場合も同じ field を除外する。

---

## Timezone の取り扱い

data-warehouse 側で **Fitbit の naive datetime 問題** で苦労した。`"2026-05-05T23:32:00.000"` のような offset 無し ISO 8601 を PG にそのまま入れると `timestamptz` キャストが UTC として解釈し、9 時間ずれる。

### ルール

**naive な datetime 文字列を生で保存しない。必ず ISO 8601 offset を含める。**

```ts
// 例：JST 固定なら（DST 無し）
function withTokyoOffset(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/(?:Z|[+\-]\d{2}:\d{2})$/.test(s)) return s; // already complete
  return s + '+09:00';
}
```

API レスポンスを返すときも、HTTP で受信した時に offset 補完するか、保存時に offset を強制する。詳細は data-warehouse/CLAUDE.md「時間データの必須ルール」参照。

---

## content_hash の戦略（参考）

data-warehouse の Pattern 1 raw では **PostgreSQL 側で hash 計算**（`md5((data - 'at')::text)`）している。理由：

- backfill 時（migration）と runtime 時（connector）で hash 計算が byte-identical でないと、同じ data でも hash 不一致 → 無駄な revision が爆発する
- JS の `JSON.stringify` と PG の `jsonb::text` は canonical 表現が違う

data-dimensions は typed columns で Drizzle 経由の INSERT なので、content_hash は使わなくて良い（INSERT の意図が明示的）。append-only 不変性は CHECK / trigger / アプリ規律で守る。

ただし将来 hash chain（前 revision の hash を持って tamper 検出）が必要になったら、PG side computation を採用すべし。

---

## Tombstone vs Purge

data-warehouse での結論：

| 操作 | semantics | DB 操作 |
|---|---|---|
| `tombstone(id)` | 論理削除。`deleted=true` の新 revision を append。content は前 revision から carry-forward | INSERT のみ |
| `purge(id)` | 最終確定削除。`purged=true` の新 revision を append。CHECK で 1 回限り | INSERT のみ |

**物理削除は一切行わない**（過去 revision は audit のため永続）。GDPR で content 抹消が必要なら：
- app 側で別途 `redact` 機能を作る（過去 revision の sensitive column を NULL 化、UPDATE 必要なので append-only 一時 bypass）
- or 別 schema にレプリカを保ち、redact 時にその一部だけ NULL 化

これは本リポジトリで実装するか、利用者責務とするか、選択肢として残しておく。

---

## append-only 強制

UPDATE / DELETE を SQL レベルで禁止するトリガーを **opt-in で table 単位** で有効化できる。data-warehouse 側に procedure を用意した：

```sql
CALL data_warehouse_v2.enable_append_only_protection('<tbl>');
-- BEFORE UPDATE / DELETE トリガーで例外を raise
```

本リポジトリは Drizzle ベースなので、同等のものを Drizzle migration で書くか、コード規律＋code review で運用するか。コード規律で運用するなら、tombstone / purge は必ず関数経由（直 UPDATE 禁止）。

---

## dbt との関係

doc 001 (data-warehouse の `001_append_only_redesign.md`) では「DWH の fct/rpt は **deprecate by neglect**」方針。本リポジトリが HTTP API で dim を外部公開するなら、その方針を貫ける：

- 各 consumer app は data-dimensions の HTTP API で最新 dim を取る
- raw は data-warehouse から直接 SELECT する
- 中央集約 fct/rpt は不要（各 app が必要な範囲で自前 JOIN）

**「Hub アプリは作らない」**（doc 001）が貫かれた状態。

---

## テスト戦略

data-warehouse 側で pgtap を入れた。本リポジトリでは Vitest / Bun test 等で同等の invariant チェックを：

| テスト項目 | 確認内容 |
|---|---|
| **append-only invariant** | UPDATE / DELETE が拒否される（trigger 又は app discipline） |
| **as-of-T 正しさ** | retroactive / future-dated / soft-delete シナリオで `_at(biz_t, tx_t)` が期待値を返す |
| **tombstone lifecycle** | create → update → tombstone → restore の遷移が正しい revision を生む |
| **purge 単一性** | `purged=true` が同 id で 2 回作れない |
| **idempotency** | 同 content の連続 INSERT で revision が増えない（content_hash を採用するなら） |

特に **retroactive 正しさは必ずテストする**。ORDER BY のミスは見落としやすい。

---

## data-warehouse 側の参考実装

設計議論の経緯と SQL 実装は data-warehouse repository の以下を参照：

| ファイル | 内容 |
|---|---|
| `docs/000_design.md` | DWH 全体設計 |
| `docs/001_append_only_redesign.md` | append-only / bitemporal の設計判断記録（doc title は raw 中心だが、Pattern 2 もここに）|
| `CLAUDE.md` | プロジェクト規約。時間データルール、append-only schema 詳細 |
| `migrations/007_append_only_toggl_raw.sql` | Pattern 1 (raw) の最初の実装 |
| `migrations/012_raw_at_function_and_thin_views.sql` | `raw_at(tbl, t)` 汎用関数 |
| `migrations/013_pattern2_bitemporal.sql` | Pattern 2 (dim) の demo table（boilerplate template）|
| `migrations/015_create_raw_functions.sql` | raw 用 CRUD factory procedure |
| `migrations/016_create_dim_functions.sql` | dim 用 CRUD factory procedure |
| `migrations/017_append_only_protection.sql` | UPDATE/DELETE 禁止トリガー（opt-in） |
| `migrations/018_pgtap_install.sql` + `tests/` | pgtap テスト |

特に **migrations/013, 016, 017** は Pattern 2 のリファレンス実装。SQL レベルの procedure として書かれているので、Drizzle 実装の意図合わせに使える。

---

## 議論で却下された案（記録）

| 案 | 却下理由 |
|---|---|
| `valid_from` を物理列に持たず、retroactive 不可とする | retroactive 訂正 / future-dated 予約ができないと dim の time-tracking の本質を失う |
| `valid_from` を per-table opt-in | framework の non-uniform 化、`_at()` 関数の signature が table 毎に違うと利用が混乱 |
| `valid_to` を物理列にする | append-only を破る（前 revision の UPDATE が必要） |
| ORDER BY を `revision DESC` だけにする | retroactive で誤回答（上述）|
| purge を「物理削除」モード対応にする | append-only の純粋性を破る、audit trail 喪失 |
| dim を data-warehouse の raw schema に併置 | app テーブル（user, api_key, UI 状態）が DWH を汚染、責務混在 |
| data-dimensions の dim を data-warehouse から直接 JOIN | 結合度が高すぎる、各 app が API 経由で取る方が decoupled |

---

## TODO（本リポジトリで対応推奨）

| 優先度 | 項目 |
|---|---|
| 高 | Drizzle の as-of クエリで `ORDER BY id, valid_from DESC, revision DESC` を必ず使う（既存実装の確認）|
| 高 | Phase 3 (HTTP API) で `?as_of=<biz_t>` パラメータ実装、bitemporal 取得経路を完成させる |
| 中 | append-only trigger を Drizzle migration 化（または app discipline で運用と決める）|
| 中 | retroactive / future-dated UI を Phase 4 で実装、`valid_from` ピッカー追加 |
| 低 | content_hash chain（tamper 検出）が必要になったら PG-side md5 採用 |
| 低 | 古い `data_warehouse.fct_*/rpt_*` の deprecation 完了後、HTTP API の利用パターンを doc 化 |

---

## 連絡先

データ設計の議論履歴：data-warehouse repository の chat / commit log。質問は同 repo の Issue or doc 改訂で。

設計判断の根拠は **「append-only である」「retroactive を支援する」「外部 service として外部から透明」** の 3 軸に帰着するので、迷ったらこの 3 つに照らして判断する。
