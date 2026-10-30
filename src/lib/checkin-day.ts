import { hourLabel, parts } from "@/lib/format";

/*
 * Portaria de evento com várias datas: cada tipo de ingresso é de uma data (sessão) e só entra nela.
 * A portaria está sempre "numa" sessão: a última que já abriu (portões, ou início, menos OPEN_BEFORE_MS).
 * Antes da primeira abrir, conta a primeira; depois da última, a última. Assim a madrugada de sábado para
 * domingo ainda é do sábado (festa que vira a noite) e o ingresso de domingo só passa quando o domingo abre.
 */

export type SessionWindow = { id: string; startAt: Date; doorsAt: Date | null; sortOrder?: number };

/** Quanto antes dos portões (ou do início) a portaria já aceita os ingressos da sessão. */
export const OPEN_BEFORE_MS = 2 * 3600_000;

const opensAt = (s: SessionWindow) => (s.doorsAt ?? s.startAt).getTime() - OPEN_BEFORE_MS;
const WD = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Sessão em que a portaria está agora (null = evento sem sessões). */
export function currentSession<S extends SessionWindow>(list: S[], now: Date): S | null {
  const sorted = [...list].sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  let cur: S | null = sorted[0] ?? null;
  for (const s of sorted) if (opensAt(s) <= now.getTime()) cur = s;
  return cur;
}

/** "sábado, 7/11" no fuso de São Paulo. */
function dayLabel(d: Date) {
  const p = parts(d);
  return `${WD[p.wd]}, ${p.d}/${p.m}`;
}

/**
 * Motivo para recusar um ingresso da sessão `ticketSessionId` agora, ou null se ele vale.
 * A mensagem diz ao operador para quando é o ingresso (o dia; com duas sessões no mesmo dia, também o horário).
 */
export function sessionRefusal(ticketSessionId: string, list: SessionWindow[], now: Date): string | null {
  const mine = list.find((s) => s.id === ticketSessionId);
  const cur = currentSession(list, now);
  if (!mine || !cur || cur.id === mine.id) return null;
  const sameDay = dayLabel(cur.startAt) === dayLabel(mine.startAt);
  return sameDay
    ? `Ingresso para a sessão das ${hourLabel(mine.startAt)} de ${dayLabel(mine.startAt)}: vale só nessa sessão.`
    : `Ingresso para ${dayLabel(mine.startAt)}: vale só nesse dia.`;
}
