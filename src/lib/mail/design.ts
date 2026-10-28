/*
 * E-mail do produtor: um design é uma lista de blocos + o estilo geral.
 * Este arquivo não depende do servidor: o editor (navegador) e o envio usam os mesmos tipos.
 */

export type Align = "left" | "center";

export type MailStyle = {
  /** fundo de fora do e-mail */
  bg: string;
  /** fundo do conteúdo */
  card: string;
  text: string;
  /** botões e destaques */
  accent: string;
  /** texto dentro dos botões */
  accentText: string;
  font: "sans" | "serif" | "mono";
  /** arredondamento dos cantos (px) */
  radius: number;
  /** topo do e-mail: logo/foto do produtor, só o nome, ou nada */
  header: "logo" | "nome" | "nenhum";
  headerBg: string;
  headerText: string;
};

export type Block =
  | { id: string; t: "titulo"; text: string; size: "g" | "m" | "p"; align: Align }
  | { id: string; t: "texto"; html: string; align: Align }
  | { id: string; t: "imagem"; src: string; alt: string; href: string; width: number; rounded: boolean }
  | { id: string; t: "botao"; label: string; href: string; align: Align; full: boolean }
  | { id: string; t: "evento"; eventId: string; layout: "destaque" | "lado"; price: boolean; cta: string; image: string }
  | { id: string; t: "eventos"; title: string; mode: "proximos" | "escolhidos"; eventIds: string[]; limit: number }
  | { id: string; t: "lineup"; eventId: string; title: string }
  | { id: string; t: "ingressos"; eventId: string; title: string; cta: string }
  | { id: string; t: "cupom"; code: string; text: string; eventId: string; until: string }
  | { id: string; t: "contagem"; eventId: string; text: string }
  | { id: string; t: "local"; eventId: string }
  | { id: string; t: "divisor" }
  | { id: string; t: "espaco"; h: number }
  | { id: string; t: "redes"; instagram: string; whatsapp: string; site: string };

export type BlockType = Block["t"];
export type Design = { v: 1; style: MailStyle; blocks: Block[] };

/** Quem recebe: compradores, seguidores e listas de lançamento, com exclusões. */
export type Audience = {
  /** compradores: de todos os eventos, de eventos escolhidos, ou ninguém */
  buyers: "all" | "events" | "none";
  buyerEvents: string[];
  /** quem segue a página do produtor */
  followers: boolean;
  /** "me avise" e cadastro da pré-venda */
  signups: boolean;
  /** não envia para quem já comprou estes eventos (ex.: o evento anunciado) */
  excludeBuyersOf: string[];
};

export const DEFAULT_AUDIENCE: Audience = { buyers: "all", buyerEvents: [], followers: true, signups: true, excludeBuyersOf: [] };

export const DEFAULT_STYLE: MailStyle = {
  bg: "#F1F1EC", card: "#FFFFFF", text: "#141414", accent: "#141414", accentText: "#DCF568",
  font: "sans", radius: 14, header: "logo", headerBg: "#FFFFFF", headerText: "#141414",
};

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Bloco novo com valores iniciais (o evento vem do primeiro evento do produtor, se houver). */
export function makeBlock(t: BlockType, eventId = ""): Block {
  const id = newId();
  switch (t) {
    case "titulo": return { id, t, text: "Escreva um título", size: "g", align: "left" };
    case "texto": return { id, t, html: "Oi {{primeiro_nome|pessoal}}, escreva aqui a sua mensagem.", align: "left" };
    case "imagem": return { id, t, src: "", alt: "", href: "", width: 100, rounded: true };
    case "botao": return { id, t, label: "Comprar ingressos", href: "", align: "left", full: false };
    case "evento": return { id, t, eventId, layout: "destaque", price: true, cta: "Comprar ingressos", image: "" };
    case "eventos": return { id, t, title: "Próximos eventos", mode: "proximos", eventIds: [], limit: 4 };
    case "lineup": return { id, t, eventId, title: "Line-up" };
    case "ingressos": return { id, t, eventId, title: "Ingressos", cta: "Garantir o meu" };
    case "cupom": return { id, t, code: "", text: "Use o cupom na compra e ganhe desconto.", eventId, until: "" };
    case "contagem": return { id, t, eventId, text: "para {{evento}}" };
    case "local": return { id, t, eventId };
    case "divisor": return { id, t };
    case "espaco": return { id, t, h: 24 };
    case "redes": return { id, t, instagram: "", whatsapp: "", site: "" };
  }
}

/** Nomes e grupos que aparecem na paleta do editor. */
export const BLOCK_INFO: Record<BlockType, { label: string; desc: string; group: "evento" | "basico" }> = {
  evento: { label: "Evento", desc: "Cartaz, data, local e botão", group: "evento" },
  eventos: { label: "Agenda", desc: "Seus próximos eventos", group: "evento" },
  ingressos: { label: "Ingressos", desc: "Lotes e preços do dia", group: "evento" },
  lineup: { label: "Line-up", desc: "Artistas do evento", group: "evento" },
  cupom: { label: "Cupom", desc: "Código com botão", group: "evento" },
  contagem: { label: "Contagem", desc: "Dias até o evento", group: "evento" },
  local: { label: "Local", desc: "Endereço e como chegar", group: "evento" },
  titulo: { label: "Título", desc: "Chamada principal", group: "basico" },
  texto: { label: "Texto", desc: "Parágrafo com links", group: "basico" },
  imagem: { label: "Imagem", desc: "Foto ou arte", group: "basico" },
  botao: { label: "Botão", desc: "Chamada para ação", group: "basico" },
  redes: { label: "Redes", desc: "Instagram, WhatsApp, site", group: "basico" },
  divisor: { label: "Divisor", desc: "Linha de separação", group: "basico" },
  espaco: { label: "Espaço", desc: "Respiro entre blocos", group: "basico" },
};

/** Blocos que dependem de um evento escolhido. */
export const needsEvent = (b: Block) => "eventId" in b && b.t !== "cupom";

/* ---------- variáveis do texto ---------- */

export type Vars = { nome: string; primeiro_nome: string; email: string };

/** {{primeiro_nome}}, {{nome}}, {{email}}; com reserva: {{primeiro_nome|pessoal}} */
export function fillVars(s: string, v: Vars, extra: Record<string, string> = {}) {
  return s.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_, k: string, fb?: string) => {
    const val = (k in extra ? extra[k] : (v as Record<string, string>)[k]) ?? "";
    return val || (fb ?? "").trim();
  });
}

export const SAMPLE_VARS: Vars = { nome: "Marina Souza", primeiro_nome: "Marina", email: "marina@exemplo.com" };

/* ---------- limpeza do texto rico ---------- */

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "br", "p", "div", "a", "span"]);

/** Mantém só negrito, itálico, sublinhado, quebras e links http(s)/mailto. Funciona no servidor e no navegador. */
export function cleanHtml(input: string) {
  let s = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (tag, name: string, attrs: string) => {
    const n = name.toLowerCase();
    const close = tag.startsWith("</");
    if (!ALLOWED.has(n)) return "";
    if (n === "div" || n === "p") return close ? "" : "<br>";
    if (n === "span") return "";
    if (n === "br") return "<br>";
    if (close) return `</${n === "strong" ? "b" : n === "em" ? "i" : n}>`;
    if (n === "a") {
      const m = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i);
      const href = (m?.[2] ?? m?.[3] ?? "").trim();
      return /^(https?:\/\/|mailto:)/i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}">` : "<a>";
    }
    return `<${n === "strong" ? "b" : n === "em" ? "i" : n}>`;
  });
  return s.replace(/^(<br>)+/, "").replace(/(<br>){3,}/g, "<br><br>");
}

export const stripTags = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');

/* ---------- validação (o design vem do navegador) ---------- */

const COLOR = /^#[0-9a-fA-F]{6}$/;

/** Mantém só blocos e campos conhecidos, com os tipos certos. */
export function normalizeDesign(input: unknown): Design {
  const d = (input ?? {}) as { style?: Record<string, unknown>; blocks?: unknown[] };
  const style = { ...DEFAULT_STYLE };
  for (const [k, def] of Object.entries(DEFAULT_STYLE) as [keyof MailStyle, MailStyle[keyof MailStyle]][]) {
    const v = d.style?.[k];
    if (typeof v !== typeof def) continue;
    if (typeof def === "string" && def.startsWith("#") && !COLOR.test(v as string)) continue;
    (style as Record<string, unknown>)[k] = v;
  }
  if (!["sans", "serif", "mono"].includes(style.font)) style.font = "sans";
  if (!["logo", "nome", "nenhum"].includes(style.header)) style.header = "logo";
  style.radius = Math.max(0, Math.min(28, Math.round(style.radius)));
  const blocks: Block[] = [];
  for (const raw of (Array.isArray(d.blocks) ? d.blocks : []).slice(0, 80)) {
    const r = (raw ?? {}) as Record<string, unknown>;
    if (typeof r.t !== "string" || !(r.t in BLOCK_INFO)) continue;
    const b = makeBlock(r.t as BlockType) as Record<string, unknown>;
    for (const k of Object.keys(b)) {
      const v = r[k];
      if (k === "t") continue;
      if (Array.isArray(b[k])) { if (Array.isArray(v)) b[k] = v.filter((x) => typeof x === "string").slice(0, 12); continue; }
      if (typeof v === typeof b[k]) b[k] = typeof v === "string" ? v.slice(0, k === "html" ? 8000 : 600) : v;
    }
    blocks.push(b as Block);
  }
  return { v: 1, style, blocks };
}

export function normalizeAudience(input: unknown): Audience {
  const a = (input ?? {}) as Record<string, unknown>;
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).slice(0, 50) : []);
  return {
    buyers: a.buyers === "events" || a.buyers === "none" ? a.buyers : "all",
    buyerEvents: ids(a.buyerEvents), followers: a.followers !== false, signups: a.signups !== false, excludeBuyersOf: ids(a.excludeBuyersOf),
  };
}

/** Por que a pessoa recebe (rodapé), conforme as fontes escolhidas. */
export function reasonFor(a: Audience, orgName: string) {
  const n = [a.buyers !== "none", a.followers, a.signups].filter(Boolean).length;
  if (n > 1) return `Você recebe este e-mail porque comprou ingresso, segue ou pediu aviso de eventos de ${orgName} na Tickets Win.`;
  if (a.buyers !== "none") return `Você recebe este e-mail porque comprou ingresso para um evento de ${orgName}.`;
  if (a.followers) return `Você recebe este e-mail porque segue ${orgName} na Tickets Win.`;
  if (a.signups) return `Você recebe este e-mail porque pediu aviso de um evento de ${orgName}.`;
  return `Você recebe este e-mail de ${orgName}.`;
}
