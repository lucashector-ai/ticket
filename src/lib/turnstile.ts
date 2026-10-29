import "server-only";
import { headers } from "next/headers";

/*
 * Cloudflare Turnstile (verificador de humanos) no login e no cadastro.
 * Liga sozinho quando as duas chaves existem no ambiente; sem elas o site segue funcionando sem o desafio.
 */

export function turnstileSiteKey() {
  const site = process.env.TURNSTILE_SITE_KEY, secret = process.env.TURNSTILE_SECRET_KEY;
  return site && secret ? site : null;
}

/** Confere o token do widget com a Cloudflare. Sem chaves configuradas, aprova (o desafio está desligado). */
export async function verifyHuman(token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !turnstileSiteKey()) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const h = await headers();
  const ip = h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const j = (await r.json()) as { success?: boolean };
    return !!j.success;
  } catch (e) {
    console.error("turnstile", e);
    return false;
  }
}

export const HUMAN_ERROR = "Confirme que você não é um robô e tente de novo.";
