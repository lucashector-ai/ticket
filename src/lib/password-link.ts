import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

/*
 * Link para criar uma senha nova. O Neon Auth gera um código de "esqueci a senha"; em vez de mandar
 * o código, o e-mail leva um link de uso único. O código fica guardado no KV atrás desse link
 * (a chave é o hash do link) e só é usado quando a pessoa escolhe a nova senha.
 */

const TTL = 15 * 60;
const keyOf = (t: string) => `pwlink:${createHash("sha256").update(t).digest("base64url")}`;

async function kv() {
  const { env } = await getCloudflareContext({ async: true });
  return env.KV;
}

/** Guarda o código e devolve o caminho do link (/redefinir-senha?t=...). */
export async function createResetLink(email: string, otp: string) {
  const t = randomBytes(24).toString("base64url");
  await (await kv()).put(keyOf(t), JSON.stringify({ email, otp }), { expirationTtl: TTL });
  return `/redefinir-senha?t=${t}`;
}

export async function readResetLink(t: string): Promise<{ email: string; otp: string } | null> {
  if (!/^[\w-]{20,64}$/.test(t)) return null;
  return (await kv()).get<{ email: string; otp: string }>(keyOf(t), "json");
}

export async function dropResetLink(t: string) {
  await (await kv()).delete(keyOf(t));
}

/** Um envio a cada 30s e no máximo 6 por hora por chave (e-mail); o Neon Auth também limita. */
export async function linkThrottled(key: string) {
  const store = await kv();
  const h = createHash("sha256").update(key.toLowerCase()).digest("base64url");
  const k = `pwreq:${h}`, kh = `pwreqh:${h}`;
  const at = Number((await store.get(k)) ?? 0);
  if (at && Date.now() - at < 30_000) return true;
  // além dos 30 s entre pedidos, no máximo 6 por hora para o mesmo e-mail: ninguém usa o site para
  // encher a caixa de entrada de outra pessoa (a resposta é a mesma com ou sem conta)
  const n = Number((await store.get(kh)) ?? 0);
  if (n >= LINKS_PER_HOUR) return true;
  await store.put(k, String(Date.now()), { expirationTtl: 60 });
  await store.put(kh, String(n + 1), { expirationTtl: 3600 });
  return false;
}

const LINKS_PER_HOUR = 6;
