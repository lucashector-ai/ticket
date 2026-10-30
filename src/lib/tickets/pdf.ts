import "server-only";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { MARK, WORD } from "@/components/brand-logo";
import type { TicketCardData } from "@/lib/tickets/card";

/*
 * PDF do ingresso montado no servidor (mesmo visual do cartão da página do ingresso). Antes o PDF era gerado
 * no celular e o download falhava no Safari do iPhone e nos navegadores do WhatsApp/Instagram.
 */

const W = 360;
const INK = rgb(0.067, 0.067, 0.067);
const MUTE = rgb(0.43, 0.43, 0.45);
const SOFT = rgb(0.6, 0.6, 0.62);
const LIME = rgb(0.827, 0.961, 0.357);
const PAPER = rgb(0.949, 0.949, 0.933);
const WHITE = rgb(1, 1, 1);
const NAVY = rgb(0.094, 0.098, 0.2);

/** As fontes padrão do PDF só têm o alfabeto latino (acentos ok); o resto (emoji etc.) sai. */
const WIN = /[^ -~ -ÿ–—‘’“”•…€]/g;
const safe = (s: string) => s.replace(/\s+/g, " ").replace(WIN, "").trim();

function wrap(text: string, font: PDFFont, size: number, max: number, maxLines: number) {
  const words = safe(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) <= max || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && font.widthOfTextAtSize(`${last}…`, size) > max) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

/** retângulo de cantos arredondados (y = base, no sistema do PDF) */
function rounded(page: PDFPage, x: number, y: number, w: number, h: number, r: number, color: ReturnType<typeof rgb>) {
  const p = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  // drawSvgPath usa y para baixo a partir do ponto dado
  page.drawSvgPath(p, { x, y: y + h, color });
}

function center(page: PDFPage, text: string, font: PDFFont, size: number, y: number, color = INK, cx = W / 2, spacing = 0) {
  const t = safe(text);
  if (!spacing) {
    page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y, size, font, color });
    return;
  }
  // texto espaçado (código do ingresso, "APRESENTA")
  const widths = [...t].map((c) => font.widthOfTextAtSize(c, size));
  let x = cx - (widths.reduce((a, b) => a + b, 0) + spacing * (t.length - 1)) / 2;
  [...t].forEach((c, i) => { page.drawText(c, { x, y, size, font, color }); x += widths[i] + spacing; });
}

export async function ticketPdf(t: TicketCardData, qrPayload: string, art: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Ingresso ${t.code} · ${safe(t.title)}`);
  doc.setAuthor("Tickets Win");
  doc.setCreator("Tickets Win");
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let img: PDFImage | null = null;
  if (art) img = await doc.embedJpg(art).catch(() => null);

  // medidas (de cima para baixo) para saber a altura da página
  const cardX = 14, cardW = W - 28, inner = cardW - 40;
  const artW = cardW - 24, artH = Math.round(artW * 1.25);
  const titleL = wrap(t.title, bold, 19, inner, 2);
  const dateL = t.dateLine ? wrap(t.dateLine, bold, 10.5, inner, 2) : [];
  const placeL = t.placeLine ? wrap(t.placeLine, reg, 10, inner, 2) : [];
  const qr = 176;
  const top = 26 + artH + 22;
  const textH = (t.presenter ? 18 : 0) + titleL.length * 23 + 6 + dateL.length * 14 + (placeL.length ? 6 + placeL.length * 13 : 0);
  const boxY = top + textH + 16, boxH = 50;
  const cutY = boxY + boxH + 22;
  const qrY = cutY + 22;
  const H = qrY + qr + 18 + 16 + 16 + 30 + 26;

  const page = doc.addPage([W, H]);
  const Y = (fromTop: number) => H - fromTop; // converte "distância do topo" para o eixo do PDF
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INK });
  rounded(page, cardX, 12, cardW, H - 24, 24, WHITE);

  // arte do evento
  const ax = cardX + 12, ay = Y(26 + artH);
  rounded(page, ax, ay, artW, artH, 18, NAVY);
  if (img) {
    // a arte já vem no formato do quadro (4:5); se não vier, cabe inteira dentro dele
    const s = Math.min(artW / img.width, artH / img.height);
    const w = img.width * s, h = img.height * s;
    page.drawImage(img, { x: ax + (artW - w) / 2, y: ay + (artH - h) / 2, width: w, height: h });
  } else {
    const big = wrap(t.title.toUpperCase(), bold, 26, artW - 40, 3);
    big.forEach((l, i) => center(page, l, bold, 26, ay + artH / 2 + (big.length / 2 - i - 0.75) * 30, LIME));
  }
  // selo "Ingresso válido" / estado
  const tag = t.valid ? "Ingresso válido" : "Ingresso não válido";
  const tw = bold.widthOfTextAtSize(tag, 9) + 30;
  rounded(page, ax + artW - tw - 10, Y(26 + 14 + 22), tw, 22, 11, INK);
  page.drawCircle({ x: ax + artW - tw - 10 + 12, y: Y(26 + 14 + 11), size: 3, color: t.valid ? LIME : rgb(0.9, 0.3, 0.25) });
  page.drawText(tag, { x: ax + artW - tw - 10 + 20, y: Y(26 + 14 + 14.5), size: 9, font: bold, color: t.valid ? LIME : WHITE });

  // textos
  let y = top;
  if (t.presenter) { center(page, `${t.presenter} apresenta`.toUpperCase(), bold, 8, Y(y + 8), SOFT, W / 2, 1.2); y += 18; }
  titleL.forEach((l) => { center(page, l, bold, 19, Y(y + 17)); y += 23; });
  y += 6;
  dateL.forEach((l) => { center(page, l, bold, 10.5, Y(y + 10)); y += 14; });
  if (placeL.length) { y += 6; placeL.forEach((l) => { center(page, l, reg, 10, Y(y + 10), MUTE); y += 13; }); }

  // portões · setor · tipo
  const bx = cardX + 20, bw = cardW - 40;
  rounded(page, bx, Y(boxY + boxH), bw, boxH, 14, PAPER);
  const cols: [string, string][] = [["Portões", t.gates], ["Setor", t.sector], ["Tipo", t.type]];
  cols.forEach(([k, v], i) => {
    const cx = bx + (bw / 3) * (i + 0.5);
    center(page, k, reg, 8.5, Y(boxY + 18), SOFT, cx);
    center(page, wrap(v, bold, 11, bw / 3 - 10, 1)[0] ?? "", bold, 11, Y(boxY + 36), INK, cx);
    if (i) page.drawLine({ start: { x: bx + (bw / 3) * i, y: Y(boxY + 12) }, end: { x: bx + (bw / 3) * i, y: Y(boxY + boxH - 12) }, thickness: 0.6, color: rgb(0.86, 0.86, 0.84) });
  });

  // picote
  page.drawCircle({ x: cardX, y: Y(cutY), size: 10, color: INK });
  page.drawCircle({ x: cardX + cardW, y: Y(cutY), size: 10, color: INK });
  page.drawLine({ start: { x: cardX + 18, y: Y(cutY) }, end: { x: cardX + cardW - 18, y: Y(cutY) }, thickness: 0.8, color: rgb(0.85, 0.85, 0.83), dashArray: [4, 4] });

  // QR code (vetorial: nítido em qualquer tamanho)
  const m = QRCode.create(qrPayload, { errorCorrectionLevel: "M" }).modules;
  const cell = qr / m.size, qx = (W - qr) / 2;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.get(r, c)) page.drawRectangle({ x: qx + c * cell, y: Y(qrY + (r + 1) * cell), width: cell + 0.2, height: cell + 0.2, color: INK });
    }
  }
  y = qrY + qr + 18;
  center(page, t.code, bold, 12, Y(y + 10), INK, W / 2, 3.5);
  y += 16;
  const foot = [t.holder, t.orderNumber ? `Pedido #${t.orderNumber}` : "", t.age].filter(Boolean).join("  ·  ");
  if (foot) center(page, foot, reg, 9.5, Y(y + 12), MUTE);
  y += 16 + 14;
  // marca (os mesmos desenhos do logo do site)
  const mark = 18, wordH = 13, wordW = (wordH * 724) / 128, gap = 6;
  const lx = (W - mark - gap - wordW) / 2, ly = Y(y);
  page.drawSvgPath(MARK, { x: lx, y: ly + 2, scale: mark / 173, color: LIME });
  const ws = wordH / 128;
  for (const d of WORD) page.drawSvgPath(d, { x: lx + mark + gap - 194 * ws, y: ly + 2 - (mark - wordH) / 2 + 22 * ws, scale: ws, color: INK });

  return doc.save();
}
