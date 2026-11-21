import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  categories, products, offers, discountCodes, discountRedemptions, orders, orderItems,
  orderStatusHistory, settings,
} from "../db/schema.js";
import { HttpError } from "./http.js";
import {
  PricingError, computeDiscount, normalizeCart, normalizeCode, priceLines, isOfferLive, effectivePrice, fmtCop,
  type OfferRow, type ProductRow,
} from "./pricing.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Q = typeof db | Tx;

/* ---------- Ajustes ---------- */
export type StoreSettings = { usdRate: number; showUsd: boolean; whatsappNumber: string; notifyEmail: string };

export async function getSettings(q: Q = db): Promise<StoreSettings> {
  const rows = await q.select().from(settings);
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value as any]));
  return {
    usdRate: Number(m.usd_rate) > 0 ? Number(m.usd_rate) : 3163,
    showUsd: m.show_usd !== false,
    whatsappNumber: typeof m.whatsapp_number === "string" ? m.whatsapp_number : "573247359023",
    notifyEmail: typeof m.notify_email === "string" ? m.notify_email : "xdnola7@gmail.com",
  };
}

export const usdFor = (priceCop: number, fixedUsd: string | null, usingPromo: boolean, rate: number) =>
  fixedUsd && !usingPromo ? Number(fixedUsd) : Math.round((priceCop / rate) * 100) / 100;

/* ---------- Catálogo público ---------- */
export async function publicCatalog() {
  const now = new Date();
  const [cfg, cats, prods, offs] = await Promise.all([
    getSettings(),
    db.select().from(categories).where(and(eq(categories.isActive, true), isNull(categories.archivedAt))).orderBy(asc(categories.sortOrder), asc(categories.id)),
    db.select().from(products).where(and(eq(products.isActive, true), isNull(products.archivedAt))).orderBy(asc(products.sortOrder), asc(products.id)),
    db.select().from(offers).where(eq(offers.isActive, true)).orderBy(asc(offers.sortOrder), asc(offers.id)),
  ]);
  const liveOffers = offs.filter((o) => isOfferLive(o, now));
  const catIds = new Set(cats.map((c) => c.id));
  const list = prods.filter((p) => catIds.has(p.categoryId)).map((p) => {
    const eff = effectivePrice(p, liveOffers, now);
    const promo = eff.offerId != null;
    return {
      id: p.id,
      categoryId: p.categoryId,
      slug: p.slug,
      name: { es: p.nameEs, en: p.nameEn },
      description: { es: p.descriptionEs, en: p.descriptionEn },
      tag: p.tagEs ? { es: p.tagEs, en: p.tagEn || p.tagEs } : null,
      priceCop: eff.priceCop,
      regularPriceCop: promo ? p.priceCop : null,
      priceUsd: usdFor(eff.priceCop, p.priceUsd, promo, cfg.usdRate),
      durationDays: p.durationDays,
      robuxAmount: p.robuxAmount,
      icon: p.icon,
      imageUrl: p.imageUrl,
      available: p.status === "available",
      featured: p.featured,
      maxPerOrder: p.maxPerOrder,
    };
  });
  return {
    settings: { usdRate: cfg.usdRate, showUsd: cfg.showUsd, whatsappNumber: cfg.whatsappNumber },
    categories: cats.map((c) => ({ id: c.id, slug: c.slug, icon: c.icon, name: { es: c.nameEs, en: c.nameEn }, description: { es: c.descriptionEs, en: c.descriptionEn } })),
    products: list,
    offers: liveOffers.filter((o) => o.productId == null || list.some((p) => p.id === o.productId)).map((o) => ({
      id: o.id,
      productId: o.productId,
      title: { es: o.titleEs, en: o.titleEn },
      description: { es: o.descriptionEs, en: o.descriptionEn },
      promoPriceCop: o.promoPriceCop,
      endsAt: o.endsAt,
    })),
    generatedAt: now.toISOString(),
  };
}

/* ---------- Cotización (servidor = única fuente de verdad) ---------- */
export async function quote(q: Q, opts: { items: unknown; code?: unknown; userId?: string | null; lock?: boolean }) {
  const now = new Date();
  const lines = normalizeCart(opts.items);
  const ids = lines.map((l) => l.productId);
  const [prods, cats, offs] = await Promise.all([
    q.select().from(products).where(inArray(products.id, ids)),
    q.select({ id: categories.id, slug: categories.slug }).from(categories).where(and(eq(categories.isActive, true), isNull(categories.archivedAt))),
    q.select().from(offers).where(and(eq(offers.isActive, true), inArray(offers.productId, ids))),
  ]);
  const byId = new Map<number, ProductRow & (typeof prods)[number]>(prods.map((p) => [p.id, p]));
  const activeCats = new Set(cats.map((c) => c.id));
  const catSlug = new Map(cats.map((c) => [c.id, c.slug]));
  const priced = priceLines(lines, byId, activeCats, offs as OfferRow[], now);
  const subtotalCop = priced.reduce((s, l) => s + l.lineTotalCop, 0);

  let discount: { id: number; code: string; amountCop: number } | null = null;
  const code = normalizeCode(opts.code);
  if (code) {
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new PricingError("code_invalid");
    let sel = q.select().from(discountCodes).where(eq(discountCodes.code, code)).$dynamic();
    if (opts.lock) sel = sel.for("update");
    const [d] = await sel;
    if (!d) throw new PricingError("code_invalid");
    const [{ total }] = await q.select({ total: sql<number>`count(*)::int` }).from(discountRedemptions)
      .where(and(eq(discountRedemptions.discountCodeId, d.id), eq(discountRedemptions.status, "applied")));
    let byUser = 0;
    if (opts.userId) {
      const [r] = await q.select({ n: sql<number>`count(*)::int` }).from(discountRedemptions)
        .where(and(eq(discountRedemptions.discountCodeId, d.id), eq(discountRedemptions.userId, opts.userId), eq(discountRedemptions.status, "applied")));
      byUser = r.n;
    }
    const r = computeDiscount(d, priced, { total, byUser }, now);
    discount = { id: d.id, code: d.code, amountCop: r.amountCop };
  }
  const discountCop = discount?.amountCop ?? 0;
  return {
    lines: priced.map((l) => {
      const p = byId.get(l.productId)!;
      return { ...l, nameEs: p.nameEs, nameEn: p.nameEn, durationDays: p.durationDays, categorySlug: catSlug.get(p.categoryId) ?? "" };
    }),
    subtotalCop,
    discount,
    discountCop,
    totalCop: subtotalCop - discountCop,
  };
}

/* ---------- Pedidos ---------- */
const newOrderId = () => `NEKO-${randomBytes(3).toString("hex").toUpperCase()}`;

export async function createOrder(userId: string, body: any) {
  const idem = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(idem)) throw new HttpError(400, "invalid_idempotency_key");
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : "";

  // Pedido repetido (doble clic, reintento de red): devolvemos el mismo.
  const [dup] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idem)));
  if (dup) return { id: dup.id, duplicate: true };

  const [{ pending }] = await db.select({ pending: sql<number>`count(*)::int` }).from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "pending_payment")));
  if (pending >= 10) throw new HttpError(429, "too_many_pending_orders");

  const cfg = await getSettings();
  try {
    return await db.transaction(async (tx) => {
      const qt = await quote(tx, { items: body?.items, code: body?.code, userId, lock: true });
      let id = "";
      for (let i = 0; i < 6 && !id; i++) {
        const candidate = newOrderId();
        const ins = await tx.insert(orders).values({
          id: candidate,
          userId,
          status: "pending_payment",
          subtotalCop: qt.subtotalCop,
          discountCop: qt.discountCop,
          totalCop: qt.totalCop,
          discountCodeId: qt.discount?.id ?? null,
          discountCode: qt.discount?.code ?? null,
          usdRate: String(cfg.usdRate),
          customerNote: note,
          idempotencyKey: idem,
        }).onConflictDoNothing({ target: orders.id }).returning({ id: orders.id });
        if (ins.length) id = ins[0].id;
      }
      if (!id) throw new HttpError(500, "order_id_generation_failed");
      await tx.insert(orderItems).values(qt.lines.map((l) => ({
        orderId: id,
        productId: l.productId,
        productName: l.nameEs,
        categorySlug: l.categorySlug,
        durationDays: l.durationDays,
        unitPriceCop: l.unitPriceCop,
        quantity: l.quantity,
        lineTotalCop: l.lineTotalCop,
      })));
      if (qt.discount) {
        await tx.insert(discountRedemptions).values({ discountCodeId: qt.discount.id, orderId: id, userId, amountCop: qt.discountCop });
      }
      await tx.insert(orderStatusHistory).values({ orderId: id, fromStatus: null, toStatus: "pending_payment", note: "Pedido creado", changedBy: userId, actorType: "customer" });
      return { id, duplicate: false };
    });
  } catch (err: any) {
    // Carrera con la misma clave de idempotencia: devolver el pedido existente.
    if ((err?.code ?? err?.cause?.code) === "23505") {
      const [again] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, idem)));
      if (again) return { id: again.id, duplicate: true };
    }
    throw err;
  }
}

export async function loadOrder(id: string, q: Q = db) {
  const [o] = await q.select().from(orders).where(eq(orders.id, id));
  if (!o) return null;
  const [items, history] = await Promise.all([
    q.select().from(orderItems).where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.id)),
    q.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)).orderBy(desc(orderStatusHistory.createdAt), desc(orderStatusHistory.id)),
  ]);
  return { ...o, items, history };
}

const itemLabel = (i: { productName: string; quantity: number; durationDays: number | null }) =>
  `${i.quantity}x ${i.productName}${i.durationDays ? ` (${i.durationDays} días)` : ""}`;

/** Mensaje prellenado de WhatsApp con el formato acordado. */
export function whatsappLink(number: string, o: { id: string; subtotalCop: number; discountCop: number; discountCode: string | null; totalCop: number; items: { productName: string; quantity: number; durationDays: number | null }[] }) {
  const msg = [
    "Hola, NekoRBX.",
    "",
    "Quiero realizar el pago de mi pedido.",
    "",
    `ID: ${o.id}`,
    "",
    `Productos: ${o.items.map(itemLabel).join(", ")}`,
    "",
    `Subtotal: ${fmtCop(o.subtotalCop)}`,
    "",
    `Descuento: ${o.discountCop > 0 ? `${fmtCop(o.discountCop)}${o.discountCode ? ` (${o.discountCode})` : ""}` : "COP $0"}`,
    "",
    `Total: ${fmtCop(o.totalCop)}`,
    "",
    "¿Me pueden enviar el enlace de pago?",
  ].join("\n");
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
}

/** Vista del pedido apta para su dueño (sin notas internas del admin). */
export function customerOrderView(o: NonNullable<Awaited<ReturnType<typeof loadOrder>>>, whatsappNumber: string) {
  return {
    id: o.id,
    status: o.status,
    subtotalCop: o.subtotalCop,
    discountCop: o.discountCop,
    discountCode: o.discountCode,
    totalCop: o.totalCop,
    customerNote: o.customerNote,
    paymentReference: o.paymentReference,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    items: o.items.map((i) => ({ productId: i.productId, productName: i.productName, quantity: i.quantity, unitPriceCop: i.unitPriceCop, lineTotalCop: i.lineTotalCop, durationDays: i.durationDays, categorySlug: i.categorySlug })),
    history: o.history.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.actorType === "admin" ? "" : h.note, actorType: h.actorType, createdAt: h.createdAt })),
    whatsappUrl: whatsappLink(whatsappNumber, o),
  };
}
