export type HomeTier = { name: string; note: string | null; priceCents: number; status: "open" | "sold_out" | "upcoming" | "closed" };

/** Evento já formatado no servidor (datas como string/ms) para a home. */
export type HomeEvent = {
  slug: string; title: string; flyerId: string; bannerId: string;
  startMs: number; endMs: number; dateNice: string;
  venue: string; city: string; uf: string; minPriceCents: number; popularity: number;
  kinds: string[]; categoryLabel: string; lineup: string[]; description: string; tiers: HomeTier[];
  /** posição em "Eventos em destaque" (central); null = ordem normal */
  pin: number | null;
  /** banner principal em HTML (central) */
  bannerHtml?: string | null;
};

export type HomeCategory = { slug: string; name: string; coverFlyer: string; count: number };
export type CityOpt = { value: string; label: string };
export type DateFilter = "any" | "hoje" | "semana" | "fds" | "p30";
