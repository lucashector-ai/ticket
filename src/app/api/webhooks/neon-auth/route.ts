import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after } from "next/server";
import { verifyNeonWebhook } from "@/lib/auth/webhook";
import { emailEnabled } from "@/lib/email";
import { mailAuthCode, mailAuthLink, mailWelcome } from "@/lib/notify";

/*
 * Webhook do Neon Auth (Console do Neon → Auth → Configuration → Webhooks):
 *   URL: https://ticketswin.com.br/api/webhooks/neon-auth
 *   Eventos: send.otp, send.magic_link, user.created
 * Com send.otp/send.magic_link assinados, o Neon deixa de mandar o e-mail genérico dele e quem
 * envia (pelo Resend, no formato Tickets Win) somos nós.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL || `${process.env.NEON_AUTH_BASE_URL}/.well-known/jwks.json`;
  let ev;
  try {
    ev = await verifyNeonWebhook(raw, req.headers, jwksUrl);
  } catch (e) {
    console.error("neon-auth webhook", e);
    return Response.json({ error: "assinatura inválida" }, { status: 401 });
  }

  // o Neon repete o mesmo evento se não receber resposta: não manda o e-mail duas vezes
  const { env } = await getCloudflareContext({ async: true });
  const seenKey = `naw:${ev.event_id}`;
  if (await env.KV.get(seenKey)) return Response.json({ ok: true, duplicate: true });

  const email = ev.user?.email ?? "", d = ev.event_data ?? {};
  if (ev.event_type === "send.otp" || ev.event_type === "send.magic_link") {
    if (!emailEnabled()) return Response.json({ error: "e-mail não configurado" }, { status: 503 });
    if (d.delivery_preference === "sms") return Response.json({ ok: true, skipped: "sms" });
    const sent = ev.event_type === "send.otp"
      ? await mailAuthCode(d.otp_type ?? "sign-in", email, d.otp_code ?? "", ev.user?.name)
      : await mailAuthLink(d.link_type ?? "sign-in", email, d.link_url ?? "");
    // falhou no Resend: 5xx faz o Neon tentar de novo
    if (!sent) return Response.json({ error: "falha ao enviar" }, { status: 502 });
  } else if (ev.event_type === "user.created") {
    // conta com Google já vem com o e-mail confirmado: só boas-vindas. Com senha, o e-mail de ativação faz esse papel.
    if (email && d.auth_provider && d.auth_provider !== "credential") after(() => mailWelcome(email, ev.user?.name));
  } else if (ev.event_type === "user.before_create") {
    return Response.json({ allowed: true });
  }
  await env.KV.put(seenKey, "1", { expirationTtl: 60 * 60 * 24 });
  return Response.json({ ok: true });
}
