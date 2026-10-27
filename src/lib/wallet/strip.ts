import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { decodePng, encodePng } from "./png";

/* Faixa do passe da Apple (strip.png, 375 × 98 pt) com cara de ingresso: a capa do evento recortada
   pelo Images da Cloudflare, escurecida à esquerda para o nome do evento ficar legível, e a borda de
   baixo picotada (recortes nos cantos e serrilhado), na cor do passe. Evento sem foto (arte do
   catálogo) ganha a faixa num degradê da cor do evento. Gera uma vez e guarda no R2. */

const W = 375, H = 98;
const SIZES: [string, number][] = [["strip.png", 1], ["strip@2x.png", 2], ["strip@3x.png", 3]];
type RGB = [number, number, number];

const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** Pinta a faixa em `k`×: fundo (foto já recortada ou degradê), sombra à esquerda e picote na cor do passe. */
function paint(k: number, bg: RGB, accent: RGB, photo?: Uint8Array) {
  const w = W * k, h = H * k, px = new Uint8Array(w * h * 4);
  const notch = 13 * k, step = 11 * k, tooth = 3.2 * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const over = (cr: number, cg: number, cb: number, ca: number) => {
        const na = ca + a * (1 - ca);
        if (na <= 0) return;
        r = (cr * ca + r * a * (1 - ca)) / na; g = (cg * ca + g * a * (1 - ca)) / na; b = (cb * ca + b * a * (1 - ca)) / na; a = na;
      };
      const i = (y * w + x) * 4;
      if (photo) {
        over(photo[i] * 0.72, photo[i + 1] * 0.72, photo[i + 2] * 0.72, 1);
      } else {
        // arte sem foto: da cor do passe (esquerda) para a cor do evento (direita), com um brilho no canto
        const t = clamp((x / w - 0.25) / 0.75) ** 1.4 * 0.9;
        const glow = clamp(1 - Math.hypot(x - w * 0.86, y - h * 0.15) / (w * 0.45)) * 0.35;
        const m = clamp(t + glow);
        over(bg[0] + (accent[0] - bg[0]) * m, bg[1] + (accent[1] - bg[1]) * m, bg[2] + (accent[2] - bg[2]) * m, 1);
      }
      over(0, 0, 0, (photo ? 0.72 : 0.62) * clamp(1 - x / (w * (photo ? 0.85 : 0.7))) ** 1.3);
      // picote: recortes nos cantos de baixo e serrilhado ao longo da borda
      const dn = Math.min(Math.hypot(x + 0.5, h - y - 0.5), Math.hypot(w - x - 0.5, h - y - 0.5));
      const cx = Math.floor(x / step) * step + step / 2;
      const dt = Math.hypot(x + 0.5 - cx, h - y - 0.5);
      const cut = Math.max(clamp(notch - dn + 0.5), clamp(tooth - dt + 0.5));
      if (cut > 0) over(bg[0], bg[1], bg[2], cut);
      px[i] = Math.round(r); px[i + 1] = Math.round(g); px[i + 2] = Math.round(b); px[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(w, h, px);
}

/** Bytes do banner: enviado pelo produtor (R2) ou arquivo estático do site (eventos de demonstração). */
async function bannerBytes(env: CloudflareEnv, path: string, site: string) {
  const obj = await env.MEDIA.get(path.slice("/midia/".length));
  if (obj) return obj.arrayBuffer();
  const r = env.ASSETS ? await env.ASSETS.fetch(new URL(path, site)) : await fetch(new URL(path, site));
  return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/") ? r.arrayBuffer() : null;
}

export async function passStrip(bannerPath: string | null, site: string, bg: RGB, accent: RGB): Promise<Record<string, Uint8Array> | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const photo = bannerPath?.startsWith("/midia/") ? bannerPath : null;
    const hex = (c: RGB) => c.map((x) => x.toString(16).padStart(2, "0")).join("");
    const base = `wallet/strip/v4-${hex(bg)}-${photo ? photo.slice(7).replace(/[^\w.-]/g, "_") : `arte-${hex(accent)}`}`;
    const out: Record<string, Uint8Array> = {};

    const cached = await Promise.all(SIZES.map(([n]) => env.MEDIA.get(`${base}-${n}`)));
    if (cached.every(Boolean)) {
      for (const [i, [n]] of SIZES.entries()) out[n] = new Uint8Array(await cached[i]!.arrayBuffer());
      return out;
    }
    const bytes = photo && env.IMAGES ? await bannerBytes(env, photo, site).catch(() => null) : null;
    const fromPhoto = async (k: number) => {
      const r = await env.IMAGES!.input(new Response(bytes).body!)
        .transform({ width: W * k, height: H * k, fit: "cover", gravity: "auto" })
        .output({ format: "image/png" });
      const img = decodePng(new Uint8Array(await r.response().arrayBuffer()));
      if (img.w !== W * k || img.h !== H * k) throw new Error(`faixa ${img.w}×${img.h}`);
      return paint(k, bg, accent, img.rgba);
    };
    let ok = !!bytes;
    for (const [n, k] of SIZES) {
      if (ok) out[n] = await fromPhoto(k).catch((e) => { console.error("wallet strip", e); ok = false; return new Uint8Array(); });
    }
    // se o Images falhar, a faixa sai no degradê (sem guardar, para tentar a foto de novo depois)
    if (!ok) for (const [n, k] of SIZES) out[n] = paint(k, bg, accent);
    if (ok || !photo) await Promise.all(SIZES.map(([n]) => env.MEDIA.put(`${base}-${n}`, out[n], { httpMetadata: { contentType: "image/png" } })));
    return out;
  } catch (e) {
    console.error("wallet strip", e);
    return null;
  }
}
