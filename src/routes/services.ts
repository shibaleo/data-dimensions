import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomCode } from "@/lib/utils";
import {
  serviceCreateInputSchema,
  serviceUpdateInputSchema,
} from "@/lib/schemas/service";
import { reorderInputSchema } from "@/lib/schemas/common";

const app = new Hono()
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(services)
      .where(eq(services.deleted, false))
      .orderBy(services.sortOrder, services.createdAt);
    return c.json({ data: rows, next_cursor: null });
  })
  .post("/", zValidator("json", serviceCreateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const values = {
      code: body.code || randomCode(),
      name: body.name,
      sourceKind: body.source_kind,
      ...(body.id ? { id: body.id } : {}),
    };
    const [row] = await db.insert(services).values(values).returning();
    return c.json({ data: row }, 201);
  })
  .patch("/reorder", zValidator("json", reorderInputSchema), async (c) => {
    const { ids } = c.req.valid("json");
    await Promise.all(
      ids.map((id, i) =>
        db
          .update(services)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(eq(services.id, id)),
      ),
    );
    return c.json({ ok: true });
  })
  .get("/:id", async (c) => {
    const [row] = await db.select().from(services).where(eq(services.id, c.req.param("id")));
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .put("/:id", zValidator("json", serviceUpdateInputSchema), async (c) => {
    const body = c.req.valid("json");
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) updates.code = body.code;
    if (body.name !== undefined) updates.name = body.name;
    if (body.source_kind !== undefined) updates.sourceKind = body.source_kind;
    if (body.sort_order !== undefined) updates.sortOrder = body.sort_order;
    const [row] = await db
      .update(services)
      .set(updates)
      .where(eq(services.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .delete("/:id", async (c) => {
    const [row] = await db
      .update(services)
      .set({ deleted: true, updatedAt: new Date() })
      .where(eq(services.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  })
  .post("/:id/restore", async (c) => {
    const [row] = await db
      .update(services)
      .set({ deleted: false, updatedAt: new Date() })
      .where(eq(services.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json({ data: row });
  });

export default app;
