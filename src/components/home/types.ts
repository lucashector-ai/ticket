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

/** Banner livre do carrossel (não é evento: HTML ou imagem com link próprio), já pronto para a home. */
export type HomeFreeSlide = {
  id: string; label: string; href: string; cta: string | null;
  html: string | null; image: string | null;
  /** tamanho de projeto da arte e a cor de fundo que preenche as sobras */
  w: number; h: number; bg: string;
};

/** Slide do carrossel principal: um evento ou um banner livre. */
export type HeroItem = { kind: "event"; key: string; ev: HomeEvent } | { kind: "free"; key: string; slide: HomeFreeSlide };

export type HomeCategory = { slug: string; name: string; coverFlyer: string; count: number };
export type CityOpt = { value: string; label: string };
export type DateFilter = "any" | "hoje" | "semana" | "fds" | "p30";
