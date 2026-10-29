/*
 * Regras de cancelamento, transferência e revenda de um evento (usadas no servidor e no navegador).
 *
 * Direito de arrependimento (CDC, art. 49, como está nos Termos): o comprador cancela em até 7 dias depois
 * do pagamento, desde que faltem mais de 48 horas para o evento, com reembolso integral (taxa inclusa).
 * Vale sempre, em qualquer evento. Por cima disso o produtor pode liberar o cancelamento até X horas antes
 * do evento e, só para os cancelamentos fora dos 7 dias, ficar com a taxa de serviço (keepFee).
 */

export type CancelPolicy = { mode: "legal" | "until"; hoursBefore: number; keepFee: boolean };

export const LEGAL_DAYS = 7;
export const LEGAL_MIN_HOURS = 48;
/** Depois do anúncio do adiamento, o comprador tem esses dias para pedir reembolso (Termos, item 4). */
export const POSTPONE_REFUND_DAYS = 7;
const H = 3_600_000;

export const DEFAULT_POLICY: CancelPolicy = { mode: "legal", hoursBefore: 48, keepFee: false };
/** Opções do painel para "cancelar até X antes do evento". */
export const POLICY_HOURS = [24, 48, 72, 168, 360, 720] as const;
/** Opções do painel para os prazos de transferência e revenda (0 = até o início). */
export const DEADLINE_HOURS = [0, 2, 6, 12, 24, 48, 72] as const;

export function policyOf(e: { cancelPolicy?: Partial<CancelPolicy> | null }): CancelPolicy {
  const p = e.cancelPolicy;
  if (!p || p.mode !== "until") return DEFAULT_POLICY;
  const h = Number(p.hoursBefore);
  return { mode: "until", hoursBefore: Number.isFinite(h) && h >= 1 && h <= 24 * 90 ? Math.round(h) : 48, keepFee: !!p.keepFee };
}

/** "48 horas", "7 dias", "1 dia". */
export function hoursLabel(h: number) {
  if (h % 24 === 0 && h >= 24) { const d = h / 24; return `${d} ${d === 1 ? "dia" : "dias"}`; }
  return `${h} ${h === 1 ? "hora" : "horas"}`;
}

/** Texto da política mostrado na página do evento e no ingresso. */
export function policyText(p: CancelPolicy): string {
  const legal = `Você pode cancelar em até ${LEGAL_DAYS} dias após a compra, desde que faltem mais de ${LEGAL_MIN_HOURS} horas para o evento, com reembolso integral (direito de arrependimento).`;
  if (p.mode === "legal") return `${legal} Depois disso, o ingresso não é reembolsável, mas você pode transferir ou revender se o evento permitir.`;
  return `${legal} Fora desse prazo, o cancelamento pelo site vale até ${hoursLabel(p.hoursBefore)} antes do início, com reembolso ${p.keepFee ? "do valor do ingresso, sem a taxa de serviço" : "integral, taxa de serviço inclusa"}.`;
}

/** Regras fixas da Tickets Win para cancelamento e adiamento (mostradas junto com a política). */
export const EVENT_RULES = "Evento cancelado: reembolso integral e automático, com a taxa de serviço. Evento adiado: o ingresso vale para a nova data, e dá para pedir o reembolso em até 7 dias após o anúncio.";

export type CancelWindow =
  | { allowed: true; legal: boolean; keepFee: boolean; until: Date }
  | { allowed: false; reason: string };

/**
 * O comprador pode cancelar agora? `legal`: dentro do direito de arrependimento (reembolso integral).
 * `keepFee`: fora dele, numa política que fica com a taxa. `until`: até quando vale.
 */
export function cancelWindow(p: CancelPolicy, o: { paidAt: Date; startAt: Date; now?: Date }): CancelWindow {
  const now = (o.now ?? new Date()).getTime();
  const start = o.startAt.getTime();
  if (now >= start) return { allowed: false, reason: "O evento já começou." };
  const legalUntil = Math.min(o.paidAt.getTime() + LEGAL_DAYS * 24 * H, start - LEGAL_MIN_HOURS * H);
  const policyUntil = p.mode === "until" ? start - p.hoursBefore * H : -Infinity;
  if (now <= legalUntil) return { allowed: true, legal: true, keepFee: false, until: new Date(Math.max(legalUntil, policyUntil)) };
  if (now <= policyUntil) return { allowed: true, legal: false, keepFee: p.keepFee, until: new Date(policyUntil) };
  return {
    allowed: false,
    reason: p.mode === "until"
      ? `O prazo para cancelar acabou ${hoursLabel(p.hoursBefore)} antes do evento.`
      : `O prazo de ${LEGAL_DAYS} dias após a compra (com mais de ${LEGAL_MIN_HOURS} horas para o evento) já passou.`,
  };
}

/** Prazo de transferência/revenda: aberto até `hours` horas antes do início (0 = até o início). */
export function deadlineOpen(startAt: Date, hours: number, now = new Date()) {
  return now.getTime() < startAt.getTime() - Math.max(0, hours) * H;
}
export function deadlineLabel(hours: number) {
  return hours > 0 ? `até ${hoursLabel(hours)} antes do início` : "até o início do evento";
}
