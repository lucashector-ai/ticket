"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { checkinTicket, type CheckinResult } from "@/lib/checkin";
import { organizerFor } from "@/lib/criar/save";
import { getPainelScope, type PainelRole } from "@/lib/data/painel";
import { isProducer } from "@/lib/data/producer";
import { mailPortariaAccess, mailSecurityNotice, mailTeamInvite } from "@/lib/notify";
import { destLabel } from "@/lib/bank";
import { checkSecondFactor, logSecurity, mfaSettings } from "@/lib/mfa";
import { newAccessCode } from "@/lib/portaria";
import { AGES, parseBrDateTime } from "@/lib/criar/model";

const { coupons, organizerMembers, organizers } = schema;
type R = { ok: true } | { ok: false; error: string };
const RANK: Record<PainelRole, number> = { portaria: 0, admin: 1, owner: 2 };

async function scope(need: PainelRole) {
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  if (RANK[s.role] < RANK[need]) return null;
  // conta sem equipe cai como "dono" (de nada): convidar equipe ou criar o produtor nas configurações só para
  // produtor aprovado; senão qualquer conta convidava uma segunda conta e virava produtor sem passar pela aprovação
  if (need === "owner" && !(await isProducer(user))) return null;
  return { user, ...s };
}

/* ---------- check-in (portaria) ---------- */

export async function scanTicket(eventId: string, input: string): Promise<Omit<CheckinResult, "status"> & { auth: boolean }> {
  const s = await scope("portaria");
  if (!s || !s.events.some((e) => e.id === eventId)) return { ok: false, auth: false, error: "Sem permissão para este evento." };
  const r = await checkinTicket(input, new Set([eventId]), s.user.name || s.user.email || "Equipe");
  return { ok: r.ok, error: r.error, checkedInAt: r.checkedInAt, ticket: r.ticket, auth: true };
}

/* ---------- check-in pelo celular: links externos ---------- */

type LinkOut = { ok: true; id: string; token: string; code: string; email: string | null; sent: boolean } | { ok: false; error: string };

/** Manda o link do acesso por e-mail e registra o envio. */
async function deliver(link: { id: string; token: string; code: string | null; label: string; eventId: string }, email: string, orgName: string) {
  const ev = await db.query.events.findFirst({ where: eq(schema.events.id, link.eventId), columns: { title: true, dateLabel: true } });
  const ok = await mailPortariaAccess({ email, name: link.label, eventTitle: ev?.title ?? "o evento", when: ev?.dateLabel ?? "", orgName, token: link.token, code: link.code ?? "" });
  if (ok) await db.update(schema.checkinLinks).set({ email, sentAt: new Date() }).where(eq(schema.checkinLinks.id, link.id));
  return ok;
}

/**
 * Convite para a portaria de um evento: cria um acesso único e secreto (link + código) para uma pessoa.
 * `send`: manda por e-mail; sem ele, a tela mostra o QR code para a pessoa abrir na hora.
 */
export async function createCheckinLink(eventId: string, label: string, email?: string, send = false): Promise<LinkOut> {
  const s = await scope("admin");
  if (!s || !s.events.some((e) => e.id === eventId)) return { ok: false, error: "Sem permissão para este evento." };
  const name = label.trim().slice(0, 60) || "Portaria";
  const mail = (email ?? "").trim().toLowerCase();
  if (mail && !z.email().safeParse(mail).success) return { ok: false, error: "Confira o e-mail." };
  if (send && !mail) return { ok: false, error: "Digite o e-mail para enviar o acesso." };
  const open = await db.select({ id: schema.checkinLinks.id }).from(schema.checkinLinks)
    .where(and(eq(schema.checkinLinks.eventId, eventId), isNull(schema.checkinLinks.revokedAt)));
  if (open.length >= 30) return { ok: false, error: "Este evento já tem 30 acessos ativos. Desligue algum antes de criar outro." };
  const token = randomBytes(18).toString("base64url");
  // código curto para digitar no app da portaria (único; tenta de novo no raro caso de colisão)
  for (let i = 0; i < 5; i++) {
    const code = newAccessCode();
    const [row] = await db.insert(schema.checkinLinks).values({ eventId, token, code, label: name, email: mail || null, createdByUserId: s.user.id }).onConflictDoNothing().returning({ id: schema.checkinLinks.id });
    if (!row) continue;
    const sent = send ? await deliver({ id: row.id, token, code, label: name, eventId }, mail, s.org?.name ?? "A produção") : false;
    revalidatePath(`/painel/evento/${eventId}`);
    revalidatePath("/painel/equipe");
    return { ok: true, id: row.id, token, code, email: mail || null, sent };
  }
  return { ok: false, error: "Não foi possível criar o acesso. Tente de novo." };
}

/** Envia (ou reenvia) um acesso já criado por e-mail. */
export async function sendCheckinLink(id: string, email: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const s = await scope("admin");
  if (!s) return { ok: false, error: "Sem permissão." };
  const mail = email.trim().toLowerCase();
  if (!z.email().safeParse(mail).success) return { ok: false, error: "Confira o e-mail." };
  const link = await db.query.checkinLinks.findFirst({ where: and(eq(schema.checkinLinks.id, id), isNull(schema.checkinLinks.revokedAt)), columns: { id: true, token: true, code: true, label: true, eventId: true, email: true, createdByUserId: true } });
  if (!link || !s.events.some((e) => e.id === link.eventId)) return { ok: false, error: "Acesso não encontrado." };
  // o acesso de outra pessoa só vai para o e-mail que já está nele: trocar o destino é da dona ou de quem criou (SEC-401)
  if (link.email && link.email !== mail && s.role !== "owner" && link.createdByUserId !== s.user.id) {
    return { ok: false, error: "Este acesso já tem um e-mail. Só quem criou o acesso, ou o dono, pode mandá-lo para outro e-mail." };
  }
  if (!(await deliver(link, mail, s.org?.name ?? "A produção"))) return { ok: false, error: "Não foi possível enviar o e-mail agora. Tente de novo." };
  revalidatePath(`/painel/evento/${link.eventId}`);
  revalidatePath("/painel/equipe");
  return { ok: true, email: mail };
}

export async function revokeCheckinLink(id: string): Promise<R> {
  const s = await scope("admin");
  if (!s) return { ok: false, error: "Sem permissão." };
  const link = await db.query.checkinLinks.findFirst({ where: eq(schema.checkinLinks.id, id), columns: { eventId: true } });
  if (!link || !s.events.some((e) => e.id === link.eventId)) return { ok: false, error: "Link não encontrado." };
  await db.update(schema.checkinLinks).set({ revokedAt: new Date() }).where(eq(schema.checkinLinks.id, id));
  revalidatePath(`/painel/evento/${link.eventId}`);
  return { ok: true };
}

/* ---------- marketing: cupons ---------- */

const couponSchema = z.object({
  eventId: z.uuid(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, "Código: 3 a 40 letras, números, - ou _."),
  kind: z.enum(["pct", "brl"]),
  value: z.number().positive("Informe o desconto."),
  limit: z.number().int().min(0),
  until: z.string().max(20),
});

export async function createCoupon(input: z.input<typeof couponSchema>): Promise<R> {
  const s = await scope("admin");
  if (!s) return { ok: false, error: "Sem permissão." };
  const p = couponSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira o cupom." };
  const d = p.data;
  if (!s.events.some((e) => e.id === d.eventId)) return { ok: false, error: "Evento não encontrado." };
  if (d.kind === "pct" && d.value > 100) return { ok: false, error: "Desconto em % vai até 100." };
  const until = d.until ? parseBrDateTime(d.until, true) : null;
  if (d.until && !until) return { ok: false, error: "Validade no formato 31/12/2026." };
  const taken = await db.query.coupons.findFirst({ where: eq(coupons.code, d.code), columns: { id: true } });
  if (taken) return { ok: false, error: "Esse código já existe. Escolha outro." };
  await db.insert(coupons).values({
    eventId: d.eventId, code: d.code, percentOff: d.kind === "pct" ? Math.round(d.value) : null,
    amountOffCents: d.kind === "brl" ? Math.round(d.value * 100) : null, maxUses: d.limit || null, expiresAt: until,
  });
  revalidatePath("/painel/marketing");
  return { ok: true };
}

export async function setCouponActive(couponId: string, active: boolean): Promise<R> {
  const s = await scope("admin");
  if (!s) return { ok: false, error: "Sem permissão." };
  const c = await db.query.coupons.findFirst({ where: eq(coupons.id, couponId), columns: { eventId: true } });
  if (!c?.eventId || !s.events.some((e) => e.id === c.eventId)) return { ok: false, error: "Cupom não encontrado." };
  await db.update(coupons).set({ active }).where(eq(coupons.id, couponId));
  revalidatePath("/painel/marketing");
  return { ok: true };
}

/* ---------- equipe ---------- */

const roleSchema = z.enum(["admin", "portaria"]);

export async function inviteMember(email: string, role: string): Promise<R> {
  const s = await scope("owner");
  if (!s) return { ok: false, error: "Só o dono pode convidar." };
  const e = z.email("Confira o e-mail.").safeParse(email.trim().toLowerCase());
  const r = roleSchema.safeParse(role);
  if (!e.success || !r.success) return { ok: false, error: "Confira o e-mail e a função." };
  if (e.data === s.user.email?.toLowerCase()) return { ok: false, error: "Esse é o seu próprio e-mail." };
  const org = s.org ?? (await organizerFor(s.user));
  await db.insert(organizerMembers).values({ organizerId: org.id, email: e.data, role: r.data })
    .onConflictDoUpdate({ target: [organizerMembers.organizerId, organizerMembers.email], set: { role: r.data } });
  after(() => mailTeamInvite(e.data, r.data, org.name, s.user.name));
  revalidatePath("/painel/equipe");
  return { ok: true };
}

/** Resultado da saída de alguém da equipe: acessos desligados (criados pela pessoa) e acessos trocados (para reenviar). */
type Retired = { ok: true; revoked: number; rotated: number } | { ok: false; error: string };

/**
 * Quem sai da equipe (ou deixa de ser admin) perde a portaria dos eventos da produtora (SEC-003, SEC-401):
 * 1. todos os acessos que a pessoa criou são desligados: o pessoal ("Abrir app da portaria") e os que ela criou para
 *    outras pessoas, inclusive com um e-mail escolhido por ela. Aparelho conectado a eles sai na hora;
 * 2. se era admin, ela viu (e pode ter copiado) token e código de todos os outros acessos na tela Equipe: eles trocam
 *    de token e código. NADA é reenviado sozinho: o e-mail gravado no acesso pode ter sido escolhido pela pessoa
 *    que saiu (sendCheckinLink). A dona reenvia na tela Equipe (o aviso diz quantos); aparelho já conectado continua.
 */
async function retireFromPortaria(userId: string | null, wasAdmin: boolean, evIds: string[]) {
  const { checkinLinks } = schema;
  if (!evIds.length) return { revoked: 0, rotated: 0 };
  const revoked = userId
    ? (await db.update(checkinLinks).set({ revokedAt: new Date() })
      .where(and(eq(checkinLinks.createdByUserId, userId), inArray(checkinLinks.eventId, evIds), isNull(checkinLinks.revokedAt)))
      .returning({ id: checkinLinks.id })).length
    : 0;
  if (!wasAdmin) return { revoked, rotated: 0 };
  const live = await db.query.checkinLinks.findMany({
    where: and(inArray(checkinLinks.eventId, evIds), isNull(checkinLinks.revokedAt)),
    columns: { id: true },
  });
  let rotated = 0;
  for (const l of live) {
    for (let i = 0; i < 5; i++) {
      try {
        // sentAt volta a vazio: a tela mostra "ainda não enviado" e o botão de enviar o acesso novo
        await db.update(checkinLinks).set({ token: randomBytes(18).toString("base64url"), code: newAccessCode(), sentAt: null }).where(eq(checkinLinks.id, l.id));
        rotated++;
        break;
      } catch { /* colisão rara de código: tenta outro */ }
    }
  }
  return { revoked, rotated };
}

export async function setMemberRole(memberId: string, role: string): Promise<Retired> {
  const s = await scope("owner");
  const r = roleSchema.safeParse(role);
  if (!s?.org || !r.success) return { ok: false, error: "Sem permissão." };
  const [before] = await db.select({ role: organizerMembers.role, userId: organizerMembers.userId }).from(organizerMembers).where(and(eq(organizerMembers.id, memberId), eq(organizerMembers.organizerId, s.org.id)));
  await db.update(organizerMembers).set({ role: r.data }).where(and(eq(organizerMembers.id, memberId), eq(organizerMembers.organizerId, s.org.id)));
  // admin que vira portaria: perde os acessos que criou e os que viu trocam de token e código
  const out = before?.role === "admin" && r.data !== "admin"
    ? await retireFromPortaria(before.userId, true, s.events.filter((e) => e.organizerId === s.org!.id).map((e) => e.id))
    : { revoked: 0, rotated: 0 };
  revalidatePath("/painel/equipe");
  return { ok: true, ...out };
}

export async function removeMember(memberId: string): Promise<Retired> {
  const s = await scope("owner");
  if (!s?.org) return { ok: false, error: "Sem permissão." };
  const [gone] = await db.delete(organizerMembers).where(and(eq(organizerMembers.id, memberId), eq(organizerMembers.organizerId, s.org.id)))
    .returning({ userId: organizerMembers.userId, role: organizerMembers.role });
  const evIds = s.events.filter((e) => e.organizerId === s.org!.id).map((e) => e.id);
  const out = gone ? await retireFromPortaria(gone.userId, gone.role === "admin", evIds) : { revoked: 0, rotated: 0 };
  revalidatePath("/painel/equipe");
  return { ok: true, ...out };
}

/* ---------- configurações ---------- */

const opt = (n: number) => z.string().trim().max(n);
const settingsSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(160),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Endereço: só letras minúsculas, números e hífens.").min(3).max(60),
  contactEmail: z.union([z.literal(""), z.email("E-mail inválido.")]),
  legalName: opt(200), cnpj: opt(20),
  payout: z.object({ bank: opt(80), agency: opt(12), account: opt(24), kind: z.enum(["corrente", "poupanca"]), holder: opt(160), doc: opt(20), pixKey: opt(140) }),
  defaults: z.object({ buyerPaysFee: z.boolean(), autoMeia: z.boolean(), age: z.enum(AGES), refund: opt(300) }),
  /** código do app autenticador: exigido para trocar a conta de recebimento quando a conta usa o app (D-04) */
  code: opt(20).optional(),
});
export type SettingsInput = z.input<typeof settingsSchema>;
/** `needsCode`: a conta de recebimento mudou e a conta usa app autenticador; a tela pede o código e salva de novo. */
export type SettingsResult = R | { ok: false; error: string; needsCode: true };

const PAYOUT_CODE = "Para trocar a conta de recebimento, digite o código do app autenticador.";

export async function saveSettings(input: SettingsInput): Promise<SettingsResult> {
  const s = await scope("owner");
  if (!s) return { ok: false, error: "Só o dono pode mudar as configurações." };
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os campos." };
  const d = p.data;
  const org = s.org ?? (await organizerFor(s.user));
  const clash = await db.query.organizers.findFirst({ where: and(eq(organizers.slug, d.slug), ne(organizers.id, org.id)), columns: { id: true } });
  if (clash) return { ok: false, error: "Esse endereço já está em uso. Escolha outro." };
  const prevPayout = (org.payout ?? {}) as Record<string, unknown>;
  const payoutChanged = (Object.keys(d.payout) as (keyof typeof d.payout)[]).some((k) => String(prevPayout[k] ?? "") !== String(d.payout[k] ?? ""));
  // para onde vão os saques: com o app autenticador ligado, trocar exige o código do app (sessão roubada não
  // redireciona o dinheiro). Sem o app, segue valendo só com a sessão, com aviso por e-mail e registro abaixo.
  if (payoutChanged && (await mfaSettings(s.user.id)).method === "totp") {
    if (!d.code) return { ok: false, error: PAYOUT_CODE, needsCode: true };
    // só o código do app (um código de recuperação não troca o destino do dinheiro, e não é gasto aqui)
    if (/[a-z]/i.test(d.code)) return { ok: false, error: "Use o código de 6 dígitos do app autenticador.", needsCode: true };
    const c = await checkSecondFactor(s.user.id, "bank", d.code);
    if (!c.ok) return { ok: false, error: c.error, needsCode: true };
  }
  await db.update(organizers).set({
    name: d.name, slug: d.slug, contactEmail: d.contactEmail || null, legalName: d.legalName || null, cnpj: d.cnpj || null,
    payout: d.payout, defaults: d.defaults,
  }).where(eq(organizers.id, org.id));
  // a conta de recebimento é para onde vão os saques: toda troca fica registrada e o dono é avisado por e-mail
  if (payoutChanged && (d.payout.pixKey || d.payout.account || org.payout)) {
    await logSecurity(s.user.id, "payout", "Conta de recebimento alterada");
    const to = s.user.email;
    if (to) after(() => mailSecurityNotice(to, "A conta de recebimento mudou", `A conta para receber os saques de ${d.name} na Tickets Win foi alterada para ${destLabel(d.payout)}. Os próximos saques vão para essa conta.`));
  }
  revalidatePath("/painel", "layout");
  return { ok: true };
}
