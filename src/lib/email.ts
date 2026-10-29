import "server-only";
import { brandShell, brandSimple, escHtml } from "@/lib/mail/brand";
import { renderTx, type TxMail } from "@/lib/mail/tx";

/*
 * E-mails transacionais pelo Resend (https://resend.com).
 *
 * Segredos no Cloudflare:
 *   RESEND_API_KEY  chave da API do Resend
 *   EMAIL_FROM      remetente de um domínio verificado no Resend, ex.: "info@ticketswin.com.br"
 *                   (sem nome, aparece como "Tickets Win <info@ticketswin.com.br>")
 * Sem a chave, nada é enviado (o painel continua mostrando os cadastros e os links).
 */

export type Mail = { to: string; subject: string; html: string; text: string };

export const emailEnabled = () => !!process.env.RESEND_API_KEY;

/** Remetente dos e-mails do sistema: o endereço de EMAIL_FROM com o nome "Tickets Win" quando vier sem nome. */
export function systemFrom() {
  const raw = (process.env.EMAIL_FROM || "onboarding@resend.dev").trim();
  return raw.includes("<") ? raw : `Tickets Win <${raw}>`;
}

/** Envia em lotes de 100 (limite do Resend). Devolve quantos foram aceitos. */
export async function sendEmails(list: Mail[]): Promise<number> {
  if (!emailEnabled() || !list.length) return 0;
  const from = systemFrom();
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

/** E-mail do sistema no formato Tickets Win: título, parágrafos e um botão, com o cabeçalho e o rodapé da marca. */
export function mailLayout(o: { preheader: string; title: string; paragraphs: string[]; cta: { label: string; url: string }; foot?: string }): Pick<Mail, "html" | "text"> {
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticketswin.com.br").replace(/\/$/, "");
  const html = brandShell({ site, preheader: o.preheader, body: brandSimple(o), note: [...(o.foot ? [escHtml(o.foot)] : []), "Você recebeu este e-mail porque tem conta na Tickets Win."] });
  const text = [o.title, "", ...o.paragraphs, "", `${o.cta.label}: ${o.cta.url}`, ...(o.foot ? ["", o.foot] : [])].join("\n");
  return { html, text };
}

export const siteBase = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://ticketswin.com.br").replace(/\/$/, "");

/** Um e-mail transacional no formato da marca. Devolve se o Resend aceitou. */
export async function sendTx(to: string, subject: string, m: TxMail): Promise<boolean> {
  if (!to) return false;
  return (await sendEmails([{ to, subject, ...renderTx(m, siteBase()) }])) > 0;
}
