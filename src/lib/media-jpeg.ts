import "server-only";
import { createHash } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/*
 * Cópia em JPG de uma arte enviada (/midia/...), gerada uma vez pelo serviço de imagens do Cloudflare e guardada
 * no R2. Usada na prévia do link e no PDF do ingresso (as artes originais são PNG grandes).
 */
export async function mediaJpeg(src: string, transform: ImageTransform, quality = 82): Promise<Uint8Array | null> {
  if (!src.startsWith("/midia/")) return null;
  const { env } = await getCloudflareContext({ async: true });
  const key = `jpg/${createHash("sha256").update(`${src}|${JSON.stringify(transform)}|${quality}`).digest("hex").slice(0, 24)}.jpg`;
  const saved = await env.MEDIA.get(key);
  if (saved) return new Uint8Array(await saved.arrayBuffer());
  const original = await env.MEDIA.get(src.replace(/^\/midia\//, ""));
  if (!original || !env.IMAGES) return null;
  try {
    const out = await env.IMAGES.input(original.body).transform(transform).output({ format: "image/jpeg", quality });
    const bytes = new Uint8Array(await out.response().arrayBuffer());
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    return bytes;
  } catch (e) {
    console.error("media jpeg", e);
    return null;
  }
}
