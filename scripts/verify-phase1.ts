import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import {
  appendTargetMasterRevision,
  appendMappingRevision,
} from "../src/lib/db/append-revision";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    ssl: "require",
    prepare: false,
  });
  const db = drizzle(sql, { schema });

  try {
    console.log("== 1. services CRUD ==");
    const [svc] = await db
      .insert(schema.services)
      .values({
        code: `test_${Date.now()}`,
        name: "Phase1 verify",
        sourceKind: "toggl",
      })
      .returning();
    console.log("inserted service:", svc.id, svc.code);

    console.log("\n== 2. target_masters create + update ==");
    const tmId = crypto.randomUUID();
    const [tm1] = await db
      .insert(schema.targetMasters)
      .values({
        id: tmId,
        revision: 1,
        serviceId: svc.id,
        validFrom: new Date(),
        name: "Education",
      })
      .returning();
    console.log("rev 1:", tm1.id, tm1.revision, tm1.name);

    const tm2 = await appendTargetMasterRevision(db, tmId, {
      name: "Education (renamed)",
    });
    console.log("rev 2:", tm2!.id, tm2!.revision, tm2!.name);

    console.log("\n== 3. target_masters_current view ==");
    const tmCurrent = await db
      .select()
      .from(schema.targetMastersCurrent)
      .where(eq(schema.targetMastersCurrent.id, tmId));
    console.log("current:", tmCurrent.length, "row(s), name:", tmCurrent[0]?.name);

    console.log("\n== 4. mappings commit (add → repoint) ==");
    const mappingId = crypto.randomUUID();
    const [m1] = await db
      .insert(schema.mappings)
      .values({
        id: mappingId,
        revision: 1,
        serviceId: svc.id,
        validFrom: new Date(),
        sourceType: "toggl_color",
        sourceValue: "red",
        targetId: tmId,
      })
      .returning();
    console.log("rev 1:", m1.sourceType, m1.sourceValue, "→", m1.targetId);

    // create another target to repoint to
    const tm2Id = crypto.randomUUID();
    await db
      .insert(schema.targetMasters)
      .values({
        id: tm2Id,
        revision: 1,
        serviceId: svc.id,
        validFrom: new Date(),
        name: "Work",
      });

    const m2 = await appendMappingRevision(db, mappingId, { targetId: tm2Id });
    console.log("rev 2 (repointed):", m2!.sourceType, "→ target:", m2!.targetId);

    console.log("\n== 5. mappings_current view ==");
    const mCurrent = await db
      .select()
      .from(schema.mappingsCurrent)
      .where(eq(schema.mappingsCurrent.id, mappingId));
    console.log("current:", mCurrent.length, "row(s), target:", mCurrent[0]?.targetId);

    console.log("\n== 6. cleanup ==");
    // soft delete はせずに物理削除でテストデータをクリア
    await db.delete(schema.mappings).where(eq(schema.mappings.serviceId, svc.id));
    await db.delete(schema.targetMasters).where(eq(schema.targetMasters.serviceId, svc.id));
    await db.delete(schema.services).where(eq(schema.services.id, svc.id));
    console.log("cleaned up.");

    console.log("\n✓ Phase 1 verification passed.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
