/*
 * E-mail de evento no formato Tickets Win: o produtor escolhe o evento, o motivo e, se quiser,
 * escreve um recado. O resto (cartaz, data, local, preço, botão, rodapé) é montado sozinho.
 * Puro: roda no servidor (envio) e no navegador (prévia do painel).
 */
import { BRAND, brandButton, brandShell, escHtml, eyebrow, spacer } from "./brand";
import { fillVars, type Design } from "./design";
import { absUrl, href, onColor, renderEmail, type EvInfo, type RenderCtx } from "./render";

export type Motive = "novo" | "ultimos" | "lembrete" | "cupom";
export type EventContent = { eventId: string; motive: Motive; message: string; coupon: string };

export const MOTIVES: Record<Motive, { label: string; hint: string; intro: string; cta: string; subject: (title: string, when: string) => string }> = {
  novo: { label: "Divulgar o evento", hint: "Para anunciar um evento novo ou chamar para comprar", intro: "compartilhou este evento com você", cta: "Ver evento", subject: (t, w) => `${t} · ${w}` },
  ultimos: { label: "Últimos ingressos", hint: "O lote está acabando ou o preço vai subir", intro: "avisa que os ingressos estão acabando", cta: "Garantir meu ingresso", subject: (t) => `Últimos ingressos: ${t}` },
  lembrete: { label: "Lembrete para quem comprou", hint: "Endereço, horário e o que levar", intro: "lembra que o evento está chegando", cta: "Ver evento", subject: (t) => `Falta pouco: ${t}` },
  cupom: { label: "Cupom de desconto", hint: "Mande um código para o seu público", intro: "mandou um cupom de desconto para você", cta: "Usar o cupom", subject: (t) => `Cupom de desconto para ${t}` },
};

/** Texto de prévia na caixa de entrada quando o produtor não escreve um: local e preço. */
export const defaultPreheader = (e: EvInfo) => [[e.venue, e.city].filter(Boolean).join(", "), e.minPrice ? (e.minPrice === "Grátis" ? "Entrada grátis" : `ingressos a partir de ${e.minPrice}`) : ""].filter(Boolean).join(" · ");

export function normalizeContent(input: unknown): EventContent {
  const c = (input ?? {}) as Record<string, unknown>;
  const motive = (typeof c.motive === "string" && c.motive in MOTIVES ? c.motive : "novo") as Motive;
  return {
    eventId: typeof c.eventId === "string" && /^[0-9a-f-]{36}$/.test(c.eventId) ? c.eventId : "",
    motive,
    message: typeof c.message === "string" ? c.message.slice(0, 4000) : "",
    coupon: typeof c.coupon === "string" ? c.coupon.trim().toUpperCase().slice(0, 40) : "",
  };
}

const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
const p = (text: string) => `<p style="margin:0 0 14px;font-size:15.5px;line-height:1.65;color:${BRAND.body}">${escHtml(text).replace(/\n/g, "<br>")}</p>`;

/** Linha "rótulo: valor" como no e-mail do Sympla, com linha fina entre elas. */
const info = (rows: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map(([k, v], i) => `<tr>
<td class="tw-stack" width="128" valign="top" style="padding:12px 12px 12px 0;${i ? `border-top:1px solid ${BRAND.hair};` : ""}font-size:13px;line-height:21px;color:${BRAND.muted}">${k}</td>
<td class="tw-stack" valign="top" style="padding:12px 0;${i ? `border-top:1px solid ${BRAND.hair};` : ""}font-size:15px;line-height:21px;color:${BRAND.ink}">${v}</td></tr>`).join("")}</table>`;

/** Cartaz quando o evento não tem imagem enviada: a cor do evento e o nome em letra grande. */
function poster(e: EvInfo) {
  const fg = onColor(e.accent);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="260" valign="bottom" style="background:${e.accent};height:260px;padding:28px 36px">
${eyebrow(e.whenShort, fg)}${spacer(8)}<div style="font-size:40px;line-height:1;font-weight:800;letter-spacing:-1.2px;text-transform:uppercase;color:${fg}">${escHtml(e.title)}</div></td></tr></table>`;
}

/** O e-mail de evento completo (envelope Tickets Win + conteúdo). */
export function renderEventEmail(content: EventContent, c: RenderCtx) {
  const e = c.events[content.eventId];
  const m = MOTIVES[content.motive];
  const org = c.org.name;
  if (!e) {
    const body = `<div style="padding:60px 40px;text-align:center;font-size:15px;color:${BRAND.muted}">Escolha o evento do e-mail.</div>`;
    return { html: brandShell({ site: c.site, preheader: c.preheader, body }), text: "" };
  }
  const evUrl = content.motive === "cupom" && content.coupon ? `${e.url}?cupom=${encodeURIComponent(content.coupon)}` : e.url;
  const go = href(evUrl, c);
  const pic = e.banner ?? e.flyer;
  const initials = org.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const avatar = c.org.logo
    ? `<img src="${escHtml(absUrl(c.org.logo, c))}" alt="" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;border:0">`
    : `<div style="width:44px;height:44px;line-height:44px;border-radius:50%;background:${BRAND.ink};color:${BRAND.lime};text-align:center;font-size:15px;font-weight:800">${escHtml(initials || "TW")}</div>`;
  const msg = fillVars(content.message, c.vars).trim();
  const text = msg ? paragraphs(msg) : paragraphs(e.description).slice(0, 3);
  const venue = [e.venue, e.city].filter(Boolean).join(" · ");

  const rows: [string, string][] = [];
  if (e.organizer || org) rows.push(["Organizado por", escHtml(e.organizer || org)]);
  rows.push(["Data", escHtml(e.when)]);
  if (venue) rows.push(["Local", e.mapsUrl ? `<a href="${escHtml(href(e.mapsUrl, c))}" style="color:${BRAND.ink};text-decoration:underline;text-underline-offset:2px">${escHtml(venue)}</a>` : escHtml(venue)]);
  if (e.minPrice) rows.push(["Ingressos", e.minPrice === "Grátis" ? "Grátis" : `A partir de <b>${escHtml(e.minPrice)}</b>`]);

  const coupon = content.motive === "cupom" && content.coupon ? `${spacer(24)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="background:${BRAND.panel};border:1.5px dashed #CFCFC6;border-radius:14px;padding:22px">
${eyebrow("Seu cupom")}${spacer(8)}<div style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:28px;line-height:34px;font-weight:700;letter-spacing:4px;color:${BRAND.ink}">${escHtml(content.coupon)}</div>
${spacer(6)}<div style="font-size:13px;line-height:18px;color:${BRAND.muted}">O desconto entra sozinho pelo botão abaixo.</div></td></tr></table>` : "";

  const body = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="tw-px" style="padding:24px 36px;border-bottom:1px solid ${BRAND.hair}"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:14px">${avatar}</td>
<td valign="middle"><div style="font-size:16px;line-height:21px;font-weight:800;color:${BRAND.ink}">${escHtml(org)}</div><div style="font-size:14px;line-height:20px;color:${BRAND.muted}">${escHtml(m.intro)}:</div></td></tr></table></td></tr>
<tr><td>${pic ? `<a href="${escHtml(go)}"><img src="${escHtml(absUrl(pic, c))}" alt="${escHtml(e.title)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></a>` : poster(e)}</td></tr>
<tr><td class="tw-px" style="padding:30px 36px 8px">
${eyebrow(e.whenShort)}${spacer(8)}
<a href="${escHtml(go)}" style="text-decoration:none;color:${BRAND.ink}"><h1 class="tw-h1" style="margin:0;font-size:27px;line-height:1.15;font-weight:800;letter-spacing:-.6px;color:${BRAND.ink}">${escHtml(e.title)}</h1></a>
${spacer(16)}${info(rows)}${coupon}</td></tr>
${text.length ? `<tr><td class="tw-px" style="padding:22px 36px 0"><div style="border-top:1px solid ${BRAND.hair};padding-top:24px">${text.map(p).join("")}</div></td></tr>` : ""}
<tr><td class="tw-px" style="padding:12px 36px 36px">${brandButton(m.cta, go)}</td></tr></table>`;

  const site = c.site;
  const note = [
    `E-mail enviado para ${escHtml(c.vars.email)} por <b style="color:${BRAND.body}">${escHtml(org)}</b> através do evento <b style="color:${BRAND.body}">${escHtml(e.title)}</b>.`,
    `Não quer receber e-mails dos produtores? <a href="${escHtml(c.unsubscribeUrl)}" style="color:${BRAND.ink};text-decoration:underline;text-underline-offset:2px">Descadastre-se aqui</a>.${c.viewUrl ? ` <a href="${escHtml(c.viewUrl)}" style="color:${BRAND.muted};text-decoration:underline">Ver no navegador</a>.` : ""}`,
    `A Tickets Win não é autora do conteúdo deste e-mail. Identificou algo suspeito? <a href="${escHtml(site)}/ajuda" style="color:${BRAND.muted};text-decoration:underline">Fale com a gente</a>.`,
  ];
  const html = brandShell({ site, preheader: fillVars(c.preheader, c.vars) || defaultPreheader(e), body, note, pixelUrl: c.pixelUrl });
  const plain = [`${org} ${m.intro}:`, "", e.title, e.when, venue, e.minPrice ? `Ingressos a partir de ${e.minPrice}` : "", content.motive === "cupom" && content.coupon ? `Cupom: ${content.coupon}` : "", "", ...text, "", `${m.cta}: ${href(evUrl, { ...c, link: undefined })}`, "", "—", `Descadastre-se: ${c.unsubscribeUrl}`].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
  return { html, text: plain };
}

/** Campanha → e-mail: modelo pronto ("evento") ou o editor de blocos ("livre"). */
export type CampaignLike = { format: string; content: EventContent | null; design: Design };
export function renderCampaign(c: CampaignLike, ctx: RenderCtx) {
  return c.format === "evento" && c.content ? renderEventEmail(c.content, ctx) : renderEmail(c.design, ctx);
}

/** Links do e-mail na ordem em que aparecem (para o rastreio de cliques). */
export function campaignLinks(c: CampaignLike, ctx: RenderCtx) {
  const links: string[] = [];
  const seen = new Set<string>();
  renderCampaign(c, { ...ctx, link: (u) => { if (!seen.has(u)) { seen.add(u); links.push(u); } return u; } });
  return links;
}
