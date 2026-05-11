import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  targetMasters,
  targetMastersCurrent,
  targetMasterOrder,
  mappingsCurrent,
} from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  targetMasterCreateInputSchema,
  targetMasterUpdateInputSchema,
} from "@/lib/schemas/target-master";
import {
  appendTargetMasterRevision,
  appendMappingRevision,
} from "@/lib/db/append-revision";

const listQuerySchema = z.object({
  service_id: z.string().uuid(),
});

const reorderInputSchema = z.object({
  ids: z.array(z.string().uuid()),
});

const app = new Hono()
  .get("/", zValidator("query", listQuerySchema), async (c) => {
    const { service_id } = c.req.valid("query");
    // sort_order が NULL (未設定) のものは最後、その中は name で安定化
    const rows = await db
      .select({
        id: targetMastersCurrent.id,
        revision: targetMastersCurrent.revision,
        serviceId: targetMastersCurrent.serviceId,
        createdAt: targetMastersCurrent.createdAt,
        validFrom: targetMastersCurrent.validFrom,
        name: targetMastersCurrent.name,
        parentId: targetMastersCurrent.parentId,
        deleted: targetMastersCurrent.deleted,
        purged: targetMastersCurrent.purged,
        sortOrder: targetMasterOrder.sortOrder,
      })
      .from(targetMastersCurrent)
      .leftJoin(targetMasterOrder, eq(targetMasterOrder.targetId, targetMastersCurrent.id))
      .where(eq(targetMastersCurrent.serviceId, service_id))
      .orderBy(
        sql`${targetMasterOrder.sortOrder} ASC NULLS LAST`,
        targetMastersCurrent.name,
      );
    return c.json({ data: rows });
  })
  .post("/", zValidator("json", targetMasterCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const validFrom = body.valid_from ? new Date(body.valid_from) : new Date();

    const [row] = await db
      .insert(targetMasters)
      .values({
        id: crypto.randomUUID(),
        revision: 1,
        serviceId: body.service_id,
        validFrom,
        name: body.name,
        parentId: body.parent_id ?? null,
      })
      .returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const { ids } = c.req.valid("json");
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .insert(targetMasterOrder)
          .values({ targetId: ids[i], sortOrder: i })
          .onConflictDoUpdate({
            target: targetMasterOrder.targetId,
            set: { sortOrder: i, updatedAt: new Date() },
          });
      }
    });
    return c.json({ ok: true });
  })
  .put("/:id", zValidator("json", targetMasterUpdateInputSchema), async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const row = await appendTargetMasterRevision(db, id, {
      name: body.name,
      parentId: body.parent_id,
      validFrom: body.valid_from ? new Date(body.valid_from) : undefined,
    });
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  /**
   * archive (soft delete) — 同一 tx で参照中の mappings_current も deleted=true で新 revision INSERT する
   */
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const result = await db.transaction(async (tx) => {
      const row = await appendTargetMasterRevision(tx, id, { deleted: true });
      if (!row) return null;

      const referencing = await tx
        .select({ id: mappingsCurrent.id })
        .from(mappingsCurrent)
        .where(eq(mappingsCurrent.targetId, id));
      for (const m of referencing) {
        await appendMappingRevision(tx, m.id, { deleted: true });
      }
      return row;
    });
    if (!result) return c.json({ error: "Not found" }, 404);
    return c.json({ data: result });
  })
  .post("/:id/restore", async (c) => {
    const id = c.req.param("id");
    const row = await appendTargetMasterRevision(db, id, { deleted: false });
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
