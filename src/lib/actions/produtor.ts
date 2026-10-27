"use server";

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { initials } from "@/lib/format";

const { organizers, organizerPosts, follows, eventReviews, events, tickets } = schema;

type R = { ok: true } | { ok: false; error: string };
const media = z.string().max(200).regex(/^\/midia\/eventos\/[\w/.-]+$/).nullable();

/** Só o dono mexe no perfil; devolve o produtor ou null. */
async function ownOrganizer(orgId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  const org = await db.query.organizers.findFirst({ where: eq(organizers.id, orgId) });
  return org && org.ownerUserId === user.id ? org : null;
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(160),
  tagline: z.string().trim().max(200),
  bio: z.string().trim().max(4000),
  cityName: z.string().trim().max(120),
  uf: z.string().trim().max(2),
  instagram: z.string().trim().max(120),
  website: z.string().trim().max(200),
  contactEmail: z.union([z.literal(""), z.email("E-mail inválido.")]),
  whatsapp: z.string().trim().max(32),
  legalName: z.string().trim().max(200),
  cnpj: z.string().trim().max(20),
  avatarUrl: media,
  coverUrl: media,
  policies: z.object({ cancel: z.string().max(400), meia: z.string().max(400), transfer: z.string().max(400), access: z.string().max(400) }),
});
export type ProducerProfileInput = z.input<typeof profileSchema>;

export async function updateProducerProfile(orgId: string, input: ProducerProfileInput): Promise<R> {
  const org = await ownOrganizer(orgId);
  if (!org) return { ok: false, error: "Só o dono da página pode editar." };
  const p = profileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os campos." };
  const d = p.data;
  const site = d.website && !/^https?:\/\//i.test(d.website) ? `https://${d.website}` : d.website;
  await db.update(organizers).set({
    name: d.name, initials: initials(d.name), tagline: d.tagline || null, bio: d.bio || null,
    cityName: d.cityName || null, uf: d.uf.toUpperCase() || null,
    instagram: d.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "") || null,
    website: site || null, contactEmail: d.contactEmail || null, whatsapp: d.whatsapp || null,
    legalName: d.legalName || null, cnpj: d.cnpj || null,
    avatarUrl: d.avatarUrl, coverUrl: d.coverUrl,
    policies: Object.fromEntries(Object.entries(d.policies).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v)),
  }).where(eq(organizers.id, orgId));
  revalidatePath(`/produtor/${org.slug}`);
  return { ok: true };
}

/** Troca rápida de capa ou foto (botão de câmera direto na página). */
export async function setProducerImage(orgId: string, kind: "avatar" | "cover", url: string | null): Promise<R> {
  const org = await ownOrganizer(orgId);
  if (!org) return { ok: false, error: "Só o dono da página pode editar." };
  if (!media.safeParse(url).success) return { ok: false, error: "Imagem inválida." };
  await db.update(organizers).set(kind === "avatar" ? { avatarUrl: url } : { coverUrl: url }).where(eq(organizers.id, orgId));
  revalidatePath(`/produtor/${org.slug}`);
  return { ok: true };
}

export async function createPost(orgId: string, input: { body: string; imageUrl: string | null; eventId: string | null }): Promise<R> {
  const org = await ownOrganizer(orgId);
  if (!org) return { ok: false, error: "Só o dono da página pode publicar." };
  const body = input.body.trim();
  if (body.length < 2 && !input.imageUrl) return { ok: false, error: "Escreva algo ou adicione uma foto." };
  if (body.length > 2000) return { ok: false, error: "Texto longo demais (máximo 2.000 caracteres)." };
  if (!media.safeParse(input.imageUrl).success) return { ok: false, error: "Imagem inválida." };
  let eventId: string | null = null;
  if (input.eventId) {
    const ev = await db.query.events.findFirst({ where: and(eq(events.id, input.eventId), eq(events.organizerId, orgId)), columns: { id: true } });
    eventId = ev?.id ?? null;
  }
  await db.insert(organizerPosts).values({ organizerId: orgId, body, imageUrl: input.imageUrl, eventId });
  revalidatePath(`/produtor/${org.slug}`);
  return { ok: true };
}

export async function deletePost(postId: string): Promise<R> {
  const post = await db.query.organizerPosts.findFirst({ where: eq(organizerPosts.id, postId) });
  if (!post) return { ok: true };
  const org = await ownOrganizer(post.organizerId);
  if (!org) return { ok: false, error: "Só o dono da página pode apagar." };
  await db.delete(organizerPosts).where(eq(organizerPosts.id, postId));
  revalidatePath(`/produtor/${org.slug}`);
  return { ok: true };
}

/** Sininho: segue (se ainda não segue) e liga/desliga os avisos de pré-venda. */
export async function setProducerNotify(orgId: string, on: boolean): Promise<{ ok: boolean; auth: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, auth: false };
  await db.insert(follows).values({ userId: user.id, targetType: "organizer", targetId: orgId, notify: on })
    .onConflictDoUpdate({ target: [follows.userId, follows.targetType, follows.targetId], set: { notify: on } });
  return { ok: true, auth: true };
}

const reviewSchema = z.object({
  eventId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000),
  tags: z.array(z.string().max(40)).max(6),
});

/** Avaliação: só quem tinha ingresso de um evento que já aconteceu. */
export async function submitReview(input: z.input<typeof reviewSchema>): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta para avaliar." };
  const p = reviewSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Escolha de 1 a 5 estrelas." };
  const { eventId, rating, body, tags } = p.data;
  const [had] = await db.select({ id: tickets.id, org: events.organizerId }).from(tickets).innerJoin(events, eq(events.id, tickets.eventId))
    .where(and(eq(tickets.eventId, eventId), eq(tickets.holderUserId, user.id), inArray(tickets.status, ["valid", "used"]), lt(sql`coalesce(${events.endAt}, ${events.startAt})`, sql`now()`)))
    .limit(1);
  if (!had) return { ok: false, error: "Só quem foi ao evento com ingresso do Tickets Win pode avaliar." };
  await db.insert(eventReviews).values({ eventId, organizerId: had.org, userId: user.id, userName: user.name || null, rating, body: body || null, tags })
    .onConflictDoUpdate({ target: [eventReviews.eventId, eventReviews.userId], set: { rating, body: body || null, tags } });
  const org = had.org ? await db.query.organizers.findFirst({ where: eq(organizers.id, had.org), columns: { slug: true } }) : null;
  if (org) revalidatePath(`/produtor/${org.slug}`);
  return { ok: true };
}

export async function replyReview(reviewId: string, reply: string): Promise<R> {
  const rv = await db.query.eventReviews.findFirst({ where: eq(eventReviews.id, reviewId) });
  if (!rv?.organizerId) return { ok: false, error: "Avaliação não encontrada." };
  const org = await ownOrganizer(rv.organizerId);
  if (!org) return { ok: false, error: "Só o produtor pode responder." };
  const t = reply.trim().slice(0, 1500);
  await db.update(eventReviews).set({ reply: t || null, repliedAt: t ? new Date() : null }).where(eq(eventReviews.id, reviewId));
  revalidatePath(`/produtor/${org.slug}`);
  return { ok: true };
}
