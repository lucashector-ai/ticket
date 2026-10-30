import "server-only";
import type { HomeProps } from "@/components/painel/home";
import { platformFee, type PaidBucket } from "@/lib/data/painel";
import { brl } from "@/lib/format";
import { DAY, delta, spark } from "@/lib/painel/build";

/*
 * Números do início do painel a partir das somas do banco (`paidBuckets`), sem trazer os pedidos um a um.
 * Mesmo cálculo de antes (indicadores por período, atual × anterior, minilinha de 10 pontos), linha por linha
 * multiplicada pela quantidade de pedidos dela.
 */

/** Meia-noite (do servidor) do primeiro dia de uma minilinha de `days` dias que termina hoje. */
export function sparkStart(now: number, days: number) {
  const d = new Date(now - (days - 1) * DAY);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const PERIODS = [["7d", 7], ["30d", 30], ["all", 0]] as const;

export function homeKpis(rows: PaidBucket[], absorbById: Map<string, boolean>, now: number): HomeProps["kpis"] {
  const start7 = sparkStart(now, 7);
  const net = (r: PaidBucket) => r.revenue - platformFee(r.revenue, absorbById.get(r.eventId) ?? false);
  const first = rows.length ? Math.min(...rows.map((r) => r.first)) : now;
  return Object.fromEntries(PERIODS.map(([key, d]) => {
    const days = d || Math.max(10, Math.ceil((now - first) / DAY) + 1);
    // o dia de cada linha é contado a partir do começo da minilinha de 7 dias; aqui, do começo da deste período
    const offset = Math.round((start7 - sparkStart(now, days)) / DAY);
    const inP = rows.filter((r) => (d === 7 ? r.w7 : d === 30 ? r.w30 : true));
    const prevP = rows.filter((r) => (d === 7 ? r.p7 : d === 30 ? r.p30 : false));
    const sum = (l: PaidBucket[], f: (r: PaidBucket) => number) => l.reduce((s, r) => s + f(r) * r.n, 0);
    const rev = sum(inP, net), tix = sum(inP, (r) => r.qty), n = sum(inP, () => 1);
    const pRev = sum(prevP, net), pTix = sum(prevP, (r) => r.qty), pN = sum(prevP, () => 1);
    const avg = tix ? Math.round(rev / tix) : 0, pAvg = pTix ? Math.round(pRev / pTix) : 0;
    const bucket = (f: (r: PaidBucket) => number) => {
      const per = new Array<number>(days).fill(0);
      for (const r of inP) {
        const i = r.day + offset;
        if (i >= 0 && i < days) per[i] += f(r) * r.n;
      }
      const step = Math.ceil(days / 10);
      return Array.from({ length: 10 }, (_, i) => per.slice(i * step, (i + 1) * step).reduce((a, b) => a + b, 0));
    };
    const note = d ? `vs ${d} dias anteriores` : "desde a primeira venda";
    const mk = (label: string, value: string, cur: number, prev: number, series: number[]) => ({ label, value, ...(d ? delta(cur, prev) : { text: "", cls: "dl" }), note, ...spark(series) });
    return [key, [
      mk("Receita líquida", brl(rev), rev, pRev, bucket(net)),
      mk("Ingressos vendidos", tix.toLocaleString("pt-BR"), tix, pTix, bucket((r) => r.qty)),
      mk("Pedidos", n.toLocaleString("pt-BR"), n, pN, bucket(() => 1)),
      mk("Ticket médio", brl(avg), avg, pAvg, bucket((r) => net(r) / Math.max(1, r.qty))),
    ]];
  })) as HomeProps["kpis"];
}

/** Líquido por evento (todas as vendas pagas). */
export function netByEvent(rows: PaidBucket[], absorbById: Map<string, boolean>) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.eventId, (m.get(r.eventId) ?? 0) + (r.revenue - platformFee(r.revenue, absorbById.get(r.eventId) ?? false)) * r.n);
  return m;
}
