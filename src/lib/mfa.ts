import "server-only";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/db";
import { clearAttempts, reserveAttempt } from "@/lib/attempts";
import { mailMfaCode } from "@/lib/notify";
import { acceptedKeys, currentKey, hmacWith, type Key } from "@/lib/signing-secret";

/*
 * Verificação em duas etapas da Tickets Win (por cima do login do Neon Auth).
 * Depois da senha (ou do Google), quem ligou as duas etapas digita o código do app autenticador
 * (Google Authenticator, 1Password, iCloud Senhas...) ou um código enviado por e-mail.
 * Enquanto o código não é confirmado a sessão existe, mas o site trata a pessoa como deslogada.
 * Confirmado o código, o cookie `tw_mfa` libera só aquela sessão: todo login novo pede o código de novo.
 */

export type MfaMethod = "email" | "totp";
export type CodePurpose = "login" | "setup" | "off" | "email" | "newemail" | "bank";

const PASS_COOKIE = "tw_mfa";
/** cookie antigo do "confiar neste aparelho" (não vale mais; só é apagado) */
const OLD_TRUST_COOKIE = "tw_mfa_dev";
const CODE_TTL = 10 * 60;
const MAX_TRIES = 5;
/** segundos até poder pedir outro código (a tela mostra a mesma contagem) */
export const RESEND_AFTER = 30;
const MAX_SENDS_HOUR = 8;

/*
 * Chaves (SEC-200, src/lib/signing-secret.ts): "mfa" para o cookie da segunda etapa, os aparelhos e os códigos por
 * e-mail; "recovery" para os códigos de recuperação; "totp" para cifrar o segredo do app. Com o segredo antigo (sem
 * TW_SIGNING_SECRET) as contas são exatamente as de antes; com a chave derivada, HMAC.
 */
const macWith = (k: Key, s: string) => hmacWith(k, s).slice(0, 32);
const mac = (s: string) => macWith(currentKey("mfa"), s);
const hashWith = (k: Key, text: string) => (k.kind === "raw"
  ? createHash("sha256").update(`${k.value}:${text}`).digest("base64url")
  : hmacWith(k, text));
const hashCode = (k: Key, userId: string, purpose: string, code: string) => hashWith(k, `${userId}:${purpose}:${code}`);
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

async function kv() {
  const { env } = await getCloudflareContext({ async: true });
  return env.KV;
}

export async function mfaSettings(userId: string): Promise<{ method: MfaMethod | null; email: string | null; name: string | null; recoveryLeft: number }> {
  const p = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, userId), columns: { mfaMethod: true, mfaTotp: true, mfaRecovery: true, email: true, name: true } });
  // app autenticador sem segredo salvo não vale (cai no e-mail)
  const method: MfaMethod | null = p?.mfaMethod === "totp" ? (p.mfaTotp ? "totp" : "email") : p?.mfaMethod === "email" ? "email" : null;
  return { method, email: p?.email ?? null, name: p?.name ?? null, recoveryLeft: p?.mfaRecovery?.length ?? 0 };
}

/** A sessão atual já passou pela segunda etapa? */
export async function sessionCleared(sessionId: string) {
  const pass = (await cookies()).get(PASS_COOKIE)?.value;
  return !!sessionId && !!pass && acceptedKeys("mfa").some((k) => same(pass, macWith(k, `pass:${sessionId}`)));
}

/** Libera a sessão depois do código certo. Só em ação de servidor ou rota. */
export async function clearSession(sessionId: string) {
  const c = await cookies();
  c.set(PASS_COOKIE, mac(`pass:${sessionId}`), cookieOpts);
  c.delete(OLD_TRUST_COOKIE);
}

export async function forgetDevice() {
  const c = await cookies();
  c.delete(OLD_TRUST_COOKIE);
  c.delete(PASS_COOKIE);
}

/** e-mail com o começo e o fim do nome à mostra: l••••••••s@gmail.com */
export const maskEmail = (e: string) => e.replace(/^(.)(.*)(.@.*)$/, (_m, a: string, mid: string, b: string) => a + "•".repeat(Math.min(10, Math.max(2, mid.length))) + b);

type Stored = { h: string; n: number; at: number; to: string };

/**
 * Gera e envia por e-mail um código de 6 dígitos para `to`.
 * Respeita intervalo entre reenvios e um limite por hora.
 */
export async function issueCode(userId: string, purpose: CodePurpose, to: string, name?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const store = await kv();
  const key = `mfa:${purpose}:${userId}`;
  const prev = await store.get<Stored>(key, "json");
  if (prev && Date.now() - prev.at < RESEND_AFTER * 1000) return { ok: false, error: `Aguarde ${RESEND_AFTER - Math.floor((Date.now() - prev.at) / 1000)}s para pedir outro código.` };
  const countKey = `mfa:n:${userId}`;
  const sent = Number((await store.get(countKey)) ?? 0);
  if (sent >= MAX_SENDS_HOUR) return { ok: false, error: "Muitos códigos pedidos. Tente de novo daqui a uma hora." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (!(await mailMfaCode(to, code, purpose, name))) return { ok: false, error: "Não conseguimos enviar o e-mail agora. Tente de novo." };
  await store.put(key, JSON.stringify({ h: hashCode(currentKey("mfa"), userId, purpose, code), n: 0, at: Date.now(), to } satisfies Stored), { expirationTtl: CODE_TTL });
  await store.put(countKey, String(sent + 1), { expirationTtl: 3600 });
  // código novo, tentativas novas (o limite de envios por hora continua valendo)
  await clearAttempts(userId, `code:${purpose}`);
  return { ok: true };
}

/** O contador não respondeu (banco fora): a tentativa é recusada, sem conferir o palpite. */
const ATTEMPT_DOWN = "Não conseguimos conferir o código agora. Tente de novo em instantes.";

/**
 * Confere o código do e-mail. Até 5 tentativas; depois disso é preciso pedir outro.
 * A tentativa é contada (de forma atômica, no banco) ANTES de comparar: palpites em paralelo não passam de 5 (SEC-301).
 */
export async function checkCode(userId: string, purpose: CodePurpose, code: string): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const store = await kv();
  const key = `mfa:${purpose}:${userId}`;
  const s = await store.get<Stored>(key, "json");
  if (!s) return { ok: false, error: "O código expirou. Peça um novo." };
  let at;
  try {
    at = await reserveAttempt(userId, `code:${purpose}`, MAX_TRIES, CODE_TTL);
  } catch (e) {
    console.error("mfa attempts", e);
    return { ok: false, error: ATTEMPT_DOWN };
  }
  if (!at.ok) {
    await store.delete(key);
    return { ok: false, error: "Código incorreto várias vezes. Peça um novo código." };
  }
  const clean = code.replace(/\D/g, "");
  if (clean.length === 6 && acceptedKeys("mfa").some((k) => same(s.h, hashCode(k, userId, purpose, clean)))) {
    await store.delete(key);
    await clearAttempts(userId, `code:${purpose}`).catch(() => {});
    return { ok: true, to: s.to };
  }
  const left = MAX_TRIES - at.n;
  if (left <= 0) {
    await store.delete(key);
    return { ok: false, error: "Código incorreto várias vezes. Peça um novo código." };
  }
  return { ok: false, error: `Código incorreto. Você tem mais ${left} tentativa${left === 1 ? "" : "s"}.` };
}

/** Etapa já autorizada por código (ex.: trocar o e-mail), válida por 15 minutos. */
export async function grantStep(userId: string, what: string) {
  await (await kv()).put(`step:${what}:${userId}`, "1", { expirationTtl: 900 });
}
export async function hasStep(userId: string, what: string) {
  return !!(await (await kv()).get(`step:${what}:${userId}`));
}
export async function dropStep(userId: string, what: string) {
  await (await kv()).delete(`step:${what}:${userId}`);
}

/** Quando o último código foi enviado (para mostrar "reenviar em…"). */
export async function lastSent(userId: string, purpose: CodePurpose) {
  const s = await (await kv()).get<Stored>(`mfa:${purpose}:${userId}`, "json");
  return s ? { at: s.at } : null;
}

/* ============================== app autenticador (TOTP, RFC 6238) ============================== */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;
const MAX_TOTP_TRIES = 6;

function base32(buf: Uint8Array) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function unbase32(s: string) {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(key: Buffer, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  msg.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** Segredo novo (160 bits) em base32, como os apps autenticadores esperam. */
export function newTotpSecret() {
  return base32(crypto.getRandomValues(new Uint8Array(20)));
}

/** Link otpauth:// que vira o QR code (o app mostra "Tickets Win (e-mail)"). */
export function totpUri(secretB32: string, account: string) {
  const label = encodeURIComponent(`Tickets Win:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent("Tickets Win")}&algorithm=SHA1&digits=6&period=${STEP}`;
}

/** Confere o código do app (aceita 30s de relógio adiantado/atrasado). `userId` liga a proteção contra reuso. */
export async function verifyTotp(secretB32: string, code: string, userId?: string) {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const key = unbase32(secretB32);
  const now = Math.floor(Date.now() / 1000 / STEP);
  const store = userId ? await kv() : null;
  const last = store ? Number((await store.get(`totp:last:${userId}`)) ?? 0) : 0;
  for (const step of [now, now - 1, now + 1]) {
    if (step <= last) continue; // o mesmo código não entra duas vezes
    if (same(hotp(key, step), clean)) {
      if (store) await store.put(`totp:last:${userId}`, String(step), { expirationTtl: 3 * STEP });
      return true;
    }
  }
  return false;
}

/* o segredo fica cifrado no banco (AES-GCM com chave derivada do segredo do servidor) */
async function aesKey(k: Key) {
  const raw = k.kind === "raw" ? await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${k.value}:totp`)) : new Uint8Array(k.value);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function sealSecret(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(currentKey("totp")), new TextEncoder().encode(plain)));
  return `${Buffer.from(iv).toString("base64url")}.${Buffer.from(ct).toString("base64url")}`;
}
/** Abre com a chave atual ou uma anterior (SEC-200). `stale`: foi aberto com uma chave anterior (vale recifrar). */
export async function openSecretWith(sealed: string): Promise<{ plain: string; stale: boolean }> {
  const [iv, ct] = sealed.split(".");
  const keys = acceptedKeys("totp");
  for (let i = 0; i < keys.length; i++) {
    try {
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64url") }, await aesKey(keys[i]), Buffer.from(ct, "base64url"));
      return { plain: new TextDecoder().decode(pt), stale: i > 0 };
    } catch { /* tenta a próxima chave */ }
  }
  throw new Error("segredo cifrado com chave desconhecida");
}
export async function openSecret(sealed: string) {
  return (await openSecretWith(sealed)).plain;
}

/** Segredo do app autenticador esperando a confirmação (15 min), cifrado no KV. */
export async function stashTotpSetup(userId: string, secretB32: string) {
  await (await kv()).put(`totp:setup:${userId}`, await sealSecret(secretB32), { expirationTtl: 900 });
}
export async function takeTotpSetup(userId: string) {
  const v = await (await kv()).get(`totp:setup:${userId}`);
  return v ? openSecret(v) : null;
}
export async function dropTotpSetup(userId: string) {
  await (await kv()).delete(`totp:setup:${userId}`);
}

/* códigos de recuperação: 10 códigos de uso único, guardados só como hash */
const RC = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const rcHash = (userId: string, c: string, k: Key = currentKey("recovery")) => hashWith(k, `rc:${userId}:${c.replace(/[^A-Z0-9]/gi, "").toUpperCase()}`);
export function newRecoveryCodes(userId: string) {
  const codes = Array.from({ length: 10 }, () => {
    const r = crypto.getRandomValues(new Uint8Array(8));
    const s = Array.from(r, (b) => RC[b % RC.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map((c) => rcHash(userId, c)) };
}

/**
 * Segunda etapa conforme o método da conta: app autenticador (ou um código de recuperação) ou o código do e-mail.
 * Limita as tentativas do app a 6 a cada 5 minutos.
 */
export async function checkSecondFactor(userId: string, purpose: CodePurpose, input: string): Promise<{ ok: true; how: "totp" | "recovery" | "email" } | { ok: false; error: string }> {
  const s = await mfaSettings(userId);
  if (s.method !== "totp") {
    const r = await checkCode(userId, purpose, input);
    return r.ok ? { ok: true, how: "email" } : r;
  }
  // a tentativa conta antes de conferir, no banco e de forma atômica (SEC-301): 6 a cada 5 min, mesmo em paralelo
  let at;
  try {
    at = await reserveAttempt(userId, "totp", MAX_TOTP_TRIES, 300);
  } catch (e) {
    console.error("mfa attempts", e);
    return { ok: false, error: ATTEMPT_DOWN };
  }
  if (!at.ok) return { ok: false, error: "Muitas tentativas. Espere 5 minutos e tente de novo." };
  const p = await db.query.userProfiles.findFirst({ where: eq(schema.userProfiles.userId, userId), columns: { mfaTotp: true, mfaRecovery: true } });
  const clean = input.trim();
  if (/[a-z]/i.test(clean)) {
    const left = p?.mfaRecovery ?? [];
    // códigos gerados antes da troca de chave continuam valendo (SEC-200)
    const h = acceptedKeys("recovery").map((k) => rcHash(userId, clean, k)).find((x) => left.includes(x));
    if (h) {
      await db.update(schema.userProfiles).set({ mfaRecovery: left.filter((x) => x !== h) }).where(eq(schema.userProfiles.userId, userId));
      await clearAttempts(userId, "totp").catch(() => {});
      return { ok: true, how: "recovery" };
    }
  } else if (p?.mfaTotp) {
    const sec = await openSecretWith(p.mfaTotp);
    if (await verifyTotp(sec.plain, clean, userId)) {
      await clearAttempts(userId, "totp").catch(() => {});
      // cifrado com a chave anterior: regrava com a atual (a troca de chave avança sozinha com o uso, SEC-200)
      if (sec.stale) await db.update(schema.userProfiles).set({ mfaTotp: await sealSecret(sec.plain) }).where(eq(schema.userProfiles.userId, userId)).catch(() => {});
      return { ok: true, how: "totp" };
    }
  }
  return { ok: false, error: /[a-z]/i.test(clean) ? "Código de recuperação inválido ou já usado." : "Código incorreto. Confira o horário do celular e o código da Tickets Win no app." };
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
