import type { Config, Context } from "@netlify/functions";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { orders, orderItems, paymentRecords, profiles } from "../../db/schema.js";
import { ensureProfile, getAuthUser, isAdmin, requireUser } from "../../server/auth.js";
import { HttpError, clientIp, json, readJson, str, withErrors } from "../../server/http.js";
import { rateLimit } from "../../server/ratelimit.js";
import { createOrder, customerOrderView, getSettings, loadOrder, quote } from "../../server/store.js";
import { changeOrderStatus } from "../../server/status.js";
import { notifyNewOrder, notifyOrderChange } from "../../server/notify.js";

const ORDER_ID = /^NEKO-[0-9A-F]{6}$/;

export default withErrors(async (req: Request, ctx: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean); // ["api", ...]
  const route = parts.slice(1);
  const method = req.method;

  /* ---- Cotización del carrito (precios y cupón validados en el servidor) ---- */
  if (route[0] === "cart" && route[1] === "quote" && method === "POST") {
    const body = await readJson(req);
    const user = await getAuthUser(req).catch(() => null);
    await rateLimit(`quote:${user?.id ?? clientIp(req, ctx)}`, 60, 600);
    if (body?.code) await rateLimit(`code:${user?.id ?? clientIp(req, ctx)}`, 20, 600);
    const q = await quote(db, { items: body?.items, code: body?.code, userId: user?.id ?? null });
    return json({
      lines: q.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPriceCop: l.unitPriceCop, lineTotalCop: l.lineTotalCop })),
      subtotalCop: q.subtotalCop,
      discountCop: q.discountCop,
      discountCode: q.discount?.code ?? null,
      totalCop: q.totalCop,
    });
  }

  const user = await requireUser(req);

  /* ---- Perfil ---- */
  if (route[0] === "me" && route.length === 1) {
    if (method === "GET") {
      const p = await ensureProfile(user, ctx);
      return json({ user: { id: p.id, email: p.email, name: p.displayName, createdAt: p.createdAt }, isAdmin: await isAdmin(user) });
    }
    if (method === "PUT") {
      const body = await readJson(req);
      const name = str(body?.name, 40, { required: true, min: 2 });
      await ensureProfile(user, ctx);
      const [p] = await db.update(profiles).set({ displayName: name, updatedAt: new Date() }).where(eq(profiles.id, user.id)).returning();
      return json({ user: { id: p.id, email: p.email, name: p.displayName, createdAt: p.createdAt } });
    }
  }

  /* ---- Pedidos del usuario ---- */
  if (route[0] === "orders") {
    const cfg = await getSettings();

    if (route.length === 1 && method === "GET") {
      const list = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt)).limit(100);
      const items = list.length
        ? await db.select().from(orderItems).where(inArray(orderItems.orderId, list.map((o) => o.id)))
        : [];
      return json({
        orders: list.map((o) => ({
          id: o.id, status: o.status, totalCop: o.totalCop, subtotalCop: o.subtotalCop, discountCop: o.discountCop, discountCode: o.discountCode, createdAt: o.createdAt,
          items: items.filter((i) => i.orderId === o.id).map((i) => ({ productName: i.productName, quantity: i.quantity, durationDays: i.durationDays })),
        })),
      });
    }

    if (route.length === 1 && method === "POST") {
      await rateLimit(`order:${user.id}`, 10, 600);
      const body = await readJson(req);
      await ensureProfile(user, ctx);
      const { id, duplicate } = await createOrder(user.id, body);
      const o = (await loadOrder(id))!;
      if (!duplicate) ctx.waitUntil(notifyNewOrder({ id: o.id, status: o.status, totalCop: o.totalCop, createdAt: o.createdAt, items: o.items, discountCode: o.discountCode }));
      return json({ order: customerOrderView(o, cfg.whatsappNumber), duplicate }, duplicate ? 200 : 201);
    }

    const id = (route[1] ?? "").toUpperCase();
    if (!ORDER_ID.test(id)) throw new HttpError(404, "order_not_found");
    // Solo el dueño puede ver su pedido: un ID ajeno responde igual que uno inexistente.
    const [own] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.id, id), eq(orders.userId, user.id)));
    if (!own) throw new HttpError(404, "order_not_found");

    if (route.length === 2 && method === "GET") {
      return json({ order: customerOrderView((await loadOrder(id))!, cfg.whatsappNumber) });
    }

    if (route[2] === "cancel" && method === "POST") {
      const o = (await loadOrder(id))!;
      if (!["pending_payment", "in_review"].includes(o.status)) throw new HttpError(409, "cannot_cancel");
      const r = await changeOrderStatus(id, "cancelled", { id: user.id, email: user.email, type: "customer" }, "Cancelado por el cliente", { onlyOwner: user.id });
      ctx.waitUntil(notifyOrderChange({ id, from: r.from, to: r.to, by: `Cliente (${user.email})` }));
      return json({ order: customerOrderView((await loadOrder(id))!, cfg.whatsappNumber) });
    }

    if (route[2] === "payment-report" && method === "POST") {
      await rateLimit(`payrep:${user.id}`, 10, 600);
      const body = await readJson(req);
      const reference = str(body?.reference, 120, { required: true, min: 3 });
      const method_ = str(body?.method, 60);
      const o = (await loadOrder(id))!;
      if (o.status !== "pending_payment") throw new HttpError(409, "cannot_report_payment");
      await db.insert(paymentRecords).values({ orderId: id, provider: "manual", method: method_, reference, amountCop: o.totalCop, status: "reported", recordedBy: user.id, recordedByEmail: user.email, notes: "Reportado por el cliente" });
      const r = await changeOrderStatus(id, "in_review", { id: user.id, email: user.email, type: "customer" }, `El cliente reportó el pago (ref. ${reference})`, { onlyOwner: user.id });
      ctx.waitUntil(notifyOrderChange({ id, from: r.from, to: r.to, by: `Cliente (${user.email})`, note: `Referencia: ${reference}` }));
      return json({ order: customerOrderView((await loadOrder(id))!, cfg.whatsappNumber) });
    }
  }

  return json({ error: "not_found" }, 404);
});

export const config: Config = { path: ["/api/me", "/api/orders", "/api/orders/*", "/api/cart/quote"] };
