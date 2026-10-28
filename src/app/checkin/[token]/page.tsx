import type { Metadata } from "next";
import { CheckinApp } from "@/components/checkin/checkin-app";
import { activeCheckinLink, checkinCounts } from "@/lib/checkin";
import { dateNice } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check-in", robots: { index: false, follow: false } };

/** Tela de check-in aberta pelo link que o produtor gera no painel: valida ingressos pelo celular, sem login. */
export default async function CheckinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await activeCheckinLink(token);
  if (!link) return <CheckinApp token={token} off />;
  const c = await checkinCounts(link.eventId);
  const e = link.event;
  return (
    <CheckinApp
      token={token}
      gate={link.label}
      event={{ title: e.title, flyerId: e.flyerId, when: e.dateLabel ?? dateNice(e.startAt) }}
      total={c.total}
      inside={c.inside}
    />
  );
}
