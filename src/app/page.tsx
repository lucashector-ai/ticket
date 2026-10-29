import type { Metadata } from "next";
import { HomeClient } from "@/components/home/home-client";
import type { HomeEvent } from "@/components/home/types";
import { getSessionUser } from "@/lib/auth/server";
import { listCategories, listCities, listHeroEvents, listLiveEvents, type EventCard } from "@/lib/data/events";
import { listHomeExtras } from "@/lib/data/home";
import { getSpotifyConnection } from "@/lib/data/user";
import { slugify } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Tickets Win · Descubra eventos" },
  description: "Descubra os eventos que valem sair de casa. Festas, shows, festivais e experiências nas principais cidades do Brasil.",
};

export default async function Home() {
  const [live, hero, cats, cities, user] = await Promise.all([listLiveEvents(), listHeroEvents(), listCategories(), listCities(), getSessionUser()]);
  const [extras, spotifyConn] = await Promise.all([listHomeExtras([...live, ...hero].map((e) => e.id)), getSpotifyConnection(user?.id)]);

  const toHome = (e: EventCard & { heroArt?: string | null; heroHtml?: string | null }): HomeEvent => ({
    slug: e.slug, title: e.title, flyerId: e.flyerId, bannerId: e.heroArt ?? e.bannerId ?? e.flyerId, bannerHtml: e.heroHtml ?? null, pin: e.featuredOrder,
    startMs: e.startAt.getTime(), endMs: (e.endAt ?? e.startAt).getTime(), dateNice: e.dateNice,
    venue: e.venue, city: e.city, uf: e.uf, minPriceCents: e.minPriceCents, popularity: e.popularity,
    kinds: e.kinds, categoryLabel: e.categoryLabel ?? "Evento", lineup: e.lineup,
    description: extras[e.id]?.description ?? e.tagline ?? "", tiers: extras[e.id]?.tiers ?? [],
  });

  const events = live.map(toHome);
  const heroEvents = (hero.length ? hero : live.slice(0, 4)).map(toHome);
  const categories = cats.slice(0, 7).map((c) => ({
    slug: c.slug, name: c.name, coverFlyer: c.coverFlyer ?? "baile",
    count: live.filter((e) => e.kinds.includes(c.slug)).length,
  }));
  const cityOpts = [
    { value: "all", label: "Todas as cidades" },
    ...cities
      .filter((c) => live.some((e) => e.city === c.name))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((c) => ({ value: c.name, label: c.name })),
  ];
  // shows dos artistas que a pessoa ouve no Spotify (pelo nome, como aparece no line-up)
  const heard = new Set((spotifyConn?.artists ?? []).map((a) => slugify(a.name)));
  const spotify = spotifyConn
    ? { connected: true, name: spotifyConn.displayName, picks: events.filter((e) => e.lineup.some((n) => heard.has(slugify(n)))).map((e) => e.slug) }
    : { connected: false, name: null, picks: [] };
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <HomeClient user={headerUser} events={events} heroEvents={heroEvents} categories={categories} cityOpts={cityOpts} spotify={spotify} />
  );
}
