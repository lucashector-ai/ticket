import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { artVersion, eventShareArt } from "@/lib/share-image";

const HEADERS = { "content-type": "image/jpeg", "cache-control": "public, max-age=86400, s-maxage=604800" };
/** acima disso o WhatsApp costuma não mostrar a imagem */
const MAX_ORIGINAL = 500_000;

/** Prévia do link do evento: a arte em JPG leve (1200×630 do banner, ou o cartaz reduzido). Fica salva no R2. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [e] = await db.select({ flyerId: schema.events.flyerId, bannerId: schema.events.bannerId }).from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
  const art = e ? eventShareArt(e) : null;
  if (!art) return new Response("Sem arte", { status: 404 });

  const { env } = await getCloudflareContext({ async: true });
  const key = `og/${artVersion(art.src)}.jpg`;
  const saved = await env.MEDIA.get(key);
  if (saved) return new Response(saved.body, { headers: HEADERS });

  const original = await env.MEDIA.get(art.src.replace(/^\/midia\//, ""));
  if (!original) return new Response("Sem arte", { status: 404 });
  try {
    if (!env.IMAGES) throw new Error("sem o serviço de imagens");
    const out = await env.IMAGES.input(original.body)
      .transform(art.wide ? { width: 1200, height: 630, fit: "cover" } : { width: 900, height: 900, fit: "scale-down" })
      .output({ format: "image/jpeg", quality: 82 });
    const bytes = await out.response().arrayBuffer();
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    return new Response(bytes, { headers: HEADERS });
  } catch (err) {
    console.error("og image", err);
    // sem o serviço de imagens: a arte original, se for leve o bastante
    if (original.size > MAX_ORIGINAL) return new Response("Arte grande demais", { status: 404 });
    const again = await env.MEDIA.get(art.src.replace(/^\/midia\//, ""));
    if (!again) return new Response("Sem arte", { status: 404 });
    return new Response(again.body, { headers: { ...HEADERS, "content-type": again.httpMetadata?.contentType ?? "image/png" } });
  }
}
