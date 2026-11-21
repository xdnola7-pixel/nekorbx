import type { Config, Context } from "@netlify/functions";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { requireAdmin, requireUser } from "../../server/auth.js";
import { HttpError, clientIp, int, json, readJson, str, withErrors } from "../../server/http.js";
import { rateLimit } from "../../server/ratelimit.js";

const rows = (result: any): any[] => Array.isArray(result) ? result : result?.rows ?? [];

// Admin API separado para que cada operación de inventario requiera sesión administrativa.
export default withErrors(async (req: Request, ctx: Context) => {
  const admin = await requireAdmin(req);
  await rateLimit(`admin:${admin.id}`, 600, 300);
  const url = new URL(req.url);
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).slice(1);
  const [resource, id, action] = parts;

  if (resource === "services" && req.method === "GET") {
    const result = await db.execute(sql`SELECT s.*, count(c.id)::int AS total_codes,
      count(c.id) FILTER (WHERE c.claimed_by IS NULL)::int AS available_codes,
      count(c.id) FILTER (WHERE c.claimed_by IS NOT NULL)::int AS claimed_codes
      FROM gift_code_services s LEFT JOIN gift_codes c ON c.service_id=s.id
      GROUP BY s.id ORDER BY s.sort_order, s.id`);
    return json({ services: rows(result) });
  }
  if (resource === "services" && req.method === "POST") {
    const b = await readJson(req);
    const slug = str(b.slug, 50, { required: true }).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(slug)) throw new HttpError(400, "invalid_slug");
    const name = str(b.name, 80, { required: true, min: 1 });
    const description = str(b.description, 400);
    const price = int(b.priceCop ?? 0, { min: 0, max: 1_000_000_000 })!;
    const result = await db.execute(sql`INSERT INTO gift_code_services (slug,name,description,price_cop,sort_order)
      VALUES (${slug},${name},${description},${price},COALESCE((SELECT max(sort_order)+1 FROM gift_code_services),0)) RETURNING *`);
    await db.execute(sql`INSERT INTO admin_audit_logs (admin_id,admin_email,action,entity_type,entity_id,details)
      VALUES (${admin.id},${admin.email},'gift_service.create','gift_code_service',${slug},${JSON.stringify({name,priceCop:price})}::jsonb)`);
    return json({ service: rows(result)[0] }, 201);
  }
  if (resource === "services" && id && req.method === "PUT") {
    const serviceId = int(id, { min: 1 })!;
    const b = await readJson(req);
    const name = str(b.name, 80, { required: true, min: 1 });
    const description = str(b.description, 400);
    const price = int(b.priceCop ?? 0, { min: 0, max: 1_000_000_000 })!;
    const active = b.isActive === true || b.isActive === "true";
    const result = await db.execute(sql`UPDATE gift_code_services SET name=${name}, description=${description}, price_cop=${price}, is_active=${active}, updated_at=now()
      WHERE id=${serviceId} RETURNING *`);
    const service = rows(result)[0];
    if (!service) throw new HttpError(404, "not_found");
    await db.execute(sql`INSERT INTO admin_audit_logs (admin_id,admin_email,action,entity_type,entity_id,details)
      VALUES (${admin.id},${admin.email},'gift_service.update','gift_code_service',${String(serviceId)},${JSON.stringify({name,priceCop:price,isActive:active})}::jsonb)`);
    return json({ service });
  }
  if (resource === "inventory" && req.method === "GET") {
    const serviceId = url.searchParams.get("serviceId");
    const result = await db.execute(serviceId
      ? sql`SELECT c.id,c.service_id,c.code,c.claimed_by,c.claimed_at,c.created_at,s.name AS service_name,p.email AS customer_email
        FROM gift_codes c JOIN gift_code_services s ON s.id=c.service_id LEFT JOIN profiles p ON p.id=c.claimed_by
        WHERE c.service_id=${int(serviceId,{min:1})!} ORDER BY c.id DESC LIMIT 500`
      : sql`SELECT c.id,c.service_id,c.code,c.claimed_by,c.claimed_at,c.created_at,s.name AS service_name,p.email AS customer_email
        FROM gift_codes c JOIN gift_code_services s ON s.id=c.service_id LEFT JOIN profiles p ON p.id=c.claimed_by
        ORDER BY c.id DESC LIMIT 500`);
    return json({ codes: rows(result) });
  }
  if (resource === "inventory" && req.method === "POST") {
    const b = await readJson(req);
    const serviceId = int(b.serviceId,{min:1})!;
    const supplied = typeof b.codes === "string" ? b.codes : "";
    const codes = [...new Set(supplied.split(/[\r\n,;]+/).map((v) => v.trim()).filter(Boolean))];
    if (!codes.length || codes.length > 500) throw new HttpError(400,"invalid_code_batch",{max:500});
    if (codes.some((c) => c.length > 200 || /[\u0000-\u001f]/.test(c))) throw new HttpError(400,"invalid_code_format");
    const [service] = rows(await db.execute(sql`SELECT id FROM gift_code_services WHERE id=${serviceId}`));
    if (!service) throw new HttpError(404,"service_not_found");
    const inserted = await db.transaction(async (tx) => {
      let added = 0;
      for (const code of codes) {
        const result = await tx.execute(sql`INSERT INTO gift_codes(service_id,code,created_by) VALUES (${serviceId},${code},${admin.email}) ON CONFLICT (code) DO NOTHING RETURNING id`);
        added += rows(result).length;
      }
      await tx.execute(sql`INSERT INTO admin_audit_logs (admin_id,admin_email,action,entity_type,entity_id,details)
        VALUES (${admin.id},${admin.email},'gift_codes.import','gift_code_service',${String(serviceId)},${JSON.stringify({submitted:codes.length,added,duplicates:codes.length-added})}::jsonb)`);
      return added;
    });
    return json({ added: inserted, duplicates: codes.length-inserted }, 201);
  }
  if (resource === "inventory" && id && req.method === "DELETE") {
    const codeId = int(id,{min:1})!;
    const result = await db.execute(sql`DELETE FROM gift_codes WHERE id=${codeId} AND claimed_by IS NULL RETURNING id,service_id`);
    const deleted = rows(result)[0];
    if (!deleted) throw new HttpError(409,"code_already_claimed_or_missing");
    await db.execute(sql`INSERT INTO admin_audit_logs (admin_id,admin_email,action,entity_type,entity_id)
      VALUES (${admin.id},${admin.email},'gift_code.delete','gift_code',${String(codeId)})`);
    return json({ ok: true });
  }
  return json({error:"not_found"},404);
});

export const config: Config = { path: "/api/admin-codes/*" };
