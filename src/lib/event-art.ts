import "server-only";
import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/*
 * Arte horizontal do evento para e-mail, aviso e passe da carteira.
 * Sem banner enviado, o evento guarda o cartaz (3:4) como banner (bannerId = flyerId, DM-2). Usar essa imagem
 * como banner deixava o topo do e-mail com o cartaz inteiro em pé (quase 700 px de altura) e a faixa do passe
 * cortada no meio. Aqui o banner é montado como o BannerArt da página: o cartaz inteiro no centro sobre ele mesmo
 * desfocado e escurecido, numa JPG gerada uma vez pelo serviço de imagens e guardada no R2 (/api/arte/<slug>).
 */

/** Tamanhos servidos: e-mail e aviso (16:9) e a faixa do passe do Google (3:1, recomendação 1032×336). */
export const ART_SIZES = { email: { w: 1200, h: 675 }, carteira: { w: 1032, h: 336 } } as const;
export type ArtSize = keyof typeof ART_SIZES;

type EvArt = { slug: string; flyerId: string; bannerId: string | null; media?: { share?: string; home?: string } | null };
const uploaded = (id: string | null | undefined) => (id && id.startsWith("/midia/") ? id : null);

/** O evento tem banner de verdade (horizontal), e não o cartaz guardado no lugar dele? */
export const hasRealBanner = (e: Pick<EvArt, "flyerId" | "bannerId">) => !!uploaded(e.bannerId) && e.bannerId !== e.flyerId;

/** muda quando a arte muda (o e-mail já enviado continua apontando para a versão dele) */
const version = (src: string) => createHash("sha256").update(src).digest("hex").slice(0, 10);

/**
 * Endereço (relativo ao site) da arte horizontal do evento, ou null sem arte enviada.
 * Banner enviado: o próprio banner no e-mail; na carteira, a faixa 3:1 recortada dele.
 * Só cartaz: o banner montado. Eventos de demonstração (arte pronta, sem envio): a imagem de compartilhamento.
 */
export function wideArt(e: EvArt, size: ArtSize = "email"): string | null {
  const banner = hasRealBanner(e) ? e.bannerId! : null;
  if (banner && size === "email") return banner;
  const src = banner ?? uploaded(e.flyerId);
  if (src) return `/api/arte/${encodeURIComponent(e.slug)}?f=${size}&v=${version(src)}`;
  const share = e.media?.share;
  return share && share.startsWith("/") ? share : null;
}

/**
 * JPG horizontal (w×h) a partir de uma arte enviada. Arte larga: recorte central. Arte alta (cartaz): cartaz inteiro
 * no centro, na altura toda, sobre ele mesmo ampliado, desfocado e escurecido (os mesmos valores do BannerArt).
 * Gerada uma vez e guardada no R2; null sem o serviço de imagens ou sem o arquivo.
 */
export async function wideJpeg(src: string, w: number, h: number, quality = 82): Promise<Uint8Array | null> {
  if (!src.startsWith("/midia/") || src.includes("..")) return null;
  const { env } = await getCloudflareContext({ async: true });
  const key = `jpg/wide-${createHash("sha256").update(`${src}|${w}x${h}|${quality}|v1`).digest("hex").slice(0, 24)}.jpg`;
  const saved = await env.MEDIA.get(key);
  if (saved) return new Uint8Array(await saved.arrayBuffer());
  const original = await env.MEDIA.get(src.replace(/^\/midia\//, ""));
  if (!original || !env.IMAGES) return null;
  const bytes = new Uint8Array(await original.arrayBuffer());
  const stream = () => new Blob([bytes as BlobPart]).stream();
  try {
    const info = await env.IMAGES.info(stream());
    const iw = "width" in info ? info.width : 0, ih = "height" in info ? info.height : 0;
    let img;
    if (!iw || !ih || iw / ih >= 1.3) {
      img = env.IMAGES.input(stream()).transform({ width: w, height: h, fit: "cover" });
    } else {
      const fw = Math.min(w, Math.round((h * iw) / ih));
      const back = env.IMAGES.input(stream()).transform({ width: w, height: h, fit: "cover", blur: 40, brightness: 0.72, saturation: 1.15 });
      // o cartaz reduzido vira bytes antes de desenhar: no ambiente local o serviço de imagens só aceita imagem pronta
      const front = await env.IMAGES.input(stream()).transform({ width: fw, height: h, fit: "contain", background: "#111111" }).output({ format: "image/png" });
      img = back.draw(front.response().body!, { top: 0, left: Math.round((w - fw) / 2) });
    }
    const out = await img.output({ format: "image/jpeg", quality });
    const jpg = new Uint8Array(await out.response().arrayBuffer());
    await env.MEDIA.put(key, jpg, { httpMetadata: { contentType: "image/jpeg" } });
    return jpg;
  } catch (e) {
    console.error("arte horizontal", e);
    return null;
  }
}
