import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { profiles, userRoles, adminSessions } from "../db/schema.js";
import { createHash } from "node:crypto";
import { gt, isNull } from "drizzle-orm";
import { HttpError } from "./http.js";
import { notifyNewUser } from "./notify.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  confirmed: boolean;
  identityRoles: string[];
};

// Caché breve en memoria de tokens ya verificados (solo optimización; la verdad es Netlify Identity).
const cache = new Map<string, { user: AuthUser; until: number }>();
const CACHE_MS = 30_000;

const identityUrl = (req: Request) => {
  const base = new URL(req.url).origin;
  return new URL("/.netlify/identity", base).href;
};

function bearer(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+([A-Za-z0-9\-_.]+)$/.exec(h);
  return m ? m[1] : null;
}

/** Verifica el token contra Netlify Identity (firma, caducidad y revocación). */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const token = bearer(req);
  if (!token || token.length > 4096) return null;
  const hit = cache.get(token);
  if (hit && hit.until > Date.now()) return hit.user;

  let res: Response;
  try {
    res = await fetch(`${identityUrl(req)}/user`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new HttpError(503, "auth_unavailable");
  }
  if (!res.ok) return null;
  const u: any = await res.json();
  if (!u?.id || !u?.email) return null;
  const user: AuthUser = {
    id: String(u.id),
    email: String(u.email).toLowerCase(),
    name: String(u.user_metadata?.full_name ?? u.user_metadata?.name ?? "").slice(0, 60),
    confirmed: Boolean(u.confirmed_at),
    identityRoles: Array.isArray(u.app_metadata?.roles) ? u.app_metadata.roles.map(String) : [],
  };
  if (cache.size > 500) cache.clear();
  cache.set(token, { user, until: Date.now() + CACHE_MS });
  return user;
}

export async function requireUser(req: Request) {
  const user = await getAuthUser(req);
  if (!user) throw new HttpError(401, "unauthorized");
  return user;
}

/** Crea/actualiza el perfil del usuario verificado. Notifica al admin si es nuevo. */
export async function ensureProfile(user: AuthUser, ctx?: any) {
  const inserted = await db.insert(profiles)
    .values({ id: user.id, email: user.email, displayName: user.name || user.email.split("@")[0], lastSeenAt: new Date() })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) {
    const p = inserted[0];
    const job = notifyNewUser({ name: p.displayName, email: p.email, createdAt: p.createdAt });
    ctx?.waitUntil ? ctx.waitUntil(job) : await job;
    return p;
  }
  const [p] = await db.update(profiles)
    .set({ email: user.email, lastSeenAt: new Date() })
    .where(eq(profiles.id, user.id))
    .returning();
  return p;
}

export async function isAdmin(user: AuthUser) {
  if (!user.confirmed) return false;
  if (user.identityRoles.includes("admin")) return true;
  // Cuenta del titular: se valida en el servidor contra el correo verificado en Netlify Identity.
  const owners = (process.env.ADMIN_EMAILS || "xdnola7@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (owners.includes(user.email)) return true;
  const rows = await db.select({ role: userRoles.role }).from(userRoles)
    .where(and(eq(userRoles.userId, user.id), eq(userRoles.role, "admin"))).limit(1);
  return rows.length > 0;
}

export const ownerEmails = () => (process.env.ADMIN_EMAILS || "xdnola7@gmail.com").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** Autorización administrativa SIEMPRE en el servidor: sesión creada tras verificar el código de un solo uso. */
export async function requireAdmin(req: Request): Promise<AuthUser> {
  const tok = req.headers.get("x-admin-session") ?? "";
  if (!/^[a-f0-9]{64}$/.test(tok)) throw new HttpError(401, "unauthorized");
  const [s] = await db.select().from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, sha256(tok)), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, new Date()))).limit(1);
  if (!s || !ownerEmails().includes(s.email)) throw new HttpError(401, "unauthorized");
  return { id: `owner:${s.email}`, email: s.email, name: "Admin", confirmed: true, identityRoles: ["admin"] };
}
