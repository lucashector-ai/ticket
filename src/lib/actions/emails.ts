"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { reserveAttempt } from "@/lib/attempts";
import { getSessionUser } from "@/lib/auth/server";
import { emailConfirmed } from "@/lib/auth/verified";
import { isProducer } from "@/lib/data/producer";
import { spDate } from "@/lib/criar/model";
import { getPainelScope } from "@/lib/data/painel";
import { emailEnabled } from "@/lib/email";
import { normalizeAudience, normalizeDesign, type Audience } from "@/lib/mail/design";
import { loadEvents, resolveAudience, searchPublicEvents } from "@/lib/mail/data";
import type { EvInfo } from "@/lib/mail/render";
import { processEmailQueue, queueCampaign, sendTestEmail } from "@/lib/mail/send";
import { fromTemplate, TEMPLATES, type TemplateKey } from "@/lib/mail/templates";
import { MOTIVES, normalizeContent, type EventContent, type Motive } from "@/lib/mail/event-email";
import { DEFAULT_AUDIENCE, DEFAULT_STYLE } from "@/lib/mail/design";
import { dateNice } from "@/lib/format";

const { emailCampaigns, emailTemplates } = schema;
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Produtor logado (admin ou dono) e os eventos dele. Só produtor (dona, equipe ou produtor antigo) com o e-mail
 * confirmado: conta qualquer recebia papel "dono" por padrão e mandava e-mail com a marca e o domínio da Tickets Win
 * (SEC-304, SEC-010).
 */
async function scope() {
  const user = await getSessionUser();
  if (!user) return null;
  if (!(await isProducer(user)) || !(await emailConfirmed(user))) return null;
  const s = await getPainelScope(user);
  if (s.role === "portaria") return null;
  return { user, org: s.org, events: s.events, sender: { orgId: s.org?.id ?? null, userId: user.id } };
}
type Scope = NonNullable<Awaited<ReturnType<typeof scope>>>;

const mine = (sc: Scope) => (sc.org ? eq(emailCampaigns.organizerId, sc.org.id) : and(isNull(emailCampaigns.organizerId), eq(emailCampaigns.userId, sc.user.id)));
async function campaignOf(sc: Scope, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return (await db.query.emailCampaigns.findFirst({ where: and(eq(emailCampaigns.id, id), mine(sc)) })) ?? null;
}
const editable = (status: string) => status === "draft" || status === "scheduled";
const today = () => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date());

export async function createCampaign(key: TemplateKey, eventId: string): Promise<R<{ id: string }>> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  const tpl = TEMPLATES.find((x) => x.key === key);
  if (!tpl) return { ok: false, error: "Modelo inválido." };
  const ev = sc.events.find((e) => e.id === eventId) ?? null;
  if (tpl.needsEvent && !ev) return { ok: false, error: "Escolha o evento." };
  const name = sc.org?.name ?? sc.user.name ?? "Produtor";
  const t = fromTemplate(key, ev && { id: ev.id, title: ev.title }, name, today());
  const [row] = await db.insert(emailCampaigns).values({
    organizerId: sc.org?.id ?? null, userId: sc.user.id, name: t.name, subject: t.subject, preheader: t.preheader,
    fromName: (ev?.title ?? name).slice(0, 120), replyTo: sc.org?.contactEmail ?? sc.user.email ?? "", audience: t.audience, design: t.design, eventId: ev?.id ?? null,
  }).returning({ id: emailCampaigns.id });
  revalidatePath("/painel/emails");
  return { ok: true, id: row.id };
}

/** Campanha no modelo pronto da Tickets Win: só o evento e o motivo; o produtor escreve um recado se quiser. */
export async function createEventCampaign(eventId: string, motive: Motive): Promise<R<{ id: string }>> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  const ev = sc.events.find((e) => e.id === eventId);
  if (!ev) return { ok: false, error: "Escolha o evento." };
  const m = MOTIVES[motive] ? motive : "novo";
  const when = ev.dateLabel || dateNice(ev.startAt);
  // lembrete vai para quem comprou; os outros para todo o público, menos quem já comprou este evento
  const audience = m === "lembrete"
    ? { buyers: "events" as const, buyerEvents: [ev.id], followers: false, signups: false, excludeBuyersOf: [] }
    : { ...DEFAULT_AUDIENCE, excludeBuyersOf: [ev.id] };
  const content: EventContent = { eventId: ev.id, motive: m, message: "", coupon: "" };
  const [row] = await db.insert(emailCampaigns).values({
    organizerId: sc.org?.id ?? null, userId: sc.user.id, name: `${MOTIVES[m].label} · ${ev.title}`.slice(0, 160),
    subject: MOTIVES[m].subject(ev.title, when).slice(0, 200), preheader: "", fromName: ev.title.slice(0, 120), replyTo: sc.org?.contactEmail ?? sc.user.email ?? "",
    audience, format: "evento", content, design: { v: 1, style: { ...DEFAULT_STYLE }, blocks: [] }, eventId: ev.id,
  }).returning({ id: emailCampaigns.id });
  revalidatePath("/painel/emails");
  return { ok: true, id: row.id };
}

/** Começa uma campanha a partir de um modelo salvo pelo produtor. */
export async function createFromSaved(templateId: string): Promise<R<{ id: string }>> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  const tpl = await db.query.emailTemplates.findFirst({ where: and(eq(emailTemplates.id, templateId), sc.org ? eq(emailTemplates.organizerId, sc.org.id) : eq(emailTemplates.userId, sc.user.id)) });
  if (!tpl) return { ok: false, error: "Modelo não encontrado." };
  const name = sc.org?.name ?? sc.user.name ?? "Produtor";
  const [row] = await db.insert(emailCampaigns).values({
    organizerId: sc.org?.id ?? null, userId: sc.user.id, name: `${tpl.name} · ${today()}`, fromName: name, replyTo: sc.org?.contactEmail ?? sc.user.email ?? "",
    audience: normalizeAudience({}), design: normalizeDesign(tpl.design),
  }).returning({ id: emailCampaigns.id });
  return { ok: true, id: row.id };
}

export async function updateCampaign(id: string, patch: { name?: string; subject?: string; preheader?: string; fromName?: string; replyTo?: string; audience?: Audience; content?: EventContent }): Promise<R> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c) return { ok: false, error: "Campanha não encontrada." };
  if (!editable(c.status)) return { ok: false, error: "Esta campanha já foi enviada." };
  const set: Partial<typeof emailCampaigns.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 160) || c.name;
  if (patch.subject !== undefined) set.subject = patch.subject.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (patch.preheader !== undefined) set.preheader = patch.preheader.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (patch.fromName !== undefined) set.fromName = patch.fromName.replace(/[\r\n"<>]+/g, " ").trim().slice(0, 120);
  if (patch.replyTo !== undefined) {
    const v = patch.replyTo.trim().toLowerCase();
    if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return { ok: false, error: "O e-mail de resposta não parece válido." };
    set.replyTo = v;
  }
  if (patch.audience !== undefined) set.audience = normalizeAudience(patch.audience);
  if (patch.content !== undefined && c.format === "evento") {
    const ct = normalizeContent(patch.content);
    if (ct.eventId && !(await scope())?.events.some((e) => e.id === ct.eventId)) return { ok: false, error: "Evento não encontrado." };
    set.content = ct; set.eventId = ct.eventId || null;
  }
  await db.update(emailCampaigns).set(set).where(eq(emailCampaigns.id, c.id));
  return { ok: true };
}

export async function saveDesign(id: string, design: unknown): Promise<R> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c) return { ok: false, error: "Campanha não encontrada." };
  if (!editable(c.status)) return { ok: false, error: "Esta campanha já foi enviada." };
  await db.update(emailCampaigns).set({ design: normalizeDesign(design) }).where(eq(emailCampaigns.id, c.id));
  return { ok: true };
}

/** Quantas pessoas recebem com este público (sem repetidos e sem descadastrados). */
export async function audienceCount(audience: Audience): Promise<R<{ total: number }>> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  const list = await resolveAudience(normalizeAudience(audience), sc.sender, sc.events.map((e) => e.id));
  return { ok: true, total: list.length };
}

const TESTS_PER_CAMPAIGN_HOUR = 5, TESTS_PER_DAY = 20;

export async function sendTest(id: string): Promise<R<{ to: string }>> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!sc || !c) return { ok: false, error: "Campanha não encontrada." };
  if (!sc.user.email) return { ok: false, error: "Sua conta não tem e-mail." };
  // e-mail de teste: 5 por campanha por hora e 20 por conta por dia (contador atômico, SEC-304)
  try {
    if (!(await reserveAttempt(`campaign:${c.id}`, "mailtest", TESTS_PER_CAMPAIGN_HOUR, 3600)).ok
      || !(await reserveAttempt(sc.user.id, "mailtest:day", TESTS_PER_DAY, 86_400)).ok) {
      return { ok: false, error: "Muitos e-mails de teste. Tente de novo mais tarde." };
    }
  } catch (e) {
    console.error("sendTest attempts", e);
    return { ok: false, error: "Não foi possível enviar o teste agora. Tente de novo em instantes." };
  }
  const r = await sendTestEmail(c, sc.user.email, sc.user.name ?? "");
  if (!r.ok) return r;
  await db.update(emailCampaigns).set({ testSentAt: new Date() }).where(eq(emailCampaigns.id, c.id));
  return { ok: true, to: sc.user.email };
}

/** O que falta para poder enviar (o painel mostra a mesma lista). */
function blockers(c: { subject: string; format: string; content: EventContent | null; design: { blocks: unknown[] } }) {
  const out: string[] = [];
  if (!c.subject.trim()) out.push("Falta o assunto.");
  if (c.format === "evento") {
    if (!c.content?.eventId) out.push("Escolha o evento.");
    if (c.content?.motive === "cupom" && !c.content.coupon) out.push("Escolha o cupom.");
  } else if (!c.design.blocks.length) out.push("O e-mail está vazio.");
  return out;
}

export async function sendNow(id: string): Promise<R<{ total: number }>> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c) return { ok: false, error: "Campanha não encontrada." };
  if (!editable(c.status)) return { ok: false, error: "Esta campanha já foi enviada." };
  if (!emailEnabled()) return { ok: false, error: "O envio de e-mails ainda não está ligado (falta a chave RESEND_API_KEY no Cloudflare)." };
  const b = blockers(c);
  if (b.length) return { ok: false, error: b[0] };
  const r = await queueCampaign(c.id);
  if (!r.ok) return r;
  // o primeiro lote sai agora; o resto o cron manda a cada minuto
  await processEmailQueue(200).catch((e) => console.error("email first batch", e));
  revalidatePath("/painel/emails");
  return { ok: true, total: r.total };
}

/** Agenda para "2026-11-01T18:00" (horário de Brasília). */
export async function scheduleCampaign(id: string, when: string): Promise<R> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c) return { ok: false, error: "Campanha não encontrada." };
  if (!editable(c.status)) return { ok: false, error: "Esta campanha já foi enviada." };
  const m = when.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  const at = m ? spDate(m[1], m[2]) : null;
  if (!at) return { ok: false, error: "Escolha a data e a hora." };
  if (at.getTime() < Date.now() + 60_000) return { ok: false, error: "Escolha um horário no futuro." };
  const b = blockers(c);
  if (b.length) return { ok: false, error: b[0] };
  await db.update(emailCampaigns).set({ status: "scheduled", scheduledAt: at }).where(eq(emailCampaigns.id, c.id));
  revalidatePath("/painel/emails");
  return { ok: true };
}

export async function unscheduleCampaign(id: string): Promise<R> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c || c.status !== "scheduled") return { ok: false, error: "Campanha não está agendada." };
  await db.update(emailCampaigns).set({ status: "draft", scheduledAt: null }).where(and(eq(emailCampaigns.id, c.id), eq(emailCampaigns.status, "scheduled")));
  return { ok: true };
}

export async function duplicateCampaign(id: string): Promise<R<{ id: string }>> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c) return { ok: false, error: "Campanha não encontrada." };
  const [row] = await db.insert(emailCampaigns).values({
    organizerId: c.organizerId, userId: c.userId, name: `${c.name} (cópia)`.slice(0, 160), subject: c.subject, preheader: c.preheader,
    fromName: c.fromName, replyTo: c.replyTo, audience: c.audience, format: c.format, content: c.content, design: c.design, eventId: c.eventId,
  }).returning({ id: emailCampaigns.id });
  revalidatePath("/painel/emails");
  return { ok: true, id: row.id };
}

export async function deleteCampaign(id: string): Promise<R> {
  const sc = await scope();
  const c = sc && (await campaignOf(sc, id));
  if (!c) return { ok: false, error: "Campanha não encontrada." };
  if (c.status === "sending") return { ok: false, error: "A campanha está sendo enviada agora." };
  await db.delete(emailCampaigns).where(eq(emailCampaigns.id, c.id));
  revalidatePath("/painel/emails");
  return { ok: true };
}

export async function saveTemplate(name: string, design: unknown): Promise<R> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  const n = name.trim().slice(0, 120);
  if (!n) return { ok: false, error: "Dê um nome ao modelo." };
  await db.insert(emailTemplates).values({ organizerId: sc.org?.id ?? null, userId: sc.user.id, name: n, design: normalizeDesign(design) });
  revalidatePath("/painel/emails");
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<R> {
  const sc = await scope();
  if (!sc || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Sem permissão." };
  await db.delete(emailTemplates).where(and(eq(emailTemplates.id, id), sc.org ? eq(emailTemplates.organizerId, sc.org.id) : eq(emailTemplates.userId, sc.user.id)));
  revalidatePath("/painel/emails");
  return { ok: true };
}

/** Busca evento publicado de qualquer produtor (evento parceiro) e devolve os dados do bloco. */
export async function findEvents(q: string): Promise<R<{ list: { id: string; title: string }[] }>> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  const rows = await searchPublicEvents(q);
  return { ok: true, list: rows.map((r) => ({ id: r.id, title: r.title })) };
}

export async function eventInfos(ids: string[]): Promise<R<{ events: Record<string, EvInfo> }>> {
  const sc = await scope();
  if (!sc) return { ok: false, error: "Sem permissão." };
  // eventos de outros produtores só se estiverem publicados
  const own = new Set(sc.events.map((e) => e.id));
  const others = ids.filter((id) => !own.has(id) && /^[0-9a-f-]{36}$/.test(id));
  const pub = others.length ? await db.select({ id: schema.events.id }).from(schema.events).where(and(inArray(schema.events.id, others), eq(schema.events.status, "published"))) : [];
  const allowed = [...ids.filter((id) => own.has(id)), ...pub.map((x) => x.id)];
  return { ok: true, events: await loadEvents(allowed) };
}
