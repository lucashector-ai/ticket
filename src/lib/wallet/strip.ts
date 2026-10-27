import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/* Faixa do passe da Apple (strip.png, 375 × 98 pt) recortada do banner do evento pelo Images
   da Cloudflare, levemente escurecida para o nome do evento ficar legível por cima. Gera uma vez
   por banner e guarda no R2; se o Images não estiver disponível, o passe sai sem a faixa. */

const SIZES: [string, number][] = [["strip.png", 1], ["strip@2x.png", 2], ["strip@3x.png", 3]];

export async function passStrip(bannerPath: string | null): Promise<Record<string, Uint8Array> | null> {
  if (!bannerPath?.startsWith("/midia/")) return null;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const src = bannerPath.slice("/midia/".length);
    const base = `wallet/strip/${src.replace(/[^\w.-]/g, "_")}`;
    const out: Record<string, Uint8Array> = {};

    const cached = await Promise.all(SIZES.map(([n]) => env.MEDIA.get(`${base}-${n}`)));
    if (cached.every(Boolean)) {
      for (const [i, [n]] of SIZES.entries()) out[n] = new Uint8Array(await cached[i]!.arrayBuffer());
      return out;
    }
    if (!env.IMAGES) return null;
    const obj = await env.MEDIA.get(src);
    if (!obj) return null;
    const bytes = await obj.arrayBuffer();
    for (const [n, k] of SIZES) {
      const r = await env.IMAGES.input(new Response(bytes).body!)
        .transform({ width: 375 * k, height: 98 * k, fit: "cover", gravity: "auto", brightness: 0.78 })
        .output({ format: "image/png" });
      const png = new Uint8Array(await r.response().arrayBuffer());
      out[n] = png;
      await env.MEDIA.put(`${base}-${n}`, png, { httpMetadata: { contentType: "image/png" } });
    }
    return out;
  } catch (e) {
    console.error("wallet strip", e);
    return null;
  }
}
