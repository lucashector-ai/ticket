import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ART_SIZES, hasRealBanner, wideJpeg, type ArtSize } from "@/lib/event-art";

const HEADERS = { "content-type": "image/jpeg", "cache-control": "public, max-age=604800, s-maxage=2592000" };

/**
 * Arte horizontal do evento (e-mail, aviso e passe da carteira): o banner, ou o banner montado com o cartaz quando o
 * produtor só enviou o cartaz. `f`: email (1200×675) ou carteira (1032×336). Só os tamanhos fixos (nada de tamanho
 * escolhido por quem chama) e só de evento que não é rascunho.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = new URL(req.url).searchParams.get("f") ?? "email";
  if (!(f in ART_SIZES) || slug.length > 200) return new Response("Não encontrado", { status: 404 });
  const [e] = await db.select({ flyerId: schema.events.flyerId, bannerId: schema.events.bannerId, status: schema.events.status })
    .from(schema.events).where(eq(schema.events.slug, slug)).limit(1);
  if (!e || e.status === "draft") return new Response("Não encontrado", { status: 404 });
  const src = hasRealBanner(e) ? e.bannerId! : e.flyerId;
  const { w, h } = ART_SIZES[f as ArtSize];
  const jpg = await wideJpeg(src, w, h);
  if (jpg) return new Response(new Blob([jpg as BlobPart], { type: "image/jpeg" }), { headers: HEADERS });
  // sem o serviço de imagens: a arte original (melhor que imagem quebrada no e-mail já enviado)
  if (src.startsWith("/midia/")) return Response.redirect(new URL(src, req.url), 302);
  return new Response("Não encontrado", { status: 404 });
}
