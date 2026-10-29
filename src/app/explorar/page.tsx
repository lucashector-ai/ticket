import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ExplorarView } from "@/components/explorar/explorar-view";
import { parseFilters } from "@/components/explorar/filters";
import { getSessionUser } from "@/lib/auth/server";
import { listCategories, listCities, listLiveEvents, searchEvents } from "@/lib/data/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explorar eventos",
  description: "Busque e filtre todos os eventos por cidade, data, categoria e preço.",
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ExplorarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [events, cities, categories, user] = await Promise.all([listLiveEvents(), listCities(), listCategories(), getSessionUser()]);

  // o server garante a primeira lista correta (SSR); o client refiltra em memória
  const cityName = cities.find((c) => c.slug === filters.city || c.name === filters.city)?.name;
  const initialResults = await searchEvents({
    q: filters.q || undefined,
    city: cityName ?? "all",
    cat: filters.cat,
    date: filters.date,
    sort: filters.sort,
    maxPrice: filters.max ?? undefined,
  });

  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;

  return (
    <div className="pg-explorar">
      <SiteHeader user={headerUser} variant="default" activePath="/explorar" />
      <main id="explorar">
        <Suspense fallback={null}>
          <ExplorarView
            events={events}
            cities={cities.map((c) => ({ slug: c.slug, name: c.name, uf: c.uf }))}
            categories={categories.map((c) => ({ slug: c.slug, name: c.name, coverFlyer: c.coverFlyer }))}
            initial={filters}
            initialResults={initialResults}
          />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
