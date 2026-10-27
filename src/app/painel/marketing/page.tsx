import type { Metadata } from "next";
import { eq, inArray } from "drizzle-orm";
import { PainelMarketing, type MarketingProps } from "@/components/painel/marketing";
import { db, schema } from "@/db";
import { listOrders } from "@/lib/data/painel";
import { brl, dateNice } from "@/lib/format";
import { painelAccess } from "@/lib/painel/access";
import { ended, nowMs, whenLabel } from "@/lib/painel/build";
import { promoterStats } from "@/lib/promoters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing" };

/** Cupons de todos os eventos, links para divulgar e atalho para falar com os seguidores. */
export default async function PainelMarketingPage() {
  const { org, events } = await painelAccess("admin");
  const ids = events.map((e) => e.id);
  const [cps, orders] = await Promise.all([
    ids.length ? db.query.coupons.findMany({ where: inArray(schema.coupons.eventId, ids) }) : Promise.resolve([]),
    listOrders(ids, new Map(events.map((e) => [e.id, e.absorbFee]))),
  ]);
  const used = new Map<string, { n: number; off: number; rev: number }>();
  for (const o of orders) if (o.status === "paid" && o.couponId) {
    const x = used.get(o.couponId) ?? { n: 0, off: 0, rev: 0 };
    x.n += 1; x.off += o.discount; x.rev += o.revenue; used.set(o.couponId, x);
  }
  const title = new Map(events.map((e) => [e.id, e.title]));
  const proms = org ? await db.query.promoters.findMany({ where: eq(schema.promoters.organizerId, org.id), orderBy: (x, { desc }) => [desc(x.createdAt)] }) : [];
  const pstats = await promoterStats(proms.map((x) => x.id));
  const tot = [...pstats.values()].reduce((a, x) => ({ orders: a.orders + x.orders, rev: a.rev + x.revenueCents, com: a.com + x.commissionCents }), { orders: 0, rev: 0, com: 0 });
  const now = nowMs();
  const props: MarketingProps = {
    events: events.filter((e) => e.status !== "draft" && !ended(e, now)).map((e) => ({ id: e.id, slug: e.slug, title: e.title, when: whenLabel(e), unlisted: e.unlisted })),
    coupons: cps.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((c) => {
      const u = used.get(c.id);
      const expired = !!c.expiresAt && c.expiresAt.getTime() < now;
      return {
        id: c.id, code: c.code, event: title.get(c.eventId ?? "") ?? "Todos os eventos",
        off: c.percentOff ? `${c.percentOff}%` : brl(c.amountOffCents ?? 0) + (c.amountPerTicket ? " por ingresso" : ""),
        uses: `${u?.n ?? 0}${c.maxUses ? ` / ${c.maxUses}` : ""}`, discount: brl(u?.off ?? 0), revenue: brl(u?.rev ?? 0),
        until: c.expiresAt ? dateNice(c.expiresAt) : "Sem validade", active: c.active && !expired, expired, sector: c.sector,
      };
    }),
    totals: { uses: [...used.values()].reduce((s, x) => s + x.n, 0), off: brl([...used.values()].reduce((s, x) => s + x.off, 0)), rev: brl([...used.values()].reduce((s, x) => s + x.rev, 0)) },
    orgSlug: org?.slug ?? null,
    promoters: org ? {
      rows: proms.map((x) => {
        const st = pstats.get(x.id) ?? { orders: 0, tickets: 0, revenueCents: 0, commissionCents: 0 };
        return {
          id: x.id, name: x.name, email: x.email ?? "", event: x.eventId ? title.get(x.eventId) ?? "Evento" : "Todos os eventos", code: x.code, token: x.token,
          pct: x.commissionPct, active: x.active, clicks: x.clicks, orders: st.orders, tickets: st.tickets, revenue: brl(st.revenueCents), commission: brl(st.commissionCents),
          conv: x.clicks && st.orders ? `${Math.round((st.orders / x.clicks) * 100)}% compraram` : "",
        };
      }),
      events: events.filter((e) => e.status !== "draft" && !ended(e, now)).map((e) => ({ id: e.id, title: e.title })),
      totals: { orders: tot.orders, revenue: brl(tot.rev), commission: brl(tot.com) },
    } : null,
  };
  return <PainelMarketing {...props} />;
}
