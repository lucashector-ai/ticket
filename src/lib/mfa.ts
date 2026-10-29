import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/db";
import { mailMfaCode } from "@/lib/notify";
import { sendWhatsappCode, whatsappEnabled } from "@/lib/whatsapp";

/*
 * Verificação em duas etapas da Tickets Win (por cima do login do Neon Auth).
 * Depois da senha (ou do Google), quem ligou as duas etapas recebe um código por e-mail ou WhatsApp.
 * Enquanto o código não é confirmado a sessão existe, mas o site trata a pessoa como deslogada.
 * Confirmado o código, o cookie `tw_mfa` libera aquela sessão; "confiar neste aparelho" pula o código por 30 dias.
 */

export type MfaMethod = "email" | "whatsapp";
export type CodePurpose = "login" | "setup" | "off" | "email" | "bank";

const PASS_COOKIE = "tw_mfa";
const TRUST_COOKIE = "tw_mfa_dev";
const TRUST_DAYS = 30;
const CODE_TTL = 10 * 60;
const MAX_TRIES = 5;
const RESEND_AFTER = 45;
const MAX_SENDS_HOUR = 8;

const secret = () => process.env.NEON_AUTH_COOKIE_SECRET ?? "tw";
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("base64url").slice(0, 32);
const hashCode = (userId: string, purpose: string, code: string) => createHash("sha256").update(`${secret()}:${userId}:${purpose}:${code}`).digest("base64url");
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

async function kv() {
  const { env } = await getCloudflareContext({ async: true });
  return env.KV;
}

export async function mfaSettings(userId: string): Promise<{ method: MfaMethod | null; phone: string | null; email: string | null; name: string | null }> {
  const p = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, userId), columns: { mfaMethod: true, mfaPhone: true, email: true, name: true } });
  const method = p?.mfaMethod === "whatsapp" && !whatsappEnabled() ? "email" : (p?.mfaMethod ?? null);
  return { method, phone: p?.mfaPhone ?? null, email: p?.email ?? null, name: p?.name ?? null };
}

/** A sessão atual já passou pela segunda etapa (ou o aparelho é confiável)? */
export async function sessionCleared(userId: string, sessionId: string) {
  const c = await cookies();
  const pass = c.get(PASS_COOKIE)?.value;
  if (pass && same(pass, mac(`pass:${sessionId}`))) return true;
  const trust = c.get(TRUST_COOKIE)?.value?.split(".");
  if (trust?.length === 3 && trust[0] === userId && Number(trust[1]) > Date.now() && same(trust[2], mac(`dev:${trust[0]}:${trust[1]}`))) return true;
  return false;
}

/** Libera a sessão (e, se pedido, o aparelho por 30 dias). Só em ação de servidor ou rota. */
export async function clearSession(userId: string, sessionId: string, trustDevice: boolean) {
  const c = await cookies();
  c.set(PASS_COOKIE, mac(`pass:${sessionId}`), cookieOpts);
  if (trustDevice) {
    const exp = Date.now() + TRUST_DAYS * 864e5;
    c.set(TRUST_COOKIE, `${userId}.${exp}.${mac(`dev:${userId}:${exp}`)}`, { ...cookieOpts, maxAge: TRUST_DAYS * 86400 });
  }
}

export async function forgetDevice() {
  const c = await cookies();
  c.delete(TRUST_COOKIE);
  c.delete(PASS_COOKIE);
}

export const maskEmail = (e: string) => e.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => a + "•".repeat(Math.min(6, Math.max(2, mid.length))) + b);
export const maskPhone = (p: string) => { const d = p.replace(/\D/g, "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) •••••-${d.slice(-4)}` : "seu celular"; };

type Stored = { h: string; n: number; at: number; ch: MfaMethod; to: string };

/**
 * Gera e envia um código de 6 dígitos. `to` é o e-mail ou celular de destino.
 * Respeita intervalo entre reenvios e um limite por hora.
 */
export async function issueCode(userId: string, purpose: CodePurpose, ch: MfaMethod, to: string, name?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = await kv();
  const key = `mfa:${purpose}:${userId}`;
  const prev = await store.get<Stored>(key, "json");
  if (prev && Date.now() - prev.at < RESEND_AFTER * 1000) return { ok: false, error: `Aguarde ${RESEND_AFTER - Math.floor((Date.now() - prev.at) / 1000)}s para pedir outro código.` };
  const countKey = `mfa:n:${userId}`;
  const sent = Number((await store.get(countKey)) ?? 0);
  if (sent >= MAX_SENDS_HOUR) return { ok: false, error: "Muitos códigos pedidos. Tente de novo daqui a uma hora." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const ok = ch === "whatsapp" ? await sendWhatsappCode(to, code) : await mailMfaCode(to, code, purpose, name);
  if (!ok) return { ok: false, error: ch === "whatsapp" ? "Não conseguimos enviar pelo WhatsApp agora. Tente por e-mail." : "Não conseguimos enviar o e-mail agora. Tente de novo." };
  await store.put(key, JSON.stringify({ h: hashCode(userId, purpose, code), n: 0, at: Date.now(), ch, to } satisfies Stored), { expirationTtl: CODE_TTL });
  await store.put(countKey, String(sent + 1), { expirationTtl: 3600 });
  return { ok: true };
}

/** Confere o código. Até 5 tentativas; depois disso é preciso pedir outro. Devolve o destino confirmado. */
export async function checkCode(userId: string, purpose: CodePurpose, code: string): Promise<{ ok: true; to: string; ch: MfaMethod } | { ok: false; error: string }> {
  const store = await kv();
  const key = `mfa:${purpose}:${userId}`;
  const s = await store.get<Stored>(key, "json");
  if (!s) return { ok: false, error: "O código expirou. Peça um novo." };
  const clean = code.replace(/\D/g, "");
  if (clean.length === 6 && same(s.h, hashCode(userId, purpose, clean))) {
    await store.delete(key);
    return { ok: true, to: s.to, ch: s.ch };
  }
  if (s.n + 1 >= MAX_TRIES) {
    await store.delete(key);
    return { ok: false, error: "Código incorreto várias vezes. Peça um novo código." };
  }
  await store.put(key, JSON.stringify({ ...s, n: s.n + 1 }), { expirationTtl: CODE_TTL });
  return { ok: false, error: `Código incorreto. Você tem mais ${MAX_TRIES - s.n - 1} tentativa${MAX_TRIES - s.n - 1 === 1 ? "" : "s"}.` };
}

/** Quando o último código foi enviado (para mostrar "reenviar em…"). */
export async function lastSent(userId: string, purpose: CodePurpose) {
  const s = await (await kv()).get<Stored>(`mfa:${purpose}:${userId}`, "json");
  return s ? { at: s.at, ch: s.ch } : null;
}

function reqDevice(h: Headers) {
  return { ua: h.get("user-agent")?.slice(0, 300) ?? "", ip: (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) };
}

/**
 * Guarda aparelho e IP de uma sessão (o login acontece no servidor, então o Neon Auth só vê o nosso servidor).
 * A chave é o hash do token da sessão, nunca o token.
 */
export async function rememberDevice(token: string | null | undefined) {
  if (!token) return;
  try {
    await (await kv()).put(`dev:${mac(`dev:${token}`)}`, JSON.stringify(reqDevice(await headers())), { expirationTtl: 60 * 86400 });
  } catch (e) { console.error("device", e); }
}

export async function devicesOf(tokens: string[]): Promise<Map<string, { ua: string; ip: string }>> {
  const store = await kv();
  const rows = await Promise.all(tokens.map(async (t) => [t, await store.get<{ ua: string; ip: string }>(`dev:${mac(`dev:${t}`)}`, "json").catch(() => null)] as const));
  return new Map(rows.filter((r): r is readonly [string, { ua: string; ip: string }] => !!r[1]));
}

export async function currentDevice() {
  return reqDevice(await headers());
}

/** Registra um acontecimento de segurança com IP e aparelho (falha em silêncio). */
export async function logSecurity(userId: string, kind: string, detail?: string) {
  try {
    const h = await headers();
    await db.insert(schema.securityEvents).values({
      userId, kind, detail: detail?.slice(0, 200) ?? null,
      ip: (h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "").trim().slice(0, 64) || null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    });
  } catch (e) { console.error("security log", e); }
}
