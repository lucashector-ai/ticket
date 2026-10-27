type TierRow = { status: "upcoming" | "open" | "sold_out" | "closed"; salesStart: Date | null };

/** Status visto pelo comprador: lote aberto mas com vendas marcadas para depois aparece como "em breve". */
export function tierStatus(t: TierRow, now = new Date()) {
  return t.status === "open" && t.salesStart && t.salesStart > now ? "upcoming" : t.status;
}

/** "Vendas a partir de 28/10 às 10h" */
export function salesStartNote(d: Date) {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const o: Record<string, string> = {};
  for (const p of f) o[p.type] = p.value;
  return `Vendas a partir de ${o.day}/${o.month} às ${o.hour}h${o.minute !== "00" ? o.minute : ""}`;
}
