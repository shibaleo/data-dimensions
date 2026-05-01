import { sql, eq } from "drizzle-orm";
import { targetMasters, mappings } from "./schema";

/**
 * bitemporal append-only テーブル共通の「次 revision を INSERT」操作。
 *
 * tx は db (`PgDatabase`) または transaction (`PgTransaction`) のどちらでも OK。
 * 並行 INSERT は PK 制約 (id, revision) で衝突するが、1-user 想定なのでリトライ無し。
 */

type AnyDb = {
  select: typeof targetMasters extends never ? never : any;
  insert: any;
};

export async function appendTargetMasterRevision(
  tx: any,
  id: string,
  patch: {
    name?: string;
    parentId?: string | null;
    deleted?: boolean;
    purged?: boolean;
    validFrom?: Date;
  },
): Promise<typeof targetMasters.$inferSelect | null> {
  const [latest] = await tx
    .select()
    .from(targetMasters)
    .where(eq(targetMasters.id, id))
    .orderBy(sql`revision DESC`)
    .limit(1);
  if (!latest) return null;

  const [row] = await tx
    .insert(targetMasters)
    .values({
      id: latest.id,
      revision: latest.revision + 1,
      serviceId: latest.serviceId,
      validFrom: patch.validFrom ?? new Date(),
      name: patch.name ?? latest.name,
      parentId: patch.parentId !== undefined ? patch.parentId : latest.parentId,
      deleted: patch.deleted ?? latest.deleted,
      purged: patch.purged ?? latest.purged,
    })
    .returning();
  return row;
}

export async function appendMappingRevision(
  tx: any,
  id: string,
  patch: {
    targetId?: string;
    deleted?: boolean;
    purged?: boolean;
    validFrom?: Date;
  },
): Promise<typeof mappings.$inferSelect | null> {
  const [latest] = await tx
    .select()
    .from(mappings)
    .where(eq(mappings.id, id))
    .orderBy(sql`revision DESC`)
    .limit(1);
  if (!latest) return null;

  const [row] = await tx
    .insert(mappings)
    .values({
      id: latest.id,
      revision: latest.revision + 1,
      serviceId: latest.serviceId,
      validFrom: patch.validFrom ?? new Date(),
      sourceType: latest.sourceType,
      sourceValue: latest.sourceValue,
      targetId: patch.targetId ?? latest.targetId,
      deleted: patch.deleted ?? latest.deleted,
      purged: patch.purged ?? latest.purged,
    })
    .returning();
  return row;
}
