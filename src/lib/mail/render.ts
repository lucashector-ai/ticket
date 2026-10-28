/*
 * Design → HTML de e-mail (tabelas e estilos inline, que funcionam no Gmail, Outlook e Apple Mail).
 * Puro: roda no servidor (envio, teste) e no navegador (o editor mostra exatamente este HTML).
 *
 * Linguagem visual: editorial. Rótulos curtos em caixa alta, títulos fortes, linhas finas separando
 * informação, um botão por bloco e nada de emoji. As cores derivam dos tokens do estilo.
 */
import { cleanHtml, fillVars, stripTags, type Block, type Design, type MailStyle, type Vars } from "./design";

export type EvInfo = {
  id: string; slug: string; title: string;
  /** caminho no site (/eventos/...) ou endereço completo */
  url: string;
  /** "Sex, 06 nov · 22h" e "Sexta-feira, 06 de novembro de 2026, 22h" */
  whenShort: string; when: string;
  venue: string; city: string; address: string; mapsUrl: string;
  /** imagem enviada pelo produtor (/midia/... ou endereço completo): faixa larga e cartaz */
  banner: string | null; flyer: string | null;
  accent: string;
  minPrice: string | null;
  lineup: { name: string; img: string | null; role: string }[];
  tiers: { name: string; price: string; soldOut: boolean }[];
  startAt: number;
};

export type OrgInfo = { name: string; logo: string | null; instagram: string; whatsapp: string; site: string };

export type RenderCtx = {
  site: string;
  org: OrgInfo;
  events: Record<string, EvInfo>;
  /** próximos eventos do produtor (bloco Agenda) */
  upcoming: EvInfo[];
  vars: Vars;
  preheader: string;
  /** por que a pessoa recebe (rodapé) */
  reason: string;
  unsubscribeUrl: string;
  viewUrl?: string;
  pixelUrl?: string;
  /** reescreve cada link (rastreio de clique); recebe o link já com UTM */
  link?: (url: string) => string;
  utmCampaign?: string;
  now: number;
  /** marca os elementos editáveis (só no editor) */
  editor?: boolean;
};

const FONTS: Record<MailStyle["font"], string> = {
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif",
  serif: "Georgia,'Times New Roman',Times,serif",
  mono: "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace",
};
export const fontStack = (f: MailStyle["font"]) => FONTS[f] ?? FONTS.sans;
const MONO = "'SFMono-Regular',Menlo,Consolas,'Courier New',monospace";

/** Regras do celular: no e-mail ficam num @media; no editor, com a classe .m na tela. */
export const MOBILE_RULES = [
  ".tw-px{padding-left:22px!important;padding-right:22px!important}",
  ".tw-stack{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box}",
  ".tw-stack-gap{padding:0 0 16px 0!important}",
  ".tw-h1{font-size:28px!important;line-height:1.12!important}",
  ".tw-big{font-size:26px!important}",
];

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Contraste simples: texto escuro ou claro sobre uma cor. */
export function onColor(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!m) return "#111111";
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111111" : "#FFFFFF";
}
/** Mistura duas cores (k = quanto de b). Tons derivados funcionam no tema claro e no escuro. */
export function mix(a: string, b: string, k: number) {
  const pa = a.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i), pb = b.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (!pa || !pb) return b;
  return "#" + [1, 2, 3].map((i) => Math.round(parseInt(pa[i], 16) * (1 - k) + parseInt(pb[i], 16) * k).toString(16).padStart(2, "0")).join("");
}

/** Tons derivados do estilo. */
function tones(s: MailStyle) {
  return {
    body: mix(s.text, s.card, 0.14),
    muted: mix(s.text, s.card, 0.45),
    hair: mix(s.text, s.card, 0.88),
    panel: mix(s.text, s.card, 0.955),
  };
}

const absUrl = (u: string, c: RenderCtx) => (u.startsWith("/") ? c.site + u : u);

/** Link com UTM (só para o site) e com o rastreio de clique, quando houver. "evento:<id>" vira a página do evento. */
function href(url: string, c: RenderCtx) {
  if (!url) return "";
  let u = url.trim();
  if (u.startsWith("evento:")) u = c.events[u.slice(7)]?.url ?? "/";
  u = absUrl(u, c);
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(u)) u = "https://" + u;
  if (c.utmCampaign && u.startsWith(c.site)) {
    const sep = u.includes("?") ? "&" : "?";
    if (!/[?&]utm_source=/.test(u)) u += `${sep}utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(c.utmCampaign)}`;
  }
  return c.link ? c.link(u) : u;
}

const ed = (c: RenderCtx, attr: string) => (c.editor ? ` data-edit="${attr}"` : "");
/** No editor o texto fica com as variáveis cruas ({{primeiro_nome}}), para a edição não gravar o exemplo. */
const fv = (s: string, c: RenderCtx, extra?: Record<string, string>) => (c.editor ? s.replace(/\{\{\s*evento\s*\}\}/g, extra?.evento ?? "{{evento}}") : fillVars(s, c.vars, extra));

const TABLE = `role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"`;
const row = (inner: string, pad = "10px 40px") => `<table ${TABLE}><tr><td class="tw-px" style="padding:${pad}">${inner}</td></tr></table>`;
const gap = (h: number) => `<div style="height:${h}px;line-height:${h}px;font-size:1px">&nbsp;</div>`;

/** Rótulo curto em caixa alta (seções e campos). */
const label = (text: string, color: string, extra = "") => `<div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${color};${extra}">${esc(text)}</div>`;

function button(text: string, url: string, s: MailStyle, c: RenderCtx, opts: { full?: boolean; align?: "left" | "center"; edit?: boolean } = {}) {
  const r = Math.min(s.radius, 12);
  const a = `<a href="${esc(href(url, c))}"${opts.edit ? ed(c, "label") : ""} style="display:${opts.full ? "block" : "inline-block"};background:${s.accent};color:${s.accentText};text-decoration:none;font-weight:700;font-size:15px;line-height:20px;letter-spacing:.1px;padding:16px 28px;border-radius:${r}px;text-align:center;mso-padding-alt:0">${esc(text)}</a>`;
  return `<div style="text-align:${opts.align ?? "left"}">${a}</div>`;
}

/** Cartaz tipográfico quando o evento não tem imagem enviada. */
function poster(e: EvInfo, height: number, radius: number, big = 36) {
  const fg = onColor(e.accent), soft = mix(fg, e.accent, 0.35);
  return `<table ${TABLE}><tr><td height="${height}" valign="top" style="background:${e.accent};border-radius:${radius}px;padding:24px 26px;height:${height}px">
<table ${TABLE} height="${height - 48}" style="height:${height - 48}px"><tr><td valign="top">${label(e.whenShort, soft)}</td></tr>
<tr><td valign="bottom"><div class="tw-big" style="font-size:${big}px;line-height:1.02;font-weight:800;letter-spacing:-1px;text-transform:uppercase;color:${fg}">${esc(e.title)}</div>
${e.venue ? `<div style="font-size:13px;line-height:18px;font-weight:600;color:${soft};margin-top:10px">${esc([e.venue, e.city].filter(Boolean).join(" · "))}</div>` : ""}</td></tr></table></td></tr></table>`;
}
const img = (src: string, alt: string, radius: number, width = "100%") =>
  `<img src="${esc(src)}" alt="${esc(alt)}" width="${width === "100%" ? 520 : width}" style="display:block;width:${width};max-width:100%;height:auto;border:0;border-radius:${radius}px">`;

/** Linhas "rótulo · valor" separadas por linhas finas. */
function facts(rows: [string, string][], s: MailStyle) {
  const t = tones(s);
  return `<table ${TABLE}>${rows.map(([k, v], i) => `<tr>
<td width="96" valign="top" style="padding:11px 12px 11px 0;${i ? `border-top:1px solid ${t.hair};` : ""}">${label(k, t.muted, "line-height:20px")}</td>
<td valign="top" style="padding:11px 0;${i ? `border-top:1px solid ${t.hair};` : ""}font-size:15px;line-height:20px;color:${s.text}">${v}</td></tr>`).join("")}</table>`;
}

function eventFacts(e: EvInfo, s: MailStyle, price: boolean) {
  const rows: [string, string][] = [["Data", esc(e.when)]];
  if (e.venue) rows.push(["Local", esc([e.venue, e.city].filter(Boolean).join(" · "))]);
  if (price && e.minPrice) rows.push(["Ingressos", e.minPrice === "Grátis" ? "<b>Grátis</b>" : `A partir de <b>${esc(e.minPrice)}</b>`]);
  return facts(rows, s);
}

function missing(c: RenderCtx, what: string) {
  return c.editor ? row(`<div style="border:1.5px dashed #CFCFC8;border-radius:12px;padding:26px 20px;text-align:center;color:#8A8A82;font-size:14px;line-height:20px;font-family:-apple-system,'Segoe UI',sans-serif">${what}</div>`) : "";
}

/** HTML de um bloco (uma tabela de largura total). */
export function renderBlock(b: Block, s: MailStyle, c: RenderCtx): string {
  const R = s.radius, t = tones(s);
  const section = (title: string) => (title ? `${label(title, t.muted)}${gap(14)}` : "");
  switch (b.t) {
    case "titulo": {
      const fs = b.size === "g" ? 34 : b.size === "m" ? 26 : 20;
      return row(`<h1 class="${b.size === "g" ? "tw-h1" : ""}"${ed(c, "text")} style="margin:0;font-size:${fs}px;line-height:1.12;font-weight:800;letter-spacing:${b.size === "p" ? "-.2" : "-.8"}px;color:${s.text};text-align:${b.align}">${esc(fv(b.text, c))}</h1>`, "16px 40px 6px");
    }
    case "texto":
      return row(`<div${ed(c, "html")} style="font-size:16px;line-height:1.65;color:${t.body};text-align:${b.align}">${fv(cleanHtml(b.html), c).replace(/<a href="([^"]*)">/g, (_, u: string) => `<a href="${esc(href(u.replace(/&quot;/g, '"'), c))}" style="color:${s.text};text-decoration:underline;text-underline-offset:2px">`)}</div>`, "8px 40px");
    case "imagem": {
      if (!b.src) return missing(c, "Envie uma imagem no painel ao lado");
      const w = Math.max(20, Math.min(100, b.width));
      const im = img(absUrl(b.src, c), b.alt, b.rounded ? R : 0, `${w}%`);
      return row(`<div style="text-align:center">${b.href ? `<a href="${esc(href(b.href, c))}">${im}</a>` : im}</div>`, "12px 40px");
    }
    case "botao":
      return row(button(b.label, b.href || "/", s, c, { full: b.full, align: b.align, edit: true }), "14px 40px");
    case "evento": {
      const e = c.events[b.eventId];
      if (!e) return missing(c, "Escolha o evento no painel ao lado");
      const raw = b.image || (b.layout === "destaque" ? e.banner ?? e.flyer : e.flyer ?? e.banner);
      const pic = raw ? absUrl(raw, c) : null;
      const url = href(e.url, c);
      const art = (h: number, big?: number) => (pic ? `<a href="${esc(url)}">${img(pic, e.title, R)}</a>` : poster(e, h, R, big));
      const cta = b.cta ? `${gap(20)}${button(b.cta, e.url, s, c, { full: b.layout === "destaque" })}` : "";
      if (b.layout === "lado") {
        return row(`<table ${TABLE}><tr>
<td class="tw-stack tw-stack-gap" width="44%" valign="top" style="padding:0 22px 0 0">${art(250, 26)}</td>
<td class="tw-stack" valign="top">${label(e.whenShort, t.muted)}${gap(8)}<a href="${esc(url)}" style="text-decoration:none;color:${s.text}"><div style="font-size:22px;line-height:1.15;font-weight:800;letter-spacing:-.4px">${esc(e.title)}</div></a>${gap(10)}
<div style="font-size:14px;line-height:21px;color:${t.body}">${esc([e.venue, e.city].filter(Boolean).join(" · "))}${b.price && e.minPrice ? `<br>${e.minPrice === "Grátis" ? "Grátis" : `A partir de <b style="color:${s.text}">${esc(e.minPrice)}</b>`}` : ""}</div>${cta}</td></tr></table>`, "14px 40px");
      }
      return row(`${art(300)}${gap(22)}${label(e.whenShort, t.muted)}${gap(8)}<a href="${esc(url)}" style="text-decoration:none;color:${s.text}"><div class="tw-big" style="font-size:28px;line-height:1.1;font-weight:800;letter-spacing:-.7px">${esc(e.title)}</div></a>${gap(14)}${eventFacts(e, s, b.price)}${cta}`, "14px 40px");
    }
    case "eventos": {
      const list = (b.mode === "proximos" ? c.upcoming : b.eventIds.map((id) => c.events[id]).filter(Boolean)).slice(0, Math.max(1, b.limit));
      if (!list.length) return missing(c, b.mode === "proximos" ? "Nenhum evento futuro publicado" : "Escolha os eventos no painel ao lado");
      const card = (e: EvInfo) => {
        const raw = e.flyer ?? e.banner;
        const url = href(e.url, c);
        return `<a href="${esc(url)}" style="text-decoration:none;color:${s.text};display:block">${raw ? img(absUrl(raw, c), e.title, R) : poster(e, 210, R, 22)}
${gap(12)}${label(e.whenShort, t.muted)}<div style="font-size:16px;line-height:1.25;font-weight:700;letter-spacing:-.2px;margin:5px 0 3px">${esc(e.title)}</div>
<div style="font-size:13px;line-height:1.4;color:${t.muted}">${esc(e.venue || "")}</div></a>`;
      };
      let rows = "";
      for (let i = 0; i < list.length; i += 2) {
        const [a, z] = [list[i], list[i + 1]];
        rows += `<tr><td class="tw-stack tw-stack-gap" width="50%" valign="top" style="padding:0 10px 26px 0">${card(a)}</td><td class="tw-stack tw-stack-gap" width="50%" valign="top" style="padding:0 0 26px 10px">${z ? card(z) : "&nbsp;"}</td></tr>`;
      }
      return row(`${section(b.title)}<table ${TABLE}>${rows}</table>`, "28px 40px 0");
    }
    case "lineup": {
      const e = c.events[b.eventId];
      if (!e) return missing(c, "Escolha o evento no painel ao lado");
      if (!e.lineup.length) return missing(c, "Este evento ainda não tem line-up");
      const withPics = e.lineup.every((a) => a.img) && e.lineup.length <= 6;
      if (withPics) {
        const cell = (a: EvInfo["lineup"][number]) => `<td class="tw-stack tw-stack-gap" width="33%" valign="top" align="center" style="padding:0 6px 20px">
<img src="${esc(absUrl(a.img!, c))}" alt="" width="76" height="76" style="display:block;margin:0 auto;width:76px;height:76px;border-radius:50%;object-fit:cover;border:0">
<div style="font-size:15px;line-height:20px;font-weight:700;color:${s.text};margin-top:10px">${esc(a.name)}</div>${a.role ? `<div style="font-size:12px;line-height:16px;color:${t.muted}">${esc(a.role)}</div>` : ""}</td>`;
        let rows = "";
        for (let i = 0; i < e.lineup.length; i += 3) { const r = e.lineup.slice(i, i + 3); rows += `<tr>${r.map(cell).join("")}${"<td>&nbsp;</td>".repeat(3 - r.length)}</tr>`; }
        return row(`${section(b.title)}<table ${TABLE}>${rows}</table>`, "28px 40px 0");
      }
      // sem foto de todos: line-up tipográfico, como num cartaz
      const [head, ...rest] = e.lineup;
      return row(`${section(b.title)}<div class="tw-big" style="font-size:32px;line-height:1.08;font-weight:800;letter-spacing:-.8px;color:${s.text}">${esc(head.name)}</div>
${rest.length ? `${gap(10)}<div style="font-size:19px;line-height:1.5;font-weight:600;color:${t.body}">${rest.map((a) => esc(a.name)).join(`<span style="color:${t.hair}">&nbsp;&nbsp;/&nbsp;&nbsp;</span>`)}</div>` : ""}`, "28px 40px 12px");
    }
    case "ingressos": {
      const e = c.events[b.eventId];
      if (!e) return missing(c, "Escolha o evento no painel ao lado");
      const lines = e.tiers.slice(0, 10).map((x, i) => `<tr>
<td style="padding:14px 0;${i ? `border-top:1px solid ${t.hair};` : ""}font-size:15px;line-height:20px;color:${x.soldOut ? t.muted : s.text}">${esc(x.name)}</td>
<td align="right" style="padding:14px 0;${i ? `border-top:1px solid ${t.hair};` : ""}white-space:nowrap">${x.soldOut ? `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${t.panel};font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:${t.muted}">Esgotado</span>` : `<span style="font-size:15px;font-weight:700;color:${s.text}">${esc(x.price)}</span>`}</td></tr>`).join("");
      return row(`${section(b.title)}<table ${TABLE} style="border-top:1px solid ${t.hair};border-bottom:1px solid ${t.hair}">${lines || `<tr><td style="padding:14px 0;font-size:15px;color:${t.body}">Os ingressos estão na página do evento.</td></tr>`}</table>
${b.cta ? `${gap(18)}${button(b.cta, e.url, s, c, { full: true })}` : ""}`, "28px 40px 14px");
    }
    case "cupom": {
      if (!b.code) return missing(c, "Digite o código do cupom no painel ao lado");
      const e = b.eventId ? c.events[b.eventId] : undefined;
      const url = e ? `${e.url}?cupom=${encodeURIComponent(b.code)}` : "";
      return row(`<table ${TABLE}><tr><td align="center" style="border:1.5px dashed ${mix(s.text, s.card, 0.65)};border-radius:${R}px;padding:28px 24px">
${label("Cupom exclusivo", t.muted)}${gap(10)}
<div style="font-family:${MONO};font-size:32px;line-height:38px;font-weight:700;letter-spacing:5px;color:${s.text}">${esc(b.code.toUpperCase())}</div>
${b.text ? `${gap(10)}<div style="font-size:15px;line-height:1.55;color:${t.body}">${esc(fv(b.text, c))}</div>` : ""}
${b.until ? `${gap(4)}<div style="font-size:13px;line-height:18px;color:${t.muted}">Válido até ${esc(b.until)}</div>` : ""}
${url ? `${gap(20)}${button("Usar o cupom", url, s, c, { align: "center" })}` : ""}</td></tr></table>`, "14px 40px");
    }
    case "contagem": {
      const e = c.events[b.eventId];
      if (!e) return missing(c, "Escolha o evento no painel ao lado");
      const days = Math.ceil((e.startAt - c.now) / 86_400_000);
      if (days < 0 && !c.editor) return "";
      const fg = s.accentText, soft = mix(s.accentText, s.accent, 0.3);
      const big = days <= 0 ? "Hoje" : String(days);
      const unit = days <= 0 ? "" : days === 1 ? "dia" : "dias";
      return row(`<table ${TABLE}><tr><td align="center" style="background:${s.accent};border-radius:${R}px;padding:30px 24px">
<div style="font-size:76px;line-height:1;font-weight:800;letter-spacing:-3px;color:${fg}">${esc(big)}</div>
${unit ? `${gap(6)}${label(unit, soft)}` : ""}${gap(12)}
<div style="font-size:16px;line-height:22px;font-weight:600;color:${fg}">${esc(fv(b.text, c, { evento: e.title }))}</div></td></tr></table>`, "14px 40px");
    }
    case "local": {
      const e = c.events[b.eventId];
      if (!e) return missing(c, "Escolha o evento no painel ao lado");
      return row(`<table ${TABLE}><tr><td style="background:${t.panel};border-radius:${R}px;padding:22px 24px">
${label("Local", t.muted)}${gap(8)}
<div style="font-size:19px;line-height:1.25;font-weight:800;letter-spacing:-.3px;color:${s.text}">${esc(e.venue || "Local a confirmar")}</div>
${e.address ? `${gap(4)}<div style="font-size:14px;line-height:1.5;color:${t.body}">${esc(e.address)}</div>` : ""}
${e.mapsUrl ? `${gap(14)}<a href="${esc(href(e.mapsUrl, c))}" style="font-size:14px;font-weight:700;color:${s.text};text-decoration:none;border-bottom:1.5px solid ${s.text};padding-bottom:1px">Como chegar</a>` : ""}</td></tr></table>`, "14px 40px");
    }
    case "divisor":
      return row(`<div style="border-top:1px solid ${t.hair};font-size:1px;line-height:1px">&nbsp;</div>`, "18px 40px");
    case "espaco":
      return row(gap(b.h), "0 40px");
    case "redes": {
      const ig = b.instagram || c.org.instagram, wa = b.whatsapp || c.org.whatsapp, site = b.site || c.org.site;
      const links: [string, string][] = [];
      if (ig) links.push(["Instagram", ig.startsWith("http") ? ig : `https://instagram.com/${ig.replace(/^@/, "")}`]);
      if (wa) links.push(["WhatsApp", wa.startsWith("http") ? wa : `https://wa.me/${wa.replace(/\D/g, "")}`]);
      if (site) links.push(["Site", site]);
      if (!links.length) return missing(c, "Adicione Instagram, WhatsApp ou site no painel ao lado");
      const items = links.map(([l, u]) => `<a href="${esc(href(u, c))}" style="font-size:14px;font-weight:700;color:${s.text};text-decoration:none">${l}</a>`).join(`<span style="color:${t.hair}">&nbsp;&nbsp;&nbsp;/&nbsp;&nbsp;&nbsp;</span>`);
      return row(`<div style="text-align:center;padding:18px 0;border-top:1px solid ${t.hair};border-bottom:1px solid ${t.hair}">${items}</div>`, "16px 40px");
    }
  }
}

/** Topo com a marca do produtor. */
export function renderHeader(s: MailStyle, c: RenderCtx) {
  if (s.header === "nenhum") return "";
  const same = s.headerBg.toLowerCase() === s.card.toLowerCase();
  const sub = mix(s.headerText, s.headerBg, 0.45);
  const logo = s.header === "logo" && c.org.logo
    ? `<td width="52" valign="middle" style="padding-right:12px"><img src="${esc(absUrl(c.org.logo, c))}" alt="" width="40" height="40" style="display:block;width:40px;height:40px;border-radius:50%;object-fit:cover;border:0"></td>`
    : "";
  return `<table ${TABLE}><tr><td class="tw-px" style="background:${s.headerBg};padding:24px 40px 22px;${same ? `border-bottom:1px solid ${mix(s.text, s.card, 0.9)}` : ""}">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${logo}<td valign="middle"><div style="font-size:16px;line-height:20px;font-weight:800;letter-spacing:-.2px;color:${s.headerText}">${esc(c.org.name)}</div><div style="font-size:12px;line-height:16px;color:${sub};margin-top:2px">na Tickets Win</div></td></tr></table></td></tr></table>`;
}

/** Rodapé fora do cartão: por que recebeu, descadastro e assinatura da plataforma. */
export function renderFooter(s: MailStyle, c: RenderCtx) {
  const ink = onColor(s.bg), mute = mix(ink, s.bg, 0.5), link = mix(ink, s.bg, 0.25);
  const a = (u: string, t: string) => `<a href="${esc(u)}" style="color:${link};text-decoration:underline;text-underline-offset:2px">${t}</a>`;
  return `<table ${TABLE}><tr><td align="center" class="tw-px" style="padding:26px 40px 8px;font-size:12px;line-height:19px;color:${mute}">
<div style="font-weight:700;color:${link}">${esc(c.org.name)}</div>
<div style="margin-top:6px">${esc(c.reason)}</div>
<div style="margin-top:6px">${a(c.unsubscribeUrl, "Descadastrar")}${c.viewUrl ? `&nbsp;&nbsp;·&nbsp;&nbsp;${a(c.viewUrl, "Ver no navegador")}` : ""}</div>
<div style="margin-top:14px;font-size:11px;letter-spacing:.3px">Enviado com Tickets Win. A Tickets Win não é autora do conteúdo deste e-mail.</div></td></tr></table>`;
}

/** E-mail completo: HTML e versão em texto. */
export function renderEmail(d: Design, c: RenderCtx): { html: string; text: string } {
  const s = d.style;
  const body = d.blocks.map((b) => renderBlock(b, s, c)).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title></title>
<style>@media (max-width:620px){${MOBILE_RULES.join("")}} a{color:inherit} img{-ms-interpolation-mode:bicubic} body{margin:0;padding:0}</style></head>
<body style="margin:0;padding:0;background:${s.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(fillVars(c.preheader, c.vars))}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table ${TABLE} style="background:${s.bg}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:${fontStack(s.font)}">
<tr><td style="background:${s.card};border-radius:${Math.min(s.radius + 4, 24)}px;overflow:hidden">${renderHeader(s, c)}${gap(20)}${body}${gap(32)}</td></tr>
<tr><td>${renderFooter(s, c)}</td></tr>
</table></td></tr></table>${c.pixelUrl ? `<img src="${esc(c.pixelUrl)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;border:0">` : ""}</body></html>`;
  return { html, text: renderText(d, c) };
}

/** Versão em texto puro (alguns leitores e filtros de spam olham para ela). */
export function renderText(d: Design, c: RenderCtx) {
  const out: string[] = [c.org.name, ""];
  const u = (x: string) => href(x, { ...c, link: undefined });
  for (const b of d.blocks) {
    const e = "eventId" in b ? c.events[b.eventId] : undefined;
    switch (b.t) {
      case "titulo": out.push(fillVars(b.text, c.vars).toUpperCase(), ""); break;
      case "texto": out.push(stripTags(fillVars(cleanHtml(b.html), c.vars)), ""); break;
      case "botao": out.push(`${b.label}: ${u(b.href || "/")}`, ""); break;
      case "imagem": if (b.href) out.push(u(b.href), ""); break;
      case "evento": if (e) out.push(e.title, e.when, [e.venue, e.city].filter(Boolean).join(" · "), `${b.cta || "Ver evento"}: ${u(e.url)}`, ""); break;
      case "eventos": for (const x of b.mode === "proximos" ? c.upcoming.slice(0, b.limit) : b.eventIds.map((id) => c.events[id]).filter(Boolean)) out.push(`${x.title} · ${x.whenShort}: ${u(x.url)}`); out.push(""); break;
      case "lineup": if (e) out.push(`${b.title}: ${e.lineup.map((a) => a.name).join(", ")}`, ""); break;
      case "ingressos": if (e) out.push(b.title, ...e.tiers.map((x) => `${x.name}: ${x.soldOut ? "esgotado" : x.price}`), u(e.url), ""); break;
      case "cupom": if (b.code) out.push(`Cupom: ${b.code.toUpperCase()}`, b.text, ""); break;
      case "local": if (e) out.push(`Local: ${e.venue}`, e.address, ""); break;
      default: break;
    }
  }
  out.push("—", c.reason, `Descadastrar: ${c.unsubscribeUrl}`);
  return out.filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n");
}

/** Todos os links do e-mail, na ordem em que aparecem (com UTM). Usado para o rastreio de cliques. */
export function collectLinks(d: Design, c: RenderCtx) {
  const links: string[] = [];
  const idx = new Map<string, number>();
  renderEmail(d, { ...c, link: (u) => { if (!idx.has(u)) { idx.set(u, links.length); links.push(u); } return u; } });
  return links;
}
