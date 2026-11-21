import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { HttpError } from "./http.js";

/** Límite de peticiones por ventana fija, persistido en la base (funciona entre instancias). */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const res: any = await db.execute(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count`);
  const rows = Array.isArray(res) ? res : res?.rows ?? [];
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) throw new HttpError(429, "rate_limited", { retryAfter: windowSeconds });
}
