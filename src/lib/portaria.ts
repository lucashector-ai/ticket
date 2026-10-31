import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { acceptedKeys, currentKey, hmacWith, type Key } from "@/lib/signing-secret";

/*
 * App da portaria (/portaria): o aparelho entra num evento com o código curto ou o link de um
 * acesso de check-in criado no painel e fica com um cookie assinado (só o id do acesso). Cada ação
 * confere de novo no banco se o acesso continua ligado: desligar no painel corta na hora.
 */

export const PORTARIA_COOKIE = "tw_portaria";
const MAX_AGE = 60 * 60 * 24 * 30;
/** sem 0/O, 1/I/L: dá para ditar o código por telefone */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newAccessCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
/** "k7px 3mq9" → "K7PX-3MQ9" */
export function normalizeCode(v: string) {
  const s = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

const signWith = (k: Key, id: string) => hmacWith(k, `portaria:${id}`).slice(0, 32);
const sign = (id: string) => signWith(currentKey("portaria"), id);
/** Assinatura do cookie confere com a chave atual ou uma anterior (aparelho conectado não cai na troca, SEC-200). */
const signedOk = (id: string, sig: string) => acceptedKeys("portaria").some((k) => {
  const want = signWith(k, id);
  return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
});

/** Cookie do aparelho conectado a um acesso: só o id, assinado; HttpOnly. */
export const portariaCookie = (linkId: string) => ({
  name: PORTARIA_COOKIE, value: `${linkId}.${sign(linkId)}`,
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: MAX_AGE,
});
export async function setPortariaCookie(linkId: string) {
  (await cookies()).set(portariaCookie(linkId));
  await markOpened(linkId);
}
/** Rastreio: a primeira vez que o acesso foi aberto num aparelho. */
export async function markOpened(linkId: string) {
  await db.update(schema.checkinLinks).set({ openedAt: new Date() }).where(and(eq(schema.checkinLinks.id, linkId), isNull(schema.checkinLinks.openedAt))).catch(() => null);
}
export async function clearPortariaCookie() {
  (await cookies()).delete(PORTARIA_COOKIE);
}

/** Acesso ligado (não revogado, evento publicado e terminou há menos de um dia). */
export async function activeAccess(where: { id: string } | { token: string } | { code: string }) {
  const cond = "id" in where ? eq(schema.checkinLinks.id, where.id) : "token" in where ? eq(schema.checkinLinks.token, where.token) : eq(schema.checkinLinks.code, where.code);
  const link = await db.query.checkinLinks.findFirst({
    where: and(cond, isNull(schema.checkinLinks.revokedAt)),
    with: { event: { columns: { id: true, title: true, slug: true, flyerId: true, status: true, startAt: true, endAt: true, dateLabel: true } } },
  });
  if (!link || link.event.status === "draft") return null;
  const end = (link.event.endAt ?? link.event.startAt).getTime();
  return end + 86_400_000 < Date.now() ? null : link;
}

/** Acesso do aparelho (pelo cookie), ou null. */
export async function portariaSession() {
  const raw = (await cookies()).get(PORTARIA_COOKIE)?.value ?? "";
  const [id, sig] = raw.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  if (!signedOk(id, sig)) return null;
  return activeAccess({ id });
}
