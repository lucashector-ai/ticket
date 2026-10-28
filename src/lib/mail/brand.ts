/*
 * Envelope dos e-mails da Tickets Win: logo em cima, o conteúdo num cartão branco e o rodapé
 * padrão (links, aviso e assinatura). Todos os e-mails da plataforma usam este formato:
 * os do sistema (pré-venda, abertura, revenda) e os que os produtores mandam.
 * Puro: roda no servidor e no navegador (prévia do painel).
 */

export const BRAND = {
  bg: "#F1F1EC", card: "#FFFFFF", ink: "#111111", body: "#3A3A36", muted: "#77776F", hair: "#E8E8E2", panel: "#F5F5F1", lime: "#DCF568",
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif",
};

export const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;
export const spacer = (h: number) => `<div style="height:${h}px;line-height:${h}px;font-size:1px">&nbsp;</div>`;

/** Botão principal da marca: preto com texto lima. */
export function brandButton(label: string, url: string, full = true) {
  return `<a href="${escHtml(url)}" style="display:${full ? "block" : "inline-block"};background:${BRAND.ink};color:${BRAND.lime};text-decoration:none;font-weight:700;font-size:15px;line-height:20px;padding:16px 28px;border-radius:12px;text-align:center;mso-padding-alt:0">${escHtml(label)}</a>`;
}

/** Rótulo curto em caixa alta. */
export const eyebrow = (text: string, color: string = BRAND.muted) => `<div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${color}">${escHtml(text)}</div>`;

export type ShellOpts = {
  site: string;
  preheader: string;
  /** HTML do cartão (já montado) */
  body: string;
  /** linhas do rodapé específicas deste e-mail (HTML já escapado), antes dos links padrão */
  note?: string[];
  pixelUrl?: string;
};

/** E-mail completo no formato Tickets Win. */
export function brandShell(o: ShellOpts) {
  const B = BRAND, link = (u: string, t: string) => `<a href="${escHtml(o.site + u)}" style="color:${B.muted};text-decoration:underline;text-underline-offset:2px">${t}</a>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title></title>
<style>@media (max-width:620px){.tw-px{padding-left:22px!important;padding-right:22px!important}.tw-h1{font-size:24px!important}.tw-stack{display:block!important;width:100%!important}}a{color:inherit}img{-ms-interpolation-mode:bicubic}body{margin:0;padding:0}</style></head>
<body style="margin:0;padding:0;background:${B.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escHtml(o.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table ${TABLE} style="background:${B.bg}"><tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${B.font}">
<tr><td class="tw-px" style="padding:0 8px 18px"><a href="${escHtml(o.site)}" style="text-decoration:none"><img src="${escHtml(o.site)}/email/tickets-win.png" alt="Tickets Win" width="149" height="28" style="display:block;width:149px;height:28px;border:0"></a></td></tr>
<tr><td style="background:${B.card};border-radius:20px;overflow:hidden">${o.body}</td></tr>
<tr><td class="tw-px" style="padding:26px 8px 0;font-size:12px;line-height:19px;color:${B.muted}">
${(o.note ?? []).map((n) => `<p style="margin:0 0 8px">${n}</p>`).join("")}
<p style="margin:${o.note?.length ? 14 : 0}px 0 0;padding-top:${o.note?.length ? 14 : 0}px;${o.note?.length ? `border-top:1px solid ${B.hair};` : ""}">${link("/meus-ingressos", "Meus ingressos")}&nbsp;&nbsp;·&nbsp;&nbsp;${link("/ajuda", "Central de ajuda")}&nbsp;&nbsp;·&nbsp;&nbsp;${link("/legal/privacidade", "Privacidade")}&nbsp;&nbsp;·&nbsp;&nbsp;${link("/legal/termos", "Termos")}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px"><tr><td valign="middle" style="padding-right:8px"><img src="${escHtml(o.site)}/email/marca.png" alt="" width="16" height="16" style="display:block;width:16px;height:16px;border:0"></td><td valign="middle" style="font-size:12px;color:${B.muted}">Tickets Win · ingressos para shows, festas e festivais</td></tr></table>
</td></tr>
</table></td></tr></table>${o.pixelUrl ? `<img src="${escHtml(o.pixelUrl)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0">` : ""}</body></html>`;
}

/** Conteúdo simples (título, parágrafos, botão): usado pelos e-mails do sistema. */
export function brandSimple(o: { title: string; paragraphs: string[]; cta?: { label: string; url: string } }) {
  const B = BRAND;
  return `<table ${TABLE}><tr><td class="tw-px" style="padding:36px 40px 38px">
<h1 class="tw-h1" style="margin:0 0 16px;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-.6px;color:${B.ink}">${escHtml(o.title)}</h1>
${o.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${B.body}">${escHtml(p)}</p>`).join("")}
${o.cta ? `${spacer(12)}${brandButton(o.cta.label, o.cta.url, false)}` : ""}</td></tr></table>`;
}
