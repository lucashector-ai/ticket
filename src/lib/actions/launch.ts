"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { spDate } from "@/lib/criar/model";
import { getPainelScope } from "@/lib/data/painel";
import { randomToken, salePhase } from "@/lib/launch";
import { sendOpeningNotice, sendPresaleLinks } from "@/lib/launch-notify";
import { emailEnabled } from "@/lib/email";

const { events, eventSignups } = schema;
type R = { ok: true; message?: string } | { ok: false; error: string };

/* ---------- comprador: "me avise" e cadastro da pré-venda ---------- */

export async function signupLaunch(eventSlug: string, kind: "abertura" | "presale", rawEmail: string): Promise<R> {
  const email = rawEmail.trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { ok: false, error: "Digite um e-mail válido." };
  const ev = await db.query.events.findFirst({ where: eq(events.slug, eventSlug), columns: { id: true, status: true, salesOpenAt: true, presaleAt: true } });
  if (!ev || ev.status !== "published") return { ok: false, error: "Evento indisponível." };
  const phase = salePhase(ev);
  if (phase === "open") return { ok: false, error: "As vendas já abriram. É só escolher os ingressos." };
  if (kind === "presale" && (phase !== "soon" || !ev.presaleAt)) return { ok: false, error: "O cadastro da pré-venda já fechou. Deixe seu e-mail para o aviso da abertura." };
  const user = await getSessionUser();
  const [row] = await db.insert(eventSignups)
    .values({ eventId: ev.id, kind, email, userId: user?.id ?? null, token: randomToken() })
    .onConflictDoNothing()
    .returning({ id: eventSignups.id });
  return { ok: true, message: row ? undefined : "Você já estava na lista." };
}

/* ---------- produtor: lançamento, fila e revenda ---------- */

async function eventScope(eventId: string) {
  const user = await getSessionUser();
  if (!user) return null;
  const s = await getPainelScope(user);
  if (s.role === "portaria") return null;
  return s.events.find((e) => e.id === eventId) ?? null;
}

/** "2026-10-30T10:00" (input datetime-local, horário de São Paulo) → Date */
const fromLocal = (v: string) => {
  const m = v.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? spDate(m[1], m[2]) : null;
};

const launchSchema = z.object({
  eventId: z.uuid(),
  salesOpenAt: z.string().max(20),
  presaleAt: z.string().max(20),
  queueMode: z.enum(["auto", "on", "off"]),
  queueLimit: z.number().int().min(10).max(100000),
  resaleEnabled: z.boolean(),
  resaleMaxPct: z.number().int().min(50).max(300),
});

export async function saveLaunch(input: z.input<typeof launchSchema>): Promise<R> {
  const p = launchSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Confira os campos." };
  const d = p.data;
  const ev = await eventScope(d.eventId);
  if (!ev) return { ok: false, error: "Sem permissão para este evento." };
  const open = d.salesOpenAt ? fromLocal(d.salesOpenAt) : null;
  const pre = d.presaleAt ? fromLocal(d.presaleAt) : null;
  if (d.salesOpenAt && !open) return { ok: false, error: "Data de abertura inválida." };
  if (d.presaleAt && !pre) return { ok: false, error: "Data da pré-venda inválida." };
  if (pre && !open) return { ok: false, error: "Para ter pré-venda, defina também a abertura da venda geral." };
  if (pre && open && pre >= open) return { ok: false, error: "A pré-venda precisa começar antes da venda geral." };
  const cur = await db.query.events.findFirst({ where: eq(events.id, ev.id), columns: { salesOpenAt: true, presaleAt: true } });
  await db.update(events).set({
    salesOpenAt: open, presaleAt: pre,
    // mudou a data: os avisos voltam a sair na nova data
    ...(open?.getTime() !== cur?.salesOpenAt?.getTime() ? { openingSentAt: null } : {}),
    ...(pre?.getTime() !== cur?.presaleAt?.getTime() ? { presaleSentAt: null } : {}),
    queueMode: d.queueMode, queueLimit: d.queueLimit, resaleEnabled: d.resaleEnabled, resaleMaxPct: d.resaleMaxPct,
  }).where(eq(events.id, ev.id));
  revalidatePath(`/painel/evento/${ev.id}`);
  revalidatePath(`/eventos/${ev.slug}`);
  return { ok: true };
}

/** Botão "enviar agora": links da pré-venda (se ela já começou) ou aviso de abertura (se já abriu). */
export async function sendLaunchNow(eventId: string, what: "presale" | "abertura"): Promise<R> {
  const ev = await eventScope(eventId);
  if (!ev) return { ok: false, error: "Sem permissão para este evento." };
  if (!emailEnabled()) return { ok: false, error: "O envio de e-mails ainda não está configurado (RESEND_API_KEY). Copie os links da lista abaixo." };
  const row = await db.query.events.findFirst({ where: eq(events.id, eventId), columns: { id: true, slug: true, title: true, salesOpenAt: true, presaleAt: true } });
  if (!row) return { ok: false, error: "Evento não encontrado." };
  const phase = salePhase(row);
  if (what === "presale" && phase !== "presale") return { ok: false, error: "Os links só podem sair quando a pré-venda começar." };
  if (what === "abertura" && phase !== "open") return { ok: false, error: "O aviso sai quando as vendas abrirem." };
  const r = what === "presale" ? await sendPresaleLinks(row) : await sendOpeningNotice(row);
  await db.update(events).set(what === "presale" ? { presaleSentAt: new Date() } : { openingSentAt: new Date() }).where(eq(events.id, eventId));
  revalidatePath(`/painel/evento/${eventId}`);
  return { ok: true, message: r.total ? `${r.sent} de ${r.total} e-mails enviados.` : "Ninguém pendente na lista." };
}

/** Remove alguém da lista (pedido da pessoa, e-mail errado). */
export async function removeSignup(signupId: string): Promise<R> {
  const s = await db.query.eventSignups.findFirst({ where: eq(eventSignups.id, signupId), columns: { eventId: true } });
  if (!s || !(await eventScope(s.eventId))) return { ok: false, error: "Não encontrado." };
  await db.delete(eventSignups).where(and(eq(eventSignups.id, signupId)));
  revalidatePath(`/painel/evento/${s.eventId}`);
  return { ok: true };
}
