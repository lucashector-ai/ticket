import { describe, expect, it } from "vitest";
import { csvCell } from "@/lib/csv";

describe("csvCell (exportações do painel)", () => {
  it("neutraliza fórmula de planilha no começo do texto", () => {
    expect(csvCell("=HYPERLINK(\"http://x\",\"oi\")")).toBe(`"'=HYPERLINK(""http://x"",""oi"")"`);
    for (const c of ["+1", "-1+2", "@SUM(A1)", "\tx"]) expect(csvCell(c).startsWith(`"'`)).toBe(true);
  });
  it("texto comum e números ficam como estão", () => {
    expect(csvCell("Ana Souza")).toBe(`"Ana Souza"`);
    expect(csvCell("diz \"oi\"")).toBe(`"diz ""oi"""`);
    expect(csvCell(-12)).toBe("-12");
  });
});
