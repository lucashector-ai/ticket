import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { mediaJpeg } from "@/lib/media-jpeg";
import { eventShareArt } from "@/lib/share-image";

const HEADERS = { "content-type": "image/jpeg", "cache-control": "public, max-age=86400, s-maxage=604800" };
/** acima disso o WhatsApp costuma não mostrar a imagem */
const MAX_ORIGINAL = 500_000;

/** Prévia do link do evento: a arte em JPG leve (1200×630 do banner, ou o cartaz reduzido). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [e] = await db.select({ flyerId: schema.events.flyerId, bannerId: schema.events.bannerId, status: schema.events.status }).from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
  // rascunho não tem prévia pública (a página dele também é 404 para quem não criou)
  const art = e && e.status !== "draft" ? eventShareArt(e) : null;
  if (!art) return new Response("Sem arte", { status: 404 });
  const jpg = await mediaJpeg(art.src, art.wide ? { width: 1200, height: 630, fit: "cover" } : { width: 900, height: 900, fit: "scale-down" });
  if (jpg) return new Response(new Blob([jpg as BlobPart], { type: "image/jpeg" }), { headers: HEADERS });
  // sem o serviço de imagens: a arte original, se for leve o bastante
  const { env } = await getCloudflareContext({ async: true });
  const original = await env.MEDIA.get(art.src.replace(/^\/midia\//, ""));
  if (!original || original.size > MAX_ORIGINAL) return new Response("Sem arte", { status: 404 });
  return new Response(original.body, { headers: { ...HEADERS, "content-type": original.httpMetadata?.contentType ?? "image/png" } });
}
