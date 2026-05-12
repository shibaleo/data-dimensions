import "dotenv/config";
import postgres from "postgres";

/**
 * Supabase → Neon データ移行 (data_dimensions schema)。
 *
 * - Schema は事前に Neon に apply 済みのこと (drizzle-kit migrate を完了)
 * - source = SUPABASE_URL (もしくは .env の DATABASE_URL でも可)
 * - target = NEON_DWH_URL (もしくは引数の TARGET_URL)
 * - 既存行は ON CONFLICT で skip
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const NEON_URL = process.env.NEON_TARGET_URL ?? process.env.NEON_DWH_URL;
if (!SUPABASE_URL || !NEON_URL) {
  throw new Error("SUPABASE_URL and NEON_TARGET_URL (or NEON_DWH_URL) must be set");
}

const TABLES = [
  // FK 順 (services → 各テーブル)
  { name: "services", conflict: "(id)" },
  { name: "user", conflict: "(id)" },
  { name: "api_key", conflict: "(id)" },
  { name: "target_masters", conflict: "(id, revision)" },
  { name: "mappings", conflict: "(id, revision)" },
  { name: "target_master_order", conflict: "(target_id)" },
  { name: "source_order", conflict: "(service_id, source_type, source_value)" },
] as const;

async function main() {
  const src = postgres(SUPABASE_URL, { max: 1, ssl: "require", prepare: false });
  const dst = postgres(NEON_URL, { max: 1, ssl: "require", prepare: false });

  try {
    for (const { name, conflict } of TABLES) {
      const rows = await src<Record<string, unknown>[]>`
        SELECT * FROM data_dimensions.${src(name)}
      `;

      if (rows.length === 0) {
        console.log(`[${name}] empty, skipped`);
        continue;
      }

      // Get column names from first row (consistent across rows)
      const cols = Object.keys(rows[0]);
      const quotedCols = cols.map((c) => `"${c}"`).join(", ");
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");

      let inserted = 0;
      let skipped = 0;
      for (const r of rows) {
        const values = cols.map((c) => r[c]);
        const result = await dst.unsafe(
          `INSERT INTO data_dimensions."${name}" (${quotedCols})
           VALUES (${placeholders})
           ON CONFLICT ${conflict} DO NOTHING
           RETURNING 1`,
          values as any,
        );
        if (result.length > 0) inserted++;
        else skipped++;
      }
      console.log(`[${name}] ${rows.length} src rows → inserted=${inserted}, skipped=${skipped}`);
    }

    // 検証 — 行数突合
    console.log("\n== verification (count comparison) ==");
    for (const { name } of TABLES) {
      const [s] = await src<Array<{ count: bigint }>>`
        SELECT count(*)::bigint FROM data_dimensions.${src(name)}
      `;
      const [d] = await dst<Array<{ count: bigint }>>`
        SELECT count(*)::bigint FROM data_dimensions.${dst(name)}
      `;
      const sc = Number(s.count);
      const dc = Number(d.count);
      const status = sc === dc ? "✓" : sc < dc ? "+ (Neon has more)" : "✗ (mismatch)";
      console.log(`  ${name}: supabase=${sc}, neon=${dc} ${status}`);
    }

    console.log("\n✓ Data migration done.");
  } finally {
    await src.end();
    await dst.end();
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
