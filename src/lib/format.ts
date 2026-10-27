const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WDL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ML = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const TZ = "America/Sao_Paulo";

/** Partes da data no fuso de São Paulo. */
export function parts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short", hour12: false });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  const wdIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday);
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, wd: wdIdx };
}

export function brl(cents: number) {
  return "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}
export function brlReais(reais: number) {
  return "R$ " + reais.toLocaleString("pt-BR");
}

export function hourLabel(d: Date) {
  const p = parts(d);
  return p.h + "h" + (p.min ? String(p.min).padStart(2, "0") : "");
}
export function timeLabel(d: Date) {
  const p = parts(d);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}
/** "Sáb, 31 Out · 22h" */
export function dateNice(d: Date) {
  const p = parts(d);
  return `${WD[p.wd]}, ${p.d} ${MS[p.m - 1]} · ${hourLabel(d)}`;
}
/** "Sábado, 31 de outubro de 2026" */
export function dateFull(d: Date) {
  const p = parts(d);
  return `${WDL[p.wd]}, ${p.d} de ${ML[p.m - 1]} de ${p.y}`;
}
/** "Sábado, 31 de outubro · 22h" */
export function dateLong(d: Date) {
  const p = parts(d);
  return `${WDL[p.wd]}, ${p.d} de ${ML[p.m - 1]} · ${hourLabel(d)}`;
}
export function dayNum(d: Date) { return String(parts(d).d).padStart(2, "0"); }
export function monShort(d: Date) { return MS[parts(d).m - 1].toUpperCase(); }
export function monTitle(d: Date) { return MS[parts(d).m - 1]; }

export function popLabel(n: number) {
  return n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + " mil" : String(n);
}
export function kLabel(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + " mi";
  if (n >= 1000) return Math.round(n / 1000) + " mil";
  return String(n);
}
export function daysUntil(d: Date, now = new Date()) {
  return Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
}
export function initials(name: string) {
  const w = name.replace(/^(DJ|MC)\s+/, "").split(/\s+/);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase();
}
export function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
export function slugify(s: string) {
  return normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
