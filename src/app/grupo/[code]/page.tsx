import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { GrupoView, type GrupoData } from "@/components/grupo/grupo-view";
import { dateNice } from "@/lib/format";
import { SERVICE_FEE_RATE } from "@/lib/pricing";
import { nowMs } from "@/lib/painel/build";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Compra em grupo", robots: { index: false } };

type Props = { params: Promise<{ code: string }>; searchParams: Promise<{ erro?: string }> };

/** Compra em grupo: as vagas reservadas, quem já pagou e o link para chamar os amigos. */
export default async function GrupoPage({ params, searchParams }: Props) {
  const [{ code }, { erro }] = await Promise.all([params, searchParams]);
  const g = await db.query.groupOrders.findFirst({
    where: eq(schema.groupOrders.code, code),
    with: {
      event: { columns: { title: true, slug: true, flyerId: true, startAt: true, dateLabel: true, absorbFee: true, venueNameOverride: true }, with: { venue: { columns: { name: true }, with: { city: { columns: { name: true } } } } } },
      shares: { with: { ticketType: { columns: { name: true, sector: true } } } },
    },
  });
  if (!g) notFound();
  const user = await getSessionUser();
  const now = nowMs();
  const state: GrupoData["state"] = g.status === "done" || g.shares.every((s) => s.paidAt) ? "done" : g.status === "cancelled" ? "cancelled" : g.expiresAt.getTime() <= now ? "expired" : "open";
  const fee = g.event.absorbFee ? 0 : SERVICE_FEE_RATE;
  const data: GrupoData = {
    code: g.code,
    state,
    leader: g.leaderName?.split(" ")[0] ?? "Seu amigo",
    isLeader: user?.id === g.leaderUserId,
    expiresAt: g.expiresAt.toISOString(),
    event: {
      title: g.event.title, slug: g.event.slug, flyerId: g.event.flyerId, when: g.event.dateLabel ?? dateNice(g.event.startAt),
      where: [g.event.venueNameOverride ?? g.event.venue?.name, g.event.venue?.city.name].filter(Boolean).join(" · "),
    },
    shares: [...g.shares].sort((a, b) => a.sortOrder - b.sortOrder).map((s, i) => {
      const paying = !s.paidAt && !!s.claimedAt && now - s.claimedAt.getTime() < 15 * 60_000;
      return {
        id: s.id, n: i + 1, ticket: [s.ticketType.sector, s.ticketType.name].filter(Boolean).join(" · "),
        priceCents: s.priceCents + Math.round(s.priceCents * fee),
        status: s.paidAt ? "paid" : paying ? "paying" : "free",
        who: s.name?.split(" ")[0] ?? null,
        mine: !!user && s.userId === user.id,
      };
    }),
    error: erro ?? null,
  };
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;
  return (
    <div className="pg-grupo">
      <SiteHeader user={headerUser} variant="default" />
      <GrupoView g={data} />
      <SiteFooter />
    </div>
  );
}
