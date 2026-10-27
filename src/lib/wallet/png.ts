import { unzlibSync, zlibSync } from "fflate";

/* PNG RGBA mínimo (sem dependências além do fflate) para as camadas desenhadas do passe. */

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Codifica `w × h` pixels RGBA (linha a linha) em PNG. */
export function encodePng(w: number, h: number, rgba: Uint8Array) {
  const raw = new Uint8Array(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w); v.setUint32(4, h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlibSync(raw, { level: 6 })), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Decodifica PNG de 8 bits, RGB ou RGBA, sem entrelaçamento (o que o Images da Cloudflare devolve). */
export function decodePng(png: Uint8Array): { w: number; h: number; rgba: Uint8Array } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8, w = 0, h = 0, type = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = v.getUint32(o), name = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    if (name === "IHDR") {
      w = v.getUint32(o + 8); h = v.getUint32(o + 12); type = data[9];
      if (data[8] !== 8 || (type !== 2 && type !== 6) || data[12] !== 0) throw new Error("PNG não suportado");
    } else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    o += 12 + len;
  }
  const z = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  idat.reduce((at, c) => (z.set(c, at), at + c.length), 0);
  const raw = unzlibSync(z), bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const cur = new Uint8Array(stride), prev = new Uint8Array(stride), rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let p = a;
      if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = (line[i] + (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : p)) & 255;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4, s = x * bpp;
      rgba[d] = cur[s]; rgba[d + 1] = cur[s + 1]; rgba[d + 2] = cur[s + 2]; rgba[d + 3] = bpp === 4 ? cur[s + 3] : 255;
    }
    prev.set(cur);
  }
  return { w, h, rgba };
}
