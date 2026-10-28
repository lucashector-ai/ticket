/*
 * E-mail de evento no formato Tickets Win: o produtor escolhe o evento, o motivo e, se quiser,
 * escreve um recado. O resto (cartaz, data, local, preço, botão, rodapé) é montado sozinho.
 * Puro: roda no servidor (envio) e no navegador (prévia do painel).
 */
import { BRAND, brandButton, brandShell, divider, escHtml, hero, pill, spacer } from "./brand";
import { fillVars, type Design } from "./design";
import { absUrl, href, onColor, renderEmail, type EvInfo, type RenderCtx } from "./render";

export type Motive = "novo" | "ultimos" | "lembrete" | "cupom";
export type EventContent = { eventId: string; motive: Motive; message: string; coupon: string };

export const MOTIVES: Record<Motive, { label: string; hint: string; intro: string; cta: string; subject: (title: string, when: string) => string }> = {
  novo: { label: "Divulgar o evento", hint: "Para anunciar um evento novo ou chamar para comprar", intro: "compartilhou este evento com você", cta: "Garantir ingresso", subject: (t, w) => `${t} · ${w}` },
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

const paragraphs = (text: string) => text.split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
const B = BRAND;
const para = (text: string) => `<p style="margin:0 0 14px;font-family:${B.font};font-size:15px;line-height:1.65;color:${B.body}">${escHtml(text).replace(/\n/g, "<br>")}</p>`;

/** Chamada grande de cada motivo (título do e-mail) e a linha de apoio. */
const HEAD: Record<Motive, { title: string; sub: string }> = {
  novo: { title: "Seu próximo rolê<br>já tem ingresso.", sub: "Garanta o seu antes do próximo lote." },
  ultimos: { title: "Os ingressos<br>estão acabando.", sub: "Depois deste lote, o preço sobe." },
  lembrete: { title: "Falta pouco<br>para o rolê.", sub: "Seu ingresso está em Meus ingressos e na carteira do celular." },
  cupom: { title: "Um desconto<br>só pra você.", sub: "Use o cupom no checkout e pague menos." },
};

/** Cartaz quando o evento não tem imagem enviada: a cor do evento e o nome em letra grande. */
function poster(e: EvInfo, w: number, h: number, radius: number, big: number) {
  const fg = onColor(e.accent);
  return `<table role="presentation" width="${w}" cellpadding="0" cellspacing="0" border="0" style="width:${w}px;max-width:100%"><tr><td height="${h}" valign="bottom" style="height:${h}px;background:${e.accent};border-radius:${radius}px;padding:22px;text-align:left">
<div style="font-family:${B.mono};font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${fg};opacity:.75">${escHtml(e.whenShort)}</div>
<div style="font-family:${B.disp};font-size:${big}px;line-height:.95;font-weight:700;letter-spacing:-.03em;text-transform:uppercase;color:${fg};margin-top:8px">${escHtml(e.title)}</div></td></tr></table>`;
}

const meta = (e: EvInfo) => [e.whenShort, [e.venue, e.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
const price = (e: EvInfo) => (e.minPrice ? (e.minPrice === "Grátis" ? "<b style=\"color:#111\">Entrada grátis</b>" : `a partir de <b style="color:#111">${escHtml(e.minPrice)}</b>`) : "");

/** O e-mail de evento completo (formato Tickets Win). */
export function renderEventEmail(content: EventContent, c: RenderCtx) {
  const e = c.events[content.eventId];
  const m = MOTIVES[content.motive];
  const org = c.org.name;
  if (!e) {
    const body = `<tr><td align="center" style="padding:80px 40px 0;font-family:${B.font};font-size:15px;color:${B.muted}">Escolha o evento do e-mail.</td></tr>`;
    return { html: brandShell({ site: c.site, preheader: c.preheader, body }), text: "" };
  }
  const evUrl = content.motive === "cupom" && content.coupon ? `${e.url}?cupom=${encodeURIComponent(content.coupon)}` : e.url;
  const go = href(evUrl, c);
  const days = Math.ceil((e.startAt - c.now) / 86_400_000);
  const tag = content.motive === "ultimos" ? "Últimos ingressos" : content.motive === "lembrete" ? (days <= 0 ? "É hoje" : days === 1 ? "É amanhã" : `Faltam ${days} dias`) : content.motive === "cupom" ? `Cupom ${content.coupon || "exclusivo"}` : "Ingressos à venda";
  const initials = org.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const avatar = c.org.logo
    ? `<img src="${escHtml(absUrl(c.org.logo, c))}" alt="" width="24" height="24" style="display:block;width:24px;height:24px;border-radius:50%;object-fit:cover;border:0">`
    : `<div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:${B.ink};color:${B.lime};text-align:center;font-family:${B.font};font-size:10px;font-weight:700">${escHtml(initials || "TW")}</div>`;

  const flyer = e.flyer ? absUrl(e.flyer, c) : null, banner = e.banner ? absUrl(e.banner, c) : null;
  const art = flyer
    ? `<img src="${escHtml(flyer)}" width="300" alt="${escHtml(e.title)}" style="display:block;width:300px;max-width:100%;height:auto;border:0;border-radius:24px">`
    : banner ? `<img src="${escHtml(banner)}" width="520" alt="${escHtml(e.title)}" style="display:block;width:520px;max-width:100%;height:auto;border:0;border-radius:24px">`
    : poster(e, 300, 400, 24, 44);

  const msg = fillVars(content.message, c.vars).trim();
  const text = msg ? paragraphs(msg) : paragraphs(e.description).slice(0, 3);
  const venue = [e.venue, e.city].filter(Boolean).join(" · ");
  const rows: [string, string][] = [["Data", escHtml(e.when)]];
  if (venue) rows.push(["Local", `${escHtml(venue)}${e.mapsUrl ? `<br><a href="${escHtml(href(e.mapsUrl, c))}" style="color:${B.ink};font-weight:700;text-decoration:none">Como chegar →</a>` : ""}`]);
  if (e.organizer || org) rows.push(["Organização", escHtml(e.organizer || org)]);

  const others = c.upcoming.filter((x) => x.id !== e.id).slice(0, 4);
  const grid = others.length >= 2 ? others.slice(0, others.length >= 4 ? 4 : 2) : [];
  const card = (x: EvInfo, left: boolean, last: boolean) => {
    const pic = x.flyer ? absUrl(x.flyer, c) : null, u = href(x.url, c);
    return `<td class="tw-stack tw-cell${last && !left ? " tw-end" : ""}" width="50%" valign="top" style="padding:0 ${left ? 12 : 0}px ${last ? 0 : 36}px ${left ? 0 : 12}px"><a href="${escHtml(u)}" style="text-decoration:none">${pic ? `<img src="${escHtml(pic)}" width="252" alt="" style="display:block;width:252px;max-width:100%;height:auto;border:0;border-radius:18px">` : poster(x, 252, 336, 18, 30)}</a>
<div style="font-family:${B.disp};font-size:18px;font-weight:600;letter-spacing:-.02em;color:${B.ink};margin-top:14px">${escHtml(x.title)}</div>
<div style="font-family:${B.font};font-size:13px;line-height:1.5;color:${B.muted};margin-top:3px">${escHtml([x.whenShort, x.city.split(" – ")[0]].filter(Boolean).join(" · "))}</div>
${x.minPrice ? `<div style="font-family:${B.font};font-size:13px;font-weight:700;color:${B.ink};margin-top:6px"><a href="${escHtml(u)}" style="color:${B.ink};text-decoration:none">${x.minPrice === "Grátis" ? "Entrada grátis" : `a partir de ${escHtml(x.minPrice)}`} &nbsp;<span style="color:#9A9A92;font-weight:600">→</span></a></div>` : ""}</td>`;
  };
  let gridRows = "";
  for (let i = 0; i < grid.length; i += 2) gridRows += `<tr>${card(grid[i], true, i + 2 >= grid.length)}${card(grid[i + 1], false, i + 2 >= grid.length)}</tr>`;

  const body = `<tr><td align="center" class="tw-px" style="padding:56px 48px 0">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td valign="middle" style="padding-right:8px">${avatar}</td><td valign="middle" style="font-family:${B.font};font-size:13px;font-weight:600;color:${B.muted}"><span style="color:${B.ink}">${escHtml(org)}</span> ${escHtml(m.intro)}</td></tr></table>
${spacer(14)}${hero(HEAD[content.motive].title, HEAD[content.motive].sub)}</td></tr>
<tr><td align="center" style="padding:44px 40px 0"><a href="${escHtml(go)}" style="text-decoration:none">${art}</a></td></tr>
<tr><td align="center" class="tw-px" style="padding:28px 48px 0">${pill(tag)}
<div style="font-family:${B.disp};font-size:30px;line-height:1.1;font-weight:600;letter-spacing:-.03em;color:${B.ink};margin-top:14px">${escHtml(e.title)}</div>
<div style="font-family:${B.font};font-size:15px;line-height:1.6;color:${B.body};margin-top:6px">${escHtml(meta(e))}${price(e) ? `<br>${price(e)}` : ""}</div></td></tr>
<tr><td align="center" style="padding:24px 40px 0">${brandButton(m.cta, go)}</td></tr>
${content.motive === "cupom" && content.coupon ? `<tr><td class="tw-px" style="padding:40px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${B.panel};border-radius:20px"><tr>
<td class="tw-cp tw-cpt" style="padding:22px 26px;font-family:${B.font};font-size:15px;color:${B.ink}"><b style="font-family:${B.disp};font-size:17px;letter-spacing:-.01em">Seu cupom de desconto</b><br><span style="font-size:13px;color:${B.muted}">O botão acima já aplica no checkout.</span></td>
<td class="tw-cp" align="right" style="padding:22px 26px"><span style="display:inline-block;padding:11px 16px;border-radius:12px;background:${B.lime};font-family:${B.mono};font-size:17px;font-weight:700;letter-spacing:.12em;color:${B.ink}">${escHtml(content.coupon)}</span></td></tr></table></td></tr>` : ""}
${divider()}
<tr><td class="tw-px" style="padding:56px 48px 0">
<div style="font-family:${B.disp};font-size:26px;font-weight:600;letter-spacing:-.03em;color:${B.ink}">${msg ? `Recado de ${escHtml(org)}` : "Sobre o evento"}</div>
${spacer(14)}${text.map(para).join("")}
${spacer(10)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${B.panel};border-radius:20px"><tr><td style="padding:8px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows.map(([k, v], i) => `<tr><td width="110" valign="top" style="padding:14px 12px 14px 0;${i ? `border-top:1px solid #E9E9E4;` : ""}font-family:${B.font};font-size:13px;font-weight:600;color:${B.muted}">${k}</td><td valign="top" style="padding:14px 0;${i ? `border-top:1px solid #E9E9E4;` : ""}font-family:${B.font};font-size:14px;line-height:1.55;color:${B.ink}">${v}</td></tr>`).join("")}</table>
</td></tr></table></td></tr>
${gridRows ? `${divider()}<tr><td class="tw-px" style="padding:56px 48px 28px">
<div style="font-family:${B.disp};font-size:26px;font-weight:600;letter-spacing:-.03em;color:${B.ink}">Também na agenda</div>
<div style="font-family:${B.font};font-size:14px;color:${B.muted};margin-top:6px">Outros eventos de ${escHtml(org)}.</div></td></tr>
<tr><td class="tw-px" style="padding:0 36px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${gridRows}</table></td></tr>` : ""}`;

  const link = (u: string, t: string) => `<a href="${escHtml(u)}" style="color:#BDBDB8;text-decoration:underline">${t}</a>`;
  const note = [
    `E-mail enviado para ${escHtml(c.vars.email)} por ${escHtml(org)} através do evento ${escHtml(e.title)}.`,
    `A Tickets Win não é autora do conteúdo deste e-mail. Algo suspeito? ${link(`${c.site}/ajuda`, "Fale com a gente")}.`,
    `${link(c.unsubscribeUrl, "Descadastrar dos e-mails de produtores")}${c.viewUrl ? ` &nbsp;·&nbsp; ${link(c.viewUrl, "Ver no navegador")}` : ""}`,
  ];
  const html = brandShell({ site: c.site, preheader: fillVars(c.preheader, c.vars) || defaultPreheader(e), body, note, pixelUrl: c.pixelUrl });
  const plain = [`${org} ${m.intro}:`, "", e.title, e.when, venue, e.minPrice ? `Ingressos a partir de ${e.minPrice}` : "", content.motive === "cupom" && content.coupon ? `Cupom: ${content.coupon}` : "", "", ...text, "", `${m.cta}: ${href(evUrl, { ...c, link: undefined })}`, "", "—", `Descadastrar: ${c.unsubscribeUrl}`].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
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
