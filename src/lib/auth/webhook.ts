/*
 * Assinatura dos webhooks do Neon Auth: JWS destacado (EdDSA / Ed25519) sobre
 * "timestamp.base64url(corpo)", com a chave pública do JWKS do próprio Neon Auth.
 * https://neon.com/docs/auth/guides/webhooks#signature-verification
 */

type Jwk = JsonWebKey & { kid?: string };

const enc = new TextEncoder();
const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

let cache: { at: number; keys: Jwk[] } | null = null;

async function jwks(url: string, refresh: boolean): Promise<Jwk[]> {
  if (cache && !refresh && Date.now() - cache.at < 3_600_000) return cache.keys;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`jwks ${r.status}`);
  cache = { at: Date.now(), keys: ((await r.json()) as { keys: Jwk[] }).keys ?? [] };
  return cache.keys;
}

/** Confere assinatura e idade (até 5 min). Devolve o corpo já em JSON, ou lança erro. */
export async function verifyNeonWebhook(raw: string, h: Headers, jwksUrl: string, getKeys: (url: string, refresh: boolean) => Promise<Jwk[]> = jwks) {
  const signature = h.get("x-neon-signature"), kid = h.get("x-neon-signature-kid"), ts = h.get("x-neon-timestamp");
  if (!signature || !kid || !ts) throw new Error("cabeçalhos do webhook ausentes");
  if (Math.abs(Date.now() - Number(ts)) > 5 * 60_000) throw new Error("webhook antigo");
  let jwk = (await getKeys(jwksUrl, false)).find((k) => k.kid === kid);
  // chave nova (rotação): busca o JWKS de novo uma vez
  if (!jwk) jwk = (await getKeys(jwksUrl, true)).find((k) => k.kid === kid);
  if (!jwk) throw new Error("chave do webhook desconhecida");
  const [header, empty, sig] = signature.split(".");
  if (empty !== "" || !header || !sig) throw new Error("assinatura em formato inesperado");
  const input = `${header}.${b64url(`${ts}.${b64url(raw)}`)}`;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, Buffer.from(sig, "base64url"), enc.encode(input));
  if (!ok) throw new Error("assinatura inválida");
  return JSON.parse(raw) as NeonAuthEvent;
}

export type NeonAuthEvent = {
  event_id: string;
  event_type: "send.otp" | "send.magic_link" | "user.before_create" | "user.created" | string;
  user?: { id?: string; email?: string; name?: string | null; email_verified?: boolean };
  event_data?: {
    otp_code?: string; otp_type?: "sign-in" | "email-verification" | "forget-password";
    link_type?: "sign-in" | "email-verification" | "forget-password"; link_url?: string;
    auth_provider?: string; delivery_preference?: string;
  };
};
