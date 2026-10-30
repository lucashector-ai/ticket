import { describe, expect, it } from "vitest";
import { MEIA_OUT, meiaOut, overLimit, roomFor, type LimitTier } from "@/lib/tickets/limits";

const tiers: LimitTier[] = [
  { id: "int", name: "Inteira", status: "open", available: 100, limit: 6 },
  { id: "meia", name: "Meia", status: "open", available: 100, limit: 6 },
  { id: "pouco", name: "Último lote", status: "open", available: 2, limit: 6 },
  { id: "fechado", name: "Fechado", status: "sold_out", available: 0, limit: 6 },
];

describe("roomFor (escolha na página do evento)", () => {
  it("o limite por pessoa é por tipo: 6 Inteira ainda deixa escolher Meia", () => {
    expect(roomFor(tiers, 8, { int: 6 }, "int").left).toBe(0);
    expect(roomFor(tiers, 8, { int: 6 }, "int").reason).toMatch(/limite é 6 ingressos de Inteira por pessoa/);
    expect(roomFor(tiers, 8, { int: 6 }, "meia").left).toBe(2);
  });
  it("o máximo por compra soma todos os tipos", () => {
    const r = roomFor(tiers, 8, { int: 6, meia: 2 }, "meia");
    expect(r.left).toBe(0);
    expect(r.reason).toMatch(/Máximo de 8 ingressos por compra/);
  });
  it("conta o que a pessoa já comprou (conta e CPF)", () => {
    const owned = tiers.map((t) => (t.id === "int" ? { ...t, owned: 4 } : t));
    expect(roomFor(owned, 8, {}, "int").left).toBe(2);
    expect(roomFor(owned, 8, { int: 2 }, "int").reason).toMatch(/Você já tem 4 e escolheu 2/);
  });
  it("não passa do estoque nem vende tipo fechado", () => {
    expect(roomFor(tiers, 8, { pouco: 2 }, "pouco").reason).toMatch(/Restam só 2 ingressos/);
    expect(roomFor(tiers, 8, {}, "fechado").left).toBe(0);
    expect(roomFor(tiers, 8, {}, "nao-existe").left).toBe(0);
  });
});

describe("overLimit (conferido no servidor ao criar e ao confirmar o pedido)", () => {
  const types = [{ id: "int", name: "Inteira", maxPerOrder: 4 }];
  it("aceita dentro do limite e recusa acima, somando as compras pagas", () => {
    expect(overLimit([{ ticketTypeId: "int", quantity: 4 }], types, new Map())).toBeNull();
    expect(overLimit([{ ticketTypeId: "int", quantity: 5 }], types, new Map())).toMatch(/limite é 4/);
    expect(overLimit([{ ticketTypeId: "int", quantity: 2 }], types, new Map([["int", { all: 3, mine: 3 }]]))).toMatch(/Esta conta já tem 3. Você ainda pode comprar 1/);
  });
  it("explica quando a conta vem do mesmo CPF em outra conta", () => {
    const msg = overLimit([{ ticketTypeId: "int", quantity: 1 }], types, new Map([["int", { all: 4, mine: 0 }]]));
    expect(msg).toMatch(/com o CPF informado, em outra conta/);
  });
});

describe("roomFor com a cota de meia do setor (40% dos lugares)", () => {
  // duas Meias no mesmo setor e data dividem a mesma cota
  const m: LimitTier[] = [
    { id: "m1", name: "Meia · 1º lote", status: "open", available: 3, limit: 6, meiaGroup: "Pista|", meiaLeft: 3 },
    { id: "m2", name: "Meia · 2º lote", status: "open", available: 3, limit: 6, meiaGroup: "Pista|", meiaLeft: 3 },
    { id: "i", name: "Inteira", status: "open", available: 50, limit: 6 },
  ];
  it("a soma das Meias do setor para na cota e explica", () => {
    expect(roomFor(m, 8, { m1: 2 }, "m2").left).toBe(1);
    const r = roomFor(m, 8, { m1: 2, m2: 1 }, "m2");
    expect(r.left).toBe(0);
    expect(r.reason).toBe("Restam só 3 meias-entradas neste setor.");
    expect(roomFor(m, 8, { m1: 2, m2: 1 }, "i").left).toBe(5);
  });
  it("cota esgotada: texto do dono e a Meia aparece esgotada neste setor", () => {
    const out = m.map((t) => (t.meiaGroup ? { ...t, available: 0, meiaLeft: 0 } : t));
    expect(meiaOut(out[0])).toBe(true);
    expect(meiaOut(out[2])).toBe(false);
    expect(roomFor(out, 8, {}, "m1").reason).toBe(MEIA_OUT);
  });
});
