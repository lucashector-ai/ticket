/** Cálculo do pedido, idêntico no navegador e no servidor. Valores em centavos. */

export const SERVICE_FEE_RATE = 0.0799;
export const MAX_INSTALLMENTS = 6;
export const INTEREST_FREE_INSTALLMENTS = 3;

/** `sector` limita cupons de setor; `meiaOk: false` = tipo já tem preço próprio (meia, social...), sem meia no checkout. */
export type PricingLine = { ticketTypeId: string; priceCents: number; quantity: number; sector?: string | null; meiaOk?: boolean };
export type PricingHolder = { ticketTypeId: string; meia: boolean };
/** `amountPerTicket`: o desconto em R$ vale por ingresso; `sector`: só para ingressos desse setor. */
export type PricingCoupon = { percentOff: number; amountOffCents: number; amountPerTicket?: boolean; sector?: string | null } | null;

export function installmentRate(n: number) {
  return n <= INTEREST_FREE_INSTALLMENTS ? 0 : 0.0299 * n;
}

export function priceOrder(input: {
  lines: PricingLine[];
  holders: PricingHolder[];
  coupon: PricingCoupon;
  method: "pix" | "card";
  installments: number;
  /** 0 quando o produtor absorve a taxa */
  feeRate?: number;
}) {
  const line = new Map(input.lines.map((l) => [l.ticketTypeId, l]));
  const halfOf = (h: PricingHolder) => {
    const l = line.get(h.ticketTypeId);
    return h.meia && l && l.meiaOk !== false ? Math.round(l.priceCents / 2) : 0;
  };
  const subtotal = input.lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const meia = input.holders.reduce((s, h) => s + halfOf(h), 0);
  const afterMeia = subtotal - meia;
  let discount = 0;
  const c = input.coupon;
  if (c) {
    const ok = (l: PricingLine) => !c.sector || l.sector === c.sector;
    const eligible = input.lines.filter(ok);
    const base = eligible.reduce((s, l) => s + l.priceCents * l.quantity, 0)
      - input.holders.reduce((s, h) => s + (eligible.some((l) => l.ticketTypeId === h.ticketTypeId) ? halfOf(h) : 0), 0);
    const units = eligible.reduce((s, l) => s + l.quantity, 0);
    const amount = c.amountPerTicket ? c.amountOffCents * units : c.amountOffCents;
    discount = Math.min(base, Math.round((base * c.percentOff) / 100) + amount);
  }
  const fee = Math.round((afterMeia - discount) * (input.feeRate ?? SERVICE_FEE_RATE));
  const base = afterMeia - discount + fee;
  const n = input.method === "card" ? Math.min(Math.max(1, Math.trunc(input.installments)), MAX_INSTALLMENTS) : 1;
  const interest = input.method === "card" && n > INTEREST_FREE_INSTALLMENTS ? Math.round(base * installmentRate(n)) : 0;
  return { subtotal, meia, discount, fee, base, installments: n, interest, total: base + interest };
}

/**
 * Divide a taxa do pedido (calculada sobre o total, como em priceOrder) entre as linhas, proporcional ao
 * valor de cada uma, pelo maior resto: a soma das partes é exatamente `fee`. Serve para mostrar a taxa por
 * linha sem a diferença de centavos que aparece ao arredondar ingresso a ingresso (2 × 43,95 ≠ 87,89).
 */
export function feeShares(fee: number, amounts: number[]): number[] {
  const total = amounts.reduce((s, a) => s + Math.max(0, a), 0);
  if (!total || fee <= 0) return amounts.map(() => 0);
  const raw = amounts.map((a) => (Math.max(0, a) * fee) / total);
  const out = raw.map(Math.floor);
  let rest = fee - out.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

/** Opções de parcelamento para um valor base (sem juros). */
export function installmentOptions(baseCents: number) {
  return Array.from({ length: MAX_INSTALLMENTS }, (_, i) => {
    const k = i + 1;
    const total = Math.round(baseCents * (1 + installmentRate(k)));
    return { n: k, totalCents: total, eachCents: Math.round(total / k), interestFree: k <= INTEREST_FREE_INSTALLMENTS };
  });
}

/** Valor com centavos sempre, no padrão do checkout: "R$ 242,00". */
export function money(cents: number) {
  return "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
