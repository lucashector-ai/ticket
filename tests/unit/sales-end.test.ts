import { describe, expect, it } from "vitest";
import { eventEndsAt, SALES_ENDED, SALES_ENDED_DATE, salesEnded, salesEndedError, sessionEndsAt } from "@/lib/tickets/sales-end";

const H = 3_600_000;
const at = (iso: string) => new Date(iso);

// "Calourada Sem Fim": 29/10 22h até 30/10 05h (horário de Brasília) = 30/10 01:00Z até 08:00Z
const calourada = { startAt: at("2026-10-30T01:00:00Z"), endAt: at("2026-10-30T08:00:00Z"), sessions: [], ticketTypes: [{ id: "pista", sessionId: null }] };

describe("fim das vendas (U-73)", () => {
  it("evento de data única: vende até o término; às 05h de 30/10 (BRT) acabou", () => {
    expect(salesEndedError(calourada, ["pista"], at("2026-10-30T07:59:00Z"))).toBeNull();
    expect(salesEndedError(calourada, ["pista"], at("2026-10-30T08:00:00Z"))).toBe(SALES_ENDED);
    // 21h de 30/10 (BRT): quando o pedido de teste #48256 foi pago
    expect(salesEndedError(calourada, ["pista"], at("2026-10-31T00:00:00Z"))).toBe(SALES_ENDED);
    expect(salesEnded(calourada, at("2026-10-31T00:00:00Z"))).toBe(true);
  });

  it("sem horário de término: a mesma regra da vitrine (o início)", () => {
    const e = { startAt: at("2026-11-10T23:00:00Z"), endAt: null };
    expect(eventEndsAt(e)).toEqual(e.startAt);
    expect(salesEnded(e, at("2026-11-10T22:59:00Z"))).toBe(false);
    expect(salesEnded(e, at("2026-11-10T23:00:00Z"))).toBe(true);
  });

  it("várias datas: cada data termina depois da duração da última; a última, no término do evento", () => {
    const d1 = at("2026-11-01T00:00:00Z"), d2 = at("2026-11-02T00:00:00Z"), d3 = at("2026-11-03T00:00:00Z");
    const e = {
      startAt: d1, endAt: new Date(d3.getTime() + 6 * H),
      sessions: [{ id: "s2", startAt: d2 }, { id: "s1", startAt: d1 }, { id: "s3", startAt: d3 }],
      ticketTypes: [{ id: "t1", sessionId: "s1" }, { id: "t2", sessionId: "s2" }, { id: "t3", sessionId: "s3" }],
    };
    expect(sessionEndsAt(e, "s1")).toEqual(new Date(d1.getTime() + 6 * H));
    expect(sessionEndsAt(e, "s3")).toEqual(e.endAt);
    const now = new Date(d1.getTime() + 7 * H);
    expect(salesEndedError(e, ["t1"], now)).toBe(SALES_ENDED_DATE);
    expect(salesEndedError(e, ["t2", "t3"], now)).toBeNull();
    // um tipo encerrado no meio do pedido já recusa o pedido todo
    expect(salesEndedError(e, ["t2", "t1"], now)).toBe(SALES_ENDED_DATE);
    // sem tipos: o evento todo ainda vende
    expect(salesEndedError(e, [], now)).toBeNull();
    expect(salesEndedError(e, ["t3"], new Date(e.endAt.getTime() + 1))).toBe(SALES_ENDED);
  });

  it("duração estranha (término antes do início da última data) não estende a venda das outras datas", () => {
    const d1 = at("2026-11-01T00:00:00Z"), d2 = at("2026-11-02T00:00:00Z");
    const e = { startAt: d1, endAt: new Date(d2.getTime() - H), sessions: [{ id: "a", startAt: d1 }, { id: "b", startAt: d2 }] };
    expect(sessionEndsAt(e, "a")).toEqual(d1);
  });
});
