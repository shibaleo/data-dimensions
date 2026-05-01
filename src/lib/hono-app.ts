import { Hono } from "hono";
import { logger } from "hono/logger";
import { authenticate, type AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };
import health from "@/routes/health";
import services from "@/routes/services";
import apiKeys from "@/routes/api-keys";
import users from "@/routes/users";

/* ── V1 API sub-app ──
 *
 * Methods are chained so the accumulated route schema is preserved
 * in the app's type — required for Hono RPC (`hc<AppType>`).
 */

const v1 = new Hono<Env>()
  .use("*", logger())
  .onError((err, c) => {
    console.error(err);
    const causeMsg = err.cause instanceof Error ? err.cause.message : "";
    const msg = causeMsg ? `${err.message} - ${causeMsg}` : (err.message || "Internal Server Error");
    return c.json({ error: msg }, 500);
  })
  // Public routes (before auth middleware)
  .route("/health", health)
  // Auth middleware for all subsequent routes
  .use("*", async (c, next) => {
    const result = await authenticate(c.req.raw);
    if (!result) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("authResult", result);
    await next();
  })
  // Protected routes
  .route("/services", services)
  .route("/api-keys", apiKeys)
  .route("/users", users)
  // /me endpoint — return authenticated user info
  .get("/me", (c) => {
    const authResult = c.get("authResult");
    return c.json({
      data: {
        id: authResult.userId,
        name: authResult.name,
        email: authResult.email,
      },
    });
  });

const app = new Hono()
  .basePath("/api")
  .route("/v1", v1);

export default app;

/** Type used by `hc<AppType>()` on the client to derive a type-safe RPC client. */
export type AppType = typeof app;
