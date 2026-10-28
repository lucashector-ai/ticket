"use server";

import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { initials, slugify } from "@/lib/format";
import { AUDIENCE, KINDS, PER_YEAR } from "@/lib/onboarding";

const { organizers } = schema;
type R<T = object> = ({ ok: true } & T) | { ok: false; error: string };


/** O nome público já é de outro produtor? Devolve o endereço que a página vai ter. */
export async function checkOrganizerName(name: string): Promise<R<{ available: boolean; slug: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const slug = slugify(name.trim());
  if (slug.length < 2) return { ok: true, available: false, slug };
  const hit = await db.query.organizers.findFirst({ where: and(eq(organizers.slug, slug), ne(organizers.ownerUserId, user.id)), columns: { id: true } });
  const sameName = await db.query.organizers.findFirst({ where: and(eq(organizers.name, name.trim()), ne(organizers.ownerUserId, user.id)), columns: { id: true } });
  return { ok: true, available: !hit && !sameName, slug };
}

/** Fim do cadastro: cria (ou atualiza) a página do produtor com o nome e as respostas. */
export async function finishOnboarding(input: { name: string; kind: string; perYear: string; audience: string }): Promise<R> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Digite o nome do organizador." };
  const check = await checkOrganizerName(name);
  if (!check.ok) return check;
  if (!check.available) return { ok: false, error: "Esse nome já é de outro produtor. Tente uma variação." };
  const pick = (list: readonly (readonly [string, string])[], v: string) => (list.some(([k]) => k === v) ? v : list[list.length - 1][0]);
  const onboarding = { kind: pick(KINDS, input.kind), perYear: pick(PER_YEAR, input.perYear), audience: pick(AUDIENCE, input.audience), doneAt: new Date().toISOString() };
  const own = await db.query.organizers.findFirst({ where: eq(organizers.ownerUserId, user.id) });
  const values = { name, slug: check.slug, initials: initials(name) || name.slice(0, 2).toUpperCase(), onboarding };
  if (own) await db.update(organizers).set(values).where(eq(organizers.id, own.id));
  else await db.insert(organizers).values({ ...values, ownerUserId: user.id, contactEmail: user.email ?? null });
  // sem revalidar: a tela de "Tudo pronto" continua; o painel é dinâmico e já abre atualizado
  return { ok: true };
}
