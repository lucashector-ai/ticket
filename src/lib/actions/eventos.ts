"use server";

import { and, count, eq, gt, inArray, isNotNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope } from "@/lib/data/painel";

const { events, orders, tickets } = schema;
type R = { ok: true } | { ok: false; error: string };
/** margem depois do fim da reserva para a confirmação do pagamento chegar (webhook atrasado) */
const PAYING_GRACE_MS = 5 * 60_000;

/**
 * Exclui um evento que ainda não vendeu (rascunho, teste, data que não vai acontecer).
 * Evento com ingresso vendido não pode sumir: quem comprou perderia o ingresso.
 */
export async function deleteEvent(eventId: string, confirmTitle: string): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const s = await getPainelScope(user);
  const ev = s.role === "portaria" ? null : s.events.find((e) => e.id === eventId);
  if (!ev) return { ok: false, error: "Evento não encontrado." };
  if (confirmTitle.trim().toLowerCase() !== ev.title.trim().toLowerCase()) return { ok: false, error: "Digite o nome do evento igual para confirmar." };
  const [[sold], [issued]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(and(eq(orders.eventId, ev.id), inArray(orders.status, ["paid", "refunded"]))),
    db.select({ n: count() }).from(tickets).where(eq(tickets.eventId, ev.id)),
  ]);
  if ((sold?.n ?? 0) > 0 || (issued?.n ?? 0) > 0) return { ok: false, error: "Este evento já tem ingressos vendidos e não pode ser excluído." };
  // alguém pagando agora (Pix gerado ou cartão em andamento): apagar o pedido deixaria o pagamento sem pedido,
  // sem ingresso e sem estorno automático quando a confirmação chegasse
  const [paying] = await db.select({ n: count() }).from(orders).where(and(
    eq(orders.eventId, ev.id), eq(orders.status, "pending"),
    or(gt(orders.expiresAt, new Date(Date.now() - PAYING_GRACE_MS)), isNotNull(orders.paidAt)),
  ));
  if ((paying?.n ?? 0) > 0) return { ok: false, error: "Tem gente pagando um pedido deste evento agora. Tente excluir de novo em 20 minutos." };
  // pedidos que não foram pagos (abandonados, expirados) saem junto
  await db.delete(orders).where(eq(orders.eventId, ev.id));
  await db.delete(events).where(eq(events.id, ev.id));
  revalidatePath("/painel");
  revalidatePath("/");
  return { ok: true };
}
