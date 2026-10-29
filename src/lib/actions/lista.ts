"use server";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope, type PainelRole } from "@/lib/data/painel";
import { emailEnabled } from "@/lib/email";
import {
  GUEST_MAX_COMPANIONS, GUEST_MAX_PER_EVENT, GUEST_MAX_PER_PASTE, checkinGuest, doorGuests, guestCounts, newGuestToken,
  type DoorGuest,
} from "@/lib/guest-list";
import { mailGuestInvites } from "@/lib/notify";

/*
 * Lista free do painel: dono e admins montam a lista (um por um ou colando vários), a equipe de
 * portaria só consulta e libera a entrada. Tudo conferido aqui no servidor: o evento tem que ser
 * do produtor de quem chama.
 */

const g = schema.guestListEntries;
type R = { ok: true } | { ok: false; error: string };
const RANK: Record<PainelRole, number> = { portaria: 0, admin: 1, owner: 2 };
const UUID = z.uuid();

async function scope(need: PainelRole, eventId: string) {
  if (!UUID.safeParse(eventId).success) return null;
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  if (RANK[s.role] < RANK[need] || !s.events.some((e) => e.id === eventId)) return null;
  return { user, ...s, by: (user.name || user.email || "Equipe").slice(0, 120) };
}
/** A entrada da lista e o escopo, se o evento dela for de quem chama. */
async function entryScope(need: PainelRole, id: string) {
  if (!UUID.safeParse(id).success) return null;
  const e = await db.query.guestListEntries.findFirst({ where: eq(g.id, id) });
  if (!e) return null;
  const s = await scope(need, e.eventId);
  return s ? { s, e } : null;
}
const touch = (eventId: string) => revalidatePath(`/painel/evento/${eventId}`);

/* ---------- montar a lista ---------- */

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const guestSchema = z.object({
  name: z.string().transform((v) => v.replace(/\s+/g, " ").trim()).pipe(z.string().min(2, "Nome muito curto.").max(120, "Nome muito longo.")),
  email: z.union([z.literal(""), z.email("E-mail inválido.").max(254)]),
  guests: z.number().int().min(0).max(GUEST_MAX_COMPANIONS, `No máximo ${GUEST_MAX_COMPANIONS} acompanhantes.`),
  note: z.string().trim().max(200, "Observação muito longa."),
});
export type GuestInput = z.input<typeof guestSchema>;
type Clean = z.output<typeof guestSchema>;

/** "Maria Souza; maria@x.com; +2" (ou separado por tab, vindo de planilha) → campos. A ordem não importa. */
function parseLine(line: string): GuestInput {
  const parts = (/[;\t]/.test(line) ? line.split(/[;\t]/) : line.split(",")).map((p) => p.trim()).filter(Boolean);
  const out: GuestInput = { name: "", email: "", guests: 0, note: "" };
  const rest: string[] = [];
  for (const p of parts) {
    if (!out.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) out.email = p.toLowerCase();
    else if (!out.guests && /^\+\s*\d{1,2}$/.test(p)) out.guests = Number(p.replace(/\D/g, ""));
    else rest.push(p);
  }
  out.name = rest.shift() ?? "";
  out.note = rest.join(" · ").slice(0, 200);
  return out;
}

type Skip = { line: string; reason: string };

/** Grava as linhas válidas que ainda não estão na lista (mesmo e-mail ou mesmo nome, sem diferença de maiúsculas e acentos = repetido). */
async function insertGuests(eventId: string, userId: string, rows: { raw: string; input: GuestInput }[]) {
  const existing = await db.select({ name: g.name, email: g.email }).from(g).where(eq(g.eventId, eventId));
  const emails = new Set(existing.map((x) => x.email?.toLowerCase()).filter(Boolean));
  const names = new Set(existing.map((x) => norm(x.name)));
  const room = GUEST_MAX_PER_EVENT - existing.length;
  const skipped: Skip[] = [];
  const ok: Clean[] = [];
  for (const { raw, input } of rows) {
    const p = guestSchema.safeParse(input);
    if (!p.success) { skipped.push({ line: raw, reason: p.error.issues[0]?.message ?? "Confira os dados." }); continue; }
    const d = p.data;
    const em = d.email.toLowerCase();
    if (em && emails.has(em)) { skipped.push({ line: raw, reason: "E-mail já está na lista." }); continue; }
    if (names.has(norm(d.name))) { skipped.push({ line: raw, reason: "Nome já está na lista." }); continue; }
    if (ok.length >= room) { skipped.push({ line: raw, reason: `A lista chegou ao limite de ${GUEST_MAX_PER_EVENT} nomes.` }); continue; }
    if (em) emails.add(em);
    names.add(norm(d.name));
    ok.push({ ...d, email: em });
  }
  const ids = ok.length
    ? await db.insert(g).values(ok.map((d) => ({
      eventId, name: d.name, email: d.email || null, guests: d.guests, note: d.note || null, token: newGuestToken(), addedByUserId: userId,
    }))).returning({ id: g.id, email: g.email })
    : [];
  return { ids, skipped };
}

type AddResult = { ok: true; added: number; invited: number; skipped: Skip[] } | { ok: false; error: string };

/** Um nome (formulário). `invite` manda o convite com QR para o e-mail, se houver. */
export async function addGuest(eventId: string, input: GuestInput, invite = false): Promise<AddResult> {
  const s = await scope("admin", eventId);
  if (!s) return { ok: false, error: "Sem permissão para este evento." };
  const p = guestSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os dados." };
  const { ids, skipped } = await insertGuests(eventId, s.user.id, [{ raw: input.name, input }]);
  if (!ids.length) return { ok: false, error: skipped[0]?.reason ?? "Não foi possível adicionar." };
  const invited = invite ? await sendInvites(ids) : 0;
  touch(eventId);
  return { ok: true, added: ids.length, invited, skipped };
}

/** Vários nomes colados, um por linha: "Nome; e-mail; +2" (e-mail e acompanhantes são opcionais). */
export async function addGuestsBulk(eventId: string, text: string, invite = false): Promise<AddResult> {
  const s = await scope("admin", eventId);
  if (!s) return { ok: false, error: "Sem permissão para este evento." };
  const lines = String(text ?? "").slice(0, 60_000).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: "Cole pelo menos um nome." };
  if (lines.length > GUEST_MAX_PER_PASTE) return { ok: false, error: `Cole no máximo ${GUEST_MAX_PER_PASTE} nomes por vez (você colou ${lines.length}).` };
  const { ids, skipped } = await insertGuests(eventId, s.user.id, lines.map((raw) => ({ raw: raw.slice(0, 120), input: parseLine(raw) })));
  const invited = invite ? await sendInvites(ids) : 0;
  if (ids.length) touch(eventId);
  return { ok: true, added: ids.length, invited, skipped: skipped.slice(0, 50) };
}

export async function removeGuest(id: string): Promise<R> {
  const x = await entryScope("admin", id);
  if (!x) return { ok: false, error: "Nome não encontrado." };
  if (x.e.checkedInAt) return { ok: false, error: "Essa pessoa já entrou. Desfaça a entrada antes de remover." };
  await db.delete(g).where(and(eq(g.id, id), isNull(g.checkedInAt)));
  touch(x.e.eventId);
  return { ok: true };
}

/** Corrige uma liberação feita por engano (só dono e admins). */
export async function undoGuestCheckin(id: string): Promise<R> {
  const x = await entryScope("admin", id);
  if (!x) return { ok: false, error: "Nome não encontrado." };
  await db.update(g).set({ checkedInAt: null, checkedInBy: null }).where(eq(g.id, id));
  touch(x.e.eventId);
  return { ok: true };
}

/* ---------- convite por e-mail ---------- */

/** Envia (em segundo plano) o convite com o QR da lista para quem tem e-mail; devolve quantos vão sair. */
async function sendInvites(rows: { id: string; email: string | null }[]) {
  if (!emailEnabled()) return 0;
  const list = rows.filter((r) => r.email);
  if (!list.length) return 0;
  await db.update(g).set({ invitedAt: new Date() }).where(inArray(g.id, list.map((r) => r.id)));
  after(() => mailGuestInvites(list.map((r) => r.id)));
  return list.length;
}

export async function inviteGuest(id: string): Promise<R> {
  const x = await entryScope("admin", id);
  if (!x) return { ok: false, error: "Nome não encontrado." };
  if (!x.e.email) return { ok: false, error: "Esse nome não tem e-mail." };
  if (!emailEnabled()) return { ok: false, error: "O envio de e-mails não está ligado neste ambiente." };
  if (x.e.invitedAt && Date.now() - x.e.invitedAt.getTime() < 10 * 60_000) return { ok: false, error: "O ingresso de lista acabou de ser enviado. Espere alguns minutos para reenviar." };
  await sendInvites([{ id: x.e.id, email: x.e.email }]);
  touch(x.e.eventId);
  return { ok: true };
}

/** Convite para todos da lista com e-mail que ainda não receberam. */
export async function inviteAllPending(eventId: string): Promise<{ ok: true; invited: number } | { ok: false; error: string }> {
  const s = await scope("admin", eventId);
  if (!s) return { ok: false, error: "Sem permissão para este evento." };
  if (!emailEnabled()) return { ok: false, error: "O envio de e-mails não está ligado neste ambiente." };
  const rows = await db.select({ id: g.id, email: g.email }).from(g)
    .where(and(eq(g.eventId, eventId), isNotNull(g.email), isNull(g.invitedAt), isNull(g.checkedInAt))).limit(GUEST_MAX_PER_PASTE);
  const invited = await sendInvites(rows);
  if (invited) touch(eventId);
  return { ok: true, invited };
}

/* ---------- portaria pelo painel (conta da equipe) ---------- */

export type DoorList = { ok: true; guests: DoorGuest[]; counts: Awaited<ReturnType<typeof guestCounts>> } | { ok: false; error: string };

/** Lista para a portaria (sem e-mail). */
export async function painelDoorGuests(eventId: string): Promise<DoorList> {
  const s = await scope("portaria", eventId);
  if (!s) return { ok: false, error: "Sem permissão para este evento." };
  const [guests, counts] = await Promise.all([doorGuests(eventId), guestCounts(eventId)]);
  return { ok: true, guests, counts };
}

export async function painelReleaseGuest(eventId: string, id: string): Promise<{ ok: boolean; error?: string; inAt?: string | null; name?: string; guests?: number }> {
  const s = await scope("portaria", eventId);
  if (!s || !UUID.safeParse(id).success) return { ok: false, error: "Sem permissão para este evento." };
  const r = await checkinGuest({ id }, new Set([eventId]), s.by);
  if (r.ok) touch(eventId);
  return { ok: r.ok, error: r.error, inAt: r.checkedInAt?.toISOString() ?? null, name: r.guest?.name, guests: r.guest?.guests };
}
