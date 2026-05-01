# data-dimensions

**サービスごとに source → target のマッピングを管理し、外部公開できる状態にするための dim 層管理アプリ**。
各サービス内で「自分で定義したターゲットマスタ」と「外部 raw 由来のソースマスタ (固定)」をマッピングし、bitemporal append-only で履歴保持する。

作成日: 2026-05-01

---

## 概要

### このアプリが何をするか (主用途)

- **サービス** という単位を最上位に据える (例: `toggl_time` = 時間分類サービス)
- 各サービス内で:
  - **ソースマスタ** = 外部 raw 由来 (固定、編集不可)。例: Toggl の project / color / client
  - **ターゲットマスタ** = 自分で定義 (編集可)。例: Education / Sleep / Drift / Work / Leisure
  - **マッピング** = source → target の対応 (左 source / 右 target を線で結ぶ UI)
- 確定したマッピングを **bitemporal append-only** で保持し、過去の分類観も後から参照できる
- マッピング結果は **外部公開可能な dim view** として他アプリから read-only 参照できる

### このアプリが扱わないもの

- raw データの取得 (= GAS connector の責務、`data-warehouse` で完結)
- raw データの修正 (= append-only、外部からは触らない)
- ソースマスタそのものの編集 (= 外部 raw の写像、固定)
- **目標管理 / 進捗表示** (= 本アプリは dim 層管理に専念。目標・進捗は外部公開された dim view を読む別アプリの責務)
- **「どう分類しようか」と悩む探索作業** (= Obsidian canvas で行う。本アプリは確定済みマッピングのみ扱う)

---

## 経緯

このプロジェクトは「data-warehouse に軽量 UI が欲しい」から始まった対話を通じて、以下のように本質まで降りてきた:

1. **発端**: data-warehouse に data-drills-cf みたいな軽量 UI が欲しい
2. → 当初は目標管理アプリを志向したが、目標は dim とは別レイヤと判明
3. → 「**主用途は dim 層 (カテゴリ・マッピング) の動的編集**」と再フレーム
4. → 真の課題は「**dim 層の time-tracking**」と判明
   - 過去の自分がどう分類していたかを保持したい (履歴)
   - 「重点が時間と共に移動する」ことを観察できるのが価値
5. → **bitemporal append-only モデル**を採用
   - `created_at` (system) + `valid_from` (business) + `revision` (順序)
   - UPDATE 禁止、すべて INSERT で表現
   - 「悩んでる過程」は対象外 — Obsidian canvas で探索し、確定したマッピングだけを INSERT する
6. → 前提として **raw 層も append-only 化が必要**と判明
   - data-warehouse の Phase 1/2 で raw 層を append-only 化 (`data_warehouse_v2` schema、2026-05-01 完了)
7. → スコープを Toggl 限定で考えていたが、**dim 管理の本質はサービスを超えて汎用**と判明
   - Toggl も Fitbit も Tanita も Zaim も、source → target のマッピングという同じ構造
   - data-drills-cf の **project パターン** (project ごとに subject/level/topic がぶら下がる) を踏襲し、最上位概念を「サービス」とする
   - source は固定 (外部 raw 由来) / target は自由定義 / mapping は bitemporal、という三層に整理
8. → 本丸の **dim 管理アプリ = data-dimensions** を着手 ← **今ここ**

詳細は `C:\Users\m_fukuda\Documents\data-warehouse\docs\001_append_only_redesign.md` を参照。

---

## アーキテクチャ

```
┌─ Neon data-warehouse project ─────────────────┐
│  schema: data_warehouse_v2                    │ read-only
│   ├ raw_*               (append-only)         │ ─────┐
│   └ <source>_current    (view, 最新有効)      │      │  source 由来の raw
└───────────────────────────────────────────────┘      │
                                                       ▼
                                            ┌──────────────────────┐
                                            │ data-dimensions app  │
                                            │ (CF Pages + Workers) │
                                            └──────────────────────┘
                                                       ▲
┌─ Supabase project ──────────────────────────┐        │
│  schema: data_drills (既存)                  │        │ read / write
│  schema: data_dimensions (新規)              │ ───────┘
│   ├ services                                 │
│   ├ target_masters  (bitemporal append-only) │
│   └ mappings        (bitemporal append-only) │
└──────────────────────────────────────────────┘

         data-dimensions が公開する HTTP API
         GET {base_url}/{service_code}        → メタデータ
         GET {base_url}/{service_code}/list   → dim 一覧
                       │
                       ▼
              ┌──────────────────┐
              │ 他アプリ (時間集計、│
              │ 目標管理、etc.)   │
              └──────────────────┘
```

### 接続先 DB

| DB | スキーマ | 役割 | 権限 |
|---|---|---|---|
| Neon `data-warehouse` | `data_warehouse_v2` | source raw (Toggl project / color / client 等) の参照 | read-only |
| Supabase | (本アプリ専用 schema) | services / target_masters / mappings の CRUD | read/write |

外部公開は **DB ではなく HTTP API**。スキーマ名は内部実装の話なので、外部アプリは知らなくてよい。

### スタック

data-drills-cf と同等:
- **Frontend**: React 19 + Vite + TanStack Router + Tailwind v4
- **UI**: Radix UI + shadcn パターン + Sonner
- **Server state**: TanStack Query
- **Forms**: React Hook Form + Zod
- **API**: Hono on CF Workers (`AppType` + RPC client)
- **ORM**: Drizzle (Supabase 側)、生 SQL or postgres.js (Neon 側)
- **Auth**: Clerk

---

## UI パターン

### サービス分離 (data-drills-cf の project パターン踏襲)

ヘッダー右上に **フィルターアイコン (ListFilter = 逆▲の3本線)** を置き、ここからサービスを切り替える。data-drills-cf の `FilterPopover` と同じ実装パターン。

```
┌─ Header ─────────────────────────────────────────────┐
│  data-dimensions                              [▽]  │ ← 逆▲3本線 = service filter
└──────────────────────────────────────────────────────┘
                                                ↓ click
                                     ┌────────────────┐
                                     │ Service        │
                                     │ ☑ toggl_time   │
                                     │ ☐ fitbit_sleep │
                                     │ ☐ zaim_kakei   │
                                     │ + 新規サービス │
                                     └────────────────┘
```

current service は React Context + localStorage で persist (data-drills-cf の `useProject` 相当を `useService` として実装)。

### マッピングエディタ (各サービスの主画面)

**左 source / 右 target を線で結ぶ** マッピングエディタ。

```
[service: toggl_time ▽]

┌─ source master (固定) ─┐          ┌─ target master (自作) ─┐
│ Toggl project A         │ ─────────→ Education            │
│ Toggl project B         │ ──┐    ┌→ Work                  │
│ Toggl project C         │ ──┴────┘  Leisure               │
│ Toggl color X           │ ─────────→ Drift                 │
└─────────────────────────┘          └────────────────────────┘
                          [確定で書き込み]
```

- **source 側 (固定)** = サービス定義に紐づく外部 raw。`data_warehouse_v2.*_current` から read-only 取得、本アプリでは編集しない
- **target 側 (自作)** = ターゲットマスタとして編集可能 (追加 / rename / archive)
- 線を引く / 切る / 付け替える操作は UI 上の **draft** を変更するだけ
- **「確定」操作** で初めて mappings に bitemporal な INSERT が走る
- 「どう分類しようか」と悩む探索作業は **Obsidian canvas** で行い、決まったものだけ本アプリで確定する

### 外部公開 (HTTP API)

他アプリから dim を参照するときは **DB に直接つながず、本アプリの HTTP API を叩く**。サービスコードを URL に乗せる構造:

```
GET  {base_url}/{service_code}          → サービスのメタデータ (name, source_kind, target 数 等)
GET  {base_url}/{service_code}/list     → dim 一覧 (source → target の現在有効マッピング)
GET  {base_url}/{service_code}/list?as_of=2026-04-15  → 過去時点の dim
```

例:
```
GET /api/v1/toggl_time
→ { code: "toggl_time", name: "時間分類", source_kind: "toggl",
    target_count: 5, last_updated: "..." }

GET /api/v1/toggl_time/list
→ [
    { source_type: "toggl_color", source_value: "red",   target_name: "Education", ... },
    { source_type: "toggl_project", source_value: "12",   target_name: "Work", ... },
    ...
  ]
```

- DB スキーマ名は外部に出さない (内部実装の都合で変更可能)
- 外部アプリは「サービスコード」だけ知っていればよい
- 認証は Clerk のサービストークン or 公開 read-only エンドポイント (運用で決める)

---

## 内部スキーマ (Supabase 側)

> 内部実装。外部アプリは HTTP API 経由で参照するので、ここは知らなくてよい。スキーマ名は実装時に決める。

### services (通常 master、bitemporal ではない)

```sql
services
  id            UUID PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,    -- 'toggl_time', 'fitbit_sleep', ... (URL に乗る)
  name          TEXT NOT NULL,           -- '時間分類'
  source_kind   TEXT NOT NULL,           -- 'toggl' (どの外部 raw を source に使うか)
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
```

サービス自体は数が少なく履歴も不要なので、通常の master として扱う。

### target_masters (bitemporal append-only)

```sql
target_masters
  id            UUID,
  revision      INT,
  service_id    UUID NOT NULL,           -- 所属サービス (FK to services.id)
  created_at    TIMESTAMPTZ,             -- system (transaction time)
  valid_from    TIMESTAMPTZ,             -- business (ユーザー指定)
  name          TEXT NOT NULL,
  parent_id     UUID,                    -- hierarchy (Education > Reading 等)
  deleted       BOOLEAN DEFAULT false,
  purged        BOOLEAN DEFAULT false,
  PRIMARY KEY (id, revision)
  -- CHECK: 各 id について purged=true は ≤1 行
```

### mappings (bitemporal append-only)

```sql
mappings
  id            UUID,
  revision      INT,
  service_id    UUID NOT NULL,           -- FK to services.id
  created_at    TIMESTAMPTZ,
  valid_from    TIMESTAMPTZ,
  source_type   TEXT NOT NULL,           -- 'toggl_color' | 'toggl_client' | 'toggl_project' (service.source_kind 配下)
  source_value  TEXT NOT NULL,           -- raw の値 (project ID / color名 / client名)
  target_id     UUID NOT NULL,           -- target_masters.id (revision は最新有効)
  deleted       BOOLEAN DEFAULT false,
  purged        BOOLEAN DEFAULT false,
  PRIMARY KEY (id, revision)
```

### 派生 view (内部用)

bitemporal の現在有効な行を引きやすくするための内部 view。外部公開は HTTP API 経由なので、サービスごとの公開 view は作らない。

```sql
CREATE VIEW <table>_current AS
SELECT * FROM (
  SELECT DISTINCT ON (id) *
  FROM <table>
  ORDER BY id, revision DESC
) t
WHERE deleted = false AND purged = false;
```

### bitemporal クエリ例 (内部、API 実装で使う)

```sql
-- GET /api/v1/toggl_time/list?as_of=2026-04-15 の中で実行されるイメージ
SELECT m.source_type, m.source_value, t.name AS target_name, t.parent_id
FROM mappings m
JOIN services s ON s.id = m.service_id
JOIN target_masters_current t ON t.id = m.target_id
WHERE s.code = 'toggl_time'
  AND m.valid_from <= '2026-04-15'
ORDER BY m.id, m.revision DESC;
```

---

## 実装計画

### Phase 0: リポジトリ初期化

- [ ] data-drills-cf を `git clone` → `data-dimensions` に rename
- [ ] 不要部分を削ぎ落とし: `services/pdf/`, problems/answers/flashcards 関連 routes/pages/schemas
- [ ] **project パターンは流用** (services として再利用、useProject → useService に rename)
- [ ] CF Worker name / Pages project name を `data-dimensions` に更新
- [ ] `package.json` の name 変更、依存関係はそのまま流用
- [ ] Clerk app を新規作成 or 既存流用、env 設定

### Phase 1: Supabase スキーマと最小 API

- [ ] Supabase 既存 project に `data_dimensions` schema 追加 (migration 1 本)
- [ ] services / target_masters / mappings + `_current` view を作成
- [ ] Drizzle schema 定義 (`src/lib/db/schemas/data-dimensions.ts`)
- [ ] Hono CRUD endpoints (内部用)
  - services: GET/POST/PUT/DELETE (通常 CRUD)
  - target_masters: GET (current) / POST / PUT / DELETE / restore (bitemporal INSERT)
  - mappings: GET (current) / POST 確定 (bitemporal INSERT、diff 単位の bulk)
- [ ] Neon `data_warehouse_v2` 接続 (read-only) — service.source_kind に応じて source_current を取得

### Phase 2: マッピングエディタ UI (主画面)

- [ ] `useService` Context (data-drills-cf の `useProject` 相当)
- [ ] ヘッダー右上の **FilterPopover (ListFilter icon)** で service 切り替え
- [ ] 左 source / 右 target の 2 カラムレイアウト
  - **左 (source)**: 現在 service の source_kind に応じた raw を Neon から一覧 (read-only)
  - **右 (target)**: `target_masters_current WHERE service_id = current` を一覧、追加 / rename / archive
  - **線**: 既存マッピングを線で表示、ドラッグで draft 編集
- [ ] draft 状態の管理 (まだ INSERT しない)
- [ ] **「確定」操作** で diff を `mappings` に bitemporal INSERT
- [ ] source タイプ切替 (project / color / client タブ)
- [ ] サービス管理画面 (service の CRUD、新規サービス作成)

### Phase 3: 外部公開 HTTP API

- [ ] `GET /api/v1/{service_code}` — サービスメタデータ
- [ ] `GET /api/v1/{service_code}/list` — 現在有効な dim 一覧 (source → target)
- [ ] `GET /api/v1/{service_code}/list?as_of=YYYY-MM-DD` — 過去時点の dim
- [ ] 認証ポリシーの整理 (Clerk のサービストークン or 公開 read-only)
- [ ] 他アプリから叩いて dim を引ける状態を確認

### Phase 4: 過去状態の参照

- [ ] 「○○年○○月の dim はどうなってた?」を見れる as-of view モード
- [ ] retroactive 訂正 UI (valid_from を過去日付で指定して INSERT)

### Phase 5: 他サービス追加 (必要になってから)

- 最初は `toggl_time` サービス 1 つで開始
- Fitbit / Tanita / Zaim は同じ枠組みで追加可能だが、現時点では **作らない** (YAGNI)

---

## 設計判断の記録

- **名前 `data-dimensions`**: Kimball 用語の "dimensional modeling" に合わせ、複数形で実態 (複数テーブル) を反映
- **サービス分離パターンは data-drills-cf の project を踏襲**: project (data-drills-cf) ↔ service (本アプリ)。useProject / FilterPopover の構造をそのまま流用
- **ソースマスタは固定、ターゲットマスタは自作**: 編集の自由度を target に集中させ、source は外部 raw の写像として固定
- **マッピング結果は HTTP API で外部公開**: 他アプリは `{base_url}/{service_code}/list` を叩いて dim を取得する。**DB は内部実装** — 外部からは触らせない (スキーマ変更を吸収できる、認証も統一できる)。本アプリは「dim を作る場所」、消費は他アプリ
- **目標管理は対象外**: 本アプリは dim 層管理に専念。進捗表示や目標達成判定は別アプリの責務
- **探索は Obsidian canvas、確定だけ本アプリ**: 「悩む過程」を bitemporal に乗せるとノイズになる。確定したマッピングのみ INSERT する
- **UI は左 source / 右 target の線結び**: マッピング編集の本質をそのまま表現するインタラクションを採用
- **bitemporal で「重点の移動」を観察可能に**: 「重点が時間と共に移動する」という人生現象を捨てない
- **DB-level 強制 (ロール分離) は探索期間中は省略**: コード規律 + content_hash で運用、リリース時に DB role 分離を導入
- **"Hub アプリ" は作らない**: 各アプリが自前で dim を持つ。Rule of Three まで重複は許容
- **DWH の `data_warehouse_v2.fct_*/rpt_*` は deprecate by neglect**: 明示的に剥がさず、新アプリ側で自前実装することで自然に枯らす

---

## 関連プロジェクト

| プロジェクト | 役割 | このアプリとの関係 |
|---|---|---|
| `data-warehouse` | raw / stg 層 (append-only) | データソース。`data_warehouse_v2.*_current` を read-only で参照 (source 側) |
| `data-drills-cf` | 問題演習管理 | **同じスタック + project パターンの直接踏襲元**。雛形として複製、useProject → useService に流用 |
| `data-stockflow-cf` | 複式簿記 | 同じ append-only / bitemporal 思想の先行例。実装参考 |
| `mcpist` | LLM データ分析ブリッジ | DB-less、`data_warehouse_v2` を read-only で参照 |
| Obsidian canvas | dim 設計の探索 | 「どう分類するか」の検討はこちらで行い、確定したものだけ本アプリで INSERT |
| 下流アプリ (将来) | dim を消費する側 | `{base_url}/{service_code}/list` を HTTP で取得 (DB 直結ではない) |

---

## 参考ドキュメント

- `data-warehouse/docs/000_design.md` — DWH の元設計
- `data-warehouse/docs/001_append_only_redesign.md` — raw 層 append-only 化の方針 / 進捗
- `data-drills-cf/CLAUDE.md` — スタックと規約 (踏襲する)
- `data-drills-cf/src/hooks/use-project.tsx` — project (= service) Context の実装パターン
- `data-drills-cf/src/components/shared/filter-popover.tsx` — ヘッダー右上フィルター UI の実装パターン
