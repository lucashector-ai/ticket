"use server";

import { and, eq, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSessionUser } from "@/lib/auth/server";
import { initials, slugify } from "@/lib/format";
import { isProducer } from "@/lib/data/producer";
import { producerStatus } from "@/lib/producer-apply";

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

/** Categoria da inscrição → tipo de evento do cadastro. */
function kindOf(category: string) {
  const c = category.toLowerCase();
  return c.includes("festival") ? "festivais" : c.includes("show") ? "shows" : c.includes("teatro") ? "teatro" : c.includes("outro") ? "outro" : "festas";
}
const audienceOf = (n: number) => (n < 300 ? "ate300" : n <= 1000 ? "300a1000" : n <= 4000 ? "1000a4000" : "mais4000");

/**
 * Fim do cadastro do produtor aprovado: cria (ou atualiza) a página do produtor com nome, cidade, Instagram e frase.
 * As respostas sobre o tipo e o tamanho dos eventos vêm da inscrição aprovada.
 */
export async function finishOnboarding(input: { name: string; city: string; uf: string; instagram: string; tagline: string }): Promise<R<{ slug: string }>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Entre na sua conta." };
  const st = await producerStatus(user);
  if (st.status !== "approved" && st.status !== "producer") return { ok: false, error: "Sua conta de produtor ainda não foi aprovada." };
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Digite o nome do organizador." };
  const check = await checkOrganizerName(name);
  if (!check.ok) return check;
  if (!check.available) return { ok: false, error: "Esse nome já é de outro produtor. Tente uma variação." };
  const uf = /^[A-Z]{2}$/.test(input.uf.trim().toUpperCase()) ? input.uf.trim().toUpperCase() : null;
  const ig = input.instagram.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "").slice(0, 60);
  const app = st.app;
  const onboarding = {
    kind: app ? kindOf(app.category) : "outro", perYear: "ate10", audience: app ? audienceOf(app.expected) : "ate300", doneAt: new Date().toISOString(),
  };
  const own = await db.query.organizers.findFirst({ where: eq(organizers.ownerUserId, user.id) });
  const values = {
    name, slug: check.slug, initials: initials(name) || name.slice(0, 2).toUpperCase(), onboarding,
    cityName: input.city.trim().slice(0, 120) || null, uf, instagram: ig ? `@${ig}` : null, tagline: input.tagline.trim().slice(0, 140) || null,
  };
  if (own) await db.update(organizers).set(values).where(eq(organizers.id, own.id));
  else await db.insert(organizers).values({ ...values, ownerUserId: user.id, contactEmail: user.email ?? null });
  return { ok: true, slug: check.slug };
}

/** O usuário logado já é produtor? (o cabeçalho usa para mostrar Painel e Meus eventos) */
export async function myProducerStatus(): Promise<boolean> {
  const user = await getSessionUser();
  return user ? isProducer(user) : false;
}
