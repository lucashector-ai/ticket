import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { baseCtx, firstName } from "@/lib/mail/send";
import { renderCampaign } from "@/lib/mail/event-email";
import { sendByToken } from "@/lib/mail/unsubscribe";

/** "Ver no navegador": o mesmo e-mail que a pessoa recebeu. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await sendByToken(token);
  const c = r && (await db.query.emailCampaigns.findFirst({ where: eq(schema.emailCampaigns.id, r.campaignId) }));
  if (!r || !c) return new Response("E-mail não encontrado.", { status: 404 });
  const base = await baseCtx(c);
  const name = r.name ?? "";
  const { html } = renderCampaign(c, { ...base, vars: { nome: name, primeiro_nome: firstName(name), email: r.email }, unsubscribeUrl: `${base.site}/e/sair/${token}` });
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } });
}
