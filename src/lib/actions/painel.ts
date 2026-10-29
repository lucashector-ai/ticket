"use server";

import { randomBytes } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { checkinTicket, type CheckinResult } from "@/lib/checkin";
import { organizerFor } from "@/lib/criar/save";
import { getPainelScope, type PainelRole } from "@/lib/data/painel";
import { mailSecurityNotice, mailTeamInvite } from "@/lib/notify";
import { destLabel } from "@/lib/bank";
import { logSecurity } from "@/lib/mfa";
import { newAccessCode } from "@/lib/portaria";
import { AGES, parseBrDateTime } from "@/lib/criar/model";

const { coupons, organizerMembers, organizers } = schema;
type R = { ok: true } | { ok: false; error: string };
const RANK: Record<PainelRole, number> = { portaria: 0, admin: 1, owner: 2 };

async function scope(need: PainelRole) {
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  return RANK[s.role] >= RANK[need] ? { user, ...s } : null;
}

/* ---------- check-in (portaria) ---------- */

export async function scanTicket(eventId: string, input: string): Promise<Omit<CheckinResult, "status"> & { auth: boolean }> {
  const s = await scope("portaria");
  if (!s || !s.events.some((e) => e.id === eventId)) return { ok: false, auth: false, error: "Sem permissão para este evento." };
  const r = await checkinTicket(input, new Set([eventId]), s.user.name || s.user.email || "Equipe");
  return { ok: r.ok, error: r.error, checkedInAt: r.checkedInAt, ticket: r.ticket, auth: true };
}

/* ---------- check-in pelo celular: links externos ---------- */

export async function createCheckinLink(eventId: string, label: string): Promise<{ ok: true; id: string; token: string; code: string } | { ok: false; error: string }> {
  const s = await scope("admin");
  if (!s || !s.events.some((e) => e.id === eventId)) return { ok: false, error: "Sem permissão para este evento." };
  const name = label.trim().slice(0, 60) || "Portaria";
  const open = await db.select({ id: schema.checkinLinks.id }).from(schema.checkinLinks)
    .where(and(eq(schema.checkinLinks.eventId, eventId), isNull(schema.checkinLinks.revokedAt)));
  if (open.length >= 20) return { ok: false, error: "Este evento já tem 20 links ativos. Desligue algum antes de criar outro." };
  const token = randomBytes(18).toString("base64url");
  // código curto para digitar no app da portaria (único; tenta de novo no raro caso de colisão)
  for (let i = 0; i < 5; i++) {
    const code = newAccessCode();
    const [row] = await db.insert(schema.checkinLinks).values({ eventId, token, code, label: name, createdByUserId: s.user.id }).onConflictDoNothing().returning({ id: schema.checkinLinks.id });
    if (!row) continue;
    revalidatePath(`/painel/evento/${eventId}`);
    return { ok: true, id: row.id, token, code };
  }
  return { ok: false, error: "Não foi possível criar o acesso. Tente de novo." };
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

export async function setMemberRole(memberId: string, role: string): Promise<R> {
  const s = await scope("owner");
  const r = roleSchema.safeParse(role);
  if (!s?.org || !r.success) return { ok: false, error: "Sem permissão." };
  await db.update(organizerMembers).set({ role: r.data }).where(and(eq(organizerMembers.id, memberId), eq(organizerMembers.organizerId, s.org.id)));
  revalidatePath("/painel/equipe");
  return { ok: true };
}

export async function removeMember(memberId: string): Promise<R> {
  const s = await scope("owner");
  if (!s?.org) return { ok: false, error: "Sem permissão." };
  await db.delete(organizerMembers).where(and(eq(organizerMembers.id, memberId), eq(organizerMembers.organizerId, s.org.id)));
  revalidatePath("/painel/equipe");
  return { ok: true };
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
});
export type SettingsInput = z.input<typeof settingsSchema>;

export async function saveSettings(input: SettingsInput): Promise<R> {
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
