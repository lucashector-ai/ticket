"use server";

import { randomBytes } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/server";
import { sendTx } from "@/lib/email";
import { CONTACT_SUBJECTS, HELP_EMAIL, type ContactSubject } from "@/lib/help/contact";
import { HUMAN_ERROR, verifyHuman } from "@/lib/turnstile";

/** mensagens por IP a cada hora (o formulário também passa pelo Turnstile) */
const MAX_PER_HOUR = 5;

const subjects = Object.keys(CONTACT_SUBJECTS) as [ContactSubject, ...ContactSubject[]];
const oneLine = (v: string) => v.replace(/[\r\n\t]+/g, " ").trim();

const schema = z.object({
  name: z.string().transform(oneLine).pipe(z.string().min(2, "Digite seu nome.").max(120, "Nome longo demais.")),
  email: z.string().trim().toLowerCase().pipe(z.email("Digite um e-mail válido.").max(254)),
  subject: z.enum(subjects, { message: "Escolha o assunto." }),
  order: z.string().transform((v) => v.replace(/[^\dA-Za-z-]/g, "").slice(0, 24)),
  message: z.string().trim().min(20, "Conte um pouco mais (pelo menos 20 caracteres).").max(4000, "Mensagem longa demais (até 4.000 caracteres)."),
  article: z.string().regex(/^[a-z0-9-]{0,80}$/).catch(""),
});

export type ContactInput = z.input<typeof schema> & { human: string; website?: string };
export type ContactResult =
  | { ok: true; protocol: string; email: string }
  | { ok: false; error: string; field?: "name" | "email" | "subject" | "order" | "message" };

/** confirmações automáticas para o mesmo endereço a cada hora (o formulário não vira disparador de e-mails) */
const MAX_CONFIRM_PER_HOUR = 2;

/** Conta mais um uso de `key` na hora; true quando já passou de `max`. */
async function overLimit(key: string, max: number) {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const n = Number((await env.KV.get(key)) ?? 0);
    if (n >= max) return true;
    await env.KV.put(key, String(n + 1), { expirationTtl: 3600 });
  } catch { /* sem KV (dev): segue sem limite */ }
  return false;
}

/**
 * Formulário de contato: a mensagem completa vai só para o suporte (responder-para = quem escreveu).
 * A confirmação para quem escreveu é genérica: não repete nome, mensagem nem nada digitado no formulário,
 * para o formulário não servir de retransmissor de spam para endereços de terceiros.
 */
export async function sendContact(input: ContactInput): Promise<ContactResult> {
  // campo escondido que só robô preenche: finge que deu certo
  if (input.website) return { ok: true, protocol: "TW-000000", email: "" };
  const p = schema.safeParse(input);
  if (!p.success) {
    const issue = p.error.issues[0];
    const field = issue?.path[0];
    return { ok: false, error: issue?.message ?? "Confira os campos.", field: typeof field === "string" && field !== "article" ? (field as "name") : undefined };
  }
  if (!(await verifyHuman(input.human))) return { ok: false, error: HUMAN_ERROR };
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (await overLimit(`contato:${ip}`, MAX_PER_HOUR)) return { ok: false, error: "Você já mandou várias mensagens nesta hora. Aguarde um pouco ou escreva direto para ajuda@ticketswin.com.br." };

  const d = p.data;
  const user = await getSessionUser().catch(() => null);
  const protocol = `TW-${randomBytes(4).toString("hex").slice(0, 6).toUpperCase()}`;
  const subj = CONTACT_SUBJECTS[d.subject];
  const paragraphs = d.message.split(/\n\s*\n|\n/).map((s) => s.trim()).filter(Boolean).slice(0, 60);
  const reply = `mailto:${d.email}?subject=${encodeURIComponent(`Re: ${subj} [${protocol}]`)}`;

  const rows: [string, string][] = [
    ["Protocolo", protocol],
    ["Nome", d.name],
    ["E-mail (responder para)", d.email],
    ["Assunto", subj],
    ["Pedido", d.order ? `#${d.order.replace(/^#/, "")}` : "Não informado"],
    ["Conta logada", user ? `${user.email}${user.email.toLowerCase() === d.email ? "" : " (e-mail diferente do informado)"}` : "Não estava logado"],
    ...(d.article ? [["Veio do artigo", `/ajuda/${d.article}`] as [string, string]] : []),
  ];

  const sent = await sendTx(HELP_EMAIL, `[Contato] ${subj} · ${d.name} · ${protocol}`, {
    preheader: `${d.name} <${d.email}> escreveu pelo formulário de contato.`,
    eyebrow: "Formulário de contato",
    title: `${subj}: mensagem de ${d.name}`,
    paragraphs,
    blocks: [{ kind: "rows", rows }, { kind: "note", text: `Responder este e-mail vai para ${d.email}. O endereço não foi confirmado: não envie dados da conta antes de conferir que é a mesma pessoa.` }],
    cta: { label: `Responder para ${d.name.split(" ")[0]}`, url: reply },
    reason: "Mensagem enviada pelo formulário de contato do site.",
  }, { replyTo: d.email });
  if (!sent) return { ok: false, error: "Não conseguimos enviar sua mensagem agora. Tente de novo em instantes ou escreva direto para ajuda@ticketswin.com.br." };

  // confirmação genérica: só o protocolo (gerado aqui) e o assunto escolhido na lista fixa
  if (!(await overLimit(`contato:to:${d.email}`, MAX_CONFIRM_PER_HOUR))) {
    after(() => sendTx(d.email, `Recebemos sua mensagem [${protocol}]`, {
      preheader: "Respondemos em até 1 dia útil.",
      eyebrow: "Suporte Tickets Win",
      title: "Recebemos sua mensagem",
      paragraphs: [
        "Sua mensagem chegou para o nosso time de suporte. A resposta vem para este e-mail em até 1 dia útil.",
        "Se quiser acrescentar algo, escreva para ajuda@ticketswin.com.br informando o protocolo abaixo.",
      ],
      blocks: [{ kind: "rows", rows: [["Protocolo", protocol], ["Assunto", subj]] }],
      cta: { label: "Ver a central de ajuda", url: "/ajuda" },
      foot: "Não foi você que escreveu? Pode ignorar este e-mail: nada muda na sua conta.",
      reason: "Você recebeu este e-mail porque o seu endereço foi informado no formulário de contato da Tickets Win.",
    }).catch(() => false));
  }

  return { ok: true, protocol, email: d.email };
}
