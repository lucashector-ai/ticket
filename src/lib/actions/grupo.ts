"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { capacityOkSql, heldByType, stockLockKeys } from "@/lib/holds";
import { abortOf, ensure, lockKeys, runBatch } from "@/lib/payments/tx";
import { canBuy, randomToken } from "@/lib/launch";
import { queueAllows } from "@/lib/queue";
import { tierStatus } from "@/lib/tickets/status";

const { events, groupOrders, groupShares } = schema;
/** quanto tempo o grupo segura as vagas para os amigos pagarem */
const GROUP_MINUTES = 60;

const groupSchema = z.object({
  eventSlug: z.string().min(1),
  items: z.array(z.object({ ticketTypeId: z.uuid(), quantity: z.number().int().min(1).max(20) })).min(1),
});

const ONE_GROUP = "Você já tem um grupo aberto neste evento. Compartilhe o link dele ou cancele-o para montar outro.";

/** O grupo aberto (dentro do prazo) que esta pessoa criou para o evento, o mais antigo primeiro. */
async function openGroupOf(userId: string, eventId: string) {
  const [g] = await db.select({ id: groupOrders.id }).from(groupOrders)
    .where(and(eq(groupOrders.leaderUserId, userId), eq(groupOrders.eventId, eventId), eq(groupOrders.status, "open"), gt(groupOrders.expiresAt, new Date())))
    .orderBy(asc(groupOrders.createdAt), asc(groupOrders.id)).limit(1);
  return g?.id ?? null;
}

/** Reserva os ingressos para um grupo: cada amigo paga a própria parte pelo link em até 60 min. */
export async function createGroup(input: z.input<typeof groupSchema>): Promise<{ ok: true; code: string } | { ok: false; error: string; needsLogin?: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta para montar o grupo.", needsLogin: true };
  const p = groupSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Escolha os ingressos do grupo." };
  const ev = await db.query.events.findFirst({ where: eq(events.slug, p.data.eventSlug), with: { ticketTypes: true } });
  if (!ev || ev.status !== "published") return { ok: false, error: "Evento indisponível." };
  if (!(await canBuy(ev)).ok) return { ok: false, error: "As vendas deste evento ainda não abriram." };
  if (!(await queueAllows(ev))) return { ok: false, error: "Você está na fila virtual. Aguarde a sua vez." };
  // um grupo aberto por pessoa em cada evento (D-01): vários grupos virariam um jeito de passar do limite por pessoa
  if (await openGroupOf(user.id, ev.id)) return { ok: false, error: ONE_GROUP };
  const total = p.data.items.reduce((s, i) => s + i.quantity, 0);
  if (total < 2) return { ok: false, error: "Um grupo precisa de pelo menos 2 ingressos." };
  if (total > ev.maxPerOrder) return { ok: false, error: `Máximo de ${ev.maxPerOrder} ingressos por grupo.` };
  const held = await heldByType(ev.id);
  const shares: { ticketTypeId: string; priceCents: number }[] = [];
  for (const it of p.data.items) {
    const tt = ev.ticketTypes.find((t) => t.id === it.ticketTypeId);
    if (!tt || tierStatus(tt) !== "open") return { ok: false, error: "Um dos lotes não está mais disponível." };
    const left = tt.quantity - tt.sold - (held.get(tt.id) ?? 0);
    if (it.quantity > left) return { ok: false, error: `Restam só ${Math.max(0, left)} ingressos em ${tt.name}.` };
    if (!tt.priceCents) return { ok: false, error: "Ingresso grátis não entra na compra em grupo: cada pessoa garante o seu." };
    for (let k = 0; k < it.quantity; k++) shares.push({ ticketTypeId: tt.id, priceCents: tt.priceCents });
  }
  const code = randomToken(10);
  // grupo e vagas numa transação só, com a mesma trava e conferência de lugares do pedido (compra.ts): se outra
  // pessoa reservou os últimos lugares antes, o grupo não é gravado
  const g = { id: randomUUID() };
  const typeIds = [...new Set(shares.map((s) => s.ticketTypeId))];
  try {
    await runBatch([
      lockKeys(stockLockKeys(typeIds)),
      db.insert(groupOrders).values({
        id: g.id, code, eventId: ev.id, leaderUserId: user.id, leaderName: user.name ?? null, expiresAt: new Date(Date.now() + GROUP_MINUTES * 60_000),
      }),
      db.insert(groupShares).values(shares.map((s, i) => ({ groupId: g.id, ticketTypeId: s.ticketTypeId, priceCents: s.priceCents, sortOrder: i }))),
      ensure(capacityOkSql(ev.id, typeIds), "stock"),
    ]);
  } catch (e) {
    if (abortOf(e) === "stock") return { ok: false, error: "Outra pessoa acabou de reservar os últimos ingressos. Confira o que ainda resta e tente de novo." };
    throw e;
  }
  // dois grupos da mesma pessoa criados no mesmo instante: fica o primeiro
  const first = await openGroupOf(user.id, ev.id);
  if (first && first !== g.id) {
    await db.update(groupOrders).set({ status: "cancelled" }).where(eq(groupOrders.id, g.id));
    return { ok: false, error: ONE_GROUP };
  }
  return { ok: true, code };
}

/** Quem criou o grupo pode desfazer: as vagas não pagas voltam para a venda (quem já pagou continua com o ingresso). */
export async function cancelGroup(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const r = await db.update(groupOrders).set({ status: "cancelled" })
    .where(and(eq(groupOrders.code, code), eq(groupOrders.leaderUserId, user.id), eq(groupOrders.status, "open"))).returning({ id: groupOrders.id });
  return r.length ? { ok: true } : { ok: false, error: "Só quem criou o grupo pode cancelar." };
}
