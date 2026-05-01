import { Hono } from "hono";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getNeonClient } from "@/lib/db/neon";

/**
 * Source proxy — `service.source_kind` に応じて Neon の raw を引いて返す read-only エンドポイント。
 *
 * URL: GET /api/v1/sources/:serviceCode/:type
 *   :type = projects | colors | clients
 *
 * Phase 1 では toggl のみ対応。
 */

interface SourceRow {
  source_value: string; // mapping の source_value に入る ID/コード
  label: string; // 画面表示用
  meta?: Record<string, unknown>;
}

async function fetchTogglProjects(): Promise<SourceRow[]> {
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
    ORDER BY data->>'name'
  `;
  return rows.map((r) => ({
    source_value: r.source_id,
    label: r.name ?? r.source_id,
    meta: { color: r.color, client_id: r.client_id },
  }));
}

async function fetchTogglColors(): Promise<SourceRow[]> {
  const sql = getNeonClient();
  const rows = await sql<Array<{ color: string }>>`
    SELECT DISTINCT data->>'color' AS color
    FROM data_warehouse_v2.raw_toggl_track__projects_current
    WHERE deleted = false AND purged = false
      AND data->>'color' IS NOT NULL
    ORDER BY 1
  `;
  return rows.map((r) => ({
    source_value: r.color,
    label: r.color,
  }));
}

async function fetchTogglClients(): Promise<SourceRow[]> {
  const sql = getNeonClient();
  const rows = await sql<Array<{ source_id: string; name: string }>>`
    SELECT
      source_id,
      data->>'name' AS name
    FROM data_warehouse_v2.raw_toggl_track__clients_current
    WHERE deleted = false AND purged = false
    ORDER BY data->>'name'
  `;
  return rows.map((r) => ({
    source_value: r.source_id,
    label: r.name ?? r.source_id,
  }));
}

const app = new Hono()
  .get("/:serviceCode/:type", async (c) => {
    const { serviceCode, type } = c.req.param();

    // service の存在と source_kind を確認
    const [svc] = await db
      .select()
      .from(services)
      .where(eq(services.code, serviceCode))
      .limit(1);
    if (!svc) return c.json({ error: "Service not found" }, 404);
    if (svc.deleted) return c.json({ error: "Service archived" }, 410);

    if (svc.sourceKind === "toggl") {
      try {
        if (type === "projects") {
          return c.json({ data: await fetchTogglProjects() });
        }
        if (type === "colors") {
          return c.json({ data: await fetchTogglColors() });
        }
        if (type === "clients") {
          return c.json({ data: await fetchTogglClients() });
        }
        return c.json({ error: `Unknown type for toggl: ${type}` }, 400);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: `Source fetch failed: ${msg}` }, 502);
      }
    }

    return c.json({ error: `source_kind=${svc.sourceKind} is not implemented yet` }, 501);
  });

export default app;
