/*
 * Formato dos e-mails da Tickets Win: cartão branco de cantos grandes, logo no topo, títulos
 * centralizados em Inter Tight, botão preto em pílula e o rodapé preto com "Todo rolê começa aqui.",
 * links, redes e a marca grande. Usado pelos e-mails do sistema e pelos que os produtores mandam.
 * Puro: roda no servidor e no navegador (prévia do painel).
 */

export const BRAND = {
  bg: "#F2F2EE", card: "#FFFFFF", ink: "#111111", body: "#6E6E73", muted: "#77776F", hair: "#EFEFEC", panel: "#F6F6F3", lime: "#EDFF3C", limeSoft: "#F8FFC2", limeInk: "#445000",
  font: "Inter,'Helvetica Neue',Helvetica,Arial,sans-serif",
  disp: "'Inter Tight',Inter,'Helvetica Neue',Helvetica,Arial,sans-serif",
  mono: "'Space Mono',Menlo,Consolas,'Courier New',monospace",
};

/** Redes da Tickets Win no rodapé: só aparecem as que tiverem endereço. */
export const BRAND_SOCIAL: { icon: "ig" | "tt" | "yt" | "sp"; label: string; url: string }[] = [
  { icon: "ig", label: "Instagram", url: "" },
  { icon: "tt", label: "TikTok", url: "" },
  { icon: "yt", label: "YouTube", url: "" },
  { icon: "sp", label: "Spotify", url: "" },
];
/** Razão social, CNPJ e endereço (obrigatórios em e-mail de marketing). O CNPJ entra quando sair o registro. */
export const BRAND_LEGAL = "Tickets Win Serviços de Reservas LTDA · São Paulo – SP";

export const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;
export const spacer = (h: number) => `<div style="height:${h}px;line-height:${h}px;font-size:1px">&nbsp;</div>`;

/** Botão principal: pílula preta com texto branco, centralizada. */
export function brandButton(label: string, url: string) {
  return `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:${BRAND.ink}"><a href="${escHtml(url)}" style="display:inline-block;padding:15px 26px;font-family:${BRAND.font};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px">${escHtml(label)}</a></td></tr></table>`;
}

/** Etiqueta lima ("2º lote acaba em 2 dias"). */
export const pill = (text: string) => `<div style="font-family:${BRAND.font};font-size:12px;font-weight:700;color:${BRAND.limeInk};background:${BRAND.limeSoft};display:inline-block;padding:5px 11px;border-radius:999px">${escHtml(text)}</div>`;

/** Linha pequena acima do título ("Esta semana · São Paulo"). */
export const eyebrow = (text: string) => `<div style="font-family:${BRAND.font};font-size:13px;font-weight:600;color:${BRAND.muted}">${escHtml(text)}</div>`;

/** Título grande centralizado + subtítulo. */
export const hero = (title: string, sub?: string) =>
  `<div class="tw-hero" style="font-family:${BRAND.disp};font-size:44px;line-height:1.04;font-weight:600;letter-spacing:-.035em;color:${BRAND.ink}">${title}</div>${sub ? `<div style="font-family:${BRAND.font};font-size:16px;line-height:1.6;color:${BRAND.body};margin-top:16px">${sub}</div>` : ""}`;

export const divider = () => `<tr><td class="tw-px" style="padding:64px 48px 0"><div style="height:1px;line-height:1px;background:${BRAND.hair}">&nbsp;</div></td></tr>`;

export type ShellOpts = {
  site: string;
  preheader: string;
  /** linhas &lt;tr&gt; do cartão (entre o logo e o rodapé) */
  body: string;
  /** texto legal deste e-mail (HTML já escapado), no fim do rodapé */
  note?: string[];
  pixelUrl?: string;
};

/** E-mail completo no formato Tickets Win. */
export function brandShell(o: ShellOpts) {
  const B = BRAND, s = o.site;
  const nav = [["Explorar", "/explorar"], ["Meus ingressos", "/meus-ingressos"], ["Ajuda", "/ajuda"], ["Para produtores", "/produtores"]]
    .map(([l, u]) => `<a href="${escHtml(s + u)}" style="color:#FFFFFF;text-decoration:none">${l}</a>`).join("&nbsp;&nbsp;&nbsp;&nbsp;");
  const social = BRAND_SOCIAL.filter((x) => x.url).map((x) => `<td style="padding:0 5px"><a href="${escHtml(x.url)}" title="${x.label}" style="display:block;width:44px;height:44px;border-radius:999px;background:${B.lime};text-decoration:none"><table role="presentation" width="44" height="44" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle"><img src="${escHtml(s)}/email/${x.icon}.png" width="18" height="18" alt="${x.label}" style="display:block;border:0"></td></tr></table></a></td>`).join("");
  const legal = [...(o.note ?? []), ...(BRAND_LEGAL ? [escHtml(BRAND_LEGAL)] : [])].join("<br>");
  return `<!doctype html><html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title></title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&amp;family=Inter+Tight:wght@600;700&amp;family=Space+Mono:wght@700&amp;display=swap" rel="stylesheet">
<style>body{margin:0;padding:0;background:${B.bg}} img{-ms-interpolation-mode:bicubic} a{color:inherit}
@media (max-width:620px){table.tw-card{width:100%!important}.tw-px{padding-left:24px!important;padding-right:24px!important}.tw-hero{font-size:34px!important}.tw-stack{display:block!important;width:100%!important;padding-left:0!important;padding-right:0!important}.tw-stack img{width:100%!important;height:auto!important}.tw-cell{padding:0 0 32px!important}.tw-cell.tw-end{padding-bottom:0!important}.tw-cp{display:block!important;width:100%!important;text-align:left!important;padding-top:0!important}.tw-cp.tw-cpt{padding-top:20px!important;padding-bottom:10px!important}}</style></head>
<body style="margin:0;padding:0;background:${B.bg}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escHtml(o.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table ${TABLE} style="background:${B.bg}"><tr><td align="center" style="padding:32px 12px">
<table class="tw-card" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${B.card};border-radius:28px">
<tr><td align="center" style="padding:40px 40px 0"><a href="${escHtml(s)}" style="text-decoration:none"><img src="${escHtml(s)}/email/tickets-win.png?v=2" width="137" height="26" alt="Tickets Win" style="display:block;width:137px;height:26px;border:0"></a></td></tr>
${o.body}
<tr><td style="padding:64px 0 0">
<table ${TABLE} style="background:${B.ink};border-radius:0 0 28px 28px">
<tr><td align="center" class="tw-px" style="padding:64px 48px 0">
<div style="font-family:${B.disp};font-size:40px;line-height:1.02;font-weight:600;letter-spacing:-.035em;color:#FFFFFF">Todo rolê<br>começa <span style="color:${B.lime}">aqui.</span></div>
<div style="font-family:${B.font};font-size:15px;line-height:1.6;color:#9B9B96;margin-top:14px">Seus ingressos no celular, na Apple Wallet e no Google Wallet.</div></td></tr>
<tr><td class="tw-px" style="padding:44px 48px 0"><div style="height:1px;line-height:1px;background:#2A2A2A">&nbsp;</div></td></tr>
<tr><td align="center" class="tw-px" style="padding:28px 48px 0;font-family:${B.font};font-size:14px;font-weight:600;line-height:2">${nav}</td></tr>
${social ? `<tr><td align="center" style="padding:22px 48px 0"><table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr>${social}</tr></table></td></tr>` : ""}
<tr><td align="center" style="padding:56px 40px 0"><a href="${escHtml(s)}" style="text-decoration:none"><img src="${escHtml(s)}/email/tickets-win-rodape.png?v=2" width="337" height="64" alt="Tickets Win" style="display:block;width:337px;max-width:100%;height:auto;border:0"></a></td></tr>
<tr><td align="center" class="tw-px" style="padding:32px 48px 48px;font-family:${B.font};font-size:12px;line-height:1.7;color:#7C7C77">${legal}</td></tr>
</table></td></tr>
</table></td></tr></table>${o.pixelUrl ? `<img src="${escHtml(o.pixelUrl)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0">` : ""}</body></html>`;
}

/** E-mail do sistema: título grande centralizado, parágrafos e um botão. */
export function brandSimple(o: { title: string; paragraphs: string[]; cta?: { label: string; url: string }; eyebrow?: string }) {
  return `<tr><td align="center" class="tw-px" style="padding:56px 48px 0">
${o.eyebrow ? `${eyebrow(o.eyebrow)}${spacer(14)}` : ""}${hero(escHtml(o.title), o.paragraphs.map(escHtml).join("<br><br>"))}</td></tr>
${o.cta ? `<tr><td align="center" style="padding:32px 40px 0">${brandButton(o.cta.label, o.cta.url)}</td></tr>` : ""}`;
}
