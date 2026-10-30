import { z } from "zod";

/*
 * Banner livre do carrossel principal da home (tabela hero_slides): regras usadas pela central (ação) e pela home.
 * Sem banco e sem "server-only": também roda nos testes unitários.
 */

/** O mesmo limite do HTML do banner de evento (events.hero_html). */
export const HERO_HTML_MAX = 300_000;
export const HERO_SIZE_DEFAULT = { width: 1440, height: 800 } as const;
/** Arte própria do celular: o tamanho do cartão da home a 390 px (358 × 206, proporção do cartão em qualquer largura). */
export const HERO_MOBILE_SIZE_DEFAULT = { width: 358, height: 206 } as const;
/** Imagem enviada pela central (/api/admin/banner) */
export const HERO_IMAGE_RE = /^\/midia\/[\w/.-]+\.(png|jpe?g|webp|gif)$/i;

/**
 * Destino do clique: só caminho do próprio site ("/produtores", "/eventos/x?y=1") ou https://.
 * Recusa "//host" e "/\host" (o navegador trata como outro site), javascript:, data:, http: e usuário/senha na URL.
 * Devolve o endereço normalizado ou null.
 */
export function safeHref(raw: string): string | null {
  const s = raw.trim();
  if (!s || s.length > 500 || /[\s\u0000-\u001f\u007f]/.test(s)) return null;
  if (s.startsWith("/")) return /^\/([^/\\]|$)/.test(s) ? s : null;
  if (!/^https:\/\//i.test(s)) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max, msg);

/** Dados do banner livre vindos da central. Erros com o texto que a central mostra. */
export const heroSlideInput = z
  .object({
    id: z.string().uuid().nullable(),
    label: text(3, 160, "Escreva o rótulo do banner (3 a 160 letras): é o que o leitor de tela lê no link."),
    href: z.string().transform((v, ctx) => {
      const h = safeHref(v);
      if (!h) ctx.addIssue({ code: "custom", message: "O link precisa começar com / (página do site, ex.: /produtores) ou com https://." });
      return h ?? "";
    }),
    cta: z.string().trim().max(40, "O texto do botão passa de 40 letras.").transform((v) => v || null),
    kind: z.enum(["html", "image"]),
    html: z.string().max(HERO_HTML_MAX + 10_000).transform((v) => v.trim()),
    image: z.string().trim().nullable(),
    width: z.coerce.number().int("Largura em pixels, sem vírgula.").min(320, "Largura entre 320 e 3840 px.").max(3840, "Largura entre 320 e 3840 px."),
    height: z.coerce.number().int("Altura em pixels, sem vírgula.").min(180, "Altura entre 180 e 2160 px.").max(2160, "Altura entre 180 e 2160 px."),
    bg: z.string().trim().regex(/^#[0-9a-f]{6}$/i, "Cor de fundo no formato #RRGGBB."),
    active: z.boolean(),
    /** arte do celular (opcional): vazio = o celular usa a arte normal */
    htmlMobile: z.string().max(HERO_HTML_MAX + 10_000).optional().default("").transform((v) => v.trim()),
    mobileWidth: z.coerce.number().int("Largura do celular em pixels, sem vírgula.").min(240, "Largura do celular entre 240 e 1600 px.").max(1600, "Largura do celular entre 240 e 1600 px.").optional().default(HERO_MOBILE_SIZE_DEFAULT.width),
    mobileHeight: z.coerce.number().int("Altura do celular em pixels, sem vírgula.").min(120, "Altura do celular entre 120 e 1600 px.").max(1600, "Altura do celular entre 120 e 1600 px.").optional().default(HERO_MOBILE_SIZE_DEFAULT.height),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "html") {
      if (!v.html) ctx.addIssue({ code: "custom", message: "Cole o HTML do banner." });
      else if (v.html.length > HERO_HTML_MAX) ctx.addIssue({ code: "custom", message: "O HTML passa de 300 KB. Use imagens por link em vez de embutidas." });
    } else if (!v.image || !HERO_IMAGE_RE.test(v.image)) ctx.addIssue({ code: "custom", message: "Envie a imagem do banner (PNG, JPG, WebP ou GIF)." });
    if (v.htmlMobile.length > HERO_HTML_MAX) ctx.addIssue({ code: "custom", message: "O HTML do celular passa de 300 KB. Use imagens por link em vez de embutidas." });
  })
  .transform((v) => ({
    id: v.id, label: v.label, href: v.href, cta: v.cta, width: v.width, height: v.height, bg: v.bg.toUpperCase(), active: v.active,
    html: v.kind === "html" ? v.html : null, image: v.kind === "image" ? v.image : null,
    htmlMobile: v.htmlMobile || null, mobileWidth: v.mobileWidth, mobileHeight: v.mobileHeight,
  }));
export type HeroSlideInput = z.input<typeof heroSlideInput>;

/** Ordem única da central: "e:<id do evento>" ou "s:<id do banner livre>". */
export const heroOrderToken = z.string().regex(/^[es]:[0-9a-f-]{36}$/i).refine((t) => z.string().uuid().safeParse(t.slice(2)).success);

/**
 * Junta eventos do banner e banners livres pela posição (eventos sem posição, os de reserva, vão no fim).
 * Empate: o banner livre antes. A ordem de entrada desempata o resto (sort estável).
 */
export function mergeHero<E, S>(events: { order: number | null; item: E }[], slides: { position: number; item: S }[]): ({ kind: "event"; item: E } | { kind: "free"; item: S })[] {
  const all = [
    ...slides.map((s) => ({ n: s.position, t: 0, v: { kind: "free" as const, item: s.item } })),
    ...events.map((e) => ({ n: e.order ?? Number.POSITIVE_INFINITY, t: 1, v: { kind: "event" as const, item: e.item } })),
  ];
  return all.sort((a, b) => a.n - b.n || a.t - b.t).map((x) => x.v);
}
