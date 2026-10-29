"use server";

import { eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { ADMIN_PATH, adminUser, grantProducer, ungrantProducer } from "@/lib/admin";
import { logSecurity } from "@/lib/mfa";
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

const MAX_HTML = 300_000;

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
