import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteUrl } from "@/lib/mail/data";

/** Clique rastreado: conta e leva para o link original guardado na campanha. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; i: string }> }) {
  const { token, i } = await params;
  const s = schema.emailSends;
  const row = /^[0-9a-f]{32}$/.test(token)
    ? await db.select({ id: s.id, campaignId: s.campaignId, links: schema.emailCampaigns.links }).from(s).innerJoin(schema.emailCampaigns, eq(schema.emailCampaigns.id, s.campaignId)).where(eq(s.token, token)).limit(1)
    : [];
  const url = row[0]?.links?.[Number(i)];
  if (!row[0] || !url) return Response.redirect(siteUrl(), 302);
  // clicar também prova que abriu (quando o leitor bloqueia imagens)
  await db.update(s).set({ clicks: sql`${s.clicks} + 1`, clickedAt: sql`coalesce(${s.clickedAt}, now())`, openedAt: sql`coalesce(${s.openedAt}, now())` }).where(eq(s.id, row[0].id)).catch(() => {});
  const c = schema.emailCampaigns, k = String(Number(i));
  await db.update(c).set({ linkClicks: sql`jsonb_set(coalesce(${c.linkClicks}, '{}'::jsonb), array[${k}]::text[], to_jsonb(coalesce((${c.linkClicks}->>${k})::int, 0) + 1))` }).where(eq(c.id, row[0].campaignId)).catch(() => {});
  return Response.redirect(url, 302);
}
