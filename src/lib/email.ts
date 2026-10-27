import "server-only";

/*
 * E-mails transacionais pelo Resend (https://resend.com).
 *
 * Segredos no Cloudflare:
 *   RESEND_API_KEY  chave da API do Resend
 *   EMAIL_FROM      remetente de um domínio verificado no Resend, ex.: "Tickets Win <ingressos@ticketswin.com.br>"
 * Sem a chave, nada é enviado (o painel continua mostrando os cadastros e os links).
 */

export type Mail = { to: string; subject: string; html: string; text: string };

export const emailEnabled = () => !!process.env.RESEND_API_KEY;

/** Envia em lotes de 100 (limite do Resend). Devolve quantos foram aceitos. */
export async function sendEmails(list: Mail[]): Promise<number> {
  if (!emailEnabled() || !list.length) return 0;
  const from = process.env.EMAIL_FROM || "Tickets Win <onboarding@resend.dev>";
  let sent = 0;
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }));
    const r = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(batch),
    });
    if (r.ok) sent += batch.length;
    else console.error("email", r.status, (await r.text()).slice(0, 300));
  }
  return sent;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** E-mail simples na cara da Tickets Win: título, parágrafos e um botão. */
export function mailLayout(o: { preheader: string; title: string; paragraphs: string[]; cta: { label: string; url: string }; foot?: string }): Pick<Mail, "html" | "text"> {
  const ps = o.paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#3a3a3e">${esc(p)}</p>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f2f6;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f6;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
<tr><td style="background:#111111;padding:22px 28px;color:#dcf568;font-weight:800;font-size:18px;letter-spacing:-.2px">tickets<span style="color:#ffffff">win</span></td></tr>
<tr><td style="padding:30px 28px 10px"><h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;color:#111111">${esc(o.title)}</h1>${ps}</td></tr>
<tr><td style="padding:6px 28px 30px"><a href="${esc(o.cta.url)}" style="display:inline-block;background:#111111;color:#dcf568;text-decoration:none;font-weight:700;font-size:16px;padding:14px 22px;border-radius:12px">${esc(o.cta.label)}</a></td></tr>
${o.foot ? `<tr><td style="padding:0 28px 26px;font-size:13px;color:#8a8a90;line-height:1.5">${esc(o.foot)}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
  const text = [o.title, "", ...o.paragraphs, "", `${o.cta.label}: ${o.cta.url}`, ...(o.foot ? ["", o.foot] : [])].join("\n");
  return { html, text };
}
