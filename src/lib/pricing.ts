/** Cálculo do pedido, idêntico no navegador e no servidor. Valores em centavos. */

export const SERVICE_FEE_RATE = 0.1;
export const MAX_INSTALLMENTS = 6;
export const INTEREST_FREE_INSTALLMENTS = 3;

export type PricingLine = { ticketTypeId: string; priceCents: number; quantity: number };
export type PricingHolder = { ticketTypeId: string; meia: boolean };
export type PricingCoupon = { percentOff: number; amountOffCents: number } | null;

export function installmentRate(n: number) {
  return n <= INTEREST_FREE_INSTALLMENTS ? 0 : 0.0299 * n;
}

export function priceOrder(input: {
  lines: PricingLine[];
  holders: PricingHolder[];
  coupon: PricingCoupon;
  method: "pix" | "card";
  installments: number;
}) {
  const price = new Map(input.lines.map((l) => [l.ticketTypeId, l.priceCents]));
  const subtotal = input.lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
  const meia = input.holders.reduce((s, h) => s + (h.meia ? Math.round((price.get(h.ticketTypeId) ?? 0) / 2) : 0), 0);
  const afterMeia = subtotal - meia;
  const discount = input.coupon
    ? Math.min(afterMeia, Math.round((afterMeia * input.coupon.percentOff) / 100) + input.coupon.amountOffCents)
    : 0;
  const fee = Math.round((afterMeia - discount) * SERVICE_FEE_RATE);
  const base = afterMeia - discount + fee;
  const n = input.method === "card" ? Math.min(Math.max(1, Math.trunc(input.installments)), MAX_INSTALLMENTS) : 1;
  const interest = input.method === "card" && n > INTEREST_FREE_INSTALLMENTS ? Math.round(base * installmentRate(n)) : 0;
  return { subtotal, meia, discount, fee, base, installments: n, interest, total: base + interest };
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
