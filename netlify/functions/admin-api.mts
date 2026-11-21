import type { Config, Context } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, isNotNull, or, sql } from "drizzle-orm";
import { getStore } from "@netlify/blobs";
import { admin as identityAdmin } from "@netlify/identity";
import { db } from "../../db/index.js";
import {
  adminAuditLogs, categories, discountCodes, discountRedemptions, offers, orderItems, orderStatusHistory,
  orders, paymentRecords, priceHistory, products, profiles, settings, userRoles, ORDER_STATUSES,
} from "../../db/schema.js";
import { requireAdmin, type AuthUser } from "../../server/auth.js";
import { HttpError, bool, date, int, json, readJson, str, usd, withErrors } from "../../server/http.js";
import { rateLimit } from "../../server/ratelimit.js";
import { CONFIRMED_STATUSES } from "../../server/pricing.js";
import { getSettings, loadOrder, whatsappLink } from "../../server/store.js";
import { changeOrderStatus } from "../../server/status.js";
import { notifyOrderChange } from "../../server/notify.js";

/*
 * API administrativa. CADA petición verifica en el servidor que la cuenta es administradora
 * (rol "admin" en Netlify Identity o en la tabla user_roles). Todo cambio queda en admin_audit_logs.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Q = typeof db | Tx;

const audit = (q: Q, a: AuthUser, action: string, entityType: string, entityId: string | number | null, details: Record<string, unknown> = {}) =>
  q.insert(adminAuditLogs).values({ adminId: a.id, adminEmail: a.email, action, entityType, entityId: entityId == null ? null : String(entityId), details });

const SLUG = /^[a-z0-9][a-z0-9-]{1,48}$/;
const ICONS = ["robux", "stream", "ai", "sparkle", "cart", "bolt"];

async function setPrice(tx: Tx, a: AuthUser, productId: number, priceCop: number, priceUsd: string | null, reason: string) {
  const [p] = await tx.select().from(products).where(eq(products.id, productId)).for("update");
  if (!p) throw new HttpError(404, "product_not_found");
  if (p.priceCop === priceCop && (p.priceUsd ?? null) === (priceUsd ?? null)) return p;
  const [u] = await tx.update(products).set({ priceCop, priceUsd, updatedAt: new Date() }).where(eq(products.id, productId)).returning();
  await tx.insert(priceHistory).values({
    productId, oldPriceCop: p.priceCop, newPriceCop: priceCop, oldPriceUsd: p.priceUsd, newPriceUsd: priceUsd,
    reason: reason.slice(0, 200), changedBy: a.id, changedByEmail: a.email,
  });
  await audit(tx, a, "price.update", "product", productId, { from: p.priceCop, to: priceCop, fromUsd: p.priceUsd, toUsd: priceUsd, reason });
  return u;
}

function productInput(b: any, partial: boolean) {
  const out: Partial<typeof products.$inferInsert> = {};
  const has = (k: string) => !partial || k in (b ?? {});
  if (has("categoryId")) out.categoryId = int(b.categoryId, { min: 1 })!;
  if (has("slug")) { const s = str(b.slug, 50, { required: true }); if (!SLUG.test(s)) throw new HttpError(400, "invalid_slug"); out.slug = s; }
  if (has("nameEs")) out.nameEs = str(b.nameEs, 80, { required: true, min: 1 });
  if (has("nameEn")) out.nameEn = str(b.nameEn, 80) || out.nameEs || str(b.nameEs, 80);
  if (has("descriptionEs")) out.descriptionEs = str(b.descriptionEs, 600);
  if (has("descriptionEn")) out.descriptionEn = str(b.descriptionEn, 600);
  if (has("durationDays")) out.durationDays = int(b.durationDays, { min: 1, max: 3650, nullable: true });
  if (has("robuxAmount")) out.robuxAmount = int(b.robuxAmount, { min: 1, max: 10_000_000, nullable: true });
  if (has("icon")) { const i = str(b.icon, 20) || "sparkle"; if (!ICONS.includes(i)) throw new HttpError(400, "invalid_icon"); out.icon = i; }
  if (has("tagEs")) out.tagEs = str(b.tagEs, 24) || null;
  if (has("tagEn")) out.tagEn = str(b.tagEn, 24) || null;
  if (has("status")) { const s = str(b.status, 20) || "available"; if (!["available", "sold_out"].includes(s)) throw new HttpError(400, "invalid_status"); out.status = s; }
  if (has("isActive")) out.isActive = bool(b.isActive ?? true);
  if (has("featured")) out.featured = bool(b.featured);
  if (has("sortOrder")) out.sortOrder = int(b.sortOrder ?? 0, { min: -100000, max: 100000 })!;
  if (has("maxPerOrder")) out.maxPerOrder = int(b.maxPerOrder ?? 10, { min: 1, max: 100 })!;
  return out;
}

function discountInput(b: any, partial: boolean) {
  const out: Partial<typeof discountCodes.$inferInsert> = {};
  const has = (k: string) => !partial || k in (b ?? {});
  if (has("code")) {
    const c = str(b.code, 32, { required: true }).toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(c)) throw new HttpError(400, "invalid_code_format");
    out.code = c;
  }
  if (has("description")) out.description = str(b.description, 200);
  if (has("kind")) { const k = str(b.kind, 10) || "percent"; if (!["percent", "fixed"].includes(k)) throw new HttpError(400, "invalid_kind"); out.kind = k; }
  if (has("value")) out.value = int(b.value, { min: 1, max: 100_000_000 })!;
  if (has("isActive")) out.isActive = bool(b.isActive ?? true);
  if (has("startsAt")) out.startsAt = date(b.startsAt);
  if (has("expiresAt")) out.expiresAt = date(b.expiresAt);
  if (has("maxUses")) out.maxUses = int(b.maxUses, { min: 1, max: 10_000_000, nullable: true });
  if (has("maxUsesPerUser")) out.maxUsesPerUser = int(b.maxUsesPerUser, { min: 1, max: 1000, nullable: true });
  if (has("minSubtotalCop")) out.minSubtotalCop = int(b.minSubtotalCop, { min: 1, max: 1_000_000_000, nullable: true });
  const ids = (v: unknown) => (Array.isArray(v) ? v : []).slice(0, 200).map((x) => int(x, { min: 1 })!);
  if (has("productIds")) out.productIds = ids(b.productIds);
  if (has("categoryIds")) out.categoryIds = ids(b.categoryIds);
  return out;
}

const sniffImage = (b: Uint8Array): { ext: string; type: string } | null => {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { ext: "gif", type: "image/gif" };
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return { ext: "webp", type: "image/webp" };
  return null;
};

const rows = (r: any) => (Array.isArray(r) ? r : r?.rows ?? []);

export default withErrors(async (req: Request, ctx: Context) => {
  const a = await requireAdmin(req);
  await rateLimit(`admin:${a.id}`, 600, 300);
  const url = new URL(req.url);
  const r = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).slice(2); // tras /api/admin
  const m = req.method;
  const id = r[1];
  const actor = { id: a.id, email: a.email, type: "admin" as const };

  /* ================= Sesión ================= */
  if (r[0] === "me" && m === "GET") return json({ admin: { id: a.id, email: a.email, name: a.name } });

  /* ================= Dashboard ================= */
  if (r[0] === "dashboard" && m === "GET") {
    const days = [7, 30, 90, 365].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;
    const since = new Date(Date.now() - days * 86400_000);
    const confirmed = inArray(orders.status, CONFIRMED_STATUSES);
    const [byStatus, revenueAll, revenuePeriod, salesSeries, ordersSeries, top, newUsers, usersSeries] = await Promise.all([
      db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).groupBy(orders.status),
      db.select({ v: sql<number>`coalesce(sum(${orders.totalCop}),0)::bigint` }).from(orders).where(confirmed),
      db.select({ v: sql<number>`coalesce(sum(${orders.totalCop}),0)::bigint`, n: sql<number>`count(*)::int` }).from(orders).where(and(confirmed, gte(orders.paidAt, since))),
      db.execute(sql`select to_char(date_trunc('day', paid_at at time zone 'America/Bogota'), 'YYYY-MM-DD') d, sum(total_cop)::bigint v, count(*)::int n
        from orders where status in ('payment_verified','preparing','delivered') and paid_at >= ${since} group by 1 order by 1`),
      db.execute(sql`select to_char(date_trunc('day', created_at at time zone 'America/Bogota'), 'YYYY-MM-DD') d, count(*)::int n
        from orders where created_at >= ${since} group by 1 order by 1`),
      db.select({ name: orderItems.productName, qty: sql<number>`sum(${orderItems.quantity})::int`, revenue: sql<number>`sum(${orderItems.lineTotalCop})::bigint` })
        .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId))
        .where(and(confirmed, gte(orders.paidAt, since))).groupBy(orderItems.productName).orderBy(desc(sql`2`)).limit(8),
      db.select({ n: sql<number>`count(*)::int` }).from(profiles).where(gte(profiles.createdAt, since)),
      db.execute(sql`select to_char(date_trunc('day', created_at at time zone 'America/Bogota'), 'YYYY-MM-DD') d, count(*)::int n
        from profiles where created_at >= ${since} group by 1 order by 1`),
    ]);
    const s = Object.fromEntries((byStatus as { status: string; n: number }[]).map((x) => [x.status, x.n]));
    const total = (byStatus as { n: number }[]).reduce((t: number, x) => t + x.n, 0);
    return json({
      days,
      totals: {
        orders: total,
        pending: (s.pending_payment ?? 0) + (s.in_review ?? 0),
        paid: (s.payment_verified ?? 0) + (s.preparing ?? 0),
        delivered: s.delivered ?? 0,
        cancelled: (s.cancelled ?? 0) + (s.refunded ?? 0),
        revenueConfirmedCop: Number(revenueAll[0].v),
        revenuePeriodCop: Number(revenuePeriod[0].v),
        confirmedOrdersPeriod: revenuePeriod[0].n,
        newUsersPeriod: newUsers[0].n,
      },
      byStatus: s,
      salesSeries: rows(salesSeries).map((x: any) => ({ d: x.d, v: Number(x.v), n: Number(x.n) })),
      ordersSeries: rows(ordersSeries).map((x: any) => ({ d: x.d, n: Number(x.n) })),
      usersSeries: rows(usersSeries).map((x: any) => ({ d: x.d, n: Number(x.n) })),
      topProducts: (top as { name: string; qty: number; revenue: number }[]).map((t) => ({ name: t.name, qty: t.qty, revenue: Number(t.revenue) })),
    });
  }

  /* ================= Pedidos ================= */
  if (r[0] === "orders") {
    if (!id && m === "GET") {
      const status = url.searchParams.get("status") ?? "";
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const conds = [];
      if ((ORDER_STATUSES as readonly string[]).includes(status)) conds.push(eq(orders.status, status));
      if (q) conds.push(or(ilike(orders.id, `%${q.replace(/[%_\\]/g, "")}%`), ilike(profiles.email, `%${q.replace(/[%_\\]/g, "")}%`), ilike(orders.paymentReference, `%${q.replace(/[%_\\]/g, "")}%`)));
      const where = conds.length ? and(...conds) : undefined;
      const [list, [{ n }]] = await Promise.all([
        db.select({ o: orders, email: profiles.email, name: profiles.displayName }).from(orders).innerJoin(profiles, eq(profiles.id, orders.userId))
          .where(where).orderBy(desc(orders.createdAt)).limit(25).offset((page - 1) * 25),
        db.select({ n: sql<number>`count(*)::int` }).from(orders).innerJoin(profiles, eq(profiles.id, orders.userId)).where(where),
      ]);
      const its = list.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map((x) => x.o.id))) : [];
      return json({
        page, total: n, pageSize: 25,
        orders: list.map(({ o, email, name }) => ({
          id: o.id, status: o.status, totalCop: o.totalCop, createdAt: o.createdAt, paymentReference: o.paymentReference,
          customer: { email, name },
          items: its.filter((i) => i.orderId === o.id).map((i) => `${i.quantity}x ${i.productName}`),
        })),
      });
    }
    const oid = (id ?? "").toUpperCase();
    if (!/^NEKO-[0-9A-F]{6}$/.test(oid)) throw new HttpError(404, "order_not_found");
    const o = await loadOrder(oid);
    if (!o) throw new HttpError(404, "order_not_found");

    if (r.length === 2 && m === "GET") {
      const [[customer], payments, redemption] = await Promise.all([
        db.select().from(profiles).where(eq(profiles.id, o.userId)),
        db.select().from(paymentRecords).where(eq(paymentRecords.orderId, oid)).orderBy(desc(paymentRecords.createdAt)),
        db.select().from(discountRedemptions).where(eq(discountRedemptions.orderId, oid)),
      ]);
      const cfg = await getSettings();
      return json({ order: { ...o, customer: customer ? { id: customer.id, email: customer.email, name: customer.displayName } : null, payments, redemption: redemption[0] ?? null, whatsappUrl: whatsappLink(cfg.whatsappNumber, o) } });
    }
    if (r[2] === "status" && m === "POST") {
      const b = await readJson(req);
      const to = str(b.status, 30, { required: true });
      if (!(ORDER_STATUSES as readonly string[]).includes(to)) throw new HttpError(400, "invalid_status");
      const note = str(b.note, 500);
      const ref = str(b.paymentReference, 120) || null;
      const res = await changeOrderStatus(oid, to, actor, note, { paymentReference: ref });
      if (to === "payment_verified") {
        await db.insert(paymentRecords).values({ orderId: oid, provider: "manual", method: str(b.method, 60), reference: ref ?? "", amountCop: o.totalCop, status: "verified", recordedBy: a.id, recordedByEmail: a.email, verifiedBy: a.id, verifiedAt: new Date(), notes: note });
      }
      await audit(db, a, "order.status", "order", oid, { from: res.from, to: res.to, note, paymentReference: ref });
      ctx.waitUntil(notifyOrderChange({ id: oid, from: res.from, to: res.to, by: `Admin (${a.email})`, note }));
      return json({ ok: true, ...res });
    }
    if (r[2] === "notes" && m === "PUT") {
      const b = await readJson(req);
      const notes = str(b.adminNotes, 4000);
      await db.update(orders).set({ adminNotes: notes, updatedAt: new Date() }).where(eq(orders.id, oid));
      await db.insert(orderStatusHistory).values({ orderId: oid, fromStatus: o.status, toStatus: o.status, note: "Notas internas actualizadas", changedBy: a.id, changedByEmail: a.email, actorType: "admin" });
      await audit(db, a, "order.notes", "order", oid, {});
      return json({ ok: true });
    }
    if (r[2] === "payments" && m === "POST") {
      const b = await readJson(req);
      const reference = str(b.reference, 120, { required: true, min: 2 });
      const status = ["reported", "verified", "rejected"].includes(b.status) ? b.status : "reported";
      const amountCop = int(b.amountCop, { min: 1, max: 1_000_000_000, nullable: true });
      const [p] = await db.insert(paymentRecords).values({
        orderId: oid, provider: str(b.provider, 40) || "manual", method: str(b.method, 60), reference, amountCop, status,
        notes: str(b.notes, 500), recordedBy: a.id, recordedByEmail: a.email,
        verifiedBy: status === "verified" ? a.id : null, verifiedAt: status === "verified" ? new Date() : null,
      }).returning();
      await db.update(orders).set({ paymentReference: reference, updatedAt: new Date() }).where(eq(orders.id, oid));
      await audit(db, a, "payment.record", "order", oid, { paymentId: p.id, status, reference, amountCop });
      return json({ payment: p }, 201);
    }
  }

  /* ================= Categorías ================= */
  if (r[0] === "categories") {
    if (!id && m === "GET") return json({ categories: await db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)) });
    if (!id && m === "POST") {
      const b = await readJson(req);
      const slug = str(b.slug, 50, { required: true }); if (!SLUG.test(slug)) throw new HttpError(400, "invalid_slug");
      const icon = str(b.icon, 20) || "sparkle"; if (!ICONS.includes(icon)) throw new HttpError(400, "invalid_icon");
      const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${categories.sortOrder}),0)::int` }).from(categories);
      const [c] = await db.insert(categories).values({
        slug, icon, nameEs: str(b.nameEs, 60, { required: true }), nameEn: str(b.nameEn, 60) || str(b.nameEs, 60),
        descriptionEs: str(b.descriptionEs, 300), descriptionEn: str(b.descriptionEn, 300), isActive: bool(b.isActive ?? true), sortOrder: max + 1,
      }).returning();
      await audit(db, a, "category.create", "category", c.id, { slug });
      return json({ category: c }, 201);
    }
    if (id === "reorder" && m === "POST") {
      const b = await readJson(req);
      const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 200).map((x: unknown) => int(x, { min: 1 })!);
      await db.transaction(async (tx) => {
        for (let i = 0; i < ids.length; i++) await tx.update(categories).set({ sortOrder: i + 1, updatedAt: new Date() }).where(eq(categories.id, ids[i]));
        await audit(tx, a, "category.reorder", "category", null, { ids });
      });
      return json({ ok: true });
    }
    const cid = int(id, { min: 1 })!;
    if (r.length === 2 && m === "PUT") {
      const b = await readJson(req);
      const patch: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() };
      if ("nameEs" in b) patch.nameEs = str(b.nameEs, 60, { required: true });
      if ("nameEn" in b) patch.nameEn = str(b.nameEn, 60, { required: true });
      if ("descriptionEs" in b) patch.descriptionEs = str(b.descriptionEs, 300);
      if ("descriptionEn" in b) patch.descriptionEn = str(b.descriptionEn, 300);
      if ("icon" in b) { const i = str(b.icon, 20); if (!ICONS.includes(i)) throw new HttpError(400, "invalid_icon"); patch.icon = i; }
      if ("isActive" in b) patch.isActive = bool(b.isActive);
      const [c] = await db.update(categories).set(patch).where(eq(categories.id, cid)).returning();
      if (!c) throw new HttpError(404, "not_found");
      await audit(db, a, "category.update", "category", cid, b);
      return json({ category: c });
    }
    if (r[2] === "archive" && m === "POST") {
      const b = await readJson(req);
      const archived = bool(b.archived);
      const [c] = await db.update(categories).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(categories.id, cid)).returning();
      if (!c) throw new HttpError(404, "not_found");
      await audit(db, a, archived ? "category.archive" : "category.restore", "category", cid, {});
      return json({ category: c });
    }
  }

  /* ================= Productos ================= */
  if (r[0] === "products") {
    if (!id && m === "GET") return json({ products: await db.select().from(products).orderBy(asc(products.categoryId), asc(products.sortOrder), asc(products.id)) });
    if (!id && m === "POST") {
      const b = await readJson(req);
      const data = productInput(b, false);
      const priceCop = int(b.priceCop, { min: 1, max: 1_000_000_000 })!;
      const priceUsd = usd(b.priceUsd);
      const p = await db.transaction(async (tx) => {
        const [p] = await tx.insert(products).values({ ...(data as typeof products.$inferInsert), priceCop, priceUsd }).returning();
        await tx.insert(priceHistory).values({ productId: p.id, oldPriceCop: null, newPriceCop: priceCop, newPriceUsd: priceUsd, reason: "Precio inicial", changedBy: a.id, changedByEmail: a.email });
        await audit(tx, a, "product.create", "product", p.id, { slug: p.slug, priceCop });
        return p;
      });
      return json({ product: p }, 201);
    }
    const pid = int(id, { min: 1 })!;
    if (r.length === 2 && m === "PUT") {
      const b = await readJson(req);
      const data = productInput(b, true);
      const p = await db.transaction(async (tx) => {
        if ("priceCop" in b || "priceUsd" in b) {
          const [cur] = await tx.select().from(products).where(eq(products.id, pid));
          if (!cur) throw new HttpError(404, "product_not_found");
          await setPrice(tx, a, pid, "priceCop" in b ? int(b.priceCop, { min: 1, max: 1_000_000_000 })! : cur.priceCop, "priceUsd" in b ? usd(b.priceUsd) : cur.priceUsd, str(b.reason, 200) || "Edición de producto");
        }
        const [p] = await tx.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, pid)).returning();
        if (!p) throw new HttpError(404, "product_not_found");
        await audit(tx, a, "product.update", "product", pid, data);
        return p;
      });
      return json({ product: p });
    }
    if (r[2] === "archive" && m === "POST") {
      const b = await readJson(req);
      const archived = bool(b.archived);
      // Archivar (no borrar): los pedidos existentes conservan su referencia al producto.
      const [p] = await db.update(products).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(products.id, pid)).returning();
      if (!p) throw new HttpError(404, "product_not_found");
      await audit(db, a, archived ? "product.archive" : "product.restore", "product", pid, {});
      return json({ product: p });
    }
    if (r[2] === "image" && m === "POST") {
      const len = Number(req.headers.get("content-length") ?? 0);
      if (len > 2_600_000) throw new HttpError(413, "image_too_large");
      const form = await req.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new HttpError(400, "missing_file");
      if (file.size > 2_000_000) throw new HttpError(413, "image_too_large");
      const buf = new Uint8Array(await file.arrayBuffer());
      const kind = sniffImage(buf);
      if (!kind) throw new HttpError(400, "invalid_image_type");
      const [cur] = await db.select().from(products).where(eq(products.id, pid));
      if (!cur) throw new HttpError(404, "product_not_found");
      const key = `products/${pid}-${randomBytes(6).toString("hex")}.${kind.ext}`;
      const store = getStore({ name: "product-images", consistency: "strong" });
      await store.set(key, buf.buffer as ArrayBuffer, { metadata: { contentType: kind.type, productId: pid, uploadedBy: a.email } });
      const imageUrl = `/api/images/${key}`;
      const [p] = await db.update(products).set({ imageUrl, updatedAt: new Date() }).where(eq(products.id, pid)).returning();
      await audit(db, a, "product.image", "product", pid, { imageUrl, previous: cur.imageUrl });
      return json({ product: p });
    }
    if (r[2] === "image" && m === "DELETE") {
      const [p] = await db.update(products).set({ imageUrl: null, updatedAt: new Date() }).where(eq(products.id, pid)).returning();
      await audit(db, a, "product.image_remove", "product", pid, {});
      return json({ product: p });
    }
  }

  /* ================= Precios ================= */
  if (r[0] === "prices") {
    if (!id && m === "GET") {
      const [list, offs] = await Promise.all([
        db.select().from(products).where(isNull(products.archivedAt)).orderBy(asc(products.categoryId), asc(products.sortOrder), asc(products.id)),
        db.select().from(offers).where(and(eq(offers.isActive, true), isNotNull(offers.productId), isNotNull(offers.promoPriceCop))),
      ]);
      return json({ products: list, promos: offs });
    }
    if (id === "bulk" && m === "POST") {
      const b = await readJson(req);
      const percent = Number(b.percent);
      if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 500) throw new HttpError(400, "invalid_percent");
      const roundTo = [1, 10, 50, 100, 500, 1000].includes(Number(b.roundTo)) ? Number(b.roundTo) : 100;
      const catId = int(b.categoryId, { min: 1, nullable: true });
      const reason = str(b.reason, 200) || `Ajuste masivo ${percent > 0 ? "+" : ""}${percent}%`;
      const changed = await db.transaction(async (tx) => {
        const list = await tx.select().from(products).where(and(isNull(products.archivedAt), catId ? eq(products.categoryId, catId) : undefined));
        let n = 0;
        for (const p of list) {
          const next = Math.max(roundTo, Math.round((p.priceCop * (1 + percent / 100)) / roundTo) * roundTo);
          if (next !== p.priceCop) { await setPrice(tx, a, p.id, next, null, reason); n++; }
        }
        await audit(tx, a, "price.bulk", "product", null, { percent, roundTo, categoryId: catId, changed: n });
        return n;
      });
      return json({ changed });
    }
    const pid = int(id, { min: 1 })!;
    if (r.length === 2 && m === "PUT") {
      const b = await readJson(req);
      const priceCop = int(b.priceCop, { min: 1, max: 1_000_000_000 })!;
      const p = await db.transaction((tx) => setPrice(tx, a, pid, priceCop, usd(b.priceUsd), str(b.reason, 200) || "Cambio de precio"));
      return json({ product: p });
    }
    if (r[2] === "history" && m === "GET") {
      return json({ history: await db.select().from(priceHistory).where(eq(priceHistory.productId, pid)).orderBy(desc(priceHistory.createdAt), desc(priceHistory.id)).limit(100) });
    }
    if (r[2] === "restore" && m === "POST") {
      const b = await readJson(req);
      const hid = int(b.historyId, { min: 1 })!;
      const [h] = await db.select().from(priceHistory).where(and(eq(priceHistory.id, hid), eq(priceHistory.productId, pid)));
      if (!h) throw new HttpError(404, "history_not_found");
      const useOld = b.which === "old" && h.oldPriceCop != null;
      const p = await db.transaction((tx) => setPrice(tx, a, pid, useOld ? h.oldPriceCop! : h.newPriceCop, useOld ? h.oldPriceUsd : h.newPriceUsd, `Restaurado desde historial #${hid}`));
      return json({ product: p });
    }
  }

  /* ================= Ofertas / precios promocionales ================= */
  if (r[0] === "offers") {
    const input = (b: any) => {
      const startsAt = date(b.startsAt), endsAt = date(b.endsAt);
      if (startsAt && endsAt && endsAt <= startsAt) throw new HttpError(400, "invalid_dates");
      return {
        productId: int(b.productId, { min: 1, nullable: true }),
        titleEs: str(b.titleEs, 100, { required: true }),
        titleEn: str(b.titleEn, 100) || str(b.titleEs, 100),
        descriptionEs: str(b.descriptionEs, 400),
        descriptionEn: str(b.descriptionEn, 400),
        promoPriceCop: int(b.promoPriceCop, { min: 1, max: 1_000_000_000, nullable: true }),
        startsAt, endsAt,
        isActive: bool(b.isActive ?? true),
        sortOrder: int(b.sortOrder ?? 0, { min: -100000, max: 100000 })!,
      };
    };
    if (!id && m === "GET") return json({ offers: await db.select().from(offers).orderBy(desc(offers.isActive), asc(offers.sortOrder), desc(offers.id)) });
    if (!id && m === "POST") {
      const data = input(await readJson(req));
      if (data.promoPriceCop != null && data.productId == null) throw new HttpError(400, "promo_requires_product");
      const [o] = await db.insert(offers).values({ ...data, createdBy: a.email }).returning();
      await audit(db, a, "offer.create", "offer", o.id, data);
      return json({ offer: o }, 201);
    }
    const ofid = int(id, { min: 1 })!;
    if (m === "PUT") {
      const data = input(await readJson(req));
      if (data.promoPriceCop != null && data.productId == null) throw new HttpError(400, "promo_requires_product");
      const [o] = await db.update(offers).set({ ...data, updatedAt: new Date() }).where(eq(offers.id, ofid)).returning();
      if (!o) throw new HttpError(404, "not_found");
      await audit(db, a, "offer.update", "offer", ofid, data);
      return json({ offer: o });
    }
    if (m === "DELETE") {
      await db.delete(offers).where(eq(offers.id, ofid));
      await audit(db, a, "offer.delete", "offer", ofid, {});
      return json({ ok: true });
    }
  }

  /* ================= Descuentos ================= */
  if (r[0] === "discounts") {
    if (!id && m === "GET") {
      const [list, stats] = await Promise.all([
        db.select().from(discountCodes).orderBy(asc(discountCodes.archivedAt), desc(discountCodes.isActive), asc(discountCodes.code)),
        db.execute(sql`select r.discount_code_id id,
            count(*) filter (where r.status='applied')::int uses,
            count(*) filter (where o.status in ('payment_verified','preparing','delivered'))::int confirmed,
            coalesce(sum(r.amount_cop) filter (where o.status in ('payment_verified','preparing','delivered')),0)::bigint discounted,
            coalesce(sum(o.total_cop) filter (where o.status in ('payment_verified','preparing','delivered')),0)::bigint revenue
          from discount_redemptions r join orders o on o.id = r.order_id group by r.discount_code_id`),
      ]);
      const st = new Map(rows(stats).map((s: any) => [Number(s.id), { uses: Number(s.uses), confirmed: Number(s.confirmed), discountedCop: Number(s.discounted), revenueCop: Number(s.revenue) }]));
      return json({ discounts: (list as (typeof discountCodes.$inferSelect)[]).map((d) => ({ ...d, stats: st.get(d.id) ?? { uses: 0, confirmed: 0, discountedCop: 0, revenueCop: 0 } })) });
    }
    if (!id && m === "POST") {
      const data = discountInput(await readJson(req), false);
      if (data.kind === "percent" && data.value! > 100) throw new HttpError(400, "percent_over_100");
      const [d] = await db.insert(discountCodes).values({ ...(data as typeof discountCodes.$inferInsert), createdBy: a.email }).returning();
      await audit(db, a, "discount.create", "discount", d.id, data);
      return json({ discount: d }, 201);
    }
    const did = int(id, { min: 1 })!;
    if (r.length === 2 && m === "PUT") {
      const data = discountInput(await readJson(req), true);
      delete data.code; // el código no se renombra para no romper el historial
      const [cur] = await db.select().from(discountCodes).where(eq(discountCodes.id, did));
      if (!cur) throw new HttpError(404, "not_found");
      if ((data.kind ?? cur.kind) === "percent" && (data.value ?? cur.value) > 100) throw new HttpError(400, "percent_over_100");
      const [d] = await db.update(discountCodes).set({ ...data, updatedAt: new Date() }).where(eq(discountCodes.id, did)).returning();
      await audit(db, a, "discount.update", "discount", did, data);
      return json({ discount: d });
    }
    if (r[2] === "archive" && m === "POST") {
      const b = await readJson(req);
      const archived = bool(b.archived);
      const [d] = await db.update(discountCodes).set({ archivedAt: archived ? new Date() : null, isActive: archived ? false : undefined, updatedAt: new Date() }).where(eq(discountCodes.id, did)).returning();
      if (!d) throw new HttpError(404, "not_found");
      await audit(db, a, archived ? "discount.archive" : "discount.restore", "discount", did, {});
      return json({ discount: d });
    }
    if (r[2] === "orders" && m === "GET") {
      const list = await db.select({ id: orders.id, status: orders.status, totalCop: orders.totalCop, discountCop: discountRedemptions.amountCop, redemption: discountRedemptions.status, createdAt: orders.createdAt, email: profiles.email })
        .from(discountRedemptions).innerJoin(orders, eq(orders.id, discountRedemptions.orderId)).innerJoin(profiles, eq(profiles.id, orders.userId))
        .where(eq(discountRedemptions.discountCodeId, did)).orderBy(desc(orders.createdAt)).limit(200);
      return json({ orders: list });
    }
  }

  /* ================= Usuarios ================= */
  if (r[0] === "users") {
    if (!id && m === "GET") {
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80).replace(/[%_\\]/g, "");
      const list = await db.select({
        id: profiles.id, email: profiles.email, name: profiles.displayName, createdAt: profiles.createdAt, lastSeenAt: profiles.lastSeenAt,
        orders: sql<number>`(select count(*)::int from orders o where o.user_id = ${profiles.id})`,
        spentCop: sql<number>`(select coalesce(sum(total_cop),0)::bigint from orders o where o.user_id = ${profiles.id} and o.status in ('payment_verified','preparing','delivered'))`,
        isAdmin: sql<boolean>`exists(select 1 from user_roles ur where ur.user_id = ${profiles.id} and ur.role = 'admin')`,
      }).from(profiles).where(q ? or(ilike(profiles.email, `%${q}%`), ilike(profiles.displayName, `%${q}%`)) : undefined).orderBy(desc(profiles.createdAt)).limit(200);
      return json({ users: list.map((u) => ({ ...u, spentCop: Number(u.spentCop) })) });
    }
    if (r[2] === "admin" && m === "POST") {
      const b = await readJson(req);
      const grant = bool(b.grant);
      const uid = str(id, 64, { required: true });
      if (uid === a.id && !grant) throw new HttpError(400, "cannot_revoke_self");
      const [u] = await db.select().from(profiles).where(eq(profiles.id, uid));
      if (!u) throw new HttpError(404, "user_not_found");
      if (grant) await db.insert(userRoles).values({ userId: uid, role: "admin", grantedBy: a.email }).onConflictDoNothing();
      else await db.delete(userRoles).where(and(eq(userRoles.userId, uid), eq(userRoles.role, "admin")));
      // Sincroniza el rol en Netlify Identity (surte efecto en el próximo inicio de sesión o renovación del token).
      let identitySynced = false;
      try {
        const iu = await identityAdmin.getUser(uid);
        const roles = new Set(iu.roles ?? []);
        grant ? roles.add("admin") : roles.delete("admin");
        await identityAdmin.updateUser(uid, { app_metadata: { ...(iu.appMetadata ?? {}), roles: [...roles] } });
        identitySynced = true;
      } catch (err) {
        console.warn("[nekorbx] no se pudo sincronizar el rol en Identity", (err as Error).message);
      }
      await audit(db, a, grant ? "role.grant" : "role.revoke", "user", uid, { role: "admin", email: u.email, identitySynced });
      return json({ ok: true, identitySynced });
    }
  }

  /* ================= Configuración ================= */
  if (r[0] === "settings") {
    if (m === "GET") return json({ settings: await getSettings(), emailConfigured: Boolean(process.env.RESEND_API_KEY) });
    if (m === "PUT") {
      const b = await readJson(req);
      const patch: Record<string, unknown> = {};
      if ("usdRate" in b) { const v = Number(b.usdRate); if (!Number.isFinite(v) || v < 100 || v > 100000) throw new HttpError(400, "invalid_rate"); patch.usd_rate = Math.round(v * 100) / 100; }
      if ("showUsd" in b) patch.show_usd = bool(b.showUsd);
      if ("whatsappNumber" in b) { const w = String(b.whatsappNumber ?? "").replace(/\D/g, ""); if (w.length < 8 || w.length > 15) throw new HttpError(400, "invalid_whatsapp"); patch.whatsapp_number = w; }
      if ("notifyEmail" in b) { const e = str(b.notifyEmail, 120, { required: true }); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "invalid_email"); patch.notify_email = e.toLowerCase(); }
      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(patch)) {
          await tx.insert(settings).values({ key, value, updatedBy: a.email, updatedAt: new Date() })
            .onConflictDoUpdate({ target: settings.key, set: { value, updatedBy: a.email, updatedAt: new Date() } });
        }
        await audit(tx, a, "settings.update", "settings", null, patch);
      });
      return json({ settings: await getSettings() });
    }
  }

  /* ================= Auditoría ================= */
  if (r[0] === "audit" && m === "GET") {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const entity = url.searchParams.get("entity");
    const list = await db.select().from(adminAuditLogs)
      .where(entity ? eq(adminAuditLogs.entityType, entity) : undefined)
      .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id)).limit(50).offset((page - 1) * 50);
    return json({ logs: list, page });
  }

  return json({ error: "not_found" }, 404);
});

export const config: Config = { path: ["/api/admin/*"] };
