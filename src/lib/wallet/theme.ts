import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { decodePng, encodePng } from "./png";

/* Identidade do passe: a cor do evento (a escolhida pelo produtor ou, se ele deixou a padrão, a cor
   dominante da capa) vira o fundo; texto e rótulos se ajustam para ficarem legíveis. */

export type RGB = [number, number, number];
export type PassTheme = { bg: RGB; fg: RGB; label: RGB; light: boolean };

const DEFAULT = "#111111";
const LIME: RGB = [220, 245, 104];
const WHITE: RGB = [255, 255, 255];
const INK: RGB = [17, 17, 17];
const CARD: RGB = [28, 28, 30];

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: RGB, b: RGB, t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t)) as RGB;
const fromHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
export const toHex = (c: RGB) => `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
const lum = (c: RGB) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;

function hsl([r, g, b]: RGB) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => Math.round((v + m) * 255)) as RGB;
}

/** Cor dominante "com personalidade" de uma imagem: o tom com mais pixels saturados e claros. */
function dominant(px: Uint8Array): RGB | null {
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    const c: RGB = [px[i], px[i + 1], px[i + 2]];
    const [h, s, l] = hsl(c);
    const w = s * clamp(1 - Math.abs(l - 0.5) * 2) * (px[i + 3] / 255);
    total += w;
    if (w < 0.08) continue;
    const bin = bins[Math.floor(h / 30) % 12];
    bin.w += w; bin.r += c[0] * w; bin.g += c[1] * w; bin.b += c[2] * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w < 2 || best.w < total * 0.12) return null;
  const [h, s] = hsl([best.r / best.w, best.g / best.w, best.b / best.w].map(Math.round) as RGB);
  // fundo de passe: tom da capa, saturado o bastante e escuro o suficiente para texto branco
  return fromHsl(h, clamp(s, 0.45, 0.8), 0.34);
}

/** Bytes do banner: enviado pelo produtor (R2) ou arquivo estático do site (eventos de demonstração). */
async function bannerBytes(env: CloudflareEnv, path: string, site: string) {
  const obj = await env.MEDIA.get(path.slice("/midia/".length));
  if (obj) return obj.arrayBuffer();
  const r = env.ASSETS ? await env.ASSETS.fetch(new URL(path, site)) : await fetch(new URL(path, site));
  return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/") ? r.arrayBuffer() : null;
}

async function coverColor(banner: string, site: string): Promise<RGB | null> {
  const { env } = await getCloudflareContext({ async: true });
  const key = `wallet:cor:${banner}`;
  const hit = await env.KV.get(key);
  if (hit) return hit === "-" ? null : fromHex(hit);
  if (!env.IMAGES) return null;
  const bytes = await bannerBytes(env, banner, site);
  if (!bytes) return null;
  const r = await env.IMAGES.input(new Response(bytes).body!).transform({ width: 32, height: 32, fit: "cover" }).output({ format: "image/png" });
  const c = dominant(decodePng(new Uint8Array(await r.response().arrayBuffer())).rgba);
  await env.KV.put(key, c ? toHex(c) : "-", { expirationTtl: 60 * 60 * 24 * 30 });
  return c;
}

/** Cores do passe para o evento. */
export async function passTheme(accent: string | null, banner: string | null, site: string): Promise<PassTheme> {
  let bg: RGB | null = accent && /^#[0-9a-f]{6}$/i.test(accent) && accent.toLowerCase() !== DEFAULT ? fromHex(accent) : null;
  if (!bg && banner?.startsWith("/midia/")) bg = await coverColor(banner, site).catch((e) => (console.error("wallet cor", e), null));
  if (!bg) return { bg: CARD, fg: WHITE, label: LIME, light: false };
  const light = lum(bg) > 0.55;
  return light ? { bg, fg: INK, label: mix(bg, INK, 0.62), light } : { bg, fg: WHITE, label: mix(bg, WHITE, 0.7), light };
}

/* Faixa (strip.png, 375 × 98 pt) que fica logo abaixo do nome do evento e ocupa a largura toda do
   passe: na cor do passe, com o picote no rodapé e um recorte em cada lateral. Os recortes são
   pretos, como o fundo da Carteira no iPhone. */
const W = 375, H = 98;
const strips = new Map<string, Record<string, Uint8Array>>();

export function passStrip(t: PassTheme): Record<string, Uint8Array> {
  const id = toHex(t.bg);
  const hit = strips.get(id);
  if (hit) return hit;
  const out: Record<string, Uint8Array> = {};
  const dot: RGB = t.fg, alpha = t.light ? 0.45 : 0.4;
  for (const k of [1, 2, 3]) {
    const w = W * k, h = H * k, px = new Uint8Array(w * h * 4);
    const cy = 84 * k, notch = 10 * k, r = 1.6 * k, step = 9 * k, x0 = 20 * k, x1 = w - 20 * k;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c: RGB = t.bg;
        if (x >= x0 - r && x <= x1 + r) {
          const cx = x0 + Math.round((x - x0) / step) * step;
          const d = clamp(r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5);
          if (d > 0 && cx <= x1) c = mix(c, dot, d * alpha);
        }
        const n = clamp(notch - Math.min(Math.hypot(x + 0.5, y + 0.5 - cy), Math.hypot(w - x - 0.5, y + 0.5 - cy)) + 0.5);
        if (n > 0) c = mix(c, [0, 0, 0], n);
        const i = (y * w + x) * 4;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      }
    }
    out[k === 1 ? "strip.png" : `strip@${k}x.png`] = encodePng(w, h, px);
  }
  strips.set(id, out);
  return out;
}
