import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";

const { emailSends, emailCampaigns, emailUnsubscribes, organizers } = schema;

/** Envio + campanha + nome do produtor, a partir do token do e-mail. */
export async function sendByToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [r] = await db.select({ id: emailSends.id, email: emailSends.email, name: emailSends.name, unsubscribedAt: emailSends.unsubscribedAt, campaignId: emailCampaigns.id, orgId: emailCampaigns.organizerId, userId: emailCampaigns.userId, fromName: emailCampaigns.fromName, orgName: organizers.name })
    .from(emailSends).innerJoin(emailCampaigns, eq(emailCampaigns.id, emailSends.campaignId)).leftJoin(organizers, eq(organizers.id, emailCampaigns.organizerId))
    .where(eq(emailSends.token, token)).limit(1);
  return r ? { ...r, sender: r.orgName ?? (r.fromName || "este produtor") } : null;
}

/** Descadastra o e-mail deste produtor (ou de todos os produtores da Tickets Win). */
export async function unsubscribe(token: string, all = false) {
  const r = await sendByToken(token);
  if (!r) return null;
  const email = r.email.toLowerCase();
  const scope = all ? { organizerId: null, senderUserId: null } : r.orgId ? { organizerId: r.orgId, senderUserId: null } : { organizerId: null, senderUserId: r.userId };
  const exists = await db.query.emailUnsubscribes.findFirst({
    where: and(eq(emailUnsubscribes.email, email), scope.organizerId ? eq(emailUnsubscribes.organizerId, scope.organizerId) : isNull(emailUnsubscribes.organizerId), scope.senderUserId ? eq(emailUnsubscribes.senderUserId, scope.senderUserId) : isNull(emailUnsubscribes.senderUserId)),
  });
  if (!exists) await db.insert(emailUnsubscribes).values({ email, ...scope });
  if (!r.unsubscribedAt) await db.update(emailSends).set({ unsubscribedAt: new Date() }).where(eq(emailSends.id, r.id));
  return r;
}
