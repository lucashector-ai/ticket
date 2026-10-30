import { describe, expect, it } from "vitest";
import { dateFull, dateFullInline } from "@/lib/format";

/* Datas por extenso: no começo da frase com maiúscula; no meio ("até quinta, 5 de novembro…") sem (achado H-R3-4). */
describe("datas por extenso", () => {
  const d = new Date("2026-11-05T20:00:00-03:00");
  it("começo de frase e meio de frase", () => {
    expect(dateFull(d)).toBe("Quinta, 5 de novembro de 2026");
    expect(`até ${dateFullInline(d)}`).toBe("até quinta, 5 de novembro de 2026");
  });
});
