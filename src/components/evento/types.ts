/* Dados serializáveis da página do evento (server → client). */

export type LineupItem = {
  id: string;
  slug: string;
  name: string;
  time: string | null;
  role: string | null;
  initials: string;
  grad: string;
  fg: string;
  tracks: { title: string; plays: string; duration: string; grad: string }[];
};

export type TierItem = {
  id: string;
  name: string;
  note: string | null;
  priceCents: number;
  status: "upcoming" | "open" | "sold_out" | "closed";
  available: number;
};

export type OrganizerInfo = {
  id: string;
  name: string;
  initials: string;
  bio: string | null;
  verified: boolean;
  email: string | null;
};

export type EventoData = {
  id: string;
  slug: string;
  title: string;
  flyerId: string;
  /** cor principal do flyer: fundo atrás do desfoque do topo */
  accentColor: string;
  bannerId: string;
  category: string | null;
  dateFull: string;
  startTime: string;
  timed: boolean;
  doors: string | null;
  venue: string;
  addr: string;
  city: string;
  uf: string;
  mapsUrl: string;
  paragraphs: string[];
  age: string | null;
  halfPrice: string | null;
  refund: string | null;
  lineup: LineupItem[];
  organizer: OrganizerInfo | null;
  tiers: TierItem[];
  maxPerOrder: number;
  minPriceCents: number;
};
