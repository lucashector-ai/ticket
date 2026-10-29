import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { ProdutorView, type ProdutorProps } from "@/components/produtor/produtor-view";
import { getSessionUser } from "@/lib/auth/server";
import { getProducerPage } from "@/lib/data/produtor";
import { brl, dateLong, daysUntil, initials } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await getProducerPage(slug, null);
  if (!d) return { title: "Produtor não encontrado" };
  return { title: d.org.name, description: d.org.tagline ?? d.org.bio?.slice(0, 160) ?? `Eventos de ${d.org.name} na Tickets Win.` };
}

const when = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "hoje";
  if (days < 2) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const m = Math.floor(days / 30);
  return m < 12 ? `há ${m} ${m === 1 ? "mês" : "meses"}` : `há ${Math.floor(m / 12)} ${m < 24 ? "ano" : "anos"}`;
};
const countdown = (d: Date) => {
  const n = daysUntil(d);
  return n <= 0 ? "é hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
};

export default async function ProdutorPage({ params }: Params) {
  const { slug } = await params;
  const user = await getSessionUser();
  const d = await getProducerPage(slug, user?.id ?? null);
  if (!d) notFound();
  const { org } = d;

  /* nota média e distribuição (5 → 1) */
  const n = d.reviews.length;
  const avg = n ? d.reviews.reduce((s, r) => s + r.rating, 0) / n : 0;
  const dist = [5, 4, 3, 2, 1].map((k) => (n ? Math.round((d.reviews.filter((r) => r.rating === k).length / n) * 100) : 0));
  const byEvent = new Map<string, { sum: number; n: number }>();
  for (const r of d.reviews) {
    const x = byEvent.get(r.eventSlug) ?? { sum: 0, n: 0 };
    x.sum += r.rating; x.n += 1; byEvent.set(r.eventSlug, x);
  }
  /* locais onde o produtor já fez ou vai fazer eventos */
  const venues = new Map<string, { name: string; city: string; n: number }>();
  for (const e of [...d.upcoming, ...d.past]) {
    if (!e.venue) continue;
    const k = `${e.venue}|${e.city}`;
    const v = venues.get(k) ?? { name: e.venue, city: [e.city, e.uf].filter(Boolean).join(", "), n: 0 };
    v.n += 1; venues.set(k, v);
  }
  const next = d.upcoming[0] ?? null;

  const props: ProdutorProps = {
    user: user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null,
    loggedIn: !!user,
    isOwner: d.isOwner,
    org: {
      id: org.id, slug: org.slug, name: org.name, initials: org.initials ?? initials(org.name), verified: org.verified,
      tagline: org.tagline ?? "", bio: org.bio ?? "", avatarUrl: org.avatarUrl, coverUrl: org.coverUrl,
      cityName: org.cityName ?? "", uf: org.uf ?? "", instagram: org.instagram ?? "", website: org.website ?? "",
      contactEmail: org.contactEmail ?? "", whatsapp: org.whatsapp ?? "", legalName: org.legalName ?? "", cnpj: org.cnpj ?? "",
      policies: { cancel: org.policies?.cancel ?? "", meia: org.policies?.meia ?? "", transfer: org.policies?.transfer ?? "", access: org.policies?.access ?? "" },
      since: String(org.createdAt.getFullYear()),
    },
    followers: d.followers,
    following: d.following,
    notify: d.notify,
    next: next ? {
      slug: next.slug, title: next.title, bannerId: next.bannerId ?? next.flyerId, dateLong: dateLong(next.startAt),
      venue: next.venue, city: next.city, uf: next.uf, price: next.minPriceCents ? brl(next.minPriceCents) : "Grátis",
      countdown: countdown(next.startAt), soldPct: d.nextSold,
    } : null,
    upcoming: d.upcoming.slice(next ? 1 : 0),
    past: d.past.map((e) => {
      const r = byEvent.get(e.slug);
      return { slug: e.slug, title: e.title, flyerId: e.flyerId, date: dateLong(e.startAt), venue: e.venue, city: e.city, uf: e.uf, rating: r ? (r.sum / r.n).toFixed(1).replace(".", ",") : null, reviews: r?.n ?? 0 };
    }),
    posts: d.posts.map((p) => {
      const ev = p.eventId ? [...d.upcoming, ...d.past].find((e) => e.id === p.eventId) : undefined;
      return { id: p.id, body: p.body, imageUrl: p.imageUrl, when: when(p.createdAt), event: ev ? { slug: ev.slug, title: ev.title } : null };
    }),
    reviews: d.reviews.map((r) => ({ id: r.id, name: r.name, initials: initials(r.name), rating: r.rating, body: r.body, tags: r.tags, reply: r.reply, event: r.eventTitle, when: when(r.createdAt) })),
    rating: { avg: n ? avg.toFixed(1).replace(".", ",") : "–", n, dist },
    canReview: d.canReview,
    venues: [...venues.values()].sort((a, b) => b.n - a.n).slice(0, 6),
    myEvents: d.isOwner ? [...d.upcoming, ...d.past].map((e) => ({ id: e.id, title: e.title })) : [],
  };

  return (
    <div className="pg-produtor" style={{ minHeight: "100vh", background: "#FFFFFF" }}>
      <ProdutorView {...props} />
      <SiteFooter />
    </div>
  );
}
