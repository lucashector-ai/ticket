import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "@/db";

/*
 * Fases da venda de um evento:
 *   soon     antes da pré-venda (ou da abertura, se não houver pré-venda): contagem regressiva + "me avise"
 *   presale  pré-venda em andamento: só quem tem o link secreto (cookie) compra
 *   open     vendas abertas para todos
 */
export type SalePhase = "soon" | "presale" | "open";
type LaunchRow = { salesOpenAt: Date | null; presaleAt: Date | null };

export function salePhase(e: LaunchRow, now = new Date()): SalePhase {
  if (!e.salesOpenAt || e.salesOpenAt <= now) return "open";
  if (e.presaleAt && e.presaleAt <= now) return "presale";
  return "soon";
}

/** Cookie com o token da pré-venda daquele evento (gravado por /pv/<token>). */
export const presaleCookie = (eventId: string) => `tw_pv_${eventId.replace(/-/g, "").slice(0, 12)}`;

/** Cadastro da pré-venda dono do cookie, se ainda puder ser usado. */
export async function presaleAccess(eventId: string) {
  const token = (await cookies()).get(presaleCookie(eventId))?.value;
  if (!token) return null;
  return (await db.query.eventSignups.findFirst({
    where: and(eq(schema.eventSignups.token, token), eq(schema.eventSignups.eventId, eventId), eq(schema.eventSignups.kind, "presale"), isNull(schema.eventSignups.usedAt)),
  })) ?? null;
}

/** Pode comprar agora? Na pré-venda, devolve também o cadastro que libera a compra. */
export async function canBuy(e: LaunchRow & { id: string }): Promise<{ ok: true; presaleSignupId: string | null } | { ok: false; phase: SalePhase }> {
  const phase = salePhase(e);
  if (phase === "open") return { ok: true, presaleSignupId: null };
  if (phase === "presale") {
    const s = await presaleAccess(e.id);
    if (s) return { ok: true, presaleSignupId: s.id };
  }
  return { ok: false, phase };
}

/** Token curto e difícil de adivinhar para links (pré-venda, parceiro, grupo). */
export function randomToken(len = 24) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}
