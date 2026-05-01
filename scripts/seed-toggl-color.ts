import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, and } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

/**
 * 旧 DWH (data-warehouse/seeds) の personal categories と Toggl color → category
 * マッピングをシード。冪等。
 *
 * source: data-warehouse/apps/transform/seeds/seed_category_time_personal.csv
 *         data-warehouse/apps/transform/seeds/seed_toggl_color_to_personal.csv
 */

const PERSONAL_CATEGORIES = [
  "Vitals",
  "Sleep",
  "Exercise",
  "Overhead",
  "Work",
  "Education",
  "Creative",
  "Social",
  "Meta",
  "Pleasure",
];

const COLOR_MAPPINGS: Array<[string, string]> = [
  // [color_hex, category_name]
  ["#0b83d9", "Overhead"],
  ["#2da608", "Education"],
  ["#465bb3", "Work"],
  ["#990099", "Pleasure"],
  ["#9e5bd9", "Meta"],
  ["#c7af14", "Exercise"],
  ["#c9806b", "Vitals"],
  ["#d92b2b", "Creative"],
  ["#d94182", "Social"],
  ["#e36a00", "Sleep"],
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    ssl: "require",
    prepare: false,
  });
  const db = drizzle(sql, { schema });

  try {
    // toggl source_kind の service を取得
    const togglServices = await db
      .select()
      .from(schema.services)
      .where(
        and(
          eq(schema.services.sourceKind, "toggl"),
          eq(schema.services.deleted, false),
        ),
      );

    if (togglServices.length === 0) {
      throw new Error(
        "No toggl service found. UI でサービスを 1 つ作成してから実行してください。",
      );
    }
    if (togglServices.length > 1) {
      console.log(
        `[warn] ${togglServices.length} toggl services found:`,
        togglServices.map((s) => s.code).join(", "),
      );
      console.log(`[info] using the first one`);
    }
    const service = togglServices[0];
    console.log(`Service: ${service.name} (code=${service.code}, id=${service.id})\n`);

    // ── target_masters ──
    const existingTargets = await db
      .select()
      .from(schema.targetMastersCurrent)
      .where(eq(schema.targetMastersCurrent.serviceId, service.id));
    const nameToId = new Map<string, string>(
      existingTargets.map((t) => [t.name, t.id]),
    );

    for (const name of PERSONAL_CATEGORIES) {
      if (nameToId.has(name)) {
        console.log(`[skip] target "${name}" already exists`);
        continue;
      }
      const id = crypto.randomUUID();
      await db.insert(schema.targetMasters).values({
        id,
        revision: 1,
        serviceId: service.id,
        validFrom: new Date(),
        name,
      });
      nameToId.set(name, id);
      console.log(`[create] target "${name}"`);
    }

    // ── mappings (toggl_color → target) ──
    console.log();
    const existingMappings = await db
      .select()
      .from(schema.mappingsCurrent)
      .where(
        and(
          eq(schema.mappingsCurrent.serviceId, service.id),
          eq(schema.mappingsCurrent.sourceType, "toggl_color"),
        ),
      );
    const existingSources = new Set(existingMappings.map((m) => m.sourceValue));

    for (const [color, categoryName] of COLOR_MAPPINGS) {
      if (existingSources.has(color)) {
        console.log(`[skip] mapping ${color} already exists`);
        continue;
      }
      const targetId = nameToId.get(categoryName);
      if (!targetId) {
        console.log(`[error] target "${categoryName}" not found, skipped ${color}`);
        continue;
      }
      await db.insert(schema.mappings).values({
        id: crypto.randomUUID(),
        revision: 1,
        serviceId: service.id,
        validFrom: new Date(),
        sourceType: "toggl_color",
        sourceValue: color,
        targetId,
      });
      console.log(`[create] mapping ${color} → ${categoryName}`);
    }

    console.log("\n✓ Seed done.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
