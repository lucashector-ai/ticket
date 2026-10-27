import "server-only";
import { brl, dateNice, initials } from "@/lib/format";
import type { PaidOrder, PainelEvent } from "@/lib/data/painel";

/* Montagem dos dados do painel (tudo serializável para os componentes de cliente). */

export const DAY = 86_400_000;
export const AV_BG = ["#D3F55B", "#F2DCE8", "#DCE7FF", "#FFE7C2", "#E8E3FF", "#D9F3EC"];
export const avBg = (s: string) => AV_BG[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_BG.length];

export function ago(d: Date, now = Date.now()) {
  const m = Math.max(0, Math.round((now - d.getTime()) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const days = Math.round(h / 24);
  return days === 1 ? "ontem" : `há ${days} dias`;
}

export const capacity = (e: PainelEvent) => e.ticketTypes.reduce((s, t) => s + t.quantity, 0);
export const soldCount = (e: PainelEvent) => e.ticketTypes.reduce((s, t) => s + t.sold, 0);
export const ended = (e: PainelEvent, now = Date.now()) => (e.endAt ?? e.startAt).getTime() < now || e.status === "finished" || e.status === "cancelled";
export const whereLabel = (e: PainelEvent) => [e.venueNameOverride ?? e.venue?.name, e.venue?.city.name].filter(Boolean).join(", ") || "Local a definir";
export const whenLabel = (e: PainelEvent) => e.dateLabel || dateNice(e.startAt);

export function statusOf(e: PainelEvent, now = Date.now()) {
  if (e.status === "draft") return { label: "Rascunho", cls: "st draft" };
  if (e.status === "cancelled") return { label: "Cancelado", cls: "st end" };
  if (ended(e, now)) return { label: "Encerrado", cls: "st end" };
  const cap = capacity(e), sold = soldCount(e);
  if (cap && sold >= cap) return { label: "Esgotado", cls: "st warn" };
  if (cap && sold / cap >= 0.85) return { label: "Últimos ingressos", cls: "st warn" };
  // publicado, mas antes da abertura das vendas
  if (e.salesOpenAt && e.salesOpenAt.getTime() > now) return e.presaleAt && e.presaleAt.getTime() <= now ? { label: "Pré-venda", cls: "st warn" } : { label: "Vendas em breve", cls: "st draft" };
  return { label: e.unlisted ? "À venda · só com link" : "À venda", cls: "st on" };
}

/** Linha e área da minilinha (sparkline) de 120 × 36. */
export function spark(arr: number[]) {
  const mx = Math.max(...arr), mn = Math.min(...arr), w = 120, h = 36;
  const pts = arr.map((v, i) => [(i / Math.max(1, arr.length - 1)) * w, h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  return { line, area: `${line} L120 36 L0 36 Z` };
}

export function delta(cur: number, prev: number) {
  if (!prev) return cur ? { text: "novo", cls: "dl up" } : { text: "—", cls: "dl" };
  const p = Math.round(((cur - prev) / prev) * 100);
  return { text: `${p >= 0 ? "+" : "−"}${Math.abs(p)}%`, cls: p >= 0 ? "dl up" : "dl down" };
}

export function feedItem(o: PaidOrder, title: string | null) {
  return { id: o.id, name: o.buyer, ini: initials(o.buyer) || "?", bg: avBg(o.buyer), qty: `${o.qty} ${o.qty === 1 ? "ingresso" : "ingressos"}`, what: title ?? "", ago: ago(o.at), value: brl(o.net) };
}

/** Soma por dia, do mais antigo para o mais novo. */
export function daily(orders: PaidOrder[], days: number, pick: (o: PaidOrder) => number, now = Date.now()) {
  const start = new Date(now - (days - 1) * DAY); start.setHours(0, 0, 0, 0);
  const out = new Array<number>(days).fill(0);
  for (const o of orders) {
    const i = Math.floor((o.at.getTime() - start.getTime()) / DAY);
    if (i >= 0 && i < days) out[i] += pick(o);
  }
  return { start: start.getTime(), values: out };
}

/** Agora (fora do corpo dos componentes, que a regra de pureza do React não aceita). */
export const nowMs = () => Date.now();
