import { PricingError } from "./pricing.js";

export class HttpError extends Error {
  constructor(public status: number, public code: string, public meta: Record<string, unknown> = {}) {
    super(code);
  }
}

const SECURITY_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...SECURITY_HEADERS, ...headers },
  });

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<any> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large");
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new HttpError(400, "invalid_json"); }
}

/** Convierte cualquier error en una respuesta segura (sin filtrar detalles internos). */
export function handleError(err: unknown) {
  if (err instanceof HttpError) return json({ error: err.code, ...err.meta }, err.status);
  if (err instanceof PricingError) return json({ error: err.code, ...err.meta }, err.status);
  const pg = err as { code?: string; cause?: { code?: string } };
  const pgCode = pg?.code ?? pg?.cause?.code;
  if (pgCode === "23505") return json({ error: "conflict" }, 409);
  if (pgCode === "23514" || pgCode === "22P02" || pgCode === "23503") return json({ error: "invalid_data" }, 400);
  console.error("[nekorbx] unexpected error", err);
  return json({ error: "server_error" }, 500);
}

export const withErrors = (fn: (req: Request, ctx: any) => Promise<Response>) =>
  async (req: Request, ctx: any) => {
    try { return await fn(req, ctx); } catch (err) { return handleError(err); }
  };

/* ---------- Validadores pequeños ---------- */
export const str = (v: unknown, max = 200, { required = false, min = 0 } = {}) => {
  if (v == null || v === "") {
    if (required) throw new HttpError(400, "missing_field");
    return "";
  }
  if (typeof v !== "string") throw new HttpError(400, "invalid_field");
  const s = v.trim();
  if (s.length > max || s.length < min) throw new HttpError(400, "invalid_length", { max, min });
  return s;
};
export const int = (v: unknown, { min = -Infinity, max = Infinity, nullable = false } = {}): number | null => {
  if ((v == null || v === "") && nullable) return null;
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new HttpError(400, "invalid_number", { min, max });
  return n;
};
export const bool = (v: unknown) => v === true || v === "true" || v === 1;
export const date = (v: unknown): Date | null => {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new HttpError(400, "invalid_date");
  return d;
};
export const usd = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new HttpError(400, "invalid_usd");
  return n.toFixed(2);
};

export const clientIp = (req: Request, ctx: any) =>
  ctx?.ip ?? req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
