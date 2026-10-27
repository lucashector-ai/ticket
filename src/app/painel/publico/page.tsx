import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { PainelPublico, type PublicoProps } from "@/components/painel/publico";
import { db, schema } from "@/db";
import { listOrders } from "@/lib/data/painel";
import { brl, initials } from "@/lib/format";
import { painelAccess } from "@/lib/painel/access";
import { ago, avBg, nowMs } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Público" };

/** Quem compra e quem segue: compradores únicos, recorrência, seguidores e a lista para exportar. */
export default async function PainelPublicoPage() {
  const { org, events } = await painelAccess("admin");
  const orders = (await listOrders(events.map((e) => e.id), new Map(events.map((e) => [e.id, e.absorbFee])))).filter((o) => o.status === "paid");
  const title = new Map(events.map((e) => [e.id, e.title]));
  const now = nowMs();

  const [fol] = org
    ? await db.select({ n: sql<number>`count(*)`, notify: sql<number>`count(*) filter (where ${schema.follows.notify})` }).from(schema.follows)
      .where(and(eq(schema.follows.targetType, "organizer"), eq(schema.follows.targetId, org.id)))
    : [{ n: 0, notify: 0 }];

  type B = { name: string; email: string; orders: number; tickets: number; spent: number; events: Set<string>; last: Date; lastEvent: string; meia: number };
  const by = new Map<string, B>();
  for (const o of orders) {
    const b = by.get(o.userId) ?? { name: o.buyer, email: o.email ?? "", orders: 0, tickets: 0, spent: 0, events: new Set<string>(), last: o.at, lastEvent: "", meia: 0 };
    b.orders += 1; b.tickets += o.qty; b.spent += o.revenue; b.events.add(o.eventId); if (o.meia) b.meia += 1;
    if (o.at >= b.last || !b.lastEvent) { b.last = o.at; b.lastEvent = title.get(o.eventId) ?? ""; }
    by.set(o.userId, b);
  }
  const buyers = [...by.values()];
  const repeat = buyers.filter((b) => b.events.size > 1).length;
  const spent = buyers.reduce((s, b) => s + b.spent, 0);
  const new30 = buyers.filter((b) => now - b.last.getTime() < 30 * 86_400_000).length;

  const perEvent = events.filter((e) => e.status !== "draft").map((e) => {
    const mine = buyers.filter((b) => b.events.has(e.id));
    return { id: e.id, title: e.title, buyers: mine.length, back: mine.filter((b) => b.events.size > 1).length };
  }).filter((x) => x.buyers > 0).sort((a, b) => b.buyers - a.buyers);

  const props: PublicoProps = {
    kpis: [
      { l: "Compradores únicos", v: buyers.length.toLocaleString("pt-BR"), n: `${new30} compraram nos últimos 30 dias` },
      { l: "Voltaram a comprar", v: buyers.length ? `${Math.round((repeat / buyers.length) * 100)}%` : "—", n: `${repeat} foram a mais de um evento` },
      { l: "Seguidores", v: Number(fol?.n ?? 0).toLocaleString("pt-BR"), n: `${Number(fol?.notify ?? 0)} com avisos de pré-venda ligados` },
      { l: "Gasto médio por pessoa", v: brl(buyers.length ? Math.round(spent / buyers.length) : 0), n: "em ingressos, sem a taxa" },
    ],
    perEvent,
    buyers: buyers.sort((a, b) => b.spent - a.spent).map((b, i) => ({
      id: String(i), name: b.name, ini: initials(b.name) || "?", bg: avBg(b.name), email: b.email, orders: b.orders, tickets: b.tickets,
      spent: brl(b.spent), events: b.events.size, last: `${b.lastEvent} · ${ago(b.last, now)}`, meia: b.meia > 0,
    })),
    orgSlug: org?.slug ?? null,
  };
  return <PainelPublico {...props} />;
}
