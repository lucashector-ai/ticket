import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { BrandLogo } from "@/components/brand-logo";
import { CopyButton } from "@/components/copy-button";
import { brl, dateNice } from "@/lib/format";
import { promoterStats } from "@/lib/promoters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel do parceiro", robots: { index: false } };

/** Página do parceiro (link secreto): o link de divulgação dele, cliques, vendas e comissão. Sem dados dos compradores. */
export default async function ParceiroPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await db.query.promoters.findFirst({
    where: eq(schema.promoters.token, token),
    with: { event: { columns: { title: true, slug: true, startAt: true } }, organizer: { columns: { name: true, slug: true } } },
  });
  if (!p) notFound();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = `${site}/r/${p.code}`;
  const st = (await promoterStats([p.id])).get(p.id) ?? { orders: 0, tickets: 0, revenueCents: 0, commissionCents: 0 };
  const recent = await db.query.orders.findMany({
    where: and(eq(schema.orders.promoterId, p.id), eq(schema.orders.status, "paid")),
    orderBy: [desc(schema.orders.paidAt)], limit: 20,
    columns: { id: true, paidAt: true, totalCents: true, feeCents: true, interestCents: true, commissionCents: true },
    with: { event: { columns: { title: true } }, items: { columns: { quantity: true } } },
  });
  const kpis: [string, string][] = [
    ["Cliques no link", String(p.clicks)],
    ["Ingressos vendidos", String(st.tickets)],
    ["Vendido pelo seu link", brl(st.revenueCents)],
    ["Sua comissão", brl(st.commissionCents)],
  ];

  return (
    <div className="pg-parceiro">
      <header className="pc-top"><Link href="/" aria-label="Tickets Win"><BrandLogo height={22} /></Link><span className="pc-badge">Parceiro</span></header>
      <main className="pc-wrap">
        <span className="pc-k">{p.organizer?.name ?? "Produtor"} · {p.event ? p.event.title : "todos os eventos"}</span>
        <h1 className="pc-h">Olá, {p.name.split(" ")[0]}</h1>
        <p className="pc-s">Divulgue o seu link. Quem comprar por ele em até 30 dias conta para você, com {p.commissionPct}% de comissão sobre o valor dos ingressos.{p.active ? "" : " Este link está pausado pelo produtor."}</p>
        <div className="pc-link"><code>{link.replace(/^https?:\/\//, "")}</code><CopyButton text={link} label="Copiar meu link" done="Copiado" /></div>
        <div className="pc-kpis">{kpis.map(([l, v]) => <div className="pc-kpi" key={l}><span>{l}</span><b>{v}</b></div>)}</div>
        <section className="pc-list">
          <h2>Últimas vendas</h2>
          {recent.length ? recent.map((o) => (
            <div className="pc-row" key={o.id}>
              <span><b>{o.event.title}</b><small>{o.paidAt ? dateNice(o.paidAt) : ""} · {o.items.reduce((s, i) => s + i.quantity, 0)} ingresso(s)</small></span>
              <span className="pc-v">{brl(o.totalCents - o.feeCents - o.interestCents)}<small>+ {brl(o.commissionCents)} para você</small></span>
            </div>
          )) : <p className="pc-empty">Ainda sem vendas. Compartilhe o link nos stories, no WhatsApp e na bio.</p>}
        </section>
        {p.event && <Link className="pc-ev" href={`/eventos/${p.event.slug}`}>Ver a página do evento →</Link>}
      </main>
    </div>
  );
}
