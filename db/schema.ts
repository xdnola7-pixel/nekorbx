import { sql } from "drizzle-orm";
import {
  pgTable, serial, text, integer, boolean, timestamp, numeric, jsonb,
  primaryKey, uniqueIndex, index, check,
} from "drizzle-orm/pg-core";

/*
 * Esquema de NekoRBX.
 * - Importes en COP como enteros (pesos completos, sin decimales) => exactos.
 * - Importes en USD como numeric(10,2).
 * - Los pedidos guardan una copia (snapshot) de nombres y precios: cambiar
 *   productos, precios o descuentos nunca altera pedidos anteriores.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ---------- Usuarios ---------- */

// id = id del usuario en Netlify Identity (uuid). Las contraseñas las gestiona Identity (hash), nunca esta base.
export const profiles = pgTable("profiles", {
  id: text().primaryKey(),
  email: text().notNull(),
  displayName: text("display_name").notNull().default(""),
  locale: text().notNull().default("es"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at"),
}, (t) => [
  index("profiles_email_idx").on(t.email),
  index("profiles_created_idx").on(t.createdAt),
]);

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: text().notNull(),
  grantedBy: text("granted_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.role] }),
  check("user_roles_role_chk", sql`${t.role} in ('admin')`),
]);

/* ---------- Catálogo ---------- */

export const categories = pgTable("categories", {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionEs: text("description_es").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  icon: text().notNull().default("sparkle"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: serial().primaryKey(),
  categoryId: integer("category_id").notNull().references(() => categories.id),
  slug: text().notNull().unique(),
  nameEs: text("name_es").notNull(),
  nameEn: text("name_en").notNull(),
  descriptionEs: text("description_es").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  priceCop: integer("price_cop").notNull(),
  // Precio USD fijo opcional; si es null se calcula con la tasa configurable.
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }),
  durationDays: integer("duration_days"),
  robuxAmount: integer("robux_amount"),
  icon: text().notNull().default("sparkle"),
  imageUrl: text("image_url"),
  tagEs: text("tag_es"),
  tagEn: text("tag_en"),
  // available | sold_out
  status: text().notNull().default("available"),
  isActive: boolean("is_active").notNull().default(true),
  featured: boolean().notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  maxPerOrder: integer("max_per_order").notNull().default(10),
  archivedAt: ts("archived_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  index("products_category_idx").on(t.categoryId, t.sortOrder),
  check("products_price_chk", sql`${t.priceCop} > 0`),
  check("products_status_chk", sql`${t.status} in ('available','sold_out')`),
  check("products_max_chk", sql`${t.maxPerOrder} between 1 and 100`),
  check("products_duration_chk", sql`${t.durationDays} is null or ${t.durationDays} > 0`),
]);

export const priceHistory = pgTable("price_history", {
  id: serial().primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id),
  oldPriceCop: integer("old_price_cop"),
  newPriceCop: integer("new_price_cop").notNull(),
  oldPriceUsd: numeric("old_price_usd", { precision: 10, scale: 2 }),
  newPriceUsd: numeric("new_price_usd", { precision: 10, scale: 2 }),
  reason: text().notNull().default(""),
  changedBy: text("changed_by"),
  changedByEmail: text("changed_by_email"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("price_history_product_idx").on(t.productId, t.createdAt)]);

// Ofertas: promociones con fechas; si tienen precio promocional, ese es el precio real de venta mientras estén vigentes.
export const offers = pgTable("offers", {
  id: serial().primaryKey(),
  productId: integer("product_id").references(() => products.id),
  titleEs: text("title_es").notNull(),
  titleEn: text("title_en").notNull(),
  descriptionEs: text("description_es").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  promoPriceCop: integer("promo_price_cop"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  index("offers_product_idx").on(t.productId),
  check("offers_promo_chk", sql`${t.promoPriceCop} is null or ${t.promoPriceCop} > 0`),
  check("offers_dates_chk", sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
]);

/* ---------- Descuentos ---------- */

export const discountCodes = pgTable("discount_codes", {
  id: serial().primaryKey(),
  code: text().notNull().unique(), // siempre en MAYÚSCULAS
  description: text().notNull().default(""),
  kind: text().notNull().default("percent"), // percent | fixed
  value: integer().notNull(), // % (1-100) o COP
  isActive: boolean("is_active").notNull().default(true),
  archivedAt: ts("archived_at"),
  startsAt: ts("starts_at"),
  expiresAt: ts("expires_at"),
  maxUses: integer("max_uses"),
  maxUsesPerUser: integer("max_uses_per_user"),
  minSubtotalCop: integer("min_subtotal_cop"),
  productIds: integer("product_ids").array().notNull().default(sql`'{}'::integer[]`),
  categoryIds: integer("category_ids").array().notNull().default(sql`'{}'::integer[]`),
  createdBy: text("created_by"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  check("discount_kind_chk", sql`${t.kind} in ('percent','fixed')`),
  check("discount_value_chk", sql`${t.value} > 0 and (${t.kind} <> 'percent' or ${t.value} <= 100)`),
  check("discount_code_chk", sql`${t.code} ~ '^[A-Z0-9_-]{3,32}$'`),
  check("discount_max_chk", sql`${t.maxUses} is null or ${t.maxUses} > 0`),
]);

/* ---------- Pedidos ---------- */

export const ORDER_STATUSES = [
  "pending_payment", "in_review", "payment_verified", "preparing", "delivered", "cancelled", "refunded",
] as const;

export const orders = pgTable("orders", {
  id: text().primaryKey(), // NEKO-XXXXXX
  userId: text("user_id").notNull().references(() => profiles.id),
  status: text().notNull().default("pending_payment"),
  subtotalCop: integer("subtotal_cop").notNull(),
  discountCop: integer("discount_cop").notNull().default(0),
  totalCop: integer("total_cop").notNull(),
  discountCodeId: integer("discount_code_id").references(() => discountCodes.id),
  discountCode: text("discount_code"),
  usdRate: numeric("usd_rate", { precision: 12, scale: 2 }),
  customerNote: text("customer_note").notNull().default(""),
  adminNotes: text("admin_notes").notNull().default(""),
  paymentReference: text("payment_reference"),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  paidAt: ts("paid_at"),
  deliveredAt: ts("delivered_at"),
  cancelledAt: ts("cancelled_at"),
}, (t) => [
  uniqueIndex("orders_idem_idx").on(t.userId, t.idempotencyKey),
  index("orders_user_idx").on(t.userId, t.createdAt),
  index("orders_status_idx").on(t.status, t.createdAt),
  index("orders_created_idx").on(t.createdAt),
  check("orders_id_chk", sql`${t.id} ~ '^NEKO-[0-9A-F]{6}$'`),
  check("orders_status_chk", sql`${t.status} in ('pending_payment','in_review','payment_verified','preparing','delivered','cancelled','refunded')`),
  check("orders_amounts_chk", sql`${t.subtotalCop} >= 0 and ${t.discountCop} >= 0 and ${t.discountCop} <= ${t.subtotalCop} and ${t.totalCop} = ${t.subtotalCop} - ${t.discountCop}`),
]);

export const orderItems = pgTable("order_items", {
  id: serial().primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id),
  productName: text("product_name").notNull(),
  categorySlug: text("category_slug").notNull(),
  durationDays: integer("duration_days"),
  unitPriceCop: integer("unit_price_cop").notNull(),
  quantity: integer().notNull(),
  lineTotalCop: integer("line_total_cop").notNull(),
}, (t) => [
  index("order_items_order_idx").on(t.orderId),
  index("order_items_product_idx").on(t.productId),
  check("order_items_qty_chk", sql`${t.quantity} between 1 and 100`),
  check("order_items_total_chk", sql`${t.lineTotalCop} = ${t.unitPriceCop} * ${t.quantity}`),
]);

export const discountRedemptions = pgTable("discount_redemptions", {
  id: serial().primaryKey(),
  discountCodeId: integer("discount_code_id").notNull().references(() => discountCodes.id),
  orderId: text("order_id").notNull().unique().references(() => orders.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => profiles.id),
  amountCop: integer("amount_cop").notNull(),
  status: text().notNull().default("applied"), // applied | voided
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  index("redemptions_code_idx").on(t.discountCodeId, t.status),
  index("redemptions_user_idx").on(t.userId, t.discountCodeId),
  check("redemptions_status_chk", sql`${t.status} in ('applied','voided')`),
]);

export const orderStatusHistory = pgTable("order_status_history", {
  id: serial().primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  note: text().notNull().default(""),
  changedBy: text("changed_by"),
  changedByEmail: text("changed_by_email"),
  actorType: text("actor_type").notNull().default("customer"), // customer | admin | system
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)]);

// Transacciones/pagos separados del pedido (preparado para proveedores automáticos futuros).
export const paymentRecords = pgTable("payment_records", {
  id: serial().primaryKey(),
  orderId: text("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  provider: text().notNull().default("manual"),
  method: text().notNull().default(""),
  reference: text().notNull().default(""),
  amountCop: integer("amount_cop"),
  status: text().notNull().default("reported"), // reported | verified | rejected
  notes: text().notNull().default(""),
  recordedBy: text("recorded_by"),
  recordedByEmail: text("recorded_by_email"),
  verifiedBy: text("verified_by"),
  verifiedAt: ts("verified_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  index("payment_records_order_idx").on(t.orderId),
  check("payment_records_status_chk", sql`${t.status} in ('reported','verified','rejected')`),
]);

/* ---------- Administración ---------- */

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial().primaryKey(),
  adminId: text("admin_id").notNull(),
  adminEmail: text("admin_email").notNull(),
  action: text().notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  details: jsonb().notNull().default(sql`'{}'::jsonb`),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  index("audit_created_idx").on(t.createdAt),
  index("audit_entity_idx").on(t.entityType, t.entityId),
]);

export const settings = pgTable("settings", {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const rateLimits = pgTable("rate_limits", {
  key: text().primaryKey(),
  windowStart: ts("window_start").notNull().defaultNow(),
  count: integer().notNull().default(0),
});

/* ---------- Acceso administrativo por código de un solo uso ---------- */
export const adminLoginCodes = pgTable("admin_login_codes", {
  id: serial().primaryKey(),
  email: text().notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer().notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("admin_login_codes_email_idx").on(t.email, t.createdAt)]);

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text().notNull(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});
