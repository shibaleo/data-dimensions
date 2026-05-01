import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { mappings, mappingsCurrent } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { mappingsCommitInputSchema } from "@/lib/schemas/mapping";
import { appendMappingRevision } from "@/lib/db/append-revision";

const listQuerySchema = z.object({
  service_id: z.string().uuid(),
});

const app = new Hono()
  .get("/", zValidator("query", listQuerySchema), async (c) => {
    const { service_id } = c.req.valid("query");
    const rows = await db
      .select()
      .from(mappingsCurrent)
      .where(eq(mappingsCurrent.serviceId, service_id))
      .orderBy(mappingsCurrent.sourceType, mappingsCurrent.sourceValue);
    return c.json({ data: rows });
  })
  /**
   * 確定 — diff を bitemporal な INSERT で適用する。
   *
   * トランザクション内で:
   *  - add:     新 mapping を revision=1 で INSERT
   *  - remove:  既存 mapping を deleted=true の新 revision で INSERT
   *  - repoint: 既存 mapping を新 target_id の新 revision で INSERT
   *
   * 1 source = 1 target の写像制約は API 層で保証する想定だが、
   * MVP では UI 側の自動 repoint に任せる (Phase 2)。
   */
  .post("/commit", zValidator("json", mappingsCommitInputSchema), async (c) => {
    const body = c.req.valid("json");
    const validFrom = body.valid_from ? new Date(body.valid_from) : new Date();

    const result = await db.transaction(async (tx) => {
      const applied: Array<typeof mappings.$inferSelect> = [];

      for (const change of body.changes) {
        if (change.type === "add") {
          const [row] = await tx
            .insert(mappings)
            .values({
              id: crypto.randomUUID(),
              revision: 1,
              serviceId: body.service_id,
              validFrom,
              sourceType: change.source_type,
              sourceValue: change.source_value,
              targetId: change.target_id,
            })
            .returning();
          applied.push(row);
        } else if (change.type === "remove") {
          const row = await appendMappingRevision(tx, change.mapping_id, {
            deleted: true,
            validFrom,
          });
          if (!row) throw new Error(`mapping ${change.mapping_id} not found`);
          applied.push(row);
        } else if (change.type === "repoint") {
          const row = await appendMappingRevision(tx, change.mapping_id, {
            targetId: change.target_id,
            validFrom,
          });
          if (!row) throw new Error(`mapping ${change.mapping_id} not found`);
          applied.push(row);
        }
      }

      return applied;
    });

    return c.json({ data: result }, 201);
  });

export default app;
