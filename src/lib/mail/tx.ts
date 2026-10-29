/*
 * E-mails transacionais da Tickets Win (conta, compra, ingresso, transferência...), no mesmo
 * cartão da marca dos outros e-mails: título grande, texto curto e blocos (código, detalhes,
 * evento, lista de ingressos). Puro: só monta HTML e texto.
 */
import { BRAND, brandButton, brandShell, escHtml, eyebrow, hero, spacer } from "./brand";

export type TxBlock =
  /** código de verificação grande, em caixa */
  | { kind: "code"; code: string; note?: string }
  /** cartão do evento: banner, nome, data e local */
  | { kind: "event"; title: string; when: string; where: string; image?: string | null; url?: string }
  /** pares rótulo/valor (pedido, total, pagamento...) */
  | { kind: "rows"; rows: [string, string][] }
  /** lista de ingressos ou itens */
  | { kind: "items"; title?: string; items: { name: string; sub?: string; right?: string }[] }
  /** aviso pequeno em caixa clara */
  | { kind: "note"; text: string };

export type TxMail = {
  preheader: string;
  eyebrow?: string;
  title: string;
  paragraphs: string[];
  blocks?: TxBlock[];
  cta?: { label: string; url: string };
  /** link secundário em texto, abaixo do botão */
  link?: { label: string; url: string };
  /** nota no fim do cartão (ex.: "Se não foi você, ignore este e-mail.") */
  foot?: string;
  /** por que a pessoa recebeu (rodapé preto) */
  reason?: string;
};

const B = BRAND;
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;
const row = (inner: string, pad = "32px 48px 0") => `<tr><td class="tw-px" style="padding:${pad}">${inner}</td></tr>`;
const abs = (site: string, u: string) => (u.startsWith("/") ? site + u : u);
/** Página que copia o código (e-mail não roda JavaScript). O código vai no #hash: não chega ao servidor nem aos logs. */
const copyUrl = (site: string, code: string) => `${site}/codigo#${encodeURIComponent(code)}`;

function block(b: TxBlock, site: string): string {
  switch (b.kind) {
    case "code":
      return row(`<table ${TABLE} style="background:${B.panel};border-radius:20px"><tr><td align="center" style="padding:26px 20px">
<div style="font-family:${B.mono};font-size:38px;font-weight:700;letter-spacing:.32em;color:${B.ink};padding-left:.32em">${escHtml(b.code)}</div>
${b.note ? `<div style="font-family:${B.font};font-size:13px;color:${B.muted};margin-top:10px">${escHtml(b.note)}</div>` : ""}
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td style="border-radius:999px;background:${B.lime}"><a href="${escHtml(copyUrl(site, b.code))}" style="display:inline-block;padding:11px 22px;font-family:${B.font};font-size:14px;font-weight:700;color:${B.ink};text-decoration:none;border-radius:999px">Copiar código</a></td></tr></table></td></tr></table>`);
    case "event": {
      const img = b.image ? `<tr><td><img src="${escHtml(abs(site, b.image))}" width="504" alt="" style="display:block;width:100%;height:auto;border:0;border-radius:20px 20px 0 0"></td></tr>` : "";
      const name = b.url ? `<a href="${escHtml(abs(site, b.url))}" style="color:${B.ink};text-decoration:none">${escHtml(b.title)}</a>` : escHtml(b.title);
      return row(`<table ${TABLE} style="background:${B.panel};border-radius:20px">${img}<tr><td style="padding:20px 22px 22px">
<div style="font-family:${B.disp};font-size:22px;line-height:1.2;font-weight:600;letter-spacing:-.02em;color:${B.ink}">${name}</div>
<div style="font-family:${B.font};font-size:14px;line-height:1.6;color:${B.body};margin-top:8px">${escHtml(b.when)}${b.where ? `<br>${escHtml(b.where)}` : ""}</div></td></tr></table>`);
    }
    case "rows":
      return row(`<table ${TABLE}>${b.rows.map(([k, v], i) => `<tr><td style="padding:12px 0;${i ? `border-top:1px solid ${B.hair};` : ""}font-family:${B.font};font-size:14px;color:${B.muted}">${escHtml(k)}</td><td align="right" style="padding:12px 0;${i ? `border-top:1px solid ${B.hair};` : ""}font-family:${B.font};font-size:14px;font-weight:600;color:${B.ink}">${escHtml(v)}</td></tr>`).join("")}</table>`);
    case "items":
      return row(`${b.title ? `<div style="font-family:${B.font};font-size:13px;font-weight:700;color:${B.ink};margin-bottom:10px">${escHtml(b.title)}</div>` : ""}<table ${TABLE}>${b.items.map((it) => `<tr><td style="padding:0 0 8px"><table ${TABLE} style="background:${B.panel};border-radius:16px"><tr>
<td style="padding:14px 18px;font-family:${B.font}"><div style="font-size:15px;font-weight:700;color:${B.ink}">${escHtml(it.name)}</div>${it.sub ? `<div style="font-size:13px;color:${B.muted};margin-top:3px">${escHtml(it.sub)}</div>` : ""}</td>
${it.right ? `<td align="right" style="padding:14px 18px;font-family:${B.mono};font-size:13px;font-weight:700;color:${B.ink};white-space:nowrap">${escHtml(it.right)}</td>` : ""}</tr></table></td></tr>`).join("")}</table>`);
    case "note":
      return row(`<div style="font-family:${B.font};font-size:13px;line-height:1.6;color:${B.limeInk};background:${B.limeSoft};border-radius:14px;padding:14px 16px">${escHtml(b.text)}</div>`);
  }
}

const blockText = (b: TxBlock): string[] => {
  switch (b.kind) {
    case "code": return [`Código: ${b.code}`, ...(b.note ? [b.note] : [])];
    case "event": return [b.title, b.when, ...(b.where ? [b.where] : [])];
    case "rows": return b.rows.map(([k, v]) => `${k}: ${v}`);
    case "items": return [...(b.title ? [b.title] : []), ...b.items.map((it) => `- ${it.name}${it.sub ? ` (${it.sub})` : ""}${it.right ? ` · ${it.right}` : ""}`)];
    case "note": return [b.text];
  }
};

/** HTML e texto de um e-mail transacional. `site` completa os caminhos relativos (/meus-ingressos...). */
export function renderTx(m: TxMail, site: string): { html: string; text: string } {
  const body = [
    `<tr><td align="center" class="tw-px" style="padding:56px 48px 0">${m.eyebrow ? `${eyebrow(m.eyebrow)}${spacer(14)}` : ""}${hero(escHtml(m.title), m.paragraphs.map(escHtml).join("<br><br>"))}</td></tr>`,
    ...(m.blocks ?? []).map((b) => block(b, site)),
    m.cta ? `<tr><td align="center" style="padding:36px 40px 0">${brandButton(m.cta.label, abs(site, m.cta.url))}</td></tr>` : "",
    m.link ? `<tr><td align="center" style="padding:16px 40px 0;font-family:${B.font};font-size:14px"><a href="${escHtml(abs(site, m.link.url))}" style="color:${B.ink};font-weight:600;text-decoration:underline">${escHtml(m.link.label)}</a></td></tr>` : "",
    m.foot ? `<tr><td align="center" class="tw-px" style="padding:28px 48px 0;font-family:${B.font};font-size:13px;line-height:1.6;color:${B.muted}">${escHtml(m.foot)}</td></tr>` : "",
  ].join("\n");
  const html = brandShell({ site, preheader: m.preheader, body, note: [escHtml(m.reason ?? "Este é um e-mail automático da Tickets Win sobre a sua conta.")] });
  const text = [
    m.title, "", ...m.paragraphs.flatMap((p) => [p, ""]),
    ...(m.blocks ?? []).flatMap((b) => [...blockText(b), ""]),
    ...(m.cta ? [`${m.cta.label}: ${abs(site, m.cta.url)}`] : []),
    ...(m.link ? [`${m.link.label}: ${abs(site, m.link.url)}`] : []),
    ...(m.foot ? ["", m.foot] : []),
    "", "Tickets Win · ticketswin.com.br",
  ].join("\n");
  return { html, text };
}
