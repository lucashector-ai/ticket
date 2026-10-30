"use server";

import { eq, inArray, isNotNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { ADMIN_PATH, adminUser, grantProducer, ungrantProducer } from "@/lib/admin";
import { HERO_HTML_MAX, heroOrderToken, heroSlideInput, type HeroSlideInput } from "@/lib/hero-slides";
import { logSecurity } from "@/lib/mfa";
import { runBatch } from "@/lib/payments/tx";
import { mailApplicationApproved, mailApplicationRejected, mailPayoutUpdated, mailProducerAuthorized } from "@/lib/notify";

type R = { ok: boolean; error?: string };

/** Só admin com app autenticador mexe em qualquer coisa. */
async function guard() {
  const a = await adminUser();
  if (!a) throw new Error("NOT_FOUND");
  if (!a.secure) return { ok: false as const, error: "Ative o app autenticador na sua conta para usar a central." };
  return { ok: true as const, admin: a };
}

const uuid = z.string().uuid();

/** Aprova ou recusa uma inscrição de produtor e avisa a pessoa por e-mail. */
export async function reviewApplication(id: string, approve: boolean, note: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Inscrição não encontrada." };
  const app = await db.query.producerApplications.findFirst({ where: eq(schema.producerApplications.id, id) });
  if (!app) return { ok: false, error: "Inscrição não encontrada." };
  const clean = note.trim().slice(0, 600) || null;
  const [row] = await db.update(schema.producerApplications)
    .set({ status: approve ? "approved" : "rejected", note: clean, reviewedBy: g.admin.email, reviewedAt: new Date() })
    .where(eq(schema.producerApplications.id, id)).returning();
  await logSecurity(g.admin.id, "admin", `${approve ? "Aprovou" : "Recusou"} produtor ${app.email}`);
  after(() => (approve ? mailApplicationApproved(row) : mailApplicationRejected(row, clean)));
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

const PAYOUT_NEXT: Record<string, string[]> = { requested: ["processing", "paid", "rejected"], processing: ["paid", "rejected"] };

/** Atualiza um saque (processando, pago, recusado) e avisa o produtor. */
export async function updatePayout(id: string, status: "processing" | "paid" | "rejected", note: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Saque não encontrado." };
  const p = await db.query.payoutRequests.findFirst({ where: eq(schema.payoutRequests.id, id) });
  if (!p) return { ok: false, error: "Saque não encontrado." };
  if (!PAYOUT_NEXT[p.status]?.includes(status)) return { ok: false, error: "Esse saque não pode mudar para esse status." };
  const clean = note.trim().slice(0, 600) || null;
  await db.update(schema.payoutRequests).set({ status, note: clean, paidAt: status === "paid" ? new Date() : null }).where(eq(schema.payoutRequests.id, id));
  await logSecurity(g.admin.id, "admin", `Saque ${id.slice(0, 8)} → ${status}`);
  after(() => mailPayoutUpdated(p.userId, p.amountCents, status, clean));
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/* ============================== destaques da home ============================== */

const idList = z.array(uuid).max(30);

/** Ordem do banner principal da home (lista de ids). Quem sai da lista deixa de aparecer no banner. */
export async function setHeroList(ids: string[]): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  const p = idList.safeParse(ids);
  if (!p.success) return { ok: false, error: "Lista inválida." };
  await db.update(schema.events).set({ heroOrder: null }).where(isNotNull(schema.events.heroOrder));
  for (const [i, id] of p.data.entries()) await db.update(schema.events).set({ heroOrder: i + 1 }).where(eq(schema.events.id, id));
  await logSecurity(g.admin.id, "admin", `Banner principal: ${p.data.length} evento(s)`);
  revalidatePath("/"); revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/** Ordem de "Eventos em destaque" na home. */
export async function setFeaturedList(ids: string[]): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  const p = idList.safeParse(ids);
  if (!p.success) return { ok: false, error: "Lista inválida." };
  await db.update(schema.events).set({ featuredOrder: null }).where(isNotNull(schema.events.featuredOrder));
  for (const [i, id] of p.data.entries()) await db.update(schema.events).set({ featuredOrder: i + 1 }).where(eq(schema.events.id, id));
  await logSecurity(g.admin.id, "admin", `Eventos em destaque: ${p.data.length} evento(s)`);
  revalidatePath("/"); revalidatePath(ADMIN_PATH);
  return { ok: true };
}

const MAX_HTML = HERO_HTML_MAX;

/**
 * Arte do banner principal de um evento: imagem enviada pela central (ou a do próprio evento) ou HTML.
 * `art: null` e `html: null` voltam para o banner do evento.
 */
export async function setHeroArt(eventId: string, art: string | null, html: string | null): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(eventId).success) return { ok: false, error: "Evento não encontrado." };
  if (art !== null && !/^\/midia\/[\w/.-]+\.(png|jpe?g|webp|gif)$/i.test(art)) return { ok: false, error: "Imagem inválida." };
  const h = html?.trim() || null;
  if (h && h.length > MAX_HTML) return { ok: false, error: "O HTML passa de 300 KB. Use imagens por link em vez de embutidas." };
  await db.update(schema.events).set({ heroArt: h ? null : art, heroHtml: h }).where(eq(schema.events.id, eventId));
  await logSecurity(g.admin.id, "admin", `Arte do banner ${eventId.slice(0, 8)}: ${h ? "HTML" : art ? "imagem" : "padrão"}`);
  revalidatePath("/"); revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/* ============================== banner livre (não é evento) ============================== */

/**
 * Cria ou edita um banner livre do carrossel: HTML (até 300 KB, roda isolado como o dos eventos) ou imagem, link
 * só do site ("/…") ou https://, rótulo, tamanho de projeto, cor de fundo e ligado/desligado. Novo entra no fim.
 */
export async function saveHeroSlide(input: HeroSlideInput): Promise<R & { id?: string }> {
  const g = await guard();
  if (!g.ok) return g;
  const p = heroSlideInput.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados do banner." };
  const { id, ...v } = p.data;
  const t = schema.heroSlides;
  let saved = id ?? undefined;
  if (id) {
    const [row] = await db.update(t).set(v).where(eq(t.id, id)).returning({ id: t.id });
    if (!row) return { ok: false, error: "Banner não encontrado." };
  } else {
    const [[e], [s]] = await Promise.all([
      db.select({ n: max(schema.events.heroOrder) }).from(schema.events),
      db.select({ n: max(t.position) }).from(t),
    ]);
    const [row] = await db.insert(t).values({ ...v, position: Math.max(e?.n ?? 0, s?.n ?? 0) + 1 }).returning({ id: t.id });
    saved = row.id;
  }
  await logSecurity(g.admin.id, "admin", `Banner livre ${saved!.slice(0, 8)}: ${id ? "editado" : "criado"} (${v.html ? "HTML" : "imagem"}, ${v.active ? "ligado" : "desligado"}, ${v.href})`);
  revalidatePath("/"); revalidatePath(ADMIN_PATH);
  return { ok: true, id: saved };
}

/** Apaga um banner livre (para só tirar da home, desligue). */
export async function deleteHeroSlide(id: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  if (!uuid.safeParse(id).success) return { ok: false, error: "Banner não encontrado." };
  const [row] = await db.delete(schema.heroSlides).where(eq(schema.heroSlides.id, id)).returning({ id: schema.heroSlides.id });
  if (!row) return { ok: false, error: "Banner não encontrado." };
  await logSecurity(g.admin.id, "admin", `Banner livre ${id.slice(0, 8)}: apagado`);
  revalidatePath("/"); revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/**
 * Ordem única do carrossel (eventos e banners livres juntos): "e:<id do evento>" ou "s:<id do banner>", de cima
 * para baixo. Evento fora da lista sai do carrossel (como em setHeroList); banner livre fora da lista mantém a
 * posição (sai da home só desligado ou apagado). Tudo numa transação.
 */
export async function setHeroOrder(tokens: string[]): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  const p = z.array(heroOrderToken).max(40).safeParse(tokens);
  if (!p.success || new Set(p.data).size !== p.data.length) return { ok: false, error: "Lista inválida." };
  const evIds = p.data.filter((x) => x.startsWith("e:")).map((x) => x.slice(2));
  const slIds = p.data.filter((x) => x.startsWith("s:")).map((x) => x.slice(2));
  const [evOk, slOk] = await Promise.all([
    evIds.length ? db.select({ id: schema.events.id }).from(schema.events).where(inArray(schema.events.id, evIds)) : [],
    slIds.length ? db.select({ id: schema.heroSlides.id }).from(schema.heroSlides).where(inArray(schema.heroSlides.id, slIds)) : [],
  ]);
  if (evOk.length !== evIds.length || slOk.length !== slIds.length) return { ok: false, error: "Algum item da lista não existe mais. Recarregue a página." };
  await runBatch([
    db.update(schema.events).set({ heroOrder: null }).where(isNotNull(schema.events.heroOrder)),
    ...p.data.map((x, i) =>
      x.startsWith("e:")
        ? db.update(schema.events).set({ heroOrder: i + 1 }).where(eq(schema.events.id, x.slice(2)))
        : db.update(schema.heroSlides).set({ position: i + 1 }).where(eq(schema.heroSlides.id, x.slice(2))),
    ),
  ]);
  await logSecurity(g.admin.id, "admin", `Banner principal: ${evIds.length} evento(s) e ${slIds.length} banner(s) livre(s)`);
  revalidatePath("/"); revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/* ============================== contas: liberar produtor ============================== */

/** "Tornar produtor" na aba Contas: libera a conta como se a inscrição tivesse sido aprovada e manda o e-mail. */
export async function authorizeProducer(userId: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  const r = await grantProducer(userId, g.admin.email);
  if (!r.ok) return r;
  await logSecurity(g.admin.id, "admin", `Liberou produtor ${r.app.email}`);
  after(() => mailProducerAuthorized(r.app));
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

/** "Remover permissão" para quem foi liberado mas ainda não fez o cadastro do produtor. */
export async function revokeProducer(userId: string): Promise<R> {
  const g = await guard();
  if (!g.ok) return g;
  const r = await ungrantProducer(userId, g.admin.email);
  if (!r.ok) return r;
  await logSecurity(g.admin.id, "admin", `Removeu permissão de produtor ${r.email}`);
  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
