import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Sirve las imágenes de productos guardadas en Netlify Blobs.
export default async (req: Request) => {
  const key = decodeURIComponent(new URL(req.url).pathname.replace(/^\/api\/images\//, ""));
  if (!/^products\/\d+-[0-9a-f]{12}\.(png|jpg|gif|webp)$/.test(key)) return new Response("Not found", { status: 404 });
  const store = getStore({ name: "product-images", consistency: "strong" });
  const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!res) return new Response("Not found", { status: 404 });
  const type = String(res.metadata?.contentType ?? "application/octet-stream");
  return new Response(res.data, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
};

export const config: Config = { path: "/api/images/*" };
