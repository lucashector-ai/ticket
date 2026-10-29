import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { siteUrl } from "@/lib/mail/data";

/*
 * Entrar com Apple. O Neon Auth não tem Apple entre os provedores, então o "Sign in with Apple" é nosso:
 *   1. /api/apple/start manda para a Apple com state + nonce (guardados num cookie httpOnly);
 *   2. a Apple devolve por POST em /api/apple/callback um id_token, que conferimos com as chaves dela;
 *   3. com o e-mail confirmado pela Apple: se ainda não há conta, ela nasce ali (cadastro com senha aleatória);
 *      se já há, pedimos ao Neon Auth um código de "entrar" para esse e-mail, o nosso webhook guarda o código
 *      no banco (apple_otps) em vez de mandar e-mail, e o callback entra com ele.
 * Só precisa do Services ID (APPLE_SIGNIN_CLIENT_ID); sem ele o botão não aparece.
 */

export const appleSignInEnabled = () => !!process.env.APPLE_SIGNIN_CLIENT_ID;
export const appleRedirectUri = () => `${siteUrl()}/api/apple/callback`;
/** state.nonce.next (o next em base64url); SameSite=None porque a Apple volta com um POST de outro site */
export const APPLE_COOKIE = "tw_apple";

const ISS = "https://appleid.apple.com";
const hash = (s: string) => createHash("sha256").update(s).digest("base64url");

/** Começa o login: devolve o endereço da Apple e o valor do cookie que amarra a volta a este navegador. */
export function startAppleSignIn(next: string) {
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const q = new URLSearchParams({
    client_id: process.env.APPLE_SIGNIN_CLIENT_ID!,
    redirect_uri: appleRedirectUri(),
    response_type: "code id_token",
    response_mode: "form_post",
    scope: "name email",
    state,
    nonce: hash(nonce),
  });
  return { url: `${ISS}/auth/authorize?${q}`, cookie: `${state}.${nonce}.${Buffer.from(next).toString("base64url")}` };
}

/** Lê o cookie e confere se o state que voltou da Apple é o deste navegador. */
export function readAppleCookie(cookie: string | undefined, state: string): { nonce: string; next: string } | null {
  const [st, nonce, nx] = (cookie ?? "").split(".");
  if (!st || !nonce || !state || st.length !== state.length) return null;
  if (!timingSafeEqual(Buffer.from(st), Buffer.from(state))) return null;
  return { nonce, next: Buffer.from(nx ?? "", "base64url").toString("utf8") || "/" };
}

type Jwk = JsonWebKey & { kid?: string };
let keys: { at: number; list: Jwk[] } | null = null;

async function appleKeys(refresh: boolean): Promise<Jwk[]> {
  if (keys && !refresh && Date.now() - keys.at < 3_600_000) return keys.list;
  const r = await fetch(`${ISS}/auth/keys`);
  if (!r.ok) throw new Error(`apple keys ${r.status}`);
  keys = { at: Date.now(), list: ((await r.json()) as { keys: Jwk[] }).keys ?? [] };
  return keys.list;
}

const json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export type AppleIdentity = { sub: string; email: string; privateRelay: boolean };

/** Confere assinatura (RS256, chaves da Apple), emissor, destinatário, validade e nonce do id_token. */
export async function verifyAppleIdToken(idToken: string, nonce: string): Promise<AppleIdentity> {
  const [h, p, s] = idToken.split(".");
  if (!h || !p || !s) throw new Error("id_token em formato inesperado");
  const header = json(h) as { alg?: string; kid?: string };
  if (header.alg !== "RS256") throw new Error("algoritmo inesperado");
  let jwk = (await appleKeys(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await appleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("chave da Apple desconhecida");
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, Buffer.from(s, "base64url"), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("assinatura inválida");
  const c = json(p) as { iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string; email?: string; email_verified?: boolean | string; is_private_email?: boolean | string };
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (c.iss !== ISS || !aud.includes(process.env.APPLE_SIGNIN_CLIENT_ID)) throw new Error("token de outro app");
  if (!c.exp || c.exp * 1000 < Date.now() - 60_000) throw new Error("token expirado");
  if (c.nonce !== hash(nonce)) throw new Error("nonce diferente");
  if (!c.sub || !c.email) throw new Error("a Apple não mandou o e-mail");
  if (String(c.email_verified) !== "true") throw new Error("e-mail não confirmado pela Apple");
  return { sub: c.sub, email: c.email.trim().toLowerCase(), privateRelay: String(c.is_private_email) === "true" };
}

/* Ponte com o Neon Auth: o código de "entrar" pedido pelo callback fica no banco em vez de ir por e-mail. */
const T = schema.appleOtps;
const emailHash = (email: string) => hash(`apple:${email.trim().toLowerCase()}`);
const fresh = () => gt(T.createdAt, new Date(Date.now() - 60_000));

/** Marca que o próximo código de "entrar" deste e-mail é do login com Apple. */
export async function expectAppleOtp(email: string) {
  const h = emailHash(email);
  await db.insert(T).values({ emailHash: h }).onConflictDoUpdate({ target: T.emailHash, set: { otp: null, createdAt: new Date() } });
}

/** Chamado pelo webhook: true se o código era do login com Apple (e não deve virar e-mail). */
export async function catchAppleOtp(email: string, code: string) {
  if (!email || !code) return false;
  const r = await db.update(T).set({ otp: code }).where(and(eq(T.emailHash, emailHash(email)), isNull(T.otp), fresh())).returning({ h: T.emailHash });
  return r.length > 0;
}

/** Espera o webhook entregar o código (normalmente já chegou quando o pedido ao Neon termina). */
export async function takeAppleOtp(email: string, timeoutMs = 10_000): Promise<string | null> {
  const h = emailHash(email), until = Date.now() + timeoutMs;
  for (;;) {
    const r = await db.delete(T).where(and(eq(T.emailHash, h), isNotNull(T.otp), fresh())).returning({ otp: T.otp });
    if (r[0]?.otp) return r[0].otp;
    if (Date.now() > until) {
      await db.delete(T).where(eq(T.emailHash, h));
      return null;
    }
    await new Promise((res) => setTimeout(res, 300));
  }
}
