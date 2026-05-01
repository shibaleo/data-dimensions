import postgres from "postgres";

/**
 * Neon `data-warehouse` (read-only) への接続。
 * Supabase 用の `db` (drizzle) とは別物。生 SQL で使う。
 *
 * 1-user 想定で per-request にしないシンプル版 (data-drills-cf 同等の dev fallback と同じ)。
 */

let _neonClient: ReturnType<typeof postgres> | null = null;

export function getNeonClient(): ReturnType<typeof postgres> {
  if (_neonClient) return _neonClient;

  const url = process.env.NEON_DWH_URL;
  if (!url) {
    throw new Error("NEON_DWH_URL is not set");
  }

  _neonClient = postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: "require",
    prepare: false,
  });
  return _neonClient;
}
