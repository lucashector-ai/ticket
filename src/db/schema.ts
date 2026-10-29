import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Audience, Design } from "@/lib/mail/design";
import type { EventContent } from "@/lib/mail/event-email";

/* ---------- enums ---------- */
export const eventStatus = pgEnum("event_status", ["draft", "published", "cancelled", "finished"]);
export const ticketTypeStatus = pgEnum("ticket_type_status", ["upcoming", "open", "sold_out", "closed"]);
export const orderStatus = pgEnum("order_status", ["pending", "paid", "cancelled", "refunded", "expired"]);
export const paymentMethod = pgEnum("payment_method", ["pix", "card", "free", "test"]);
export const ticketStatus = pgEnum("ticket_status", ["valid", "used", "transferred", "cancelled", "refunded"]);
export const transferStatus = pgEnum("transfer_status", ["pending", "accepted", "cancelled", "expired"]);
export const followTarget = pgEnum("follow_target", ["artist", "organizer"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

/* ---------- geografia ---------- */
export const cities = pgTable(
  "cities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    uf: varchar("uf", { length: 2 }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("cities_slug_idx").on(t.slug)],
);

export const venues = pgTable(
  "venues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    neighborhood: varchar("neighborhood", { length: 120 }),
    address: text("address"),
    cityId: uuid("city_id").notNull().references(() => cities.id),
    lat: varchar("lat", { length: 24 }),
    lng: varchar("lng", { length: 24 }),
    /** id do lugar no Google Places, quando o local veio da busca do Google */
    placeId: varchar("place_id", { length: 300 }),
    capacity: integer("capacity"),
    accessible: boolean("accessible").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("venues_slug_idx").on(t.slug), index("venues_city_idx").on(t.cityId)],
);

/* ---------- pessoas e organizações ---------- */
// Usuários vivem no Neon Auth (schema neon_auth). Aqui guardamos só o perfil extra.
export const userProfiles = pgTable("user_profiles", {
  userId: text("user_id").primaryKey(),
  name: varchar("name", { length: 160 }),
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 32 }),
  cpf: varchar("cpf", { length: 14 }),
  birthDate: varchar("birth_date", { length: 10 }),
  cityId: uuid("city_id").references(() => cities.id),
  avatarUrl: text("avatar_url"),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
  ...timestamps,
});

export const organizers = pgTable(
  "organizers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    bio: text("bio"),
    verified: boolean("verified").notNull().default(false),
    avatarUrl: text("avatar_url"),
    initials: varchar("initials", { length: 3 }),
    ownerUserId: text("owner_user_id"),
    contactEmail: varchar("contact_email", { length: 254 }),
    instagram: varchar("instagram", { length: 120 }),
    /* perfil público (página do produtor, editável pelo dono) */
    coverUrl: text("cover_url"),
    tagline: varchar("tagline", { length: 200 }),
    cityName: varchar("city_name", { length: 120 }),
    uf: varchar("uf", { length: 2 }),
    website: varchar("website", { length: 200 }),
    whatsapp: varchar("whatsapp", { length: 32 }),
    legalName: varchar("legal_name", { length: 200 }),
    cnpj: varchar("cnpj", { length: 20 }),
    policies: jsonb("policies").$type<OrganizerPolicies>(),
    /** conta para receber os repasses (painel → Configurações) */
    payout: jsonb("payout").$type<OrganizerPayout>(),
    /** padrões aplicados aos eventos novos */
    defaults: jsonb("defaults").$type<OrganizerDefaults>(),
    /** respostas do cadastro de produtor (tipo de evento, quantos por ano, público médio) */
    onboarding: jsonb("onboarding").$type<OrganizerOnboarding>(),
    ...timestamps,
  },
  (t) => [uniqueIndex("organizers_slug_idx").on(t.slug)],
);

export type OrganizerPolicies = { cancel?: string; meia?: string; transfer?: string; access?: string };
export type OrganizerPayout = { bank?: string; agency?: string; account?: string; kind?: "corrente" | "poupanca"; holder?: string; doc?: string; pixKey?: string };
export type OrganizerOnboarding = { kind: string; perYear: string; audience: string; doneAt: string };
export type OrganizerDefaults = { buyerPaysFee?: boolean; autoMeia?: boolean; age?: string; refund?: string };

/** Equipe do produtor: admin vê o painel inteiro; portaria só faz o check-in. Convite por e-mail. */
export const organizerMembers = pgTable(
  "organizer_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id").notNull().references(() => organizers.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    role: varchar("role", { length: 16 }).notNull().default("portaria"),
    userId: text("user_id"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("organizer_members_email_idx").on(t.organizerId, t.email), index("organizer_members_user_idx").on(t.userId)],
);

/** Novidades que o produtor publica na página dele (texto, foto, evento ligado). */
export const organizerPosts = pgTable(
  "organizer_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id").notNull().references(() => organizers.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    imageUrl: text("image_url"),
    eventId: uuid("event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("organizer_posts_org_idx").on(t.organizerId, t.createdAt)],
);

export const artists = pgTable(
  "artists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    genre: varchar("genre", { length: 80 }),
    cityName: varchar("city_name", { length: 120 }),
    uf: varchar("uf", { length: 2 }),
    bio: text("bio"),
    verified: boolean("verified").notNull().default(false),
    imageUrl: text("image_url"),
    monthlyListeners: integer("monthly_listeners").notNull().default(0),
    followersCount: integer("followers_count").notNull().default(0),
    showsCount: integer("shows_count").notNull().default(0),
    citiesCount: integer("cities_count").notNull().default(0),
    spotifyUrl: text("spotify_url"),
    youtubeUrl: text("youtube_url"),
    instagramUrl: text("instagram_url"),
    deezerUrl: text("deezer_url"),
    palette: jsonb("palette").$type<{ bg: string; fg: string; accent: string }>(),
    tracks: jsonb("tracks").$type<{ title: string; plays: string; duration: string }[]>(),
    /** artista ligado ao Spotify: id do Spotify e o que puxamos de lá (atualizado de tempos em tempos) */
    spotifyId: varchar("spotify_id", { length: 40 }),
    spotifyData: jsonb("spotify_data").$type<SpotifyArtistData>(),
    spotifySyncedAt: timestamp("spotify_synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("artists_slug_idx").on(t.slug), uniqueIndex("artists_spotify_idx").on(t.spotifyId)],
);

export type SpotifyRelease = { id: string; name: string; type: string; year: string; image: string | null; url: string };
export type SpotifyArtistData = {
  name: string; url: string; image: string | null; genres: string[]; followers: number | null; releases: SpotifyRelease[];
  /** "Sobre": o Spotify não expõe a bio na API, então vem da Wikipédia quando acha o artista */
  about?: { text: string; source: string; url: string } | null;
};

/** Spotify conectado por um usuário: guardamos só os artistas que ele ouve (sem tokens). */
export const spotifyConnections = pgTable("spotify_connections", {
  userId: text("user_id").primaryKey(),
  spotifyUserId: varchar("spotify_user_id", { length: 120 }).notNull(),
  displayName: varchar("display_name", { length: 160 }),
  artists: jsonb("artists").$type<{ id: string; name: string }[]>().notNull().default([]),
  ...timestamps,
});

/* ---------- catálogo ---------- */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    // flyer usado como capa da categoria na home
    coverFlyer: varchar("cover_flyer", { length: 40 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 140 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    tagline: varchar("tagline", { length: 240 }),
    description: text("description"),
    // parágrafos longos da descrição (opcional, sobrescreve description)
    descriptionParagraphs: jsonb("description_paragraphs").$type<string[]>(),
    status: eventStatus("status").notNull().default("published"),
    // identificadores dos designs de flyer/banner gerados pelo sistema
    // id de um design de flyer/banner do sistema ou caminho de imagem enviada (/midia/...)
    flyerId: varchar("flyer_id", { length: 200 }).notNull().default("baile"),
    bannerId: varchar("banner_id", { length: 200 }),
    coverUrl: text("cover_url"),
    accentColor: varchar("accent_color", { length: 9 }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    dateLabel: varchar("date_label", { length: 120 }),
    dateFullLabel: varchar("date_full_label", { length: 160 }),
    timed: boolean("timed").notNull().default(true),
    doorsLabel: varchar("doors_label", { length: 120 }),
    ageRating: varchar("age_rating", { length: 120 }),
    halfPriceInfo: text("half_price_info"),
    refundPolicy: text("refund_policy"),
    venueId: uuid("venue_id").references(() => venues.id),
    venueNameOverride: varchar("venue_name_override", { length: 160 }),
    addressLabel: varchar("address_label", { length: 200 }),
    organizerId: uuid("organizer_id").references(() => organizers.id),
    primaryCategoryLabel: varchar("primary_category_label", { length: 80 }),
    kinds: jsonb("kinds").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    popularity: integer("popularity").notNull().default(0),
    minPriceCents: integer("min_price_cents").notNull().default(0),
    maxPerOrder: integer("max_per_order").notNull().default(8),
    featured: boolean("featured").notNull().default(false),
    heroOrder: integer("hero_order"),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow(),
    /* ---- criado pelo produtor em /criar-evento ---- */
    createdByUserId: text("created_by_user_id"),
    /** fora da busca e da home: só quem tem o link vê */
    unlisted: boolean("unlisted").notNull().default(false),
    /** unica | temporada | turne */
    format: varchar("format", { length: 16 }).notNull().default("unica"),
    /** mapa | simples */
    ticketMode: varchar("ticket_mode", { length: 16 }).notNull().default("simples"),
    /** produtor paga a taxa de serviço (comprador não vê "+ taxas") */
    absorbFee: boolean("absorb_fee").notNull().default(false),
    /** imagens opcionais enviadas pelo produtor */
    media: jsonb("media").$type<{ home?: string; strip?: string; share?: string }>(),
    /** mapa do local: áreas ligadas aos setores */
    venueMap: jsonb("venue_map").$type<{
      prompt: string; sketchUrl?: string;
      plan: { width: number; depth: number; areas: { id: string; name: string; kind: string; x: number; y: number; w: number; d: number; h: number; cap: number; sectorName: string | null; color: string }[] };
    }>(),
    /** estado completo do formulário de criação, para continuar editando */
    draft: jsonb("draft").$type<Record<string, unknown>>(),
    /* ---- lançamento ---- */
    /** abertura das vendas gerais: antes dela a página mostra a contagem regressiva e o "me avise" */
    salesOpenAt: timestamp("sales_open_at", { withTimezone: true }),
    /** pré-venda para cadastrados: começa aqui (link secreto por e-mail) e vai até a abertura */
    presaleAt: timestamp("presale_at", { withTimezone: true }),
    /** quando os links da pré-venda e o aviso de abertura foram enviados */
    presaleSentAt: timestamp("presale_sent_at", { withTimezone: true }),
    openingSentAt: timestamp("opening_sent_at", { withTimezone: true }),
    /** tela de contagem antes da abertura (tema, imagem, título, mensagem); null = padrão */
    launchPage: jsonb("launch_page").$type<{ theme: "escuro" | "lima" | "arte" | "foto"; image?: string; headline: string; message: string; lineup: boolean }>(),
    /** fila virtual: auto (liga sozinha quando muita gente entra ao mesmo tempo) | on | off */
    queueMode: varchar("queue_mode", { length: 8 }).notNull().default("auto"),
    /** quantas pessoas podem comprar ao mesmo tempo antes de a fila ligar */
    queueLimit: integer("queue_limit").notNull().default(300),
    /** o fã pode transferir o ingresso para outra pessoa */
    transferEnabled: boolean("transfer_enabled").notNull().default(true),
    /** revenda oficial entre fãs e o preço máximo, em % do valor pago */
    resaleEnabled: boolean("resale_enabled").notNull().default(true),
    resaleMaxPct: integer("resale_max_pct").notNull().default(120),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("events_slug_idx").on(t.slug),
    index("events_creator_idx").on(t.createdByUserId),
    index("events_start_idx").on(t.startAt),
    index("events_venue_idx").on(t.venueId),
    index("events_status_idx").on(t.status),
  ],
);

/** Datas de um evento com várias datas ou turnê (cada uma pode ter seu local). */
export const eventSessions = pgTable(
  "event_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    doorsAt: timestamp("doors_at", { withTimezone: true }),
    capacity: integer("capacity"),
    venueId: uuid("venue_id").references(() => venues.id),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("event_sessions_event_idx").on(t.eventId)],
);

export const eventCategories = pgTable(
  "event_categories",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.categoryId] })],
);

export const eventArtists = pgTable(
  "event_artists",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    artistId: uuid("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    timeLabel: varchar("time_label", { length: 10 }),
    endLabel: varchar("end_label", { length: 10 }),
    role: varchar("role", { length: 80 }),
    /** datas em que o artista toca (null = todas) */
    sessionIds: jsonb("session_ids").$type<string[]>(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.artistId] }), index("event_artists_artist_idx").on(t.artistId)],
);

export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    note: varchar("note", { length: 160 }),
    priceCents: integer("price_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    quantity: integer("quantity").notNull().default(0),
    sold: integer("sold").notNull().default(0),
    status: ticketTypeStatus("status").notNull().default("open"),
    salesStart: timestamp("sales_start", { withTimezone: true }),
    salesEnd: timestamp("sales_end", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    maxPerOrder: integer("max_per_order").notNull().default(8),
    /** data (sessão) a que o ingresso dá acesso; null = evento de data única */
    sessionId: uuid("session_id").references(() => eventSessions.id, { onDelete: "cascade" }),
    /** setor do mapa (Pista, Camarote...) e cor */
    sector: varchar("sector", { length: 80 }),
    sectorColor: varchar("sector_color", { length: 9 }),
    /** inteira | meia | social | outro (null = legado: meia marcada no checkout) */
    kind: varchar("kind", { length: 16 }),
    description: text("description"),
    ...timestamps,
  },
  (t) => [index("ticket_types_event_idx").on(t.eventId), index("ticket_types_session_idx").on(t.sessionId)],
);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 40 }).notNull(),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    percentOff: integer("percent_off"),
    amountOffCents: integer("amount_off_cents"),
    /** desconto em R$ vale por ingresso (e não por pedido) */
    amountPerTicket: boolean("amount_per_ticket").notNull().default(false),
    /** vale só para este setor (null = todos os ingressos) */
    sector: varchar("sector", { length: 80 }),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("coupons_code_idx").on(t.code)],
);

/* ---------- vendas ---------- */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    number: integer("number").generatedAlwaysAsIdentity({ startWith: 48213 }),
    userId: text("user_id").notNull(),
    eventId: uuid("event_id").notNull().references(() => events.id),
    status: orderStatus("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    feeCents: integer("fee_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    couponId: uuid("coupon_id").references(() => coupons.id),
    paymentMethod: paymentMethod("payment_method"),
    paymentRef: varchar("payment_ref", { length: 160 }),
    buyerName: varchar("buyer_name", { length: 160 }),
    buyerEmail: varchar("buyer_email", { length: 254 }),
    buyerPhone: varchar("buyer_phone", { length: 20 }),
    buyerCpf: varchar("buyer_cpf", { length: 14 }),
    /** titulares informados no checkout, na ordem dos ingressos */
    holders: jsonb("holders").$type<{ ticketTypeId: string; name: string; meia: boolean }[]>(),
    meiaCents: integer("meia_cents").notNull().default(0),
    installments: integer("installments").notNull().default(1),
    interestCents: integer("interest_cents").notNull().default(0),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** link de divulgação que trouxe a venda e a comissão dele */
    promoterId: uuid("promoter_id"),
    commissionCents: integer("commission_cents").notNull().default(0),
    /** parte de uma compra em grupo / compra na revenda / link da pré-venda usado */
    groupShareId: uuid("group_share_id"),
    resaleListingId: uuid("resale_listing_id"),
    presaleSignupId: uuid("presale_signup_id"),
    ...timestamps,
  },
  (t) => [index("orders_user_idx").on(t.userId), index("orders_event_idx").on(t.eventId), uniqueIndex("orders_number_idx").on(t.number)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id").notNull().references(() => ticketTypes.id),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    unitFeeCents: integer("unit_fee_cents").notNull().default(0),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 24 }).notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id").references(() => orderItems.id, { onDelete: "set null" }),
    eventId: uuid("event_id").notNull().references(() => events.id),
    ticketTypeId: uuid("ticket_type_id").notNull().references(() => ticketTypes.id),
    holderUserId: text("holder_user_id").notNull(),
    holderName: varchar("holder_name", { length: 160 }),
    halfPrice: boolean("half_price").notNull().default(false),
    status: ticketStatus("status").notNull().default("valid"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    /** lembrete da véspera já enviado ao titular */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    // segredo rotativo usado na assinatura do QR; muda a cada transferência
    secret: varchar("secret", { length: 64 }).notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("tickets_code_idx").on(t.code),
    index("tickets_holder_idx").on(t.holderUserId),
    index("tickets_event_idx").on(t.eventId),
  ],
);

export const ticketTransfers = pgTable(
  "ticket_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").notNull(),
    toEmail: varchar("to_email", { length: 254 }).notNull(),
    toUserId: text("to_user_id"),
    status: transferStatus("status").notNull().default("pending"),
    token: varchar("token", { length: 64 }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("ticket_transfers_token_idx").on(t.token), index("ticket_transfers_ticket_idx").on(t.ticketId)],
);

/* ---------- social ---------- */
export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id").notNull(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.eventId] })],
);

export const follows = pgTable(
  "follows",
  {
    userId: text("user_id").notNull(),
    targetType: followTarget("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** sininho: avisar de pré-venda e novas datas */
    notify: boolean("notify").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

/** Avaliação de um evento por quem tinha ingresso; o produtor pode responder. */
export const eventReviews = pgTable(
  "event_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    organizerId: uuid("organizer_id").references(() => organizers.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    userName: varchar("user_name", { length: 160 }),
    rating: integer("rating").notNull(),
    body: text("body"),
    tags: jsonb("tags").$type<string[]>(),
    reply: text("reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_reviews_user_idx").on(t.eventId, t.userId), index("event_reviews_org_idx").on(t.organizerId, t.createdAt)],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    email: varchar("email", { length: 254 }).primaryKey(),
    cityId: uuid("city_id").references(() => cities.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ---------- lançamento, divulgação, grupo, revenda, fila ---------- */

/** "Me avise na abertura" e cadastro da pré-venda. O token é o link secreto da pré-venda. */
export const eventSignups = pgTable(
  "event_signups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    /** abertura | presale */
    kind: varchar("kind", { length: 12 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    userId: text("user_id"),
    token: varchar("token", { length: 40 }).notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_signups_email_idx").on(t.eventId, t.kind, t.email), uniqueIndex("event_signups_token_idx").on(t.token)],
);

/** Link de divulgação com comissão (promoter, influenciador, parceiro). */
export const promoters = pgTable(
  "promoters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id").notNull().references(() => organizers.id, { onDelete: "cascade" }),
    /** null = vale para todos os eventos do produtor */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 254 }),
    /** o que vai no link: /r/<code> */
    code: varchar("code", { length: 40 }).notNull(),
    commissionPct: integer("commission_pct").notNull().default(10),
    clicks: integer("clicks").notNull().default(0),
    /** página do parceiro para acompanhar as próprias vendas */
    token: varchar("token", { length: 40 }).notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("promoters_code_idx").on(t.code), uniqueIndex("promoters_token_idx").on(t.token), index("promoters_org_idx").on(t.organizerId)],
);

/** Compra em grupo: alguém reserva os lugares e cada amigo paga a sua parte pelo link. */
export const groupOrders = pgTable(
  "group_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 16 }).notNull(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    leaderUserId: text("leader_user_id").notNull(),
    leaderName: varchar("leader_name", { length: 160 }),
    /** reserva segura até aqui; depois as partes não pagas voltam para a venda */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** open | done | cancelled */
    status: varchar("status", { length: 12 }).notNull().default("open"),
    ...timestamps,
  },
  (t) => [uniqueIndex("group_orders_code_idx").on(t.code), index("group_orders_event_idx").on(t.eventId)],
);

export const groupShares = pgTable(
  "group_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groupOrders.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id").notNull().references(() => ticketTypes.id),
    priceCents: integer("price_cents").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    /** quem pegou esta parte (e o nome do titular) */
    userId: text("user_id"),
    name: varchar("name", { length: 160 }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    orderId: uuid("order_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("group_shares_group_idx").on(t.groupId), index("group_shares_type_idx").on(t.ticketTypeId)],
);

/** Revenda oficial: o fã anuncia o ingresso; na venda, o QR antigo deixa de valer. */
export const resaleListings = pgTable(
  "resale_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id").notNull().references(() => tickets.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    ticketTypeId: uuid("ticket_type_id").notNull().references(() => ticketTypes.id),
    sellerUserId: text("seller_user_id").notNull(),
    priceCents: integer("price_cents").notNull(),
    /** active | reserved | sold | cancelled */
    status: varchar("status", { length: 12 }).notNull().default("active"),
    /** comprador segurando o anúncio enquanto paga */
    reservedBy: text("reserved_by"),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    buyerUserId: text("buyer_user_id"),
    orderId: uuid("order_id"),
    soldAt: timestamp("sold_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("resale_listings_event_idx").on(t.eventId, t.status), index("resale_listings_ticket_idx").on(t.ticketId)],
);

/** Fila virtual: quem está na página do evento (visitante anônimo por cookie). */
export const queueEntries = pgTable(
  "queue_entries",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    visitorId: varchar("visitor_id", { length: 40 }).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    admittedAt: timestamp("admitted_at", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.visitorId] }), index("queue_entries_wait_idx").on(t.eventId, t.admittedAt, t.joinedAt)],
);

/* ---------- relations ---------- */

/* ---------- e-mail do produtor ---------- */

/** Campanha de e-mail: público, remetente, assunto, o design em blocos e o envio. */
export const emailCampaigns = pgTable(
  "email_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** produtor dono (ou só o usuário, quando ele ainda não tem página de produtor) */
    organizerId: uuid("organizer_id").references(() => organizers.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    /** draft | scheduled | sending | sent | cancelled */
    status: varchar("status", { length: 12 }).notNull().default("draft"),
    subject: varchar("subject", { length: 200 }).notNull().default(""),
    preheader: varchar("preheader", { length: 200 }).notNull().default(""),
    fromName: varchar("from_name", { length: 120 }).notNull().default(""),
    replyTo: varchar("reply_to", { length: 254 }).notNull().default(""),
    audience: jsonb("audience").$type<Audience>().notNull(),
    /** evento = modelo pronto da Tickets Win (evento + recado); livre = editor de blocos */
    format: varchar("format", { length: 10 }).notNull().default("livre"),
    content: jsonb("content").$type<EventContent>(),
    design: jsonb("design").$type<Design>().notNull(),
    /** evento principal (modelo escolhido na criação); usado nos atalhos */
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    /** links do e-mail no momento do envio (o clique rastreado aponta para o índice) */
    links: jsonb("links").$type<string[]>(),
    /** cliques por link (índice → total) */
    linkClicks: jsonb("link_clicks").$type<Record<string, number>>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    testSentAt: timestamp("test_sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("email_campaigns_org_idx").on(t.organizerId, t.createdAt), index("email_campaigns_user_idx").on(t.userId), index("email_campaigns_status_idx").on(t.status)],
);

/** Registro de cada e-mail do sistema (aceito ou recusado pelo Resend) e das chamadas do Neon Auth. */
export const emailLog = pgTable(
  "email_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 40 }).notNull(),
    toEmail: varchar("to_email", { length: 254 }),
    subject: varchar("subject", { length: 300 }),
    ok: boolean("ok").notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_log_created_idx").on(t.createdAt)],
);

/** Um e-mail de uma campanha para uma pessoa: fila de envio, aberturas, cliques e descadastro. */
export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id").notNull().references(() => emailCampaigns.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 254 }).notNull(),
    name: varchar("name", { length: 160 }),
    /** link de descadastro, pixel e cliques */
    token: varchar("token", { length: 32 }).notNull(),
    /** queued | sent | failed */
    status: varchar("status", { length: 10 }).notNull().default("queued"),
    error: varchar("error", { length: 300 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    opens: integer("opens").notNull().default(0),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    clicks: integer("clicks").notNull().default(0),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_sends_token_idx").on(t.token), uniqueIndex("email_sends_campaign_email_idx").on(t.campaignId, t.email), index("email_sends_queue_idx").on(t.status, t.campaignId)],
);

/** Quem pediu para não receber: de um produtor, ou de todos (organizer_id vazio). */
export const emailUnsubscribes = pgTable(
  "email_unsubscribes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    organizerId: uuid("organizer_id").references(() => organizers.id, { onDelete: "cascade" }),
    /** produtor sem página: descadastro ligado ao usuário que enviou */
    senderUserId: text("sender_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_unsubscribes_email_idx").on(t.email)],
);

/** Modelos salvos pelo produtor para reaproveitar o design. */
export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id").references(() => organizers.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    design: jsonb("design").$type<Design>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_templates_org_idx").on(t.organizerId), index("email_templates_user_idx").on(t.userId)],
);

/**
 * Link externo de check-in: abre uma tela própria no celular para validar ingressos sem conta no painel
 * (um por portão ou por pessoa da equipe). Quem tem o link valida; revogar desliga na hora.
 */
export const checkinLinks = pgTable(
  "checkin_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 48 }).notNull(),
    label: varchar("label", { length: 60 }).notNull(),
    createdByUserId: text("created_by_user_id"),
    scans: integer("scans").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("checkin_links_token_idx").on(t.token), index("checkin_links_event_idx").on(t.eventId)],
);

export const citiesRelations = relations(cities, ({ many }) => ({ venues: many(venues) }));
export const venuesRelations = relations(venues, ({ one, many }) => ({
  city: one(cities, { fields: [venues.cityId], references: [cities.id] }),
  events: many(events),
}));
export const organizersRelations = relations(organizers, ({ many }) => ({ events: many(events), posts: many(organizerPosts), reviews: many(eventReviews) }));
export const organizerMembersRelations = relations(organizerMembers, ({ one }) => ({
  organizer: one(organizers, { fields: [organizerMembers.organizerId], references: [organizers.id] }),
}));
export const organizerPostsRelations = relations(organizerPosts, ({ one }) => ({
  organizer: one(organizers, { fields: [organizerPosts.organizerId], references: [organizers.id] }),
}));
export const eventReviewsRelations = relations(eventReviews, ({ one }) => ({
  event: one(events, { fields: [eventReviews.eventId], references: [events.id] }),
  organizer: one(organizers, { fields: [eventReviews.organizerId], references: [organizers.id] }),
}));
export const artistsRelations = relations(artists, ({ many }) => ({ eventArtists: many(eventArtists) }));
export const categoriesRelations = relations(categories, ({ many }) => ({ eventCategories: many(eventCategories) }));
export const eventsRelations = relations(events, ({ one, many }) => ({
  venue: one(venues, { fields: [events.venueId], references: [venues.id] }),
  organizer: one(organizers, { fields: [events.organizerId], references: [organizers.id] }),
  ticketTypes: many(ticketTypes),
  sessions: many(eventSessions),
  eventArtists: many(eventArtists),
  eventCategories: many(eventCategories),
}));
export const eventCategoriesRelations = relations(eventCategories, ({ one }) => ({
  event: one(events, { fields: [eventCategories.eventId], references: [events.id] }),
  category: one(categories, { fields: [eventCategories.categoryId], references: [categories.id] }),
}));
export const eventArtistsRelations = relations(eventArtists, ({ one }) => ({
  event: one(events, { fields: [eventArtists.eventId], references: [events.id] }),
  artist: one(artists, { fields: [eventArtists.artistId], references: [artists.id] }),
}));
export const ticketTypesRelations = relations(ticketTypes, ({ one }) => ({
  event: one(events, { fields: [ticketTypes.eventId], references: [events.id] }),
  session: one(eventSessions, { fields: [ticketTypes.sessionId], references: [eventSessions.id] }),
}));
export const eventSessionsRelations = relations(eventSessions, ({ one, many }) => ({
  event: one(events, { fields: [eventSessions.eventId], references: [events.id] }),
  venue: one(venues, { fields: [eventSessions.venueId], references: [venues.id] }),
  ticketTypes: many(ticketTypes),
}));
export const ordersRelations = relations(orders, ({ one, many }) => ({
  event: one(events, { fields: [orders.eventId], references: [events.id] }),
  coupon: one(coupons, { fields: [orders.couponId], references: [coupons.id] }),
  items: many(orderItems),
  tickets: many(tickets),
}));
export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  ticketType: one(ticketTypes, { fields: [orderItems.ticketTypeId], references: [ticketTypes.id] }),
}));
export const ticketsRelations = relations(tickets, ({ one }) => ({
  order: one(orders, { fields: [tickets.orderId], references: [orders.id] }),
  event: one(events, { fields: [tickets.eventId], references: [events.id] }),
  ticketType: one(ticketTypes, { fields: [tickets.ticketTypeId], references: [ticketTypes.id] }),
}));
export const groupOrdersRelations = relations(groupOrders, ({ one, many }) => ({
  event: one(events, { fields: [groupOrders.eventId], references: [events.id] }),
  shares: many(groupShares),
}));
export const groupSharesRelations = relations(groupShares, ({ one }) => ({
  group: one(groupOrders, { fields: [groupShares.groupId], references: [groupOrders.id] }),
  ticketType: one(ticketTypes, { fields: [groupShares.ticketTypeId], references: [ticketTypes.id] }),
}));
export const resaleListingsRelations = relations(resaleListings, ({ one }) => ({
  ticket: one(tickets, { fields: [resaleListings.ticketId], references: [tickets.id] }),
  event: one(events, { fields: [resaleListings.eventId], references: [events.id] }),
  ticketType: one(ticketTypes, { fields: [resaleListings.ticketTypeId], references: [ticketTypes.id] }),
}));
export const promotersRelations = relations(promoters, ({ one }) => ({
  organizer: one(organizers, { fields: [promoters.organizerId], references: [organizers.id] }),
  event: one(events, { fields: [promoters.eventId], references: [events.id] }),
}));
export const emailCampaignsRelations = relations(emailCampaigns, ({ one, many }) => ({
  organizer: one(organizers, { fields: [emailCampaigns.organizerId], references: [organizers.id] }),
  event: one(events, { fields: [emailCampaigns.eventId], references: [events.id] }),
  sends: many(emailSends),
}));
export const emailSendsRelations = relations(emailSends, ({ one }) => ({
  campaign: one(emailCampaigns, { fields: [emailSends.campaignId], references: [emailCampaigns.id] }),
}));
export const checkinLinksRelations = relations(checkinLinks, ({ one }) => ({
  event: one(events, { fields: [checkinLinks.eventId], references: [events.id] }),
}));
export const favoritesRelations = relations(favorites, ({ one }) => ({
  event: one(events, { fields: [favorites.eventId], references: [events.id] }),
}));

export type Event = typeof events.$inferSelect;
export type Artist = typeof artists.$inferSelect;
export type Venue = typeof venues.$inferSelect;
export type Organizer = typeof organizers.$inferSelect;
export type TicketType = typeof ticketTypes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
