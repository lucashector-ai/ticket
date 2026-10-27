import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FavoritesHydrator } from "@/components/favorites";
import { TicketView, type TicketViewData } from "@/components/ingressos/ticket-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSessionUser } from "@/lib/auth/server";
import { getTicketByCode } from "@/lib/data/ingressos";
import { getUserFavoriteSlugs } from "@/lib/data/user";
import { dateNice } from "@/lib/format";
import { countdownLabel, eventLabels } from "@/lib/tickets/labels";
import { ticketQrSvg } from "@/lib/tickets/qr";

export const dynamic = "force-dynamic";

const CODE_RE = /^ONDE-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return { title: `Ingresso ${code.toUpperCase()}` };
}

export default async function IngressoPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toUpperCase();
  const user = await getSessionUser();
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/ingressos/${code}`)}`);
  if (!CODE_RE.test(code)) notFound();
  const [t, favs] = await Promise.all([getTicketByCode(code), getUserFavoriteSlugs(user.id)]);
  // Só o titular vê o ingresso; para os demais é como se não existisse.
  if (!t || t.holderUserId !== user.id) notFound();

  const now = new Date();
  const e = t.event;
  const L = eventLabels(e);
  const data: TicketViewData = {
    ticket: { id: t.id, code: t.code, holderName: t.holderName, status: t.status, checkedInAt: t.checkedInAt?.toISOString() ?? null, qrSvg: await ticketQrSvg(t.code, t.secret) },
    eventSlug: e.slug, title: e.title, flyerId: e.flyerId,
    upcoming: (e.endAt ?? e.startAt).getTime() >= now.getTime(), countdown: countdownLabel(e.startAt, now),
    dateFull: L.dateFull, dateNice: L.dateNice, doors: L.doors, venue: L.venue, addr: L.addr,
    tier: t.ticketType.name, orderNumber: t.order?.number ?? null,
    checkedInLabel: t.checkedInAt ? dateNice(t.checkedInAt) : null,
  };

  return (
    <div className="pg-meus-ingressos">
      <FavoritesHydrator serverFavs={favs} loggedIn />
      <SiteHeader user={user} variant="default" activePath="/meus-ingressos" />
      <TicketView data={data} />
      <SiteFooter />
    </div>
  );
}
