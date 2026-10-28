import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { PainelPromotersPage, type PromotersPageProps } from "@/components/painel/promoters-page";
import { db, schema } from "@/db";
import { brl } from "@/lib/format";
import { painelAccess } from "@/lib/painel/access";
import { ended, nowMs, whenLabel } from "@/lib/painel/build";
import { promoterStats } from "@/lib/promoters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Promoters" };

type Props = { searchParams: Promise<{ evento?: string }> };

/** Quem está vendendo os ingressos: ranking de promoters por evento, com links, vendas e comissão. */
export default async function PainelPromotersRoute({ searchParams }: Props) {
  const { evento } = await searchParams;
  const { org, events } = await painelAccess("admin");
  const now = nowMs();
  const pub = events.filter((e) => e.status !== "draft");
  const ev = pub.find((e) => e.id === evento) ?? null;
  const title = new Map(events.map((e) => [e.id, e.title]));
  const proms = org ? await db.query.promoters.findMany({ where: eq(schema.promoters.organizerId, org.id), orderBy: (x, { desc }) => [desc(x.createdAt)] }) : [];
  // com um evento escolhido: só os links daquele evento e os gerais, e as vendas daquele evento
  const shown = ev ? proms.filter((x) => !x.eventId || x.eventId === ev.id) : proms;
  const stats = await promoterStats(shown.map((x) => x.id), ev?.id);
  const rows = shown.map((x) => {
    const st = stats.get(x.id) ?? { orders: 0, tickets: 0, revenueCents: 0, commissionCents: 0 };
    return {
      id: x.id, name: x.name, email: x.email ?? "", event: x.eventId ? title.get(x.eventId) ?? "Evento" : "Todos os eventos", code: x.code, token: x.token,
      pct: x.commissionPct, active: x.active, clicks: x.clicks, orders: st.orders, tickets: st.tickets, revenue: brl(st.revenueCents), commission: brl(st.commissionCents),
      conv: x.clicks && st.orders ? `${Math.round((st.orders / x.clicks) * 100)}% compraram` : "", cents: st.revenueCents,
    };
  }).sort((a, b) => b.cents - a.cents || b.tickets - a.tickets || b.clicks - a.clicks);
  const sum = rows.reduce((a, r) => ({ orders: a.orders + r.orders, tickets: a.tickets + r.tickets, rev: a.rev + r.cents, clicks: a.clicks + r.clicks, com: a.com + (stats.get(r.id)?.commissionCents ?? 0) }), { orders: 0, tickets: 0, rev: 0, clicks: 0, com: 0 });

  const props: PromotersPageProps = {
    hasOrg: !!org,
    events: pub.map((e) => ({ id: e.id, title: e.title, when: whenLabel(e), past: ended(e, now) })),
    eventId: ev?.id ?? "",
    kpis: { revenue: brl(sum.rev), tickets: sum.tickets, orders: sum.orders, commission: brl(sum.com), clicks: sum.clicks, conv: sum.clicks ? `${Math.round((sum.orders / sum.clicks) * 100)}%` : "—", active: rows.filter((r) => r.active).length },
    list: {
      rows: rows.map(({ cents: _c, ...r }) => r),
      events: pub.filter((e) => !ended(e, now)).map((e) => ({ id: e.id, title: e.title })),
      totals: { orders: sum.orders, revenue: brl(sum.rev), commission: brl(sum.com) },
    },
  };
  return <PainelPromotersPage {...props} />;
}
