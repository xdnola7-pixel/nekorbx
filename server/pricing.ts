/*
 * Lógica de precios y descuentos SIN acceso a la base de datos (pura y testeable).
 * El servidor es la única fuente de verdad: nunca se usan precios enviados por el cliente.
 */

export type ProductRow = {
  id: number;
  categoryId: number;
  priceCop: number;
  isActive: boolean;
  archivedAt: Date | null;
  status: string;
  maxPerOrder: number;
};

export type OfferRow = {
  id: number;
  productId: number | null;
  promoPriceCop: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

export type DiscountRow = {
  id: number;
  code: string;
  kind: string; // percent | fixed
  value: number;
  isActive: boolean;
  archivedAt: Date | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  maxUsesPerUser: number | null;
  minSubtotalCop: number | null;
  productIds: number[];
  categoryIds: number[];
};

export type CartLine = { productId: number; quantity: number };
export type PricedLine = CartLine & { unitPriceCop: number; lineTotalCop: number; categoryId: number; offerId: number | null };

export class PricingError extends Error {
  constructor(public code: string, public status = 400, public meta: Record<string, unknown> = {}) {
    super(code);
  }
}

export const isOfferLive = (o: OfferRow, now: Date) =>
  o.isActive && (!o.startsAt || o.startsAt <= now) && (!o.endsAt || o.endsAt > now);

/** Precio vigente: el menor precio promocional activo (si es inferior al precio normal). */
export function effectivePrice(p: { id: number; priceCop: number }, offers: OfferRow[], now: Date) {
  let best = p.priceCop;
  let offerId: number | null = null;
  for (const o of offers) {
    if (o.productId !== p.id || o.promoPriceCop == null || !isOfferLive(o, now)) continue;
    if (o.promoPriceCop < best) { best = o.promoPriceCop; offerId = o.id; }
  }
  return { priceCop: best, offerId };
}

export const isSellable = (p: ProductRow, categoryActive: boolean) =>
  p.isActive && !p.archivedAt && p.status === "available" && categoryActive;

/** Normaliza y valida el carrito recibido (ids enteros, cantidades enteras, sin duplicados). */
export function normalizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new PricingError("cart_empty");
  if (raw.length > 30) throw new PricingError("cart_too_large");
  const map = new Map<number, number>();
  for (const it of raw) {
    const productId = Number((it as any)?.productId);
    const quantity = Number((it as any)?.quantity);
    if (!Number.isInteger(productId) || productId <= 0) throw new PricingError("invalid_product");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw new PricingError("invalid_quantity");
    map.set(productId, (map.get(productId) ?? 0) + quantity);
  }
  return [...map].map(([productId, quantity]) => ({ productId, quantity }));
}

export function priceLines(
  lines: CartLine[],
  productsById: Map<number, ProductRow>,
  activeCategoryIds: Set<number>,
  offers: OfferRow[],
  now: Date,
): PricedLine[] {
  return lines.map((l) => {
    const p = productsById.get(l.productId);
    if (!p) throw new PricingError("product_not_found", 400, { productId: l.productId });
    if (!isSellable(p, activeCategoryIds.has(p.categoryId))) throw new PricingError("product_unavailable", 409, { productId: p.id });
    if (l.quantity > p.maxPerOrder) throw new PricingError("quantity_exceeds_limit", 400, { productId: p.id, max: p.maxPerOrder });
    const { priceCop, offerId } = effectivePrice(p, offers, now);
    return { ...l, unitPriceCop: priceCop, lineTotalCop: priceCop * l.quantity, categoryId: p.categoryId, offerId };
  });
}

export const normalizeCode = (code: unknown) =>
  typeof code === "string" ? code.trim().toUpperCase().slice(0, 32) : "";

/**
 * Calcula el descuento. `usage` = usos válidos (no anulados) totales y del usuario.
 * Lanza PricingError si el código no es aplicable.
 */
export function computeDiscount(
  d: DiscountRow,
  lines: PricedLine[],
  usage: { total: number; byUser: number },
  now: Date,
): { amountCop: number; eligibleSubtotalCop: number } {
  if (!d.isActive || d.archivedAt) throw new PricingError("code_inactive");
  if (d.startsAt && d.startsAt > now) throw new PricingError("code_not_started");
  if (d.expiresAt && d.expiresAt <= now) throw new PricingError("code_expired");
  if (d.maxUses != null && usage.total >= d.maxUses) throw new PricingError("code_exhausted");
  if (d.maxUsesPerUser != null && usage.byUser >= d.maxUsesPerUser) throw new PricingError("code_user_limit");

  const subtotal = lines.reduce((s, l) => s + l.lineTotalCop, 0);
  if (d.minSubtotalCop != null && subtotal < d.minSubtotalCop) throw new PricingError("code_min_subtotal", 400, { min: d.minSubtotalCop });

  const restricted = d.productIds.length > 0 || d.categoryIds.length > 0;
  const eligible = restricted
    ? lines.filter((l) => d.productIds.includes(l.productId) || d.categoryIds.includes(l.categoryId))
    : lines;
  const eligibleSubtotalCop = eligible.reduce((s, l) => s + l.lineTotalCop, 0);
  if (eligibleSubtotalCop <= 0) throw new PricingError("code_not_applicable");

  let amount = d.kind === "percent"
    ? Math.round((eligibleSubtotalCop * d.value) / 100)
    : d.value;
  // Nunca negativo ni mayor que lo elegible (y por tanto nunca mayor que el total).
  amount = Math.max(0, Math.min(amount, eligibleSubtotalCop, subtotal));
  return { amountCop: amount, eligibleSubtotalCop };
}

export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending_payment: ["in_review", "payment_verified", "cancelled"],
  in_review: ["pending_payment", "payment_verified", "cancelled"],
  payment_verified: ["preparing", "delivered", "refunded"],
  preparing: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export const CONFIRMED_STATUSES = ["payment_verified", "preparing", "delivered"];

export const canTransition = (from: string, to: string) => (ORDER_TRANSITIONS[from] ?? []).includes(to);

export const fmtCop = (n: number) => `COP $${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
