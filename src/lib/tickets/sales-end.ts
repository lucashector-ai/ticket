/*
 * Fim das vendas: nada se reserva, se emite ou se paga depois que o evento (ou a data, em evento de várias
 * datas) terminou. "Terminou" segue a regra que a vitrine já usa (home, Explorar, revenda: coalesce(end_at,
 * start_at)): o horário de término do evento ou, sem término, o horário de início. Os horários são gravados com
 * fuso (timestamptz, convertidos do horário de Brasília na criação), então a comparação com "agora" já respeita
 * o fuso do evento.
 *
 * Várias datas: só a última data tem término gravado (events.end_at). As outras terminam depois da mesma
 * duração da última (término − início da última data), nunca depois do término do evento.
 */
type EndRow = { startAt: Date; endAt: Date | null };
type SessRow = { id: string; startAt: Date };
type TypeRow = { id: string; sessionId: string | null };
export type SalesEndEvent = EndRow & { sessions: SessRow[]; ticketTypes: TypeRow[] };

export const SALES_ENDED = "As vendas deste evento já encerraram.";
export const SALES_ENDED_DATE = "As vendas desta data já encerraram. Escolha outra data.";

/** a duração usada nas outras datas fica entre 0 e 24 h (dado estranho não estende a venda) */
const MAX_SESSION_MS = 24 * 3_600_000;

/** Fim do evento: término ou, sem término, o início (a mesma regra da vitrine). */
export const eventEndsAt = (e: EndRow) => e.endAt ?? e.startAt;

/** Fim de uma data (sessão) do evento; sem data (ou data desconhecida), o fim do evento. */
export function sessionEndsAt(e: EndRow & { sessions: SessRow[] }, sessionId: string | null | undefined): Date {
  const end = eventEndsAt(e);
  const s = sessionId ? e.sessions.find((x) => x.id === sessionId) : undefined;
  if (!s || e.sessions.length < 2) return end;
  const last = e.sessions.reduce((a, b) => (b.startAt > a.startAt ? b : a));
  if (s.id === last.id) return end;
  const dur = e.endAt ? Math.min(MAX_SESSION_MS, Math.max(0, e.endAt.getTime() - last.startAt.getTime())) : 0;
  return new Date(Math.min(s.startAt.getTime() + dur, end.getTime()));
}

/**
 * Motivo para recusar a venda dos tipos pedidos porque o evento ou a data deles já terminou (null = pode vender).
 * Sem tipos, confere o evento todo.
 */
export function salesEndedError(e: SalesEndEvent, typeIds: readonly string[] = [], now = new Date()): string | null {
  if (eventEndsAt(e) <= now) return SALES_ENDED;
  for (const id of typeIds) {
    const t = e.ticketTypes.find((x) => x.id === id);
    if (t?.sessionId && sessionEndsAt(e, t.sessionId) <= now) return SALES_ENDED_DATE;
  }
  return null;
}

/** As vendas do evento todo já encerraram? (página do evento, checkout, vitrine) */
export const salesEnded = (e: EndRow, now = new Date()) => eventEndsAt(e) <= now;

/** A data deste tipo de ingresso já terminou? (o tipo aparece "Encerrado") */
export const typeSalesEnded = (e: EndRow & { sessions: SessRow[] }, t: { sessionId: string | null }, now = new Date()) => sessionEndsAt(e, t.sessionId) <= now;
