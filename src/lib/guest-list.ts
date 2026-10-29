import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/*
 * Lista free (convidados não pagantes). Cada nome entra uma vez só (checkedInAt), com os
 * acompanhantes dele. Nada aqui cria pedido ou ingresso: a lista não aparece em vendas,
 * receita, revenda ou transferência. O QR do convite é "LISTA|<token>" (token aleatório de 128 bits).
 */

const g = schema.guestListEntries;

export const GUEST_MAX_PER_EVENT = 2000;
export const GUEST_MAX_PER_PASTE = 200;
export const GUEST_MAX_COMPANIONS = 10;

const QR_RE = /^LISTA\|([A-Za-z0-9_-]{22})$/;
export const newGuestToken = () => randomBytes(16).toString("base64url");
export const guestQrPayload = (token: string) => `LISTA|${token}`;
/** Token do QR de um convite da lista, ou null se não for um. */
export const guestTokenFrom = (input: string) => QR_RE.exec(input.trim())?.[1] ?? null;

/** Linha da lista para a portaria (sem e-mail). A conferência de documento fica a critério do local. */
export type DoorGuest = { id: string; name: string; guests: number; note: string; inAt: string | null; by: string | null };

export async function doorGuests(eventId: string): Promise<DoorGuest[]> {
  const rows = await db.select({ id: g.id, name: g.name, guests: g.guests, note: g.note, inAt: g.checkedInAt, by: g.checkedInBy })
    .from(g).where(eq(g.eventId, eventId)).orderBy(asc(g.name)).limit(GUEST_MAX_PER_EVENT);
  return rows.map((r) => ({ id: r.id, name: r.name, guests: r.guests, note: r.note ?? "", inAt: r.inAt?.toISOString() ?? null, by: r.by }));
}

/** Nomes na lista, pessoas (com acompanhantes) e quantos já entraram. */
export async function guestCounts(eventId: string) {
  const [c] = await db.select({
    names: sql<number>`count(*)`,
    people: sql<number>`coalesce(sum(1 + ${g.guests}), 0)`,
    namesIn: sql<number>`count(*) filter (where ${g.checkedInAt} is not null)`,
    peopleIn: sql<number>`coalesce(sum(1 + ${g.guests}) filter (where ${g.checkedInAt} is not null), 0)`,
  }).from(g).where(eq(g.eventId, eventId));
  return { names: Number(c?.names ?? 0), people: Number(c?.people ?? 0), namesIn: Number(c?.namesIn ?? 0), peopleIn: Number(c?.peopleIn ?? 0) };
}

export type GuestCheckin = {
  ok: boolean; error?: string; checkedInAt?: Date | null;
  guest?: { id: string; name: string; guests: number; event: string };
};

/**
 * Libera a entrada de um nome da lista (pelo id, na lista da portaria, ou pelo token do QR do convite).
 * `eventIds` = eventos que quem libera pode validar. Só marca se ainda não entrou: duas portarias
 * ao mesmo tempo não liberam o mesmo nome duas vezes.
 */
export async function checkinGuest(where: { id: string } | { token: string }, eventIds: Set<string> | null, by: string): Promise<GuestCheckin> {
  const e = await db.query.guestListEntries.findFirst({
    where: "id" in where ? eq(g.id, where.id) : eq(g.token, where.token),
    with: { event: { columns: { title: true } } },
  });
  if (!e) return { ok: false, error: "id" in where ? "Nome não encontrado na lista." : "Convite não encontrado: o nome pode ter saído da lista." };
  const guest = { id: e.id, name: e.name, guests: e.guests, event: e.event.title };
  if (eventIds && !eventIds.has(e.eventId)) return { ok: false, error: `Este convite é de outro evento (${e.event.title}).` };
  if (e.checkedInAt) return { ok: false, error: "Já entrou.", checkedInAt: e.checkedInAt, guest };
  const now = new Date();
  const done = await db.update(g).set({ checkedInAt: now, checkedInBy: by.slice(0, 120) })
    .where(and(eq(g.id, e.id), isNull(g.checkedInAt))).returning({ id: g.id });
  if (!done.length) {
    const again = await db.query.guestListEntries.findFirst({ where: eq(g.id, e.id), columns: { checkedInAt: true } });
    return { ok: false, error: "Já entrou.", checkedInAt: again?.checkedInAt ?? null, guest };
  }
  return { ok: true, checkedInAt: now, guest };
}

/** Texto do "tipo" mostrado no leitor para um convidado da lista. */
export const guestKind = (guests: number) => (guests ? `Entrada gratuita · +${guests} ${guests === 1 ? "acompanhante" : "acompanhantes"}` : "Entrada gratuita");

/** Endereço da imagem PNG do QR (para e-mail, que não mostra SVG). */
export const guestQrPngPath = (token: string) => `/api/lista/qr/${token}.png`;
export const companionsLabel = (n: number) => (n ? `+ ${n} ${n === 1 ? "acompanhante" : "acompanhantes"}` : "");

/**
 * Ingressos de lista do e-mail de uma conta (só com o e-mail confirmado: quem cria conta com o e-mail de
 * outra pessoa não vê o QR dela). Eventos publicados que não acabaram há mais de um dia.
 */
export async function listTicketsForEmail(email: string | null | undefined, verified: boolean) {
  if (!email || !verified) return [];
  const rows = await db.query.guestListEntries.findMany({
    where: sql`lower(${g.email}) = lower(${email})`,
    with: { event: { with: { venue: { with: { city: true } } } } },
    orderBy: [asc(g.createdAt)],
    limit: 50,
  });
  const now = Date.now();
  return rows.filter((r) => r.event.status === "published" && (r.event.endAt ?? r.event.startAt).getTime() + 86_400_000 > now);
}
