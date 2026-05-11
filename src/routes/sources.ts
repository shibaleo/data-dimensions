import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { db } from "@/lib/db";
import { services, sourceOrder } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getNeonClient } from "@/lib/db/neon";

/**
 * Source proxy — `service.source_kind` に応じて Neon の raw を引いて返す read-only エンドポイント。
 *
 * URL: GET /api/v1/sources/:serviceCode/:type
 *   :type = projects | colors | clients
 *
 * PATCH /:serviceCode/:type/reorder body { source_values: [] } で並べ替え保存。
 *
 * Phase 1 では toggl のみ対応。
 */

interface SourceRow {
  source_value: string;
  label: string;
  meta?: Record<string, unknown>;
  sort_order: number | null;
}

const reorderInputSchema = z.object({
  source_values: z.array(z.string()),
});

function sourceTypeKeyFor(kind: string, type: string): string {
  // type: 'projects' | 'colors' | 'clients' → mapping の source_type と一致させる
  return `${kind}_${type === "projects" ? "project" : type === "colors" ? "color" : "client"}`;
}

async function fetchTogglProjects(): Promise<Array<{
  source_value: string;
  label: string;
  meta: Record<string, unknown>;
}>> {
  const sql = getNeonClient();
  const rows = await sql<
    Array<{ source_id: string; name: string; color: string | null; client_id: string | null }>
  >`
    SELECT
      source_id,
      data->>'name'      AS name,
      data->>'color'     AS color,
      data->>'client_id' AS client_id
    FROM data_warehouse_v2.raw_toggl_track__projects_current
    WHERE deleted = false AND purged = false
  `;
  return rows.map((r) => ({
    source_value: r.source_id,
    label: r.name ?? r.source_id,
    meta: { color: r.color, client_id: r.client_id },
  }));
}

async function fetchTogglColors(): Promise<Array<{
  source_value: string;
  label: string;
  meta: Record<string, unknown>;
}>> {
  const sql = getNeonClient();
  const rows = await sql<Array<{ color: string }>>`
    SELECT DISTINCT data->>'color' AS color
    FROM data_warehouse_v2.raw_toggl_track__projects_current
    WHERE deleted = false AND purged = false
      AND data->>'color' IS NOT NULL
  `;
  return rows.map((r) => ({
    source_value: r.color,
    label: r.color,
    meta: {},
  }));
}

async function fetchTogglClients(): Promise<Array<{
  source_value: string;
  label: string;
  meta: Record<string, unknown>;
}>> {
  const sql = getNeonClient();
  const rows = await sql<Array<{ source_id: string; name: string }>>`
    SELECT
      source_id,
      data->>'name' AS name
    FROM data_warehouse_v2.raw_toggl_track__clients_current
    WHERE deleted = false AND purged = false
  `;
  return rows.map((r) => ({
    source_value: r.source_id,
    label: r.name ?? r.source_id,
    meta: {},
  }));
}

/** source_value → sort_order の map を返す (未設定は無し) */
async function loadSortOrderMap(serviceId: string, sourceType: string) {
  const rows = await db
    .select()
    .from(sourceOrder)
    .where(
      and(
        eq(sourceOrder.serviceId, serviceId),
        eq(sourceOrder.sourceType, sourceType),
      ),
    );
  return new Map<string, number>(rows.map((r) => [r.sourceValue, r.sortOrder]));
}

const app = new Hono()
  .get("/:serviceCode/:type", async (c) => {
    const { serviceCode, type } = c.req.param();

    const [svc] = await db
      .select()
      .from(services)
      .where(eq(services.code, serviceCode))
      .limit(1);
    if (!svc) return c.json({ error: "Service not found" }, 404);
    if (svc.deleted) return c.json({ error: "Service archived" }, 410);

    if (svc.sourceKind !== "toggl") {
      return c.json({ error: `source_kind=${svc.sourceKind} not implemented` }, 501);
    }

    try {
      let raw: Array<{ source_value: string; label: string; meta: Record<string, unknown> }>;
      if (type === "projects") raw = await fetchTogglProjects();
      else if (type === "colors") raw = await fetchTogglColors();
      else if (type === "clients") raw = await fetchTogglClients();
      else return c.json({ error: `Unknown type for toggl: ${type}` }, 400);

      const sourceType = sourceTypeKeyFor(svc.sourceKind, type);
      const orderMap = await loadSortOrderMap(svc.id, sourceType);

      const data: SourceRow[] = raw
        .map((r) => ({ ...r, sort_order: orderMap.get(r.source_value) ?? null }))
        .sort((a, b) => {
          // NULLS LAST
          const ao = a.sort_order;
          const bo = b.sort_order;
          if (ao == null && bo == null) return a.label.localeCompare(b.label);
          if (ao == null) return 1;
          if (bo == null) return -1;
          return ao - bo;
        });

      return c.json({ data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: `Source fetch failed: ${msg}` }, 502);
    }
  })
  .patch(
    "/:serviceCode/:type/reorder",
    zValidator("json", reorderInputSchema),
    async (c) => {
      const { serviceCode, type } = c.req.param();
      const { source_values } = c.req.valid("json");

      const [svc] = await db
        .select()
        .from(services)
        .where(eq(services.code, serviceCode))
        .limit(1);
      if (!svc) return c.json({ error: "Service not found" }, 404);

      const sourceType = sourceTypeKeyFor(svc.sourceKind, type);

      await db.transaction(async (tx) => {
        for (let i = 0; i < source_values.length; i++) {
          await tx
            .insert(sourceOrder)
            .values({
              serviceId: svc.id,
              sourceType,
              sourceValue: source_values[i],
              sortOrder: i,
            })
            .onConflictDoUpdate({
              target: [
                sourceOrder.serviceId,
                sourceOrder.sourceType,
                sourceOrder.sourceValue,
              ],
              set: { sortOrder: i, updatedAt: new Date() },
            });
        }
      });

      return c.json({ ok: true });
    },
  );

export default app;
