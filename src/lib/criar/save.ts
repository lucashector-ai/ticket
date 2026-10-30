import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { dateFull, dateNice, hourLabel, initials, parts, slugify } from "@/lib/format";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { mailEventPublished } from "@/lib/notify";
import { linkArtistSpotify } from "@/lib/spotify-artists";
import { AREA_KINDS, KIND_COLOR, MAX_AREAS, normalizePlan } from "@/lib/criar/plan";
import {
  CATEGORY_KINDS, effTypes, eventSlug, limitOf, MAX_LIMIT, num, parseBrDateTime, parseCity, spDate, toCents,
  type DbMap, type Draft, type VenuePlace,
} from "@/lib/criar/model";

const { events, eventSessions, ticketTypes, venues, cities, organizers, artists, eventArtists, categories, eventCategories, coupons } = schema;

/* ---------- validação do formulário (vem do navegador) ---------- */
const str = (max: number) => z.string().max(max).default("");
const id = z.string().min(1).max(40);
const media = z.string().max(200).regex(/^\/midia\/eventos\/[\w/.-]+$/).optional();
const place = z.object({ id: z.string().max(300), addr: str(300), hood: z.string().max(120).nullable(), lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

const draftSchema = z.object({
  mode: z.enum(["unica", "temporada", "turne"]),
  tmode: z.enum(["mapa", "simples"]),
  title: str(200), cat: str(40), catOther: str(60), age: str(20), desc: str(6000),
  lineup: z.array(z.object({ id, name: str(160), role: str(40), time: str(5), end: str(5), days: z.array(id).max(60).nullable(), spotifyId: z.string().regex(/^[A-Za-z0-9]{22}$/).optional(), image: z.string().regex(/^https:\/\/i\.scdn\.co\/[\w/]+$/).nullable().optional() })).max(60),
  media: z.object({ poster: media, banner: media, home: media, strip: media, share: media }),
  coupons: z.array(z.object({ id, code: str(40), kind: z.enum(["pct", "brl"]), value: str(12), limit: str(9), until: str(20), scope: id })).max(50),
  venue: z.object({ name: str(160), city: str(120), place: place.optional() }),
  sessions: z.array(z.object({ id, date: str(10), doors: str(5), time: str(5), end: z.string().max(5).optional(), cap: str(9), venue: str(160), city: str(120), place: place.optional() })).max(60),
  autoMeia: z.boolean(), fee: z.boolean(), transfer: z.boolean().default(true), resale: z.boolean().default(true),
  sectors: z.array(z.object({
    id, name: str(80), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), open: z.boolean(),
    types: z.array(z.object({ id, kind: z.enum(["inteira", "meia", "social", "outro"]), name: str(120), price: str(12), qty: str(9), desc: str(600), free: z.boolean().optional(), limit: z.string().max(3).optional() })).max(20),
  })).min(1).max(20),
  map: z.enum(["empty", "sketch", "done"]), prompt: str(1000), sketchUrl: z.union([z.literal(""), media.unwrap()]).default(""),
  plan: z.object({
    width: z.number(), depth: z.number(), source: z.enum(["ia", "modelo"]), notes: z.array(z.string().max(300)).max(10),
    floor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    areas: z.array(z.object({
      id, name: str(60), kind: z.enum(AREA_KINDS), x: z.number(), y: z.number(), w: z.number(), d: z.number(), h: z.number(), cap: z.number(), sector: id.nullable(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    })).max(MAX_AREAS),
  }).nullable().default(null),
  vis: z.enum(["publico", "link", "rascunho"]), saleStart: str(40), presaleStart: str(40), minors: z.boolean().default(false), refund: str(300),
  teaser: z.object({
    theme: z.enum(["escuro", "lima", "arte", "foto"]), image: media, headline: str(80), message: str(280), lineup: z.boolean(),
  }).default({ theme: "arte", headline: "", message: "", lineup: true }),
});
const mapSchema = z.object({ sessions: z.record(id, z.string().uuid()), types: z.record(z.string().max(90), z.string().uuid()) });

export type SaveEventResult =
  | { ok: true; eventId: string; slug: string; status: "published" | "draft"; unlisted: boolean; dbMap: DbMap }
  | { ok: false; error: string; step?: number };

const fail = (error: string, step?: number): SaveEventResult => ({ ok: false, error, step });
/** Texto da classificação na página: menores acompanhados só faz sentido entre Livre e 18+. */
const ageText = (age: string, minors: boolean) =>
  age === "Livre" ? "Livre" : age === "18+" || !minors ? `${age} com documento com foto` : `${age} · menores acompanhados dos pais ou responsáveis`;
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ML = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Qui, 19 Nov · 21h" para cada data; o rótulo do card resume o período. */
export function dateLabels(starts: Date[], nCities: number, tour: boolean) {
  const first = starts[0], last = starts[starts.length - 1];
  if (starts.length === 1) return { label: dateNice(first), full: dateFull(first) };
  const a = parts(first), b = parts(last);
  const range = a.m === b.m && a.y === b.y ? `${a.d}–${b.d} ${MS[a.m - 1]}` : `${a.d} ${MS[a.m - 1]} – ${b.d} ${MS[b.m - 1]}`;
  const tail = tour && nCities > 1 ? `${nCities} cidades` : `${starts.length} datas`;
  const full = a.m === b.m && a.y === b.y ? `${a.d} a ${b.d} de ${ML[a.m - 1]} de ${a.y}` : `${a.d} de ${ML[a.m - 1]} a ${b.d} de ${ML[b.m - 1]} de ${b.y}`;
  return { label: `${range} · ${tail}`, full };
}
const sessionLabel = (d: Date, city: string | null) => {
  const p = parts(d);
  return `${WD[p.wd]}, ${p.d} ${MS[p.m - 1]} · ${hourLabel(d)}${city ? ` · ${city}` : ""}`;
};

async function findOrCreateCity(name: string, uf: string) {
  const slug = slugify(`${name}-${uf}`);
  const found = await db.query.cities.findFirst({ where: eq(cities.slug, slug) });
  if (found) return found;
  const [row] = await db.insert(cities).values({ slug, name, uf }).onConflictDoNothing().returning();
  return row ?? (await db.query.cities.findFirst({ where: eq(cities.slug, slug) }))!;
}

async function findOrCreateVenue(name: string, city: { id: string; name: string }, capacity: number | null, place: VenuePlace | null) {
  const slug = slugify(`${name}-${city.name}`);
  const geo = place ? { placeId: place.id, address: place.addr || null, neighborhood: place.hood, lat: String(place.lat), lng: String(place.lng) } : null;
  const found = await db.query.venues.findFirst({ where: eq(venues.slug, slug) });
  if (found) {
    // local cadastrado sem endereço ganha o do Google; um endereço que já existe não é trocado
    if (geo && !found.lat) await db.update(venues).set({ ...geo, address: found.address ?? geo.address, neighborhood: found.neighborhood ?? geo.neighborhood }).where(eq(venues.id, found.id));
    return found;
  }
  const [row] = await db.insert(venues).values({ slug, name, cityId: city.id, capacity, ...geo }).onConflictDoNothing().returning();
  return row ?? (await db.query.venues.findFirst({ where: eq(venues.slug, slug) }))!;
}

async function uniqueEventSlug(base: string) {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const hit = await db.query.events.findFirst({ where: eq(events.slug, slug), columns: { id: true } });
    if (!hit) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

/** Produtor do usuário (cria na primeira vez que ele precisa de um). */
export async function organizerFor(user: Producer) {
  const own = await db.query.organizers.findFirst({ where: eq(organizers.ownerUserId, user.id) });
  if (own) return own;
  const name = user.name?.trim() || user.email?.split("@")[0] || "Produtor";
  const [row] = await db.insert(organizers).values({
    slug: `${slugify(name) || "produtor"}-${randomBytes(2).toString("hex")}`, name, initials: initials(name) || "ON",
    ownerUserId: user.id, contactEmail: user.email ?? null,
  }).returning();
  return row;
}

type Producer = { id: string; name?: string | null; email?: string | null };

/** Planta publicada com nome e cor do setor de cada área (o que o comprador vê). */
function venueMapOf(d: Draft) {
  if (d.tmode !== "mapa" || d.map !== "done" || !d.plan?.areas.length) return null;
  const plan = normalizePlan(d.plan, d.sectors.map((k) => k.id));
  const sec = new Map(d.sectors.map((k) => [k.id, k]));
  return {
    prompt: d.prompt, sketchUrl: d.sketchUrl || undefined,
    plan: {
      width: plan.width, depth: plan.depth, ...(plan.floor ? { floor: plan.floor } : {}),
      areas: plan.areas.map(({ sector, ...a }) => {
        const k = sector ? sec.get(sector) : undefined;
        return { ...a, sectorName: k ? k.name.trim() || "Setor" : null, color: k ? k.color : a.color ?? (a.kind === "setor" ? "#8A8A90" : KIND_COLOR[a.kind]) };
      }),
    },
  };
}

/**
 * Pode apagar estes tipos de ingresso? Não, se algum ingresso foi emitido (mesmo reembolsado), se está num grupo
 * ou na revenda, ou se alguém está pagando agora. Pedidos nunca pagos (cancelados, vencidos) não impedem:
 * `deadOrderIds` são os pedidos cujos itens deste tipo podem sair junto.
 */
export async function dropBlockers(types: { id: string; name: string }[]): Promise<{ ok: true; deadOrderIds: string[] } | { ok: false; error: string }> {
  const ids = types.map((t) => t.id);
  const nameOf = (id: string) => types.find((t) => t.id === id)?.name ?? "Ingresso";
  const { orderItems, orders, tickets, groupShares, resaleListings } = schema;
  const [issued, shared, listed, items] = await Promise.all([
    db.selectDistinct({ id: tickets.ticketTypeId }).from(tickets).where(inArray(tickets.ticketTypeId, ids)),
    db.selectDistinct({ id: groupShares.ticketTypeId }).from(groupShares).where(inArray(groupShares.ticketTypeId, ids)),
    db.selectDistinct({ id: resaleListings.ticketTypeId }).from(resaleListings).where(inArray(resaleListings.ticketTypeId, ids)),
    db.select({ type: orderItems.ticketTypeId, orderId: orders.id, status: orders.status, expiresAt: orders.expiresAt, paidAt: orders.paidAt })
      .from(orderItems).innerJoin(orders, eq(orders.id, orderItems.orderId)).where(inArray(orderItems.ticketTypeId, ids)),
  ]);
  const used = issued[0] ?? shared[0] ?? listed[0];
  if (used) return { ok: false, error: `"${nameOf(used.id)}" já teve ingressos emitidos, compra em grupo ou revenda e não pode ser apagado. Para parar de vender, deixe a quantidade igual à já vendida.` };
  const now = Date.now();
  const live = items.find((i) => i.status === "paid" || i.status === "refunded" || i.paidAt || (i.status === "pending" && (!i.expiresAt || i.expiresAt.getTime() > now - 5 * 60_000)));
  if (live) return { ok: false, error: `Tem gente comprando "${nameOf(live.type)}" agora. Tente apagar de novo em 20 minutos.` };
  return { ok: true, deadOrderIds: [...new Set(items.map((i) => i.orderId))] };
}

/** Salva o evento do formulário em nome do produtor: cria na primeira vez, atualiza depois (preços, lotes, datas). */
export async function saveEventAs(user: Producer, input: { draft: Draft; eventId: string | null; dbMap: DbMap }): Promise<SaveEventResult> {
  const parsed = draftSchema.safeParse(input.draft);
  if (!parsed.success) return fail("Alguns campos têm valores inválidos. Revise o formulário.");
  const d = parsed.data as Draft;
  const prevMap = mapSchema.safeParse(input.dbMap).success ? input.dbMap : { sessions: {}, types: {} };
  const publish = d.vis !== "rascunho";
  const title = d.title.trim();
  const tour = d.mode === "turne";
  const catLabel = d.cat === "Outros" || !d.cat ? d.catOther.trim() || "Outros" : d.cat;

  /* ---- regras para publicar ---- */
  if (!title) return fail("Dê um nome ao evento.", 1);
  if (publish && (!d.media.poster || !d.media.banner)) return fail("Envie o cartaz (3:4) e o banner (16:9) antes de publicar.", 6);
  const sessions = [...(d.mode === "unica" ? d.sessions.slice(0, 1) : d.sessions)].sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  if (publish && !sessions.length) return fail("Adicione pelo menos uma data.", 2);
  const sessRows: { id: string; start: Date; end: Date | null; doors: Date | null; cap: number | null; venue: string; city: { name: string; uf: string } | null; place: VenuePlace | null }[] = [];
  for (const s of sessions) {
    const start = spDate(s.date, s.time);
    if (!start) return fail("Uma das datas está sem dia ou horário válido.", 2);
    if (publish && start.getTime() < Date.now()) return fail("Uma das datas já passou. Escolha uma data futura.", 2);
    const venue = (tour ? s.venue : d.venue.name).trim();
    const city = parseCity(tour ? s.city : d.venue.city);
    if (publish && (!venue || !city)) return fail(tour ? "Preencha o local e a cidade (ex.: São Paulo – SP) de cada data." : "Preencha o local e a cidade no formato São Paulo – SP.", 3);
    // término antes do início = vira a noite e acaba no dia seguinte
    let end = s.end ? spDate(s.date, s.end) : null;
    if (end && end <= start) end = new Date(end.getTime() + 86_400_000);
    sessRows.push({ id: s.id, start, end, doors: s.doors ? spDate(s.date, s.doors) : null, cap: num(s.cap) || null, venue, city, place: (tour ? s.place : d.venue.place) ?? null });
  }

  const sectorTypes = d.sectors.map((k) => ({ k, types: effTypes(k, d.autoMeia) }));
  const allTypes = sectorTypes.flatMap((x) => x.types);
  if (publish) {
    if (!allTypes.length) return fail("Crie pelo menos um tipo de ingresso.", 5);
    for (const t of allTypes) {
      if (!t.name.trim()) return fail("Dê um nome a cada tipo de ingresso.", 5);
      if (!t.free && toCents(t.price) <= 0) return fail(`Defina o preço de ${t.name} ou marque como grátis.`, 5);
      if (num(t.qty) <= 0) return fail(`Defina a quantidade de ${t.name}.`, 5);
    }
  }
  const salesStart = parseBrDateTime(d.saleStart);
  if (d.saleStart.trim() && !salesStart) return fail("Escolha o dia e o horário em que as vendas abrem.", 7);
  const presaleStart = salesStart && d.presaleStart.trim() ? parseBrDateTime(d.presaleStart) : null;
  if (salesStart && d.presaleStart.trim() && !presaleStart) return fail("Escolha o dia e o horário da pré-venda.", 7);
  if (presaleStart && salesStart && presaleStart >= salesStart) return fail("A pré-venda precisa começar antes da venda geral.", 7);
  if (d.teaser.theme === "foto" && !d.teaser.image) return fail("Envie a imagem de fundo da tela de contagem ou escolha outro estilo.", 7);

  const sectorName = new Map(d.sectors.map((k) => [k.id, k.name.trim() || "Ingressos"]));
  const couponRows: Omit<typeof coupons.$inferInsert, "eventId">[] = [];
  for (const c of d.coupons) {
    const code = c.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return fail(`Cupom "${c.code}": use de 3 a 40 letras ou números, sem espaços.`, 5);
    const v = num(c.value);
    if (v <= 0 || (c.kind === "pct" && v > 100)) return fail(`Cupom ${code}: desconto inválido.`, 5);
    const until = c.until.trim() ? parseBrDateTime(c.until, true) : null;
    if (c.until.trim() && !until) return fail(`Cupom ${code}: validade no formato dd/mm/aaaa.`, 5);
    couponRows.push({
      code, percentOff: c.kind === "pct" ? Math.round(v) : null, amountOffCents: c.kind === "brl" ? Math.round(v * 100) : null,
      amountPerTicket: c.kind === "brl", sector: c.scope === "all" ? null : sectorName.get(c.scope) ?? null,
      maxUses: num(c.limit) > 0 ? Math.round(num(c.limit)) : null, expiresAt: until, active: true,
    });
  }
  if (new Set(couponRows.map((c) => c.code)).size !== couponRows.length) return fail("Há dois cupons com o mesmo código.", 5);

  /* ---- evento existente: só o criador edita ---- */
  let existing: (typeof events.$inferSelect & { sessions: (typeof eventSessions.$inferSelect)[]; ticketTypes: (typeof ticketTypes.$inferSelect)[] }) | null = null;
  if (input.eventId) {
    const found = await db.query.events.findFirst({ where: eq(events.id, input.eventId), with: { sessions: true, ticketTypes: true } });
    if (!found || found.createdByUserId !== user.id) return fail("Você não pode editar este evento.");
    // cancelado no painel (Cancelamentos e reembolsos): não volta a ser publicado por uma edição
    if (found.status === "cancelled") return fail("Este evento foi cancelado e não pode mais ser editado.");
    existing = found;
  }

  /* chaves (data × tipo) que vão existir depois de salvar */
  const sessKeys = sessRows.length ? sessRows.map((s) => s.id) : [];
  const wantTypeKeys = new Set(sessKeys.flatMap((sid) => allTypes.map((t) => `${sid}:${t.id}`)));
  const ownSess = new Set(existing?.sessions.map((s) => s.id) ?? []);
  const ownTypes = new Map(existing?.ticketTypes.map((t) => [t.id, t]) ?? []);
  const keepSess = new Set(sessKeys.map((k) => prevMap.sessions[k]).filter((x) => x && ownSess.has(x)));
  const keepTypes = new Set([...wantTypeKeys].map((k) => prevMap.types[k]).filter((x) => x && ownTypes.has(x)));
  for (const t of existing?.ticketTypes ?? []) {
    if (!keepTypes.has(t.id) && t.sold > 0) return fail(`"${t.name}" já tem ${t.sold} ingresso(s) vendido(s) e não pode ser removido.`, 5);
  }
  for (const k of wantTypeKeys) {
    const dbId = prevMap.types[k];
    const row = dbId ? ownTypes.get(dbId) : undefined;
    const t = allTypes.find((x) => x.id === k.split(":")[1])!;
    if (row && num(t.qty) < row.sold) return fail(`${t.name}: já foram vendidos ${row.sold}. A quantidade não pode ser menor.`, 5);
  }
  // tipo que sai: pedidos, ingressos, grupos e revenda apontam para ele (chave estrangeira sem cascata). Confere
  // ANTES de gravar qualquer coisa: o erro no meio deixava o evento salvo pela metade (e o reenvio duplicava tipos).
  const dropping = existing?.ticketTypes.filter((t) => !keepTypes.has(t.id)) ?? [];
  const deadItems = dropping.length ? await dropBlockers(dropping) : { ok: true as const, deadOrderIds: [] };
  if (!deadItems.ok) return fail(deadItems.error, 5);

  const conflicts = couponRows.length
    ? await db.query.coupons.findMany({ where: inArray(coupons.code, couponRows.map((c) => c.code)) })
    : [];
  const taken = conflicts.find((c) => c.eventId !== existing?.id);
  if (taken) return fail(`O código ${taken.code} já é usado por outro cupom. Escolha outro.`, 5);

  /* ---- gravação ---- */
  const organizer = await organizerFor(user);
  const venueIds = new Map<string, string>();
  const citySet = new Set<string>();
  for (const s of sessRows) {
    if (!s.venue || !s.city) continue;
    citySet.add(s.city.name);
    const key = `${s.venue}|${s.city.name}|${s.city.uf}`;
    if (venueIds.has(key)) continue;
    const city = await findOrCreateCity(s.city.name, s.city.uf);
    const venue = await findOrCreateVenue(s.venue, city, s.cap, s.place);
    venueIds.set(key, venue.id);
  }
  const venueOf = (s: (typeof sessRows)[number]) => (s.venue && s.city ? venueIds.get(`${s.venue}|${s.city.name}|${s.city.uf}`) ?? null : null);

  const starts = sessRows.map((s) => s.start);
  const startAt = starts[0] ?? existing?.startAt ?? new Date(Date.now() + 30 * 86_400_000);
  const lastStart = starts[starts.length - 1] ?? startAt;
  const labels = starts.length ? dateLabels(starts, citySet.size, tour) : { label: "Data a definir", full: "Data a definir" };
  const doorsSet = new Set(sessRows.map((s) => (s.doors ? hourLabel(s.doors) : "")));
  const first = sessRows[0];
  const doorsLabel = first?.doors
    ? `Portões ${hourLabel(first.doors)} · início ${hourLabel(first.start)}${doorsSet.size > 1 ? " (varia por data)" : ""}`
    : first ? `Início ${hourLabel(first.start)}` : null;
  const prices = allTypes.map((t) => (t.free ? 0 : toCents(t.price)));
  // teto do pedido: o maior limite por pessoa, nunca abaixo de 8 (vários tipos no mesmo pedido)
  const orderCap = Math.min(MAX_LIMIT, Math.max(8, ...allTypes.map(limitOf)));
  const kinds = CATEGORY_KINDS[d.cat] ?? [];
  const paragraphs = d.desc.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const hasMeia = allTypes.some((t) => t.kind === "meia" || t.kind === "social");

  const values = {
    title, tagline: paragraphs[0] ? paragraphs[0].split(/(?<=[.!?])\s/)[0].slice(0, 240) : null,
    description: d.desc.trim() || null, descriptionParagraphs: paragraphs,
    status: (publish ? "published" : "draft") as "published" | "draft", unlisted: d.vis === "link",
    flyerId: d.media.poster ?? "none", bannerId: d.media.banner ?? d.media.poster ?? null, accentColor: "#111111",
    startAt, endAt: sessRows[sessRows.length - 1]?.end ?? new Date(lastStart.getTime() + 6 * 3_600_000), dateLabel: labels.label, dateFullLabel: labels.full, timed: true,
    doorsLabel, ageRating: ageText(d.age, d.minors), refundPolicy: d.refund.trim() || null,
    halfPriceInfo: hasMeia ? "Estudantes, PcD, jovens de baixa renda e maiores de 60, com documento." : null,
    venueId: first ? venueOf(first) : null, venueNameOverride: tour && citySet.size > 1 ? `Turnê · ${citySet.size} cidades` : null,
    addressLabel: tour && citySet.size > 1 ? [...citySet].join(", ") : first?.city ? `${first.city.name} – ${first.city.uf}` : null,
    organizerId: organizer.id, primaryCategoryLabel: catLabel, kinds,
    minPriceCents: prices.length ? Math.min(...prices) : 0, maxPerOrder: orderCap,
    format: d.mode, ticketMode: d.tmode, absorbFee: !d.fee, transferEnabled: d.transfer, resaleEnabled: d.resale,
    media: { home: d.media.home, strip: d.media.strip, share: d.media.share },
    venueMap: venueMapOf(d),
    createdByUserId: user.id,
  };

  /*
   * Início das vendas = abertura do evento: antes dela a página mostra a contagem regressiva.
   * Campo vazio limpa a abertura (e a pré-venda, que depende dela); ajustes feitos na aba Lançamento
   * voltam para este campo, então os dois ficam iguais.
   */
  const launch = {
    salesOpenAt: salesStart, presaleAt: presaleStart, launchPage: d.teaser,
    // mudou a data: os avisos voltam a sair na nova data
    ...(existing?.salesOpenAt?.getTime() !== salesStart?.getTime() ? { openingSentAt: null } : {}),
    ...(existing?.presaleAt?.getTime() !== presaleStart?.getTime() ? { presaleSentAt: null } : {}),
  };
  // os lotes abrem junto com a pré-venda, se houver (quem tem o link já pode comprar)
  const typesStart = presaleStart ?? salesStart;

  let eventId: string, slug: string;
  const firstPublish = publish && !existing?.publishedAt;
  if (existing) {
    eventId = existing.id; slug = existing.slug;
    await db.update(events).set({ ...values, ...launch, publishedAt: publish ? existing.publishedAt ?? new Date() : existing.publishedAt }).where(eq(events.id, eventId));
  } else {
    slug = await uniqueEventSlug(eventSlug(title));
    const [row] = await db.insert(events).values({ ...values, ...launch, slug, publishedAt: publish ? new Date() : null }).returning({ id: events.id });
    eventId = row.id;
  }

  /* datas */
  const dbMap: DbMap = { sessions: {}, types: {} };
  for (const [i, s] of sessRows.entries()) {
    const v = { eventId, startAt: s.start, doorsAt: s.doors, capacity: s.cap, venueId: venueOf(s), sortOrder: i };
    const dbId = prevMap.sessions[s.id];
    if (dbId && keepSess.has(dbId)) {
      await db.update(eventSessions).set(v).where(eq(eventSessions.id, dbId));
      dbMap.sessions[s.id] = dbId;
    } else {
      const [row] = await db.insert(eventSessions).values(v).returning({ id: eventSessions.id });
      dbMap.sessions[s.id] = row.id;
    }
  }

  /* ingressos: cada tipo vale para cada data */
  const multi = sessRows.length > 1;
  let order = 0;
  for (const s of sessRows) {
    const label = sessionLabel(s.start, tour ? s.city?.name ?? null : null);
    for (const { k, types } of sectorTypes) {
      for (const t of types) {
        const key = `${s.id}:${t.id}`;
        const price = t.free ? 0 : toCents(t.price);
        const v = {
          eventId, sessionId: dbMap.sessions[s.id], name: t.name.trim() || "Ingresso",
          note: (multi ? label : t.desc.trim()).slice(0, 160) || null, description: t.desc.trim() || null,
          priceCents: price, feeCents: d.fee ? Math.round(price * SERVICE_FEE_RATE) : 0, quantity: Math.round(num(t.qty)),
          status: "open" as const, salesStart: typesStart, sortOrder: order++, maxPerOrder: limitOf(t),
          // com mapa ou com mais de um setor, o comprador vê os ingressos agrupados por setor
          sector: d.tmode === "mapa" || d.sectors.length > 1 ? k.name.trim() || "Setor" : null, sectorColor: k.color, kind: t.kind,
        };
        const dbId = prevMap.types[key];
        if (dbId && keepTypes.has(dbId)) {
          await db.update(ticketTypes).set(v).where(eq(ticketTypes.id, dbId));
          dbMap.types[key] = dbId;
        } else {
          const [row] = await db.insert(ticketTypes).values(v).returning({ id: ticketTypes.id });
          dbMap.types[key] = row.id;
        }
      }
    }
  }
  if (existing) {
    const dropTypes = existing.ticketTypes.filter((t) => !keepTypes.has(t.id)).map((t) => t.id);
    // itens de pedidos que nunca foram pagos (carrinho abandonado, reserva vencida) saem junto com o tipo
    if (dropTypes.length && deadItems.deadOrderIds.length) {
      await db.delete(schema.orderItems).where(and(inArray(schema.orderItems.ticketTypeId, dropTypes), inArray(schema.orderItems.orderId, deadItems.deadOrderIds)));
    }
    if (dropTypes.length) await db.delete(ticketTypes).where(inArray(ticketTypes.id, dropTypes));
    const dropSess = existing.sessions.filter((s) => !keepSess.has(s.id)).map((s) => s.id);
    if (dropSess.length) await db.delete(eventSessions).where(inArray(eventSessions.id, dropSess));
  }

  /* line-up */
  await db.delete(eventArtists).where(eq(eventArtists.eventId, eventId));
  const seen = new Set<string>();
  for (const [i, a] of d.lineup.entries()) {
    const name = a.name.trim();
    const aslug = slugify(name);
    if (!name || !aslug || seen.has(aslug)) continue;
    seen.add(aslug);
    // escolhido na busca do Spotify: o id do Spotify identifica o artista, mesmo com nomes iguais
    const sid = a.spotifyId ?? null;
    let artist: { id: string; spotifyId: string | null } | undefined = sid
      ? await db.query.artists.findFirst({ where: eq(artists.spotifyId, sid), columns: { id: true, spotifyId: true } })
      : undefined;
    let slugFor = aslug;
    if (!artist) {
      artist = await db.query.artists.findFirst({ where: eq(artists.slug, aslug), columns: { id: true, spotifyId: true } });
      if (artist && sid && artist.spotifyId && artist.spotifyId !== sid) { artist = undefined; slugFor = `${aslug}-${sid.slice(0, 5).toLowerCase()}`; }
    }
    if (!artist) {
      const city = first?.city;
      [artist] = await db.insert(artists).values({ slug: slugFor, name, genre: catLabel, cityName: city?.name ?? null, uf: city?.uf ?? null })
        .onConflictDoNothing().returning({ id: artists.id, spotifyId: artists.spotifyId });
      artist ??= await db.query.artists.findFirst({ where: eq(artists.slug, slugFor), columns: { id: true, spotifyId: true } });
    }
    if (!artist) continue;
    if (sid && !artist.spotifyId) await linkArtistSpotify(artist.id, sid).catch(() => null);
    const days = a.days?.map((x) => dbMap.sessions[x]).filter(Boolean) ?? null;
    await db.insert(eventArtists).values({
      eventId, artistId: artist.id, sortOrder: i, role: a.role || null,
      timeLabel: /^\d{2}:\d{2}$/.test(a.time) ? a.time : null, endLabel: /^\d{2}:\d{2}$/.test(a.end) ? a.end : null,
      sessionIds: days && days.length ? days : null,
    });
  }

  /* categorias da home */
  await db.delete(eventCategories).where(eq(eventCategories.eventId, eventId));
  if (kinds.length) {
    const cats = await db.query.categories.findMany({ where: inArray(categories.slug, kinds), columns: { id: true } });
    if (cats.length) await db.insert(eventCategories).values(cats.map((c) => ({ eventId, categoryId: c.id })));
  }

  /* cupons do evento */
  const mine = await db.query.coupons.findMany({ where: eq(coupons.eventId, eventId) });
  for (const c of couponRows) {
    const row = mine.find((m) => m.code === c.code);
    if (row) await db.update(coupons).set(c).where(eq(coupons.id, row.id));
    else await db.insert(coupons).values({ ...c, eventId });
  }
  for (const m of mine.filter((m) => !couponRows.some((c) => c.code === m.code))) {
    if (m.uses > 0) await db.update(coupons).set({ active: false }).where(eq(coupons.id, m.id));
    else await db.delete(coupons).where(eq(coupons.id, m.id));
  }

  await db.update(events).set({ draft: { form: d, dbMap } }).where(eq(events.id, eventId));
  if (firstPublish) after(() => mailEventPublished(eventId));
  return { ok: true, eventId, slug, status: publish ? "published" : "draft", unlisted: d.vis === "link", dbMap };
}
