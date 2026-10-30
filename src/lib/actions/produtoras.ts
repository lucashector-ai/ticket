"use server";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { MAX_ORGS_PER_ACCOUNT, ORG_COOKIE, orgAccessList } from "@/lib/data/org-access";
import { initials, slugify } from "@/lib/format";
import { abortOf, ensure, lockKeys, runBatch } from "@/lib/payments/tx";

/*
 * Várias produtoras numa conta (até MAX_ORGS_PER_ACCOUNT) e a troca da produtora ativa do painel.
 * Cada produtora tem os próprios eventos, equipe, dados de recebimento/CNPJ e saldo (ver org-access.ts).
 */

const { organizers } = schema;
type R = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function setActiveCookie(orgId: string) {
  (await cookies()).set(ORG_COOKIE, orgId, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400, secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Troca a produtora ativa (painel, criar evento, financeiro, equipe, configurações). Só entre as produtoras da
 * conta: dona, admin ou portaria da equipe. O cookie não dá acesso a nada sozinho: é conferido a cada pedido.
 */
export async function setActiveOrganizer(orgId: string): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  if (typeof orgId !== "string" || !UUID.test(orgId)) return { ok: false, error: "Produtora não encontrada." };
  const list = await orgAccessList(user.id);
  if (!list.some((x) => x.org.id === orgId)) return { ok: false, error: "Produtora não encontrada." };
  await setActiveCookie(orgId);
  revalidatePath("/painel", "layout");
  return { ok: true };
}

/**
 * Nova produtora na mesma conta (até 3), com os campos do cadastro do produtor: nome, cidade, UF, Instagram e frase.
 * Sem nova aprovação para quem já é produtor aprovado (dona de uma produtora com o cadastro concluído); quem só está
 * na equipe de outra produtora passa pela inscrição normal. A nova produtora já fica ativa.
 */
export async function createOrganizer(_prev: unknown, formData: FormData): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const own = await db.query.organizers.findMany({ where: eq(organizers.ownerUserId, user.id), orderBy: [asc(organizers.createdAt)], columns: { id: true, onboarding: true } });
  const approved = own.find((o) => !!o.onboarding);
  if (!approved) return { ok: false, error: "Para ter uma produtora, faça antes o cadastro de produtor." };
  if (own.length >= MAX_ORGS_PER_ACCOUNT) return { ok: false, error: `Você já tem ${MAX_ORGS_PER_ACCOUNT} produtoras, o máximo por conta.` };

  const field = (k: string, max: number) => String(formData.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const name = field("name", 80);
  if (name.length < 2) return { ok: false, error: "Digite o nome da produtora." };
  const slug = slugify(name);
  if (slug.length < 2) return { ok: false, error: "Use letras ou números no nome da produtora." };
  // nome e endereço não podem ser de nenhuma outra produtora (nem das outras da mesma conta)
  const taken = await db.query.organizers.findFirst({ where: or(eq(organizers.slug, slug), eq(organizers.name, name)), columns: { id: true } });
  if (taken) return { ok: false, error: "Esse nome já é de outra produtora. Tente uma variação." };
  const ufIn = field("uf", 2).toUpperCase();
  const ig = field("instagram", 120).replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "").slice(0, 60);
  const id = randomUUID();
  const onboarding = { ...((approved.onboarding ?? {}) as Record<string, unknown>), doneAt: new Date().toISOString() };

  // trava por conta e conferência do limite na mesma transação: dois pedidos ao mesmo tempo não passam de 3
  try {
    await runBatch([
      lockKeys([`orgs:${user.id}`]),
      db.insert(organizers).values({
        id, name, slug, initials: initials(name) || name.slice(0, 2).toUpperCase(), ownerUserId: user.id, contactEmail: user.email ?? null,
        cityName: field("city", 120) || null, uf: /^[A-Z]{2}$/.test(ufIn) ? ufIn : null, instagram: ig ? `@${ig}` : null,
        tagline: field("tagline", 140) || null, onboarding: onboarding as never,
      }),
      ensure(sql`(select count(*) from ${organizers} where owner_user_id = ${user.id}) <= ${MAX_ORGS_PER_ACCOUNT}`, "limit"),
    ]);
  } catch (e) {
    if (abortOf(e) === "limit") return { ok: false, error: `Você já tem ${MAX_ORGS_PER_ACCOUNT} produtoras, o máximo por conta.` };
    // outro pedido pegou o mesmo endereço no meio do caminho
    if (/organizers_slug_idx|duplicate key/i.test(String((e as { message?: unknown })?.message ?? "") + String((e as { cause?: { message?: unknown } })?.cause?.message ?? ""))) {
      return { ok: false, error: "Esse nome já é de outra produtora. Tente uma variação." };
    }
    throw e;
  }
  await setActiveCookie(id);
  revalidatePath("/painel", "layout");
  return { ok: true, id, slug };
}

/** Quantas produtoras a conta tem como dona e se pode criar mais uma (para o seletor do painel). */
export async function organizerQuota(): Promise<{ owned: number; max: number; canCreate: boolean }> {
  const user = await getSessionUser();
  if (!user) return { owned: 0, max: MAX_ORGS_PER_ACCOUNT, canCreate: false };
  const own = await db.select({ n: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${organizers.onboarding} is not null)::int` })
    .from(organizers).where(and(eq(organizers.ownerUserId, user.id), isNotNull(organizers.ownerUserId)));
  const n = own[0]?.n ?? 0;
  return { owned: n, max: MAX_ORGS_PER_ACCOUNT, canCreate: (own[0]?.done ?? 0) > 0 && n < MAX_ORGS_PER_ACCOUNT };
}
