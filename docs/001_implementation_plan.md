# 001 実装計画書

作成日: 2026-05-01

README の Phase 0–5 を、ファイルパス・SQL・コード骨子レベルまで具体化したもの。実装中に判断が変わったら本書を更新する (commit する)。

---

## 0. 全体方針

- **雛形は data-drills-cf**。 project パターンをそのまま service として流用するのが一番安い
- **bitemporal の確定ポイントは `mappings` への INSERT のみ**。target_masters は CRUD する。services は CRUD する (履歴不要)
- **DB は内部実装、外部公開は HTTP API**。schema 名は `data_dimensions` で確定
- **Phase 0–2 が MVP**。1 サービス (toggl_time) で source → target を線で結んで確定できれば動く

### Phase 一覧と依存

```
Phase 0 (init)  →  Phase 1 (schema + 内部 API)  →  Phase 2 (UI)
                                                   ↓
                                                  Phase 3 (外部 API)
                                                   ↓
                                                  Phase 4 (as-of)
                                                   ↓
                                                  Phase 5 (他サービス、必要時のみ)
```

各 Phase の Acceptance criteria を末尾に置く。

---

## Phase 0: リポジトリ初期化

### ゴール

`pnpm dev` で「空っぽの data-dimensions」が起動し、Clerk ログインできて、ヘッダーに `data-dimensions` と表示される状態。

### 手順

1. **clone + git 初期化**
   ```bash
   cd C:\Users\m_fukuda\Documents
   cp -r data-drills-cf data-dimensions  # or git clone + 履歴を切る
   cd data-dimensions
   rm -rf .git
   git init
   git add .
   git commit -m "Initial: forked from data-drills-cf"
   ```

2. **削るもの** (drill 固有の機能)
   - `src/services/pdf/` — PDF 生成
   - `src/routes/problems.ts`, `src/routes/answers.ts`, `src/routes/flashcards.ts`, `src/routes/notes.ts`
   - `src/app/(pages)/problems/`, `answers/`, `flashcards/`, `notes/` — drill 用ページ群
   - `src/lib/db/schemas/` の drill 専用テーブル (problem / answer / flashcard / note / subject / level / topic)
   - drill 専用 hooks (`use-problem-data.ts`, `use-flashcard-*.ts` 等)

3. **残すもの**
   - Clerk auth 周り
   - Hono + Drizzle のセットアップ
   - Tailwind v4 / shadcn / Radix
   - TanStack Router / Query
   - **`use-project.tsx` → `use-service.tsx` にリネーム** (中身は流用)
   - **`filter-popover.tsx`** (右上アイコン UI 流用)
   - レイアウト (`app-layout.tsx`) — 左サイドバー or ヘッダーを残す
   - `src/routes/projects.ts` → `src/routes/services.ts` にリネーム

4. **リネーム作業**
   - `package.json` `name` を `data-dimensions` に
   - `wrangler.toml` の `name`, Pages の `output_dir` 等を `data-dimensions` に
   - DB schema 名: drill 関連の `data_drills` 参照を新スキーマ (Phase 1 で確定) に向ける
   - localStorage key: `dd_current_project` → `dim_current_service`
   - URL: `/projects/...` → `/services/...`

5. **環境変数**
   - `.dev.vars` (CF Worker dev) に下記を設定:
     ```
     CLERK_SECRET_KEY=
     CLERK_PUBLISHABLE_KEY=
     SUPABASE_DB_URL=    # Drizzle 用、time_dims 内部スキーマ用
     NEON_DWH_URL=       # data_warehouse_v2 read-only 用
     ```
   - **Clerk app は既存流用**で確定 (新規作成しない)

### Acceptance

- [ ] `pnpm dev` で起動、Clerk ログインを通過
- [ ] ヘッダーに `data-dimensions` と表示
- [ ] drill 関連のルート (`/problems` 等) は 404 か削除済み
- [ ] `git log --oneline` で履歴がクリーン

---

## Phase 1: スキーマと内部 API

### ゴール

Supabase に dim 用 schema が立ち上がり、Hono の内部 endpoints から services / target_masters / mappings を CRUD できる。Neon 側からは toggl source の `_current` view を引ける。

### 1-1. Supabase スキーマ

**migration ファイル**: `supabase/migrations/0001_data_dimensions.sql` (新規、別アプリの既存 migration には触らない)

```sql
CREATE SCHEMA IF NOT EXISTS data_dimensions;

-- サービス (通常 master、soft delete)
CREATE TABLE data_dimensions.services (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  source_kind TEXT NOT NULL,           -- 'toggl' (Phase 5 で増える)
  sort_order  INT NOT NULL DEFAULT 0,
  deleted     BOOLEAN NOT NULL DEFAULT false,  -- soft delete
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ターゲットマスタ (bitemporal append-only)
CREATE TABLE data_dimensions.target_masters (
  id         UUID NOT NULL,
  revision   INT  NOT NULL,
  service_id UUID NOT NULL REFERENCES data_dimensions.services(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from TIMESTAMPTZ NOT NULL,
  name       TEXT NOT NULL,
  parent_id  UUID,                     -- 自己参照 (revisioned id, FK は張らない)
  deleted    BOOLEAN NOT NULL DEFAULT false,
  purged     BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id, revision)
);

-- マッピング (bitemporal append-only)
CREATE TABLE data_dimensions.mappings (
  id           UUID NOT NULL,
  revision     INT  NOT NULL,
  service_id   UUID NOT NULL REFERENCES data_dimensions.services(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_from   TIMESTAMPTZ NOT NULL,
  source_type  TEXT NOT NULL,          -- 'toggl_color' | 'toggl_client' | 'toggl_project'
  source_value TEXT NOT NULL,
  target_id    UUID NOT NULL,          -- target_masters.id (revision 非依存)
  deleted      BOOLEAN NOT NULL DEFAULT false,
  purged       BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (id, revision)
);

-- インデックス
CREATE INDEX target_masters_service_id_idx
  ON data_dimensions.target_masters (service_id, id, revision DESC);

CREATE INDEX mappings_service_source_idx
  ON data_dimensions.mappings (service_id, source_type, source_value, revision DESC);

CREATE INDEX mappings_service_target_idx
  ON data_dimensions.mappings (service_id, target_id, revision DESC);

-- 1 source = 1 target の写像制約は schema レベルでは張れない (bitemporal で revision が複数あるため)
-- → API/UI 側で「同 (service_id, source_type, source_value) で current が既にあれば repoint」を保証する
-- 物理的な保護として、_current view にユニークが立つことを CI でチェックする想定 (Phase 1 末)

-- _current view
CREATE VIEW data_dimensions.target_masters_current AS
SELECT * FROM (
  SELECT DISTINCT ON (id) *
  FROM data_dimensions.target_masters
  ORDER BY id, revision DESC
) t
WHERE deleted = false AND purged = false;

CREATE VIEW data_dimensions.mappings_current AS
SELECT * FROM (
  SELECT DISTINCT ON (id) *
  FROM data_dimensions.mappings
  ORDER BY id, revision DESC
) t
WHERE deleted = false AND purged = false;
```

### 1-2. Drizzle schema

**ファイル**: `src/lib/db/schemas/data_dimensions.ts`

```ts
import {
  pgSchema, uuid, text, integer, timestamp, boolean, primaryKey, index,
} from 'drizzle-orm/pg-core';

export const dataDimensions = pgSchema('data_dimensions');

export const services = dataDimensions.table('services', {
  id:         uuid('id').primaryKey().defaultRandom(),
  code:       text('code').notNull().unique(),
  name:       text('name').notNull(),
  sourceKind: text('source_kind').notNull(),
  sortOrder:  integer('sort_order').notNull().default(0),
  deleted:    boolean('deleted').notNull().default(false),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const targetMasters = dataDimensions.table('target_masters', {
  id:         uuid('id').notNull(),
  revision:   integer('revision').notNull(),
  serviceId:  uuid('service_id').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  validFrom:  timestamp('valid_from', { withTimezone: true }).notNull(),
  name:       text('name').notNull(),
  parentId:   uuid('parent_id'),
  deleted:    boolean('deleted').notNull().default(false),
  purged:     boolean('purged').notNull().default(false),
}, (t) => ({ pk: primaryKey({ columns: [t.id, t.revision] }) }));

export const mappings = dataDimensions.table('mappings', {
  id:          uuid('id').notNull(),
  revision:    integer('revision').notNull(),
  serviceId:   uuid('service_id').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  validFrom:   timestamp('valid_from', { withTimezone: true }).notNull(),
  sourceType:  text('source_type').notNull(),
  sourceValue: text('source_value').notNull(),
  targetId:    uuid('target_id').notNull(),
  deleted:     boolean('deleted').notNull().default(false),
  purged:      boolean('purged').notNull().default(false),
}, (t) => ({ pk: primaryKey({ columns: [t.id, t.revision] }) }));
```

### 1-3. Hono 内部 endpoints

**ファイル構成**:
```
src/routes/
  services.ts          ← /api/v1/services
  target-masters.ts    ← /api/v1/target-masters
  mappings.ts          ← /api/v1/mappings
  sources.ts           ← /api/v1/sources (Neon proxy)
```

#### services (通常 CRUD、soft delete)

```
GET    /api/v1/services                   → list (deleted=false のみ)
POST   /api/v1/services                   → create
GET    /api/v1/services/:id               → get
PUT    /api/v1/services/:id               → update (name, source_kind, sort_order)
DELETE /api/v1/services/:id               → archive (deleted=true に UPDATE、cascade なし)
POST   /api/v1/services/:id/restore       → restore (deleted=false に UPDATE)
```

archive されたサービスは UI には出ないが、target_masters / mappings は残る (= 後で復活できる)。

#### target_masters (bitemporal)

```
GET    /api/v1/target-masters?serviceId=  → list (current)
POST   /api/v1/target-masters             → create (revision=1, valid_from=now)
PUT    /api/v1/target-masters/:id         → update (新 revision INSERT)
DELETE /api/v1/target-masters/:id         → archive (新 revision deleted=true INSERT)
POST   /api/v1/target-masters/:id/restore → restore (新 revision deleted=false INSERT)
```

**delete 時の cascade**: target_masters を archive するとき、その target を参照している現在有効な mappings も同一トランザクション内で `deleted=true` の新 revision を INSERT する。restore は cascade しない (mappings は明示的に再確定が必要)。

#### mappings (bitemporal、bulk commit)

```
GET    /api/v1/mappings?serviceId=        → list (current)
POST   /api/v1/mappings/commit            → 確定 (diff bulk INSERT)
```

**commit body**:
```ts
{
  serviceId: string,
  validFrom: string,         // ISO timestamp、UI で「いつから有効か」指定
  changes: Array<
    | { type: 'add',     sourceType: string, sourceValue: string, targetId: string }
    | { type: 'remove',  mappingId: string }                       // 既存 id を deleted=true で新 revision
    | { type: 'repoint', mappingId: string, targetId: string }     // 既存 id を新 target_id で新 revision
  >
}
```

**bitemporal INSERT パターン (target_masters / mappings 共通)**:
```sql
-- create (新規)
INSERT INTO ... (id, revision, ..., deleted) VALUES (gen_random_uuid(), 1, ..., false);

-- update / repoint
INSERT INTO ... SELECT id, max(revision)+1, ..., false FROM ... WHERE id = $1;

-- delete / archive
INSERT INTO ... SELECT id, max(revision)+1, ..., true (deleted=true) FROM ... WHERE id = $1;

-- restore
INSERT INTO ... SELECT id, max(revision)+1, ..., false FROM ... WHERE id = $1;
```

実装は単一トランザクションで `MAX(revision) + 1` を取得して INSERT する関数 (`appendRevision(table, id, patch)`) にまとめる。

#### sources (Neon read-only proxy)

```
GET /api/v1/sources/:serviceCode/projects → Toggl projects
GET /api/v1/sources/:serviceCode/colors   → Toggl colors (distinct)
GET /api/v1/sources/:serviceCode/clients  → Toggl clients
```

`service_kind` で switch して Neon の `data_warehouse_v2.<source>_current` を引く。`toggl` 以外は Phase 5。

### Acceptance

- [ ] migration 適用後、3 テーブル + 2 view が存在する
- [ ] curl で services の CRUD が動く
- [ ] target_masters の CRUD で revision が増えていくのを確認 (raw 行を SELECT で見る)
- [ ] mappings の commit を投げて、複数 revision が正しく入る
- [ ] sources/:serviceCode/projects が Neon から data 返す

---

## Phase 2: マッピングエディタ UI (主画面)

### ゴール

ヘッダー右上のフィルターアイコンで `toggl_time` サービスを選び、左に Toggl source、右に target master、線で結んでドラッグで編集、「確定」で diff が INSERT される。

### 2-1. ルーティング & ナビゲーション

```
/                                    → リダイレクト (current service があればそこへ)
/services                            → サービス一覧 / 新規作成
/services/:serviceCode               → マッピングエディタ (主画面)
/services/:serviceCode/targets       → ターゲットマスタ管理 (CRUD のみ)
```

### 2-2. Service Context

**ファイル**: `src/hooks/use-service.tsx` (旧 use-project.tsx をリネーム)

- React Context + localStorage (`dim_current_service`)
- `currentService: Service | null`
- `services: Service[]` (TanStack Query)
- 切替: localStorage 更新 + URL 更新

### 2-3. ヘッダー右上 FilterPopover

**ファイル**: `src/components/shared/filter-popover.tsx` (流用 + 改修)

- ListFilter icon (lucide-react)
- popover 内容: service の radio list + 「+ 新規サービス」リンク
- service 切替で `useService` の current 更新 + ナビゲート

### 2-4. マッピングエディタ画面

**ファイル**: `src/app/(pages)/services/$serviceCode/index.tsx`

**レイアウト**:
```
┌────────────────────────────────────────────────────────────┐
│ [data-dimensions]                                  [▽]      │
├────────────────────────────────────────────────────────────┤
│ Service: toggl_time   [project|color|client tabs]          │
├──────────────┬──────────────────────────┬──────────────────┤
│  source      │   line canvas             │   target        │
│  (左)         │   (中央、SVG or RF)       │   (右)           │
│              │                           │                  │
│  Project A ─ │ ─────────────────────── │ ─ Education       │
│  Project B ─ │ ─┐                        │   Work           │
│              │   └─────────────────── │ ─ Leisure         │
│  ...          │                           │   ...            │
├──────────────┴──────────────────────────┴──────────────────┤
│ [draft: +2 / -1 / ~3]  [破棄]  [確定 (Ctrl+S)]              │
└────────────────────────────────────────────────────────────┘
```

**コンポーネント分割**:
```
MappingEditor              ← page root
  ├ EditorHeader           ← service tabs (project/color/client)
  ├ EditorBody
  │   ├ SourceColumn       ← left, useSources() で Neon から取得
  │   ├ ConnectionCanvas   ← center, line drawing
  │   └ TargetColumn       ← right, useTargetMasters() + 編集 UI
  └ EditorFooter           ← draft summary + 確定ボタン
```

### 2-5. 線描画 (確定: plain SVG、Liam ERD 風)

**plain SVG** で実装。参考は **Liam ERD** のキャンバス (https://liambx.com)。テーブル間のリレーション線をベジェ曲線で描く UI を踏襲する。

**実装方針**:
- source / target をそれぞれ縦リストで配置
- 各行に `ref` を持たせて `getBoundingClientRect()` で位置を取得 (スクロール / リサイズ時は ResizeObserver で再計算)
- ルートの `<svg>` を画面全体 (or エディタ領域全体) に被せ、`<path d="M ... C ...">` でベジェ曲線を描く
  - 始点: source 行の右端中央
  - 終点: target 行の左端中央
  - 制御点: 始点・終点から横方向に一定オフセット (Liam ERD と同じ感じ)
- ホバーで線をハイライト、クリックで「切る/付け替え」メニュー
- ドラッグ操作:
  - source 行のハンドル → ドラッグ開始
  - `mousemove` で「カーソルへの仮線」を描画
  - target 行で drop → draft に `add` 追加
  - 既に同一 source の mapping がある場合は **自動的に `repoint`** に振り替え (1 source = 1 target を保証)
- レイアウト: パン / ズームは MVP では不要、固定縦スクロール

**参考にする実装** (要 fetch するコード):
- `liam-hq/liam` の ERD canvas 部分 (OSS、SVG ベース)

採用ライブラリ: なし (plain SVG + React)。

### 2-6. Draft 状態モデル

**型**:
```ts
type DraftChange =
  | { type: 'add',     sourceType: string, sourceValue: string, targetId: string }
  | { type: 'remove',  mappingId: string }
  | { type: 'repoint', mappingId: string, newTargetId: string };

type DraftState = {
  changes: DraftChange[];
};
```

**運用**:
- `useReducer` で管理
- 「現在の表示」 = `mappings_current` + 適用後の changes (UI 側で merge)
- 同一 mappingId への repeat 操作は最後の 1 つにまとめる (例: add → remove は no-op、add → repoint は add の targetId 書き換え)
- ページ離脱時に changes が残っていたら確認モーダル

### 2-7. 確定操作

- 「確定」ボタン押下 → `POST /api/v1/mappings/commit` に diff を送信
- `validFrom` は **datetime picker** で指定 (default: 現在時刻)。retroactive (過去日時) もここで指定可能
- 成功: TanStack Query invalidate → draft クリア → toast
- 失敗: エラー表示、draft は保持

### 2-8. ターゲットマスタ管理 UI

target_masters の CRUD は右カラムでインライン編集できれば十分:
- 「+ ターゲット追加」ボタン
- 各行: rename (inline edit) / archive (×) / restore
- **階層 (parent_id) は後回し** (確定)。フラット運用で進める。Phase 5 以降に必要が出たら検討

### Acceptance

- [ ] `/services/toggl_time` を開いて、左に Toggl source、右に target が出る
- [ ] ドラッグで線を引いて draft に積める
- [ ] 線を切る/付け替える操作が draft に反映される
- [ ] 「確定」で `mappings` に新 revision が INSERT される
- [ ] ページ再読み込み後、確定済みマッピングが線で表示される
- [ ] サービス切替で別サービスのマッピングに切り替わる

---

## Phase 3: 外部公開 HTTP API

### ゴール

他アプリから `GET {base_url}/{service_code}/list` を叩いて dim を取得できる。

### 3-1. Endpoints

```
GET /api/v1/{service_code}                          → サービスメタデータ
GET /api/v1/{service_code}/list                     → 現在の dim 一覧
GET /api/v1/{service_code}/list?as_of=YYYY-MM-DD    → 指定時点 (Phase 4 と同時で OK)
```

### 3-2. レスポンス shape

```ts
// GET /api/v1/{service_code}
{
  code:           string,
  name:           string,
  source_kind:    string,
  target_count:   number,
  mapping_count:  number,
  last_updated:   string,    // mappings の MAX(created_at)
}

// GET /api/v1/{service_code}/list
[
  {
    source_type:      string,
    source_value:     string,
    target_id:        string,
    target_name:      string,
    target_parent_id: string | null,
    valid_from:       string,
    revision:         number,
  }
]
```

### 3-3. 認証 (確定: 最初 no auth、その後 API key)

**Phase 3 リリース時**: no auth で公開 (消費アプリは fetch するだけ)。
**運用が始まったら**: API key 方式に切り替え (header `X-API-Key`、本アプリの settings 画面で発行・管理)。Clerk service token は overkill なので採用しない。

破壊的変更ではない (header optional → required) ので段階的に上げる。

### Acceptance

- [ ] 別ターミナルから curl で `/api/v1/toggl_time/list` を叩いて JSON が返る
- [ ] CORS が他オリジンから許可されている (もしくは消費アプリは同 domain)
- [ ] `/{service_code}` のメタデータが正しく集計されて返る

---

## Phase 4: 過去状態の参照

### ゴール

「2026-04-15 時点の自分の dim はどうなっていたか」を見れる。retroactive 訂正もできる。

### 4-1. as-of mode

- ヘッダーに **as-of date picker** を追加 (default: 今日 = 通常モード)
- セットされたら全 query に `?as_of=YYYY-MM-DD` を付与
- マッピング・ターゲットマスタは read-only 表示 (過去を編集はしない)
- 内部 SQL:
  ```sql
  -- mappings as-of
  SELECT DISTINCT ON (id) *
  FROM data_dimensions.mappings
  WHERE service_id = $1
    AND valid_from <= $as_of_date::timestamptz
  ORDER BY id, revision DESC;
  -- WHERE deleted=false は外す? — 「その時点で deleted=true だった」も観察対象
  ```
- system time as-of (`created_at <= $`) は **Phase 4 では作らない**。bitemporal の business time 軸だけで MVP

### 4-2. retroactive 訂正

- 確定モーダルで `valid_from` を過去に指定可能に
- 「2026-04-10 時点で本当は X だった」と明示する記録の付け方
- UI: 確定ボタン横に「適用日: [今日 ▽]」picker

### Acceptance

- [ ] as-of mode で過去日付を選ぶと、その時点の mapping が表示される
- [ ] retroactive INSERT した行が as-of mode で見える
- [ ] 通常モードに戻ると最新が出る

---

## Phase 5: 他サービス追加 (YAGNI、必要時のみ)

最初は `toggl_time` 1 サービスで運用。実際に必要が出てから:

1. `services` テーブルに新 row INSERT (例: `fitbit_sleep`)
2. `source_kind` を増やす (例: `fitbit`)
3. Neon の対応 raw view が必要 (data-warehouse 側で先に作る)
4. `src/routes/sources.ts` に `fitbit` 用 handler 追加
5. UI は service code を URL に乗せているだけなので、データさえ揃えば動く

**やらないこと**:
- 抽象的な「source plugin システム」を作る — Rule of Three まで待つ
- Phase 0–4 で source_kind を string で持っていれば十分

---

## クロスカット

### bitemporal INSERT のヘルパー

target_masters / mappings 共通のロジックを 1 関数に集約:

```ts
// src/lib/db/append-revision.ts
async function appendRevision<T extends 'target_masters' | 'mappings'>(
  tx: PgTransaction,
  table: T,
  id: string,
  patch: Partial<TableRow<T>>,
): Promise<TableRow<T>>
```

新規 (revision=1) は別ヘルパー (`createNew`) にする方が読みやすい。

### Draft state は localStorage に persist しない

リロード/タブ切替で消える。理由: 「悩んでる過程」は本アプリの責務外、Obsidian canvas で考える。本アプリはコミット直前の draft しか持たない。

### エラー時の挙動

- mappings/commit が部分失敗したら全体ロールバック (トランザクション内で実行)
- 楽観ロックは MVP では不要 (1 ユーザー想定)

### ログ

`mappings/commit` には commit 単位の log を書く (誰が何を、いつ確定したか)。Cloudflare Workers の `console.log` で十分、専用テーブルは作らない。

---

## Resolved Decisions

2026-05-01 時点で確定済みの設計判断:

- [x] **schema 名**: `data_dimensions` で確定
- [x] **線描画**: plain SVG (Liam ERD のキャンバス風)。ライブラリは使わない
- [x] **外部 API 認証**: Phase 3 リリースは no auth、運用開始後に API key (`X-API-Key` header) に切り替え
- [x] **階層 (parent_id)**: 後回し。MVP は flat
- [x] **同一 source への複数 target**: 禁止 (1:N は不可)。N:1 (複数 source が同一 target に集まる) は OK。「写像」関係を保つ
- [x] **target_masters delete 時**: 参照中の mappings を同一トランザクションで cascade soft delete (deleted=true 新 revision)
- [x] **service delete**: soft delete (`deleted` フラグ追加)。target/mapping は残し、後で復活可能
- [x] **valid_from の UI**: datetime picker
- [x] **Clerk app**: 既存流用

---

## やらないこと (反対側の境界)

- raw データの取得・修正 (= data-warehouse の責務)
- 目標管理・進捗ダッシュボード (= 別アプリ、本アプリの API を消費する)
- 「分類に悩む」探索機能 (= Obsidian canvas)
- 多ユーザー / 権限分離 (= 1 ユーザー前提)
- 複雑な階層 / ツリー操作 (= MVP は flat)
- リアルタイム同期 (= 1 ユーザーなので不要)
