import { describe, expect, it } from "vitest";
import { feeShares, installmentOptions, priceOrder, SERVICE_FEE_RATE } from "@/lib/pricing";

const line = (priceCents: number, quantity: number, extra: Partial<{ ticketTypeId: string; sector: string | null; meiaOk: boolean }> = {}) =>
  ({ ticketTypeId: extra.ticketTypeId ?? "a", priceCents, quantity, sector: extra.sector ?? null, meiaOk: extra.meiaOk });

describe("priceOrder", () => {
  it("cobra a taxa de 7,99% sobre o total, arredondada uma vez", () => {
    const p = priceOrder({ lines: [line(55_000, 2)], holders: [], coupon: null, method: "pix", installments: 1 });
    expect(SERVICE_FEE_RATE).toBe(0.0799);
    expect(p.subtotal).toBe(110_000);
    expect(p.fee).toBe(8_789); // 1100 × 7,99% = 87,89 (e não 2 × 43,95)
    expect(p.total).toBe(118_789);
  });

  it("produtor absorvendo a taxa (feeRate 0) não cobra taxa", () => {
    const p = priceOrder({ lines: [line(10_000, 1)], holders: [], coupon: null, method: "pix", installments: 1, feeRate: 0 });
    expect(p.fee).toBe(0);
    expect(p.total).toBe(10_000);
  });

  it("meia-entrada só em tipo que aceita meia e a taxa incide depois da meia", () => {
    const lines = [line(10_000, 2, { ticketTypeId: "int" }), line(5_000, 1, { ticketTypeId: "meia", meiaOk: false })];
    const holders = [{ ticketTypeId: "int", meia: true }, { ticketTypeId: "int", meia: false }, { ticketTypeId: "meia", meia: true }];
    const p = priceOrder({ lines, holders, coupon: null, method: "pix", installments: 1 });
    expect(p.meia).toBe(5_000);
    expect(p.fee).toBe(Math.round(20_000 * 0.0799));
    expect(p.total).toBe(20_000 + Math.round(20_000 * 0.0799));
  });

  it("cupom percentual e em reais por ingresso, limitado ao valor e ao setor", () => {
    const lines = [line(10_000, 2, { ticketTypeId: "pista", sector: "Pista" }), line(30_000, 1, { ticketTypeId: "camarote", sector: "Camarote" })];
    const pct = priceOrder({ lines, holders: [], coupon: { percentOff: 10, amountOffCents: 0, sector: "Pista" }, method: "pix", installments: 1 });
    expect(pct.discount).toBe(2_000);
    const per = priceOrder({ lines, holders: [], coupon: { percentOff: 0, amountOffCents: 1_500, amountPerTicket: true }, method: "pix", installments: 1 });
    expect(per.discount).toBe(4_500);
    const all = priceOrder({ lines, holders: [], coupon: { percentOff: 100, amountOffCents: 99_999 }, method: "pix", installments: 1 });
    expect(all.discount).toBe(50_000);
    expect(all.total).toBe(0);
  });

  it("parcelamento: até 3x sem juros, juros a partir de 4x, no máximo 6x e Pix sem juros", () => {
    const base = { lines: [line(10_000, 1)], holders: [], coupon: null };
    expect(priceOrder({ ...base, method: "card", installments: 3 }).interest).toBe(0);
    const four = priceOrder({ ...base, method: "card", installments: 4 });
    expect(four.interest).toBe(Math.round(four.base * 0.0299 * 4));
    expect(priceOrder({ ...base, method: "card", installments: 12 }).installments).toBe(6);
    expect(priceOrder({ ...base, method: "pix", installments: 6 }).interest).toBe(0);
    expect(installmentOptions(10_000).map((o) => o.interestFree)).toEqual([true, true, true, false, false, false]);
  });
});

describe("feeShares", () => {
  it("as partes somam exatamente a taxa do pedido", () => {
    expect(feeShares(8_789, [110_000])).toEqual([8_789]);
    const parts = feeShares(Math.round(33_333 * 0.0799), [11_111, 11_111, 11_111]);
    expect(parts.reduce((s, v) => s + v, 0)).toBe(Math.round(33_333 * 0.0799));
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });
  it("proporcional ao valor de cada linha e zero sem taxa", () => {
    expect(feeShares(300, [10_000, 20_000])).toEqual([100, 200]);
    expect(feeShares(0, [10_000, 20_000])).toEqual([0, 0]);
    expect(feeShares(100, [0, 0])).toEqual([0, 0]);
  });
});
