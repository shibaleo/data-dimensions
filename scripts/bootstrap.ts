import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

/**
 * Bootstrap: data_dimensions.user に初期ユーザーを登録する。
 * Clerk JWT 認証は通っても DB の user テーブルに email がないと 401 になるので、
 * 初回ログインの前に 1 回だけ実行する。
 *
 * 冪等: 同じ email がすでに居れば skip。
 */

const USERS: Array<{ email: string; name: string }> = [
  { email: "shiba.dog.leo.private@gmail.com", name: "shibaleo" },
];

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    ssl: "require",
    prepare: false,
  });
  const db = drizzle(sql, { schema });

  try {
    for (const u of USERS) {
      const existing = await db
        .select({ id: schema.user.id, email: schema.user.email })
        .from(schema.user)
        .where(eq(schema.user.email, u.email))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[skip] ${u.email} already exists (id=${existing[0].id})`);
        continue;
      }

      const [created] = await db
        .insert(schema.user)
        .values({ email: u.email, name: u.name })
        .returning();
      console.log(`[create] ${created.email} (id=${created.id}, name=${created.name})`);
    }

    console.log("\n✓ Bootstrap done.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
