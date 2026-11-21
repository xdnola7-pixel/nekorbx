import type { Config } from "@netlify/functions";
import { json, withErrors } from "../../server/http.js";
import { publicCatalog } from "../../server/store.js";

// Catálogo público: categorías, productos activos, ofertas vigentes y ajustes visibles.
// Se lee de la base en cada petición, así los cambios del admin se ven sin redesplegar.
export default withErrors(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  return json(await publicCatalog());
});

export const config: Config = { path: "/api/catalog" };
