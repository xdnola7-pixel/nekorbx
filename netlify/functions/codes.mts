import type { Config, Context } from "@netlify/functions";
import { sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { requireUser } from "../../server/auth.js";
import { HttpError, clientIp, json, withErrors } from "../../server/http.js";
import { rateLimit } from "../../server/ratelimit.js";

const rows = (result: any): any[] => Array.isArray(result) ? result : result?.rows ?? [];

// Public catalog never contains the actual code strings. Claiming requires an account and is one per service/user.
export default withErrors(async (req: Request, ctx: Context) => {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const result = await db.execute(sql`SELECT s.id,s.slug,s.name,s.description,s.price_cop,
      count(c.id) FILTER (WHERE c.claimed_by IS NULL)::int AS available
      FROM gift_code_services s LEFT JOIN gift_codes c ON c.service_id=s.id
      WHERE s.is_active=true GROUP BY s.id ORDER BY s.sort_order,s.id`);
    return json({services: rows(result)});
  }
  if (req.method !== "POST") return json({error:"method_not_allowed"},405);
  const user = await requireUser(req);
  await rateLimit(`gift-claim:${user.id}`, 5, 86400);
  const slug = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).at(-1) || "";
  if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) throw new HttpError(404,"service_not_found");

  const claim = await db.transaction(async (tx) => {
    const service = rows(await tx.execute(sql`SELECT id,name FROM gift_code_services WHERE slug=${slug} AND is_active=true`))[0];
    if (!service) throw new HttpError(404,"service_not_found");
    const previous = rows(await tx.execute(sql`SELECT id FROM gift_codes WHERE service_id=${service.id} AND claimed_by=${user.id} LIMIT 1`))[0];
    if (previous) throw new HttpError(409,"already_claimed");
    const result = await tx.execute(sql`UPDATE gift_codes SET claimed_by=${user.id},claimed_at=now()
      WHERE id=(SELECT id FROM gift_codes WHERE service_id=${service.id} AND claimed_by IS NULL ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,code,claimed_at`);
    const code = rows(result)[0];
    if (!code) throw new HttpError(409,"out_of_stock");
    await tx.execute(sql`INSERT INTO admin_audit_logs (admin_id,admin_email,action,entity_type,entity_id,details)
      VALUES (${user.id},${user.email},'gift_code.claim','gift_code',${String(code.id)},${JSON.stringify({service:service.name})}::jsonb)`);
    return { service: service.name, code: code.code, claimedAt: code.claimed_at };
  });
  return json({claim});
});

export const config: Config = { path: ["/api/codes", "/api/codes/*"] };
