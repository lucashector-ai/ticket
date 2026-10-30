/*
 * Gerador de vídeo YUV4MPEG2 (C420) com um QR code parado, para a câmera falsa do Chromium:
 *   chromium --use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<arquivo>.y4m
 *
 * Duas origens do QR:
 *   - a imagem de verdade de um ingresso (o SVG que a pessoa vê em /ingressos/<código>), rasterizada no
 *     navegador por `grayFromSvg` (usado em portaria-camera.e2e.mjs);
 *   - um texto qualquer (`grayFromText`), para montar um QR adulterado com a mesma cara de um real.
 *
 * Uso direto (texto → vídeo):
 *   node tests/e2e/qr-y4m.mjs "ONDE|TW-XXXX-XXXX|assinatura" /caminho/saida.y4m
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const W = 640, H = 480;

/** Cinza (0 = preto, 255 = branco), W×H, em vídeo .y4m de `frames` quadros iguais (o Chromium repete o arquivo). */
export function writeY4m(file, gray, w = W, h = H, frames = 10) {
  const head = Buffer.from(`YUV4MPEG2 W${w} H${h} F10:1 Ip A1:1 C420jpeg\n`);
  // luma em faixa limitada (16–235), como as câmeras; croma neutro
  const y = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) y[i] = 16 + Math.round((gray[i] / 255) * 219);
  const uv = Buffer.alloc((w / 2) * (h / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, uv]);
  writeFileSync(file, Buffer.concat([head, ...Array(frames).fill(frame)]));
  return file;
}

/** QR de um texto (biblioteca do projeto, mesma correção de erro "M" do ingresso), centralizado com margem branca. */
export function grayFromText(text, w = W, h = H) {
  const QRCode = require("qrcode");
  const q = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = q.modules.size, side = Math.floor(Math.min(w, h) * 0.8), cell = Math.floor(side / n);
  const x0 = Math.floor((w - n * cell) / 2), y0 = Math.floor((h - n * cell) / 2);
  const g = new Uint8Array(w * h).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!q.modules.get(r, c)) continue;
    for (let dy = 0; dy < cell; dy++) g.fill(0, (y0 + r * cell + dy) * w + x0 + c * cell, (y0 + r * cell + dy) * w + x0 + (c + 1) * cell);
  }
  return g;
}

/**
 * Rasteriza no navegador (Playwright `page`) o SVG do QR que está na tela, em fundo branco, e devolve o cinza.
 * `selector`: o elemento <svg> do QR (ex.: ".qr svg" na página do ingresso).
 */
export async function grayFromSvg(page, selector, w = W, h = H) {
  const arr = await page.evaluate(async ({ selector, w, h }) => {
    const svg = document.querySelector(selector);
    if (!svg) throw new Error(`QR não encontrado: ${selector}`);
    const xml = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    const side = Math.floor(Math.min(w, h) * 0.8);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
    return g;
  }, { selector, w, h });
  return Uint8Array.from(arr);
}

/** Lê o texto de um QR em cinza (jsQR, a mesma biblioteca da portaria). */
export function readGray(gray, w = W, h = H) {
  const jsQR = require("jsqr");
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = gray[i]; rgba[i * 4 + 3] = 255; }
  return jsQR(rgba, w, h)?.data ?? null;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [text, out] = process.argv.slice(2);
  if (!text || !out) { console.error('uso: node tests/e2e/qr-y4m.mjs "<texto do QR>" saida.y4m'); process.exit(2); }
  const g = grayFromText(text);
  writeY4m(out, g);
  console.log(`ok: ${out} (QR lido de volta: ${readGray(g) === text ? "confere" : "NÃO confere"})`);
}
