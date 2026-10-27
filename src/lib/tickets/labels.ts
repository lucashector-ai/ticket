import { dateFull, dateNice, daysUntil, parts } from "@/lib/format";

const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "Sex, 12 Set 2026 · 22h" (eventos passados, com ano). */
export function datePast(d: Date) {
  const p = parts(d);
  return `${WD[p.wd]}, ${p.d} ${MS[p.m - 1]} ${p.y} · ${p.h}h${p.min ? String(p.min).padStart(2, "0") : ""}`;
}

/** "É hoje" / "É amanhã" / "Faltam N dias" */
export function countdownLabel(d: Date, now = new Date()) {
  const days = daysUntil(d, now);
  return days <= 0 ? "É hoje" : days === 1 ? "É amanhã" : `Faltam ${days} dias`;
}

export function qtyLabel(n: number) {
  return `${n} ${n === 1 ? "ingresso" : "ingressos"}`;
}

type EventLike = {
  startAt: Date; endAt: Date | null; dateLabel: string | null; dateFullLabel: string | null; doorsLabel: string | null;
  venueNameOverride: string | null; addressLabel: string | null;
  venue: { name: string; address: string | null; neighborhood: string | null; city: { name: string; uf: string } } | null;
};

/** Rótulos de evento usados nos cartões de ingresso. */
export function eventLabels(e: EventLike) {
  const city = e.venue?.city.name ?? "";
  const uf = e.venue?.city.uf ?? "";
  return {
    dateNice: e.dateLabel ?? dateNice(e.startAt),
    dateFull: e.dateFullLabel ?? dateFull(e.startAt),
    doors: e.doorsLabel ?? "",
    venue: e.venueNameOverride ?? e.venue?.name ?? "",
    addr: e.addressLabel ?? [e.venue?.neighborhood, city && `${city} – ${uf}`].filter(Boolean).join(" · "),
    city,
  };
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  valid: "Válido",
  used: "Utilizado",
  transferred: "Transferido",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};
