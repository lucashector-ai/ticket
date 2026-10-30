import type { Metadata } from "next";
import { and, count, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { PainelEvento, type EventoPainelProps } from "@/components/painel/evento";
import { emailEnabled } from "@/lib/email";
import { salePhase } from "@/lib/launch";
import { resaleCap } from "@/lib/resale";
import { listEventCoupons, listOrders, listParticipants, revenueByType } from "@/lib/data/painel";
import { refundTabData } from "@/lib/data/reembolsos";
import { painelAccess } from "@/lib/painel/access";
import { brl, dateNice, initials } from "@/lib/format";
import { GUEST_MAX_PER_EVENT, GUEST_MAX_PER_PASTE } from "@/lib/guest-list";
import { DAY, avBg, ago, capacity, daily, ended, feedItem, nowMs, soldCount, statusOf, whenLabel, whereLabel } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evento" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> };
const METHOD: Record<string, string> = { pix: "Pix", card: "Cartão", free: "Gratuito", test: "Teste" };
const TT_STATUS: Record<string, [string, string]> = { open: ["À venda", "st on"], sold_out: ["Esgotado", "st warn"], upcoming: ["Em breve", "st draft"], closed: ["Encerrado", "st end"] };
const hm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(d);
/** Date → valor de <input autoComplete="off" type="datetime-local"> no horário de São Paulo */
function localInput(d: Date | null) {
  if (!d) return "";
  const o: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d)) o[x.type] = x.value;
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}
const dm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).format(d).replace(".", "");

export default async function PainelEventoPage({ params, searchParams }: Props) {
  const [{ id }, { aba }] = await Promise.all([params, searchParams]);
  const { events } = await painelAccess("admin");
  const e = events.find((x) => x.id === id);
  if (!e) notFound();
  const now = nowMs();

  const { eventSignups, queueEntries, resaleListings, ticketTransfers, checkinLinks } = schema;
  const fresh = new Date(nowMs() - 60_000);
  const [orders, people, byType, cps, sessions, signups, [qActive], [qWaiting], resale, [transfers], links, guests] = await Promise.all([
    listOrders([e.id], new Map([[e.id, e.absorbFee]])),
    listParticipants(e.id),
    revenueByType(e.id),
    listEventCoupons(e.id),
    db.query.eventSessions.findMany({ where: eq(schema.eventSessions.eventId, e.id) }),
    db.query.eventSignups.findMany({ where: eq(eventSignups.eventId, e.id), orderBy: (x, { desc }) => [desc(x.createdAt)] }),
    db.select({ n: count() }).from(queueEntries).where(and(eq(queueEntries.eventId, e.id), isNotNull(queueEntries.admittedAt), gt(queueEntries.lastSeen, fresh))),
    db.select({ n: count() }).from(queueEntries).where(and(eq(queueEntries.eventId, e.id), isNull(queueEntries.admittedAt), gt(queueEntries.lastSeen, fresh))),
    db.query.resaleListings.findMany({
      where: eq(resaleListings.eventId, e.id), orderBy: (x, { desc }) => [desc(x.createdAt)],
      with: { ticket: { columns: { code: true, halfPrice: true } }, ticketType: { columns: { name: true, sector: true, priceCents: true } } },
    }),
    db.select({ n: count() }).from(ticketTransfers).innerJoin(schema.tickets, eq(schema.tickets.id, ticketTransfers.ticketId)).where(and(eq(schema.tickets.eventId, e.id), eq(ticketTransfers.status, "accepted"))),
    db.query.checkinLinks.findMany({ where: and(eq(checkinLinks.eventId, e.id), isNull(checkinLinks.revokedAt)), orderBy: (x, { asc }) => [asc(x.createdAt)] }),
    db.query.guestListEntries.findMany({ where: eq(schema.guestListEntries.eventId, e.id), orderBy: (x, { asc }) => [asc(x.name)], limit: GUEST_MAX_PER_EVENT }),
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
      color: t.sectorColor ?? "#111", price: t.priceCents ? brl(t.priceCents) : "Grátis", sold: t.sold, total: t.quantity,
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
    tab: aba === "participantes" || aba === "checkin" || aba === "financeiro" || aba === "lancamento" || aba === "revenda" || aba === "lista" || aba === "reembolsos" ? aba : "geral",
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
      links: links.map((l) => ({ id: l.id, label: l.label, token: l.token, code: l.code ?? "", email: l.email ?? null, sent: l.sentAt ? ago(l.sentAt, now) : null, opened: l.openedAt ? ago(l.openedAt, now) : null, scans: l.scans, used: l.lastUsedAt ? ago(l.lastUsedAt, now) : null })),
      sectors: [...sectors].map(([name, x]) => ({ name, n: x.inn, total: x.n, pct: x.n ? Math.round((x.inn / x.n) * 100) : 0 })),
      last: inside.sort((a, b) => b.checkedInAt!.getTime() - a.checkedInAt!.getTime()).slice(0, 8).map((p) => ({ id: p.id, name: p.holder || p.buyer || "Participante", what: [p.sector, p.type].filter(Boolean).join(" · "), at: hm(p.checkedInAt!) })),
    },
    fin: {
      gross: brl(gross), buyerFees: brl(buyerFees), platform: brl(gross - net), net: brl(net),
      refunds: refunded.map((o) => ({ id: o.id, name: o.buyer, value: brl(o.revenue), when: ago(o.at) })),
      refundPct: gross + sum(refunded, (o) => o.revenue) ? ((sum(refunded, (o) => o.revenue) / (gross + sum(refunded, (o) => o.revenue))) * 100).toFixed(1).replace(".", ",") : "0",
    },
  };
  const phase = salePhase(e);
  props.launch = {
    eventId: e.id, salesOpenAt: localInput(e.salesOpenAt), presaleAt: localInput(e.presaleAt), phase,
    phaseLabel: phase === "open" ? (e.salesOpenAt ? "Vendas abertas" : "À venda") : phase === "presale" ? "Pré-venda" : "Em breve",
    presaleSent: e.presaleSentAt ? `${dm(e.presaleSentAt)}, ${hm(e.presaleSentAt)}` : null,
    openingSent: e.openingSentAt ? `${dm(e.openingSentAt)}, ${hm(e.openingSentAt)}` : null,
    emailOn: emailEnabled(),
    queueMode: (["auto", "on", "off"].includes(e.queueMode) ? e.queueMode : "auto") as "auto" | "on" | "off", queueLimit: e.queueLimit,
    queueNow: { active: qActive?.n ?? 0, waiting: qWaiting?.n ?? 0 },
    signups: signups.map((x) => ({ id: x.id, kind: x.kind === "presale" ? "presale" : "abertura", email: x.email, when: `${dm(x.createdAt)}, ${hm(x.createdAt)}`, notified: !!x.notifiedAt, used: !!x.usedAt, token: x.token })),
  };
  const rsSold = resale.filter((r) => r.status === "sold");
  props.revenda = {
    eventId: e.id, transferEnabled: e.transferEnabled, resaleEnabled: e.resaleEnabled, resaleMaxPct: e.resaleMaxPct,
    transferUntilHours: e.transferUntilHours, resaleUntilHours: e.resaleUntilHours,
    kpis: {
      active: resale.filter((r) => r.status === "active" || r.status === "reserved").length, sold: rsSold.length,
      volume: brl(rsSold.reduce((s, r) => s + r.priceCents, 0)), transfers: transfers?.n ?? 0,
    },
    listings: resale.map((r) => {
      const { faceCents } = resaleCap(r.ticketType.priceCents, r.ticket.halfPrice, 100);
      return {
        id: r.id, code: r.ticket.code, what: [r.ticketType.sector, r.ticketType.name].filter(Boolean).join(" · ") + (r.ticket.halfPrice ? " (meia)" : ""),
        price: brl(r.priceCents), pct: faceCents ? Math.round((r.priceCents / faceCents) * 100) : 100,
        status: (["active", "reserved", "sold", "cancelled"].includes(r.status) ? r.status : "cancelled") as "active" | "reserved" | "sold" | "cancelled",
        when: `${dm(r.soldAt ?? r.createdAt)}, ${hm(r.soldAt ?? r.createdAt)}`,
      };
    }),
  };
  props.lista = {
    eventId: e.id, title: e.title, emailOn: emailEnabled(), max: GUEST_MAX_PER_EVENT, pasteMax: GUEST_MAX_PER_PASTE,
    guests: guests.map((x) => ({
      id: x.id, name: x.name, email: x.email ?? "", token: x.token, guests: x.guests, note: x.note ?? "",
      inAt: x.checkedInAt ? `${dm(x.checkedInAt)}, ${hm(x.checkedInAt)}` : null, by: x.checkedInBy, invited: !!x.invitedAt, added: dm(x.createdAt),
    })),
  };
  props.reembolsos = await refundTabData(e, localInput(e.startAt), whenLabel(e), now);
  return <PainelEvento {...props} />;
}
