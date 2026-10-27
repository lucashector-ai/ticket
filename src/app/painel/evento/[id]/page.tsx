import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { PainelEvento, type EventoPainelProps } from "@/components/painel/evento";
import { getSessionUser } from "@/lib/auth/server";
import { getPainelScope, listEventCoupons, listOrders, listParticipants, revenueByType } from "@/lib/data/painel";
import { brl, dateNice, initials } from "@/lib/format";
import { DAY, avBg, ago, capacity, daily, ended, feedItem, nowMs, soldCount, statusOf, whenLabel, whereLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evento" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> };
const METHOD: Record<string, string> = { pix: "Pix", card: "Cartão", free: "Gratuito", test: "Teste" };
const TT_STATUS: Record<string, [string, string]> = { open: ["À venda", "st on"], sold_out: ["Esgotado", "st warn"], upcoming: ["Em breve", "st draft"], closed: ["Encerrado", "st end"] };
const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
const dm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).format(d).replace(".", "");

export default async function PainelEventoPage({ params, searchParams }: Props) {
  const user = (await getSessionUser())!;
  const [{ id }, { aba }] = await Promise.all([params, searchParams]);
  const { events } = await getPainelScope(user.id);
  const e = events.find((x) => x.id === id);
  if (!e) notFound();
  const now = nowMs();

  const [orders, people, byType, cps, sessions] = await Promise.all([
    listOrders([e.id], new Map([[e.id, e.absorbFee]])),
    listParticipants(e.id),
    revenueByType(e.id),
    listEventCoupons(e.id),
    db.query.eventSessions.findMany({ where: eq(schema.eventSessions.eventId, e.id) }),
  ]);
  const paid = orders.filter((o) => o.status === "paid");
  const refunded = orders.filter((o) => o.status === "refunded");
  const sum = (l: typeof paid, f: (o: (typeof paid)[number]) => number) => l.reduce((s, o) => s + f(o), 0);
  const gross = sum(paid, (o) => o.revenue), net = sum(paid, (o) => o.net), buyerFees = sum(paid, (o) => o.buyerFee), tix = sum(paid, (o) => o.qty);
  const cap = capacity(e), sold = soldCount(e);

  /* gráfico: últimos 30 dias */
  const rev = daily(paid, 30, (o) => o.net, now), qty = daily(paid, 30, (o) => o.qty, now);
  const labels = rev.values.map((_, i) => dm(new Date(rev.start + i * DAY + DAY / 2)));

  const sessLabel = new Map(sessions.map((s) => [s.id, dateNice(s.startAt)]));
  const tiers = [...e.ticketTypes].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => {
    const r = byType.get(t.id);
    const [status, stCls] = t.quantity > 0 && t.sold >= t.quantity ? TT_STATUS.sold_out : TT_STATUS[t.status] ?? TT_STATUS.open;
    return {
      id: t.id, name: [t.sector, t.name].filter(Boolean).join(" · "), sub: (t.sessionId && sessLabel.get(t.sessionId)) || t.note || "",
      color: t.sectorColor ?? "#111", price: brl(t.priceCents), sold: t.sold, total: t.quantity,
      pct: t.quantity ? Math.min(100, Math.round((t.sold / t.quantity) * 100)) : 0, revenue: brl(r?.cents ?? 0), status, stCls,
    };
  });

  const methods = new Map<string, number>();
  for (const o of paid) methods.set(o.method ?? "test", (methods.get(o.method ?? "test") ?? 0) + o.revenue);
  const usedBy = new Map<string, { n: number; off: number }>();
  for (const o of paid) if (o.couponId) { const x = usedBy.get(o.couponId) ?? { n: 0, off: 0 }; x.n += 1; x.off += o.discount; usedBy.set(o.couponId, x); }

  /* check-in: ingressos válidos ou usados */
  const valid = people.filter((p) => p.status === "valid" || p.status === "used");
  const inside = valid.filter((p) => p.checkedInAt);
  const lastHour = inside.filter((p) => p.checkedInAt && now - p.checkedInAt.getTime() < 15 * 60_000).length;
  const sectors = new Map<string, { n: number; inn: number }>();
  for (const p of valid) { const k = p.sector ?? p.type; const x = sectors.get(k) ?? { n: 0, inn: 0 }; x.n += 1; if (p.checkedInAt) x.inn += 1; sectors.set(k, x); }

  const st = statusOf(e, now);
  const days = Math.ceil((e.startAt.getTime() - now) / DAY);
  const props: EventoPainelProps = {
    tab: aba === "participantes" || aba === "checkin" || aba === "financeiro" ? aba : "geral",
    ev: {
      id: e.id, slug: e.slug, title: e.title, flyerId: e.flyerId, when: whenLabel(e), where: whereLabel(e), status: st.label, stCls: st.cls,
      countdown: ended(e, now) ? "" : days <= 0 ? "É hoje" : days === 1 ? "Amanhã" : `Faltam ${days} dias`, draft: e.status === "draft", absorbFee: e.absorbFee,
    },
    kpis: {
      net: brl(net), gross: brl(gross), sold, cap, pct: cap ? Math.round((sold / cap) * 100) : 0, orders: paid.length,
      avg: brl(tix ? Math.round(net / tix) : 0), tix,
    },
    chart: { revenue: rev.values, tickets: qty.values, labels },
    tiers,
    feed: paid.slice(0, 8).map((o) => feedItem(o, null)),
    methods: [...methods].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ name: METHOD[k] ?? k, pct: gross ? Math.round((v / gross) * 100) : 0, value: brl(v) })),
    coupons: cps.map((c) => ({ code: c.code, uses: usedBy.get(c.id)?.n ?? 0, off: brl(usedBy.get(c.id)?.off ?? 0), label: c.percentOff ? `${c.percentOff}%` : brl(c.amountOffCents ?? 0) })),
    people: people.map((p) => {
      const name = p.holder || p.buyer || "Participante";
      return {
        id: p.id, name, ini: initials(name) || "?", bg: avBg(name), email: p.email ?? "", ticket: [p.sector, p.type].filter(Boolean).join(" · "), meia: p.half,
        order: p.orderNumber ? `#${p.orderNumber}` : "—", date: dm(p.at), status: p.status, inAt: p.checkedInAt ? hm(p.checkedInAt) : null,
      };
    }),
    checkin: {
      total: valid.length, inside: inside.length, perMin: (lastHour / 15).toFixed(1).replace(".", ","),
      sectors: [...sectors].map(([name, x]) => ({ name, n: x.inn, total: x.n, pct: x.n ? Math.round((x.inn / x.n) * 100) : 0 })),
      last: inside.sort((a, b) => b.checkedInAt!.getTime() - a.checkedInAt!.getTime()).slice(0, 8).map((p) => ({ id: p.id, name: p.holder || p.buyer || "Participante", what: [p.sector, p.type].filter(Boolean).join(" · "), at: hm(p.checkedInAt!) })),
    },
    fin: {
      gross: brl(gross), buyerFees: brl(buyerFees), platform: brl(gross - net), net: brl(net),
      refunds: refunded.map((o) => ({ id: o.id, name: o.buyer, value: brl(o.revenue), when: ago(o.at) })),
      refundPct: gross + sum(refunded, (o) => o.revenue) ? ((sum(refunded, (o) => o.revenue) / (gross + sum(refunded, (o) => o.revenue))) * 100).toFixed(1).replace(".", ",") : "0",
    },
  };
  return <PainelEvento {...props} />;
}
