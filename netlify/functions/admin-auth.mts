import type { Config, Context } from "@netlify/functions";
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { adminLoginCodes, adminSessions, adminAuditLogs } from "../../db/schema.js";
import { ownerEmails, sha256 } from "../../server/auth.js";
import { HttpError, clientIp, json, readJson, withErrors } from "../../server/http.js";
import { rateLimit } from "../../server/ratelimit.js";
import { sendAdminCode } from "../../server/notify.js";

const CODE_TTL = 10 * 60_000;
const SESSION_TTL = 12 * 3600_000;
// Solo se guarda el hash (scrypt) de la clave, nunca la clave en texto plano.
const PASS_SALT = "93a5d626ace570e29a84ab0d3b70b91a";
const PASS_HASH = "0b5aea17e26381f8fbce8c719e2e27324702aa156310b6c890c5434e971f2558f9f1104e8b05dc9bd2052f78cfa1fabf0b429fb8bed5c5d0dcfba42131f87eda";
function passwordOk(pw: string) {
  if (!pw || pw.length > 200) return false;
  const got = scryptSync(pw, PASS_SALT, 64);
  const want = process.env.ADMIN_PASSWORD ? scryptSync(process.env.ADMIN_PASSWORD, PASS_SALT, 64) : Buffer.from(PASS_HASH, "hex");
  return timingSafeEqual(got, want);
}
const normEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase().slice(0, 120) : "");

export default withErrors(async (req: Request, ctx: Context) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const action = new URL(req.url).pathname.split("/").pop();
  const ip = clientIp(req, ctx);
  const body = await readJson(req);

  if (action === "login") {
    await rateLimit(`admlogin-ip:${ip}`, 5, 900);
    const email = normEmail(body.email);
    const pw = typeof body.password === "string" ? body.password : "";
    const ok = passwordOk(pw);
    if (!ownerEmails().includes(email) || !ok) throw new HttpError(401, "invalid_password");
    const token = randomBytes(32).toString("hex");
    await db.insert(adminSessions).values({ tokenHash: sha256(token), email, expiresAt: new Date(Date.now() + SESSION_TTL) });
    await db.insert(adminAuditLogs).values({ adminId: `owner:${email}`, adminEmail: email, action: "admin.login", entityType: "session", details: { ip } });
    return json({ token, expiresIn: SESSION_TTL / 1000 });
  }

  if (action === "request") {
    await rateLimit(`admcode-ip:${ip}`, 5, 900);
    const email = normEmail(body.email);
    // Misma respuesta exista o no el correo (no revela cuál es el administrativo).
    if (ownerEmails().includes(email)) {
      await rateLimit(`admcode:${email}`, 5, 900);
      const code = Array.from({ length: 10 }, () => randomInt(0, 10)).join("");
      await db.update(adminLoginCodes).set({ usedAt: new Date() }).where(and(eq(adminLoginCodes.email, email), isNull(adminLoginCodes.usedAt)));
      await db.insert(adminLoginCodes).values({ email, codeHash: sha256(code), expiresAt: new Date(Date.now() + CODE_TTL) });
      const sent = await sendAdminCode(email, code);
      if (!sent) throw new HttpError(503, "email_not_configured");
    }
    return json({ ok: true });
  }

  if (action === "verify") {
    await rateLimit(`admverify-ip:${ip}`, 10, 900);
    const email = normEmail(body.email);
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";
    if (!ownerEmails().includes(email) || code.length !== 10) throw new HttpError(401, "invalid_code");
    const [row] = await db.select().from(adminLoginCodes)
      .where(and(eq(adminLoginCodes.email, email), isNull(adminLoginCodes.usedAt), gt(adminLoginCodes.expiresAt, new Date())))
      .orderBy(desc(adminLoginCodes.createdAt)).limit(1);
    if (!row || row.attempts >= 5) throw new HttpError(401, "invalid_code");
    const ok = timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(sha256(code)));
    if (!ok) {
      await db.update(adminLoginCodes).set({ attempts: row.attempts + 1 }).where(eq(adminLoginCodes.id, row.id));
      throw new HttpError(401, "invalid_code");
    }
    // Un solo uso: se marca antes de crear la sesión; si otra petición lo usó primero, falla.
    const used = await db.update(adminLoginCodes).set({ usedAt: new Date() })
      .where(and(eq(adminLoginCodes.id, row.id), isNull(adminLoginCodes.usedAt))).returning({ id: adminLoginCodes.id });
    if (!used.length) throw new HttpError(401, "invalid_code");
    const token = randomBytes(32).toString("hex");
    await db.insert(adminSessions).values({ tokenHash: sha256(token), email, expiresAt: new Date(Date.now() + SESSION_TTL) });
    await db.insert(adminAuditLogs).values({ adminId: `owner:${email}`, adminEmail: email, action: "admin.login", entityType: "session", details: { ip } });
    return json({ token, expiresIn: SESSION_TTL / 1000 });
  }

  if (action === "logout") {
    const tok = req.headers.get("x-admin-session") ?? "";
    if (/^[a-f0-9]{64}$/.test(tok)) await db.update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.tokenHash, sha256(tok)));
    return json({ ok: true });
  }

  return json({ error: "not_found" }, 404);
});

export const config: Config = { path: "/api/admin-auth/*" };
