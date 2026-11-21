/*
 * Notificaciones administrativas por correo transaccional (Resend, desde el servidor).
 * Variables: RESEND_API_KEY (obligatoria para enviar), NOTIFY_FROM y ADMIN_NOTIFY_EMAIL (opcionales).
 * Nunca se envían contraseñas, tokens ni datos de pago sensibles.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { settings } from "../db/schema.js";
import { fmtCop } from "./pricing.js";

async function recipient() {
  if (process.env.ADMIN_NOTIFY_EMAIL) return process.env.ADMIN_NOTIFY_EMAIL;
  try {
    const [row] = await db.select().from(settings).where(eq(settings.key, "notify_email"));
    if (typeof row?.value === "string" && row.value.includes("@")) return row.value;
  } catch { /* usa el predeterminado */ }
  return DEFAULT_TO;
}

const DEFAULT_TO = "xdnola7@gmail.com";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const when = (d: Date | string) => new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota" });

export const STATUS_LABELS_ES: Record<string, string> = {
  pending_payment: "Pendiente de pago",
  in_review: "En revisión",
  payment_verified: "Pago verificado",
  preparing: "En preparación",
  delivered: "Entregado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

async function send(subject: string, rows: [string, string][], to?: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[nekorbx] RESEND_API_KEY no configurada; notificación omitida: ${subject}`);
    return false;
  }
  const html = `<div style="font-family:Arial,sans-serif;background:#07060b;color:#f5f4fa;padding:24px;border-radius:12px">
    <h2 style="margin:0 0 16px;color:#a78bfa">${esc(subject)}</h2>
    <table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#a3a0b5">${esc(k)}</td><td style="padding:4px 0">${esc(v)}</td></tr>`).join("")}</table>
  </div>`;
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || "NekoRBX <onboarding@resend.dev>",
        to: [to ?? await recipient()],
        subject: `[NekoRBX] ${subject}`,
        html,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { console.error(`[nekorbx] Resend respondió ${res.status}`); return false; }
    return true;
  } catch (err) {
    console.error("[nekorbx] error enviando correo", (err as Error).message);
    return false;
  }
}

export const notifyNewUser = (u: { name: string; email: string; createdAt: Date }) =>
  send("Nuevo usuario registrado", [["Nombre", u.name], ["Correo", u.email], ["Fecha de registro", when(u.createdAt)]]);

type OrderMail = { id: string; status: string; totalCop: number; createdAt: Date; items: { productName: string; quantity: number }[]; discountCode?: string | null };

export const notifyNewOrder = (o: OrderMail) =>
  send(`Nuevo pedido ${o.id}`, [
    ["ID", o.id],
    ["Productos", o.items.map((i) => `${i.quantity}x ${i.productName}`).join(", ")],
    ["Total", fmtCop(o.totalCop)],
    ["Código", o.discountCode || "—"],
    ["Fecha", when(o.createdAt)],
    ["Estado", STATUS_LABELS_ES[o.status] ?? o.status],
  ]);

export const notifyOrderChange = (o: { id: string; from: string | null; to: string; by: string; note?: string }) =>
  send(`Pedido ${o.id}: ${STATUS_LABELS_ES[o.to] ?? o.to}`, [
    ["ID", o.id],
    ["Estado anterior", o.from ? STATUS_LABELS_ES[o.from] ?? o.from : "—"],
    ["Estado nuevo", STATUS_LABELS_ES[o.to] ?? o.to],
    ["Realizado por", o.by],
    ["Nota", o.note || "—"],
  ]);

export const sendAdminCode = (email: string, code: string) =>
  send("Código de acceso al panel", [["Código", code], ["Válido por", "10 minutos, un solo uso"], ["Aviso", "Si no lo pediste, ignora este correo."]], email);
