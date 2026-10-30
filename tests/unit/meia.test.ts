import { describe, expect, it } from "vitest";
import { meiaBoxOk } from "@/lib/pricing";
import { meiaPriceError } from "@/lib/criar/meia";
import { effTypes, type DraftSector } from "@/lib/criar/model";

/* D-09: meia-entrada com preço editável e um caminho só por setor/data. */

const tt = (kind: string | null, priceCents: number, sector: string | null = null, sessionId: string | null = null) => ({ kind, priceCents, sector, sessionId });

describe("caixa Meia-entrada no checkout (meiaBoxOk)", () => {
  it("Inteira sem tipo Meia no mesmo setor e data: a caixa aparece (evento antigo, sem meia automática)", () => {
    const int = tt("inteira", 8_000, "Pista");
    expect(meiaBoxOk(int, [int, tt("social", 5_000, "Pista")])).toBe(true);
    // tipo antigo, sem kind: continua com a caixa
    const legado = tt(null, 8_000);
    expect(meiaBoxOk(legado, [legado])).toBe(true);
  });

  it("com tipo Meia no mesmo setor e data, a Inteira não oferece a caixa (a cota do tipo Meia não é contornada)", () => {
    const int = tt("inteira", 8_000, "Pista", "s1");
    expect(meiaBoxOk(int, [int, tt("meia", 3_000, "Pista", "s1")])).toBe(false);
    // Meia de outro setor ou de outra data não conta
    expect(meiaBoxOk(int, [int, tt("meia", 3_000, "Camarote", "s1"), tt("meia", 3_000, "Pista", "s2")])).toBe(true);
  });

  it("tipos que já têm preço próprio e ingresso grátis nunca têm a caixa", () => {
    for (const k of ["meia", "social", "outro"]) expect(meiaBoxOk(tt(k, 5_000), [])).toBe(false);
    expect(meiaBoxOk(tt("inteira", 0), [])).toBe(false);
  });
});

const sector = (types: DraftSector["types"], name = "Ingressos"): DraftSector => ({ id: `k-${name}`, name, color: "#EDFF3C", open: true, types });

describe("meia automática com preço editável (effTypes + meiaPriceError)", () => {
  it("sem ajuste, a meia é a metade da inteira; com ajuste, usa o valor do produtor", () => {
    const meia = (t: DraftSector["types"][number]) => effTypes(sector([t]), true).find((x) => x.kind === "meia")!;
    expect(meia({ id: "t1", kind: "inteira", name: "Inteira", price: "80", qty: "100", desc: "" }).price).toBe("40");
    expect(meia({ id: "t1", kind: "inteira", name: "Inteira", price: "45", qty: "100", desc: "" }).price).toBe("22,5");
    expect(meia({ id: "t1", kind: "inteira", name: "Inteira", price: "80", qty: "100", desc: "", meia: "35" }).price).toBe("35");
    // vazio ou zero volta para a metade
    expect(meia({ id: "t1", kind: "inteira", name: "Inteira", price: "80", qty: "100", desc: "", meia: "" }).price).toBe("40");
  });

  it("meia acima da inteira é recusada ao publicar (automática e criada à mão)", () => {
    const auto = sector([{ id: "t1", kind: "inteira", name: "Inteira", price: "80", qty: "100", desc: "", meia: "90" }]);
    expect(meiaPriceError({ autoMeia: true, sectors: [auto] })).toBe("Meia-entrada não pode custar mais que a inteira (R$ 80).");
    const manual = sector([
      { id: "t1", kind: "inteira", name: "Inteira", price: "80", qty: "100", desc: "" },
      { id: "t2", kind: "meia", name: "Meia estudante", price: "80,01", qty: "40", desc: "" },
    ], "Pista");
    expect(meiaPriceError({ autoMeia: false, sectors: [manual, sector([], "Camarote")] })).toBe("Meia estudante (Pista) não pode custar mais que a inteira (R$ 80).");
    // valores possíveis: abaixo da metade, a metade e igual à inteira
    for (const v of ["30", "40", "80"]) expect(meiaPriceError({ autoMeia: true, sectors: [sector([{ id: "t1", kind: "inteira", name: "Inteira", price: "80", qty: "100", desc: "", meia: v }])] })).toBeNull();
  });
});
