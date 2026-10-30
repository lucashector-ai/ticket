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

/** Já passou de `max` tentativas em `key`? (só lê; conte com `addHit`) */
export async function limitReached(key: string, max: number): Promise<boolean> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return Number((await env.KV.get(key)) ?? 0) >= max;
  } catch { return false; }
}

/** Conta uma tentativa em `key` (janela de `ttlSec`). */
export async function addHit(key: string, ttlSec: number): Promise<void> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const n = Number((await env.KV.get(key)) ?? 0);
    await env.KV.put(key, String(n + 1), { expirationTtl: Math.max(60, ttlSec) });
  } catch { /* sem KV: segue */ }
}
