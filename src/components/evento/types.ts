/* Dados serializáveis da página do evento (server → client). */

export type LineupItem = {
  id: string;
  slug: string;
  name: string;
  time: string | null;
  role: string | null;
  initials: string;
  /** foto (Spotify ou enviada); sem foto, usa o avatar com as cores */
  image: string | null;
  /** ligado ao Spotify (tem player na página do artista) */
  spotify: boolean;
  grad: string;
  fg: string;
  tracks: { title: string; plays: string; duration: string; grad: string }[];
};

export type TierItem = {
  id: string;
  name: string;
  note: string | null;
  /** descrição do tipo (quem pode comprar, o que inclui) */
  desc: string | null;
  priceCents: number;
  status: "upcoming" | "open" | "sold_out" | "closed";
  available: number;
  sector: string | null;
  sectorColor: string | null;
  sessionId: string | null;
};

/** Uma data de um evento com várias datas ou turnê. */
export type SessionItem = { id: string; wd: string; day: string; sub: string };

export type OrganizerInfo = {
  id: string;
  slug: string;
  avatarUrl: string | null;
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
  sessions: SessionItem[];
  /** planta do local para o mapa 3D; cada área de setor traz o nome e a cor do setor de ingressos */
  venueMap: VenueMapData | null;
  maxPerOrder: number;
  minPriceCents: number;
  /** abertura das vendas e pré-venda (datas em ISO); `access`: tem o link da pré-venda */
  /** anúncios ativos da revenda oficial (preço do anúncio e com a taxa de serviço) */
  resale: { offers: { id: string; label: string; color: string | null; session: string | null; priceCents: number; totalCents: number; mine: boolean }[] };
  /** fila virtual ligada (automática ou sempre) */
  queueOn: boolean;
  launch: { phase: "soon" | "presale" | "open"; openAt: string | null; presaleAt: string | null; access: boolean };
};

export type VenueMapData = {
  width: number;
  depth: number;
  /** sem lotação: o público não vê quantos ingressos existem por área */
  areas: { id: string; name: string; kind: string; x: number; y: number; w: number; d: number; h: number; sectorName: string | null; color: string }[];
};
