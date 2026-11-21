import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { orders, orderStatusHistory, discountRedemptions } from "../db/schema.js";
import { HttpError } from "./http.js";
import { canTransition } from "./pricing.js";

export type Actor = { id: string; email: string; type: "customer" | "admin" | "system" };

/** Cambia el estado de un pedido de forma transaccional y deja rastro en el historial. */
export async function changeOrderStatus(orderId: string, to: string, actor: Actor, note = "", extra: { paymentReference?: string | null; onlyOwner?: string } = {}) {
  return db.transaction(async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || (extra.onlyOwner && o.userId !== extra.onlyOwner)) throw new HttpError(404, "order_not_found");
    if (o.status === to) throw new HttpError(409, "same_status");
    if (!canTransition(o.status, to)) throw new HttpError(409, "invalid_transition", { from: o.status, to });
    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: to, updatedAt: now };
    if (to === "payment_verified") patch.paidAt = now;
    if (to === "delivered") patch.deliveredAt = now;
    if (to === "cancelled") patch.cancelledAt = now;
    if (extra.paymentReference) patch.paymentReference = extra.paymentReference;
    await tx.update(orders).set(patch).where(eq(orders.id, orderId));
    // Un pedido cancelado o reembolsado libera el uso del cupón.
    if (to === "cancelled" || to === "refunded") {
      await tx.update(discountRedemptions).set({ status: "voided" }).where(eq(discountRedemptions.orderId, orderId));
    }
    await tx.insert(orderStatusHistory).values({
      orderId, fromStatus: o.status, toStatus: to, note: note.slice(0, 500),
      changedBy: actor.id, changedByEmail: actor.email, actorType: actor.type,
    });
    return { from: o.status, to };
  });
}
