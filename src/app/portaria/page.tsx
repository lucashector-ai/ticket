import { PortariaApp } from "@/components/portaria/app";
import { PortariaLogin } from "@/components/portaria/login";
import { checkinCounts } from "@/lib/checkin";
import { dateNice } from "@/lib/format";
import { portariaSession } from "@/lib/portaria";

export const dynamic = "force-dynamic";

/** Sem acesso: tela do código. Com acesso: câmera em tela cheia do evento. */
export default async function PortariaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const [link, sp] = await Promise.all([portariaSession(), searchParams]);
  if (!link) return <PortariaLogin linkError={sp.erro === "link"} />;
  const c = await checkinCounts(link.eventId);
  return <PortariaApp gate={link.label} event={{ title: link.event.title, when: link.event.dateLabel ?? dateNice(link.event.startAt) }} counts={c} />;
}
