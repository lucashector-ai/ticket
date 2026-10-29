import "server-only";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { emailEnabled } from "@/lib/email";
import { DEFAULT_AUDIENCE, fillVars, reasonFor, SAMPLE_VARS, type Vars } from "./design";
import { designEventIds, loadEvents, orgInfo, resolveAudience, siteUrl, upcomingIds, type Recipient, type Sender } from "./data";
import { campaignLinks, renderCampaign } from "./event-email";
import type { RenderCtx } from "./render";

const { emailCampaigns, emailSends, organizers, events } = schema;
type Campaign = typeof emailCampaigns.$inferSelect;

/**
 * Endereço que envia (domínio verificado no Resend, EMAIL_FROM_MARKETING); o nome que aparece na caixa
 * de entrada é o do evento (ou o que o produtor escreveu em "Nome de quem envia"). A imagem ao lado
 * continua a da Tickets Win (BIMI do domínio).
 */
function fromHeader(name: string) {
  const raw = process.env.EMAIL_FROM_MARKETING || process.env.EMAIL_FROM || "Tickets Win <onboarding@resend.dev>";
  const addr = raw.match(/<([^>]+)>/)?.[1] ?? raw.trim();
  const clean = name.replace(/["<>\r\n]/g, "").trim().slice(0, 80) || "Tickets Win";
  return `"${clean}" <${addr}>`;
}

/** Nome do remetente: o que o produtor escreveu; senão o nome do evento da campanha; senão o do produtor. */
function senderName(c: Campaign, base: Pick<RenderCtx, "events" | "org">) {
  const ev = base.events[c.content?.eventId ?? c.eventId ?? ""];
  return c.fromName.trim() || ev?.title || base.org.name;
}

const token = () => crypto.randomUUID().replace(/-/g, "");
export const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const varsFor = (r: Recipient): Vars => ({ nome: r.name, primeiro_nome: firstName(r.name), email: r.email });

/** Eventos do remetente (para o público) e o nome do produtor. */
export async function senderScope(c: Pick<Campaign, "organizerId" | "userId">) {
  const s: Sender = { orgId: c.organizerId, userId: c.userId };
  const org = c.organizerId ? await db.query.organizers.findFirst({ where: eq(organizers.id, c.organizerId) }) : null;
  const evs = await db.select({ id: events.id }).from(events).where(c.organizerId ? sql`${events.organizerId} = ${c.organizerId} or ${events.createdByUserId} = ${c.userId}` : eq(events.createdByUserId, c.userId));
  return { s, org, ownIds: evs.map((e) => e.id) };
}

/** Tudo o que o HTML precisa, menos os dados de cada pessoa. */
export async function baseCtx(c: Campaign, fallbackName = "Produtor"): Promise<Omit<RenderCtx, "vars" | "unsubscribeUrl">> {
  const site = siteUrl();
  const { s, org } = await senderScope(c);
  const up = await upcomingIds(s);
  const evs = await loadEvents([...designEventIds(c.design), ...(c.content?.eventId ? [c.content.eventId] : []), ...(c.eventId ? [c.eventId] : []), ...up]);
  const info = orgInfo(org ?? null, c.fromName || fallbackName);
  return {
    site, org: info, events: evs, upcoming: up.map((id) => evs[id]).filter(Boolean),
    preheader: c.preheader, reason: reasonFor(c.audience ?? DEFAULT_AUDIENCE, info.name),
    utmCampaign: c.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "campanha",
    now: Date.now(),
  };
}

type Out = { from: string; to: string[]; subject: string; html: string; text: string; reply_to?: string; headers?: Record<string, string> };

/** Envia até 100 por chamada (limite do Resend). Devolve se o lote foi aceito e o erro. */
async function resendBatch(list: Out[]): Promise<{ ok: boolean; error?: string; retry?: boolean }> {
  let r: Response;
  try {
    r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(list),
    });
  } catch (e) {
    // falha de rede: o lote continua na fila e o cron tenta de novo no próximo minuto
    console.error("email campaign network", e);
    return { ok: false, retry: true };
  }
  if (r.ok) return { ok: true };
  const t = (await r.text()).slice(0, 280);
  console.error("email campaign", r.status, t);
  return { ok: false, error: `${r.status} ${t}` };
}

/** E-mail de teste para o próprio produtor (assunto com [Teste], links sem rastreio). */
export async function sendTestEmail(c: Campaign, to: string, name: string) {
  if (!emailEnabled()) return { ok: false as const, error: "O envio de e-mails ainda não está ligado (falta a chave RESEND_API_KEY no Cloudflare)." };
  const base = await baseCtx(c, name);
  const vars = { ...SAMPLE_VARS, nome: name || SAMPLE_VARS.nome, primeiro_nome: firstName(name) || SAMPLE_VARS.primeiro_nome, email: to };
  const { html, text } = renderCampaign(c, { ...base, vars, unsubscribeUrl: `${base.site}/e/sair/teste` });
  const r = await resendBatch([{ from: fromHeader(senderName(c, base)), to: [to], subject: `[Teste] ${fillVars(c.subject || "(sem assunto)", vars)}`, html, text, ...(c.replyTo ? { reply_to: c.replyTo } : {}) }]);
  return r.ok ? { ok: true as const } : { ok: false as const, error: "O Resend recusou o envio. Confira o domínio do remetente no Resend." };
}

/** Monta a lista de envio e marca a campanha como "enviando". O cron manda os lotes. */
export async function queueCampaign(campaignId: string) {
  const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, campaignId) });
  if (!c) return { ok: false as const, error: "Campanha não encontrada." };
  const { s, ownIds } = await senderScope(c);
  const people = await resolveAudience(c.audience, s, ownIds);
  if (!people.length) return { ok: false as const, error: "Ninguém na lista com esse público." };
  const base = await baseCtx(c);
  const links = campaignLinks(c, { ...base, vars: SAMPLE_VARS, unsubscribeUrl: "" });
  // trava: só uma chamada passa de rascunho/agendada para enviando
  const [locked] = await db.update(emailCampaigns).set({ status: "sending", startedAt: new Date(), links })
    .where(and(eq(emailCampaigns.id, c.id), inArray(emailCampaigns.status, ["draft", "scheduled"]))).returning({ id: emailCampaigns.id });
  if (!locked) return { ok: false as const, error: "Esta campanha já foi enviada." };
  for (let i = 0; i < people.length; i += 500) {
    await db.insert(emailSends).values(people.slice(i, i + 500).map((p) => ({ campaignId: c.id, email: p.email, name: p.name || null, token: token() }))).onConflictDoNothing();
  }
  return { ok: true as const, total: people.length };
}

/** Envia o próximo lote da fila (todas as campanhas), até `limit` e-mails. */
export async function processEmailQueue(limit = 300) {
  if (!emailEnabled()) return { sent: 0, failed: 0, skipped: "sem RESEND_API_KEY" };
  const queued = await db.select({ id: emailSends.id, campaignId: emailSends.campaignId, email: emailSends.email, name: emailSends.name, token: emailSends.token })
    .from(emailSends).innerJoin(emailCampaigns, eq(emailCampaigns.id, emailSends.campaignId))
    .where(and(eq(emailSends.status, "queued"), eq(emailCampaigns.status, "sending"))).orderBy(asc(emailSends.createdAt)).limit(limit);
  let sent = 0, failed = 0;
  const byCampaign = new Map<string, typeof queued>();
  for (const q of queued) byCampaign.set(q.campaignId, [...(byCampaign.get(q.campaignId) ?? []), q]);
  for (const [cid, list] of byCampaign) {
    const c = await db.query.emailCampaigns.findFirst({ where: eq(emailCampaigns.id, cid) });
    if (!c) continue;
    const base = await baseCtx(c);
    const linkIdx = new Map((c.links ?? []).map((u, i) => [u, i]));
    const from = fromHeader(senderName(c, base));
    for (let i = 0; i < list.length; i += 100) {
      const chunk = list.slice(i, i + 100);
      const out: Out[] = chunk.map((q) => {
        const vars = varsFor({ email: q.email, name: q.name ?? "" });
        const t = q.token;
        const unsub = `${base.site}/e/sair/${t}`;
        const { html, text } = renderCampaign(c, {
          ...base, vars, unsubscribeUrl: unsub, viewUrl: `${base.site}/e/ver/${t}`, pixelUrl: `${base.site}/e/o/${t}`,
          link: (u) => (linkIdx.has(u) ? `${base.site}/e/c/${t}/${linkIdx.get(u)}` : u),
        });
        return {
          from, to: [q.email], subject: fillVars(c.subject, vars), html, text, ...(c.replyTo ? { reply_to: c.replyTo } : {}),
          headers: { "List-Unsubscribe": `<${unsub}/1click>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        };
      });
      const r = await resendBatch(out);
      if (r.retry) break;
      const ids = chunk.map((q) => q.id);
      if (r.ok) { await db.update(emailSends).set({ status: "sent", sentAt: new Date() }).where(inArray(emailSends.id, ids)); sent += ids.length; }
      else { await db.update(emailSends).set({ status: "failed", error: (r.error ?? "").slice(0, 300) }).where(inArray(emailSends.id, ids)); failed += ids.length; }
    }
  }
  // campanhas sem nada na fila terminaram
  await db.update(emailCampaigns).set({ status: "sent", sentAt: new Date() })
    .where(and(eq(emailCampaigns.status, "sending"), sql`not exists (select 1 from ${emailSends} where ${emailSends.campaignId} = ${emailCampaigns.id} and ${emailSends.status} = 'queued')`));
  return { sent, failed };
}

/** Cron (a cada minuto): agendadas que chegaram na hora e o próximo lote. */
export async function runEmailJobs(now = new Date()) {
  // sem a chave do Resend as agendadas esperam (não ficam presas em "enviando")
  if (!emailEnabled()) return { skipped: "sem RESEND_API_KEY" };
  const due = await db.select({ id: emailCampaigns.id }).from(emailCampaigns).where(and(eq(emailCampaigns.status, "scheduled"), lte(emailCampaigns.scheduledAt, now)));
  for (const d of due) {
    const r = await queueCampaign(d.id);
    if (!r.ok) await db.update(emailCampaigns).set({ status: "cancelled" }).where(eq(emailCampaigns.id, d.id));
  }
  return { started: due.length, ...(await processEmailQueue()) };
}
