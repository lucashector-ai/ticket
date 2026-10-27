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
    ...timestamps,
  },
  (t) => [uniqueIndex("organizers_slug_idx").on(t.slug)],
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
export type SpotifyArtistData = { name: string; url: string; image: string | null; genres: string[]; followers: number | null; releases: SpotifyRelease[] };

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.targetType, t.targetId] })],
);

export const newsletterSubscribers = pgTable(
  "newsletter_subscribers",
  {
    email: varchar("email", { length: 254 }).primaryKey(),
    cityId: uuid("city_id").references(() => cities.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/* ---------- relations ---------- */
export const citiesRelations = relations(cities, ({ many }) => ({ venues: many(venues) }));
export const venuesRelations = relations(venues, ({ one, many }) => ({
  city: one(cities, { fields: [venues.cityId], references: [cities.id] }),
  events: many(events),
}));
export const organizersRelations = relations(organizers, ({ many }) => ({ events: many(events) }));
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
