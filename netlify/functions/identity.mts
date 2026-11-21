import type { UserSignupEvent } from "@netlify/functions";
import { db } from "../../db/index.js";
import { profiles } from "../../db/schema.js";
import { notifyNewUser } from "../../server/notify.js";

/*
 * Eventos de Netlify Identity.
 * userSignup se dispara cuando el registro se completa (tras verificar el correo):
 * creamos el perfil y avisamos al administrador. No se asignan roles aquí:
 * el rol "admin" solo lo concede el titular desde el panel de Netlify o desde /admin.
 */
export default {
  async userSignup(event: UserSignupEvent) {
    const u = event.user;
    if (!u?.id || !u.email) return;
    try {
      const name = String((u.userMetadata as any)?.full_name ?? "").slice(0, 40) || u.email.split("@")[0];
      const inserted = await db.insert(profiles)
        .values({ id: u.id, email: u.email.toLowerCase(), displayName: name })
        .onConflictDoNothing()
        .returning();
      if (inserted.length) await notifyNewUser({ name: inserted[0].displayName, email: inserted[0].email, createdAt: inserted[0].createdAt });
    } catch (err) {
      console.error("[nekorbx] userSignup", (err as Error).message);
    }
  },
};
