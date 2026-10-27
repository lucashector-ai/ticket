"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { heldByType } from "@/lib/holds";
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
    for (let k = 0; k < it.quantity; k++) shares.push({ ticketTypeId: tt.id, priceCents: tt.priceCents });
  }
  const code = randomToken(10);
  const [g] = await db.insert(groupOrders).values({
    code, eventId: ev.id, leaderUserId: user.id, leaderName: user.name ?? null, expiresAt: new Date(Date.now() + GROUP_MINUTES * 60_000),
  }).returning({ id: groupOrders.id });
  await db.insert(groupShares).values(shares.map((s, i) => ({ groupId: g.id, ticketTypeId: s.ticketTypeId, priceCents: s.priceCents, sortOrder: i })));
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
