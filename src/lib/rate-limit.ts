import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";

/** IP de quem chamou (Cloudflare), para limites de quem não está logado. */
export async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

/**
 * Conta mais uma tentativa em `key` (KV, janela de `ttlSec`); false quando já passou de `max`.
 * Sem KV (alguns ambientes locais), não limita.
 */
export async function allowHit(key: string, max: number, ttlSec: number): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const n = Number((await env.KV.get(key)) ?? 0);
    if (n >= max) return false;
    await env.KV.put(key, String(n + 1), { expirationTtl: Math.max(60, ttlSec) });
  } catch { /* sem KV: segue */ }
  return true;
}
