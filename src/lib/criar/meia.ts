/* Meia-entrada no criar evento (D-09): preço editável pelo produtor, conferido no servidor ao publicar. */
import { brl } from "@/lib/format";
import { meiaCap } from "@/lib/meia-share";
import { effTypes, num, toCents, type Draft, type DraftSector } from "./model";

/**
 * Primeiro tipo Meia com preço acima da inteira (mensagem pronta) ou null. O preço sugerido é a metade (Lei 12.933),
 * mas o produtor pode ajustar; nunca acima da inteira. Meia automática: a Inteira de origem; tipo Meia criado à
 * mão: a Inteira mais cara do setor.
 */
export function meiaPriceError(d: Pick<Draft, "sectors" | "autoMeia">): string | null {
  for (const k of d.sectors) {
    const types = effTypes(k, d.autoMeia);
    const top = Math.max(0, ...types.filter((t) => t.kind === "inteira" && !t.free).map((t) => toCents(t.price)));
    for (const t of types) {
      if (t.kind !== "meia" || t.free) continue;
      const base = t.auto ? k.types.find((u) => `${u.id}-m` === t.id) : null;
      const cap = base ? toCents(base.price) : top;
      const label = d.sectors.length > 1 ? `${t.name} (${k.name.trim() || "Setor"})` : t.name;
      if (cap > 0 && toCents(t.price) > cap) return `${label} não pode custar mais que a inteira (${brl(cap)}).`;
    }
  }
  return null;
}

/**
 * Cota de meia do setor (decisão do dono: 40% dos lugares de cada setor; em evento de várias datas, em cada data):
 * `seats` = soma das quantidades dos tipos do setor; `cap` = quantas meias o setor permite vender (tipo Meia + caixa
 * de meia na Inteira); `meiaQty` = quantidade dos tipos Meia. A venda para no `cap` mesmo que o tipo Meia tenha mais.
 */
export function sectorMeia(k: DraftSector, autoMeia: boolean) {
  const types = effTypes(k, autoMeia);
  const seats = types.reduce((s, t) => s + Math.max(0, Math.round(num(t.qty))), 0);
  const meiaQty = types.filter((t) => t.kind === "meia").reduce((s, t) => s + Math.max(0, Math.round(num(t.qty))), 0);
  return { seats, cap: meiaCap(seats), meiaQty };
}
