import type { Metadata } from "next";
import { HomeClient } from "@/components/home/home-client";
import type { HeroItem, HomeEvent } from "@/components/home/types";
import { getSessionUser } from "@/lib/auth/server";
import { listCategories, listCities, listHeroEvents, listLiveEvents, type EventCard } from "@/lib/data/events";
import { listHeroSlides } from "@/lib/data/hero";
import { listHomeExtras } from "@/lib/data/home";
import { getSpotifyConnection } from "@/lib/data/user";
import { slugify } from "@/lib/format";
import { mergeHero } from "@/lib/hero-slides";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Tickets Win · Descubra eventos" },
  description: "Descubra os eventos que valem sair de casa. Festas, shows, festivais e experiências nas principais cidades do Brasil.",
};

export default async function Home() {
  const [live, hero, slides, cats, cities, user] = await Promise.all([listLiveEvents(), listHeroEvents(), listHeroSlides(), listCategories(), listCities(), getSessionUser()]);
  const [extras, spotifyConn] = await Promise.all([listHomeExtras([...live, ...hero].map((e) => e.id)), getSpotifyConnection(user?.id)]);

  const toHome = (e: EventCard & { heroArt?: string | null; heroHtml?: string | null }): HomeEvent => ({
    slug: e.slug, title: e.title, flyerId: e.flyerId, bannerId: e.heroArt ?? e.bannerId ?? e.flyerId, bannerHtml: e.heroHtml ?? null, pin: e.featuredOrder,
    startMs: e.startAt.getTime(), endMs: (e.endAt ?? e.startAt).getTime(), dateNice: e.dateNice,
    venue: e.venue, city: e.city, uf: e.uf, minPriceCents: e.minPriceCents, popularity: e.popularity,
    kinds: e.kinds, categoryLabel: e.categoryLabel ?? "Evento", lineup: e.lineup,
    description: extras[e.id]?.description ?? e.tagline ?? "", tiers: extras[e.id]?.tiers ?? [],
  });

  const events = live.map(toHome);
  // carrossel: eventos escolhidos na central (sem nenhum, os próximos 4) e banners livres, pela posição de cada um
  const heroEv = hero.length ? hero.map((e) => ({ order: e.heroOrder, item: toHome(e) })) : live.slice(0, 4).map((e) => ({ order: null, item: toHome(e) }));
  const heroItems: HeroItem[] = mergeHero(heroEv, slides.map((s) => ({ position: s.position, item: s }))).map((x) =>
    x.kind === "event"
      ? { kind: "event", key: `e:${x.item.slug}`, ev: x.item }
      : { kind: "free", key: `s:${x.item.id}`, slide: { id: x.item.id, label: x.item.label, href: x.item.href, cta: x.item.cta, html: x.item.html, image: x.item.image, w: x.item.width, h: x.item.height, bg: x.item.bg,
          mobile: x.item.htmlMobile ? { html: x.item.htmlMobile, w: x.item.mobileWidth, h: x.item.mobileHeight } : null } },
  );
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
    <HomeClient user={headerUser} events={events} hero={heroItems} categories={categories} cityOpts={cityOpts} spotify={spotify} />
  );
}
