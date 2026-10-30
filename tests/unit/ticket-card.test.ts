import { describe, expect, it } from "vitest";
import { ticketCard } from "@/lib/tickets/card";

const ev = { title: "Show", flyerId: "x", startAt: new Date("2026-11-20T23:00:00Z"), endAt: null, doorsAt: null, venue: null } as never;
const tk = (name: string, sector: string | null, kind: string | null, halfPrice = false) => ({ code: "TW-AAAA-BBBB", holderName: "Ana", halfPrice, status: "valid", ticketType: { name, sector, kind } });

describe("ingresso de papel: setor e tipo", () => {
  it("evento sem setores: Inteira e Meia do criador saem como setor Geral (antes o setor repetia o tipo: \"Meia-entrada\")", () => {
    expect(ticketCard(tk("Meia-entrada", null, "meia"), ev)).toMatchObject({ sector: "Geral", type: "Meia" });
    expect(ticketCard(tk("Inteira", null, "inteira"), ev)).toMatchObject({ sector: "Geral", type: "Inteira" });
  });
  it("com setor, tipo próprio e tipo antigo: mantém", () => {
    expect(ticketCard(tk("Meia-entrada", "Pista", "meia"), ev)).toMatchObject({ sector: "Pista", type: "Meia" });
    expect(ticketCard(tk("VIP", null, "outro"), ev).sector).toBe("VIP");
    expect(ticketCard(tk("Pista — 1º lote", null, null, true), ev)).toMatchObject({ sector: "Pista", type: "Meia" });
  });
});
