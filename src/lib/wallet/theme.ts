import "server-only";
import { encodePng } from "./png";

/* Cores do passe (preto, texto branco, rótulos em lima) e a faixa com o picote. */

export type RGB = [number, number, number];

export const PASS_THEME = { bg: [0, 0, 0] as RGB, fg: [255, 255, 255] as RGB, label: [220, 245, 104] as RGB };
export const toHex = (c: RGB) => `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;

const NOTCH: RGB = [242, 242, 246]; // #F2F2F6, o fundo claro da Carteira
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const mix = (a: RGB, b: RGB, t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t)) as RGB;

/* Faixa (strip.png, 375 × 98 pt) que fica sob o nome do evento e ocupa a largura toda do passe:
   na cor do passe, com o picote no rodapé e um recorte em cada lateral. */
const W = 375, H = 98;
let strip: Record<string, Uint8Array> | null = null;

export function passStrip(): Record<string, Uint8Array> {
  if (strip) return strip;
  const { bg, fg } = PASS_THEME;
  const out: Record<string, Uint8Array> = {};
  for (const k of [1, 2, 3]) {
    const w = W * k, h = H * k, px = new Uint8Array(w * h * 4);
    const cy = 84 * k, notch = 10 * k, r = 1.6 * k, step = 9 * k, x0 = 20 * k, x1 = w - 20 * k;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let c: RGB = bg;
        if (x >= x0 - r && x <= x1 + r) {
          const cx = x0 + Math.round((x - x0) / step) * step;
          const d = clamp(r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5);
          if (d > 0 && cx <= x1) c = mix(c, fg, d * 0.4);
        }
        const n = clamp(notch - Math.min(Math.hypot(x + 0.5, y + 0.5 - cy), Math.hypot(w - x - 0.5, y + 0.5 - cy)) + 0.5);
        if (n > 0) c = mix(c, NOTCH, n);
        const i = (y * w + x) * 4;
        px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
      }
    }
    out[k === 1 ? "strip.png" : `strip@${k}x.png`] = encodePng(w, h, px);
  }
  strip = out;
  return out;
}
