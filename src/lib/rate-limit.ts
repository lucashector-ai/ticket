import "server-only";
import { headers } from "next/headers";
import { countAttempts, reserveAttempt } from "@/lib/attempts";

/*
 * Limitadores do site (SEC-302). Antes eram contadores no KV no padrão "ler e depois gravar": pedidos simultâneos liam
 * o mesmo número e todos passavam, e uma escrita recusada pelo KV (1 por segundo por chave) liberava tudo. Agora usam
 * o contador atômico do banco (src/lib/attempts.ts, janela deslizante) e falham FECHADO: sem conseguir contar, a
 * tentativa é recusada (o banco fora do ar já derruba o resto do site; ninguém ganha tentativas extras com isso).
 */

/** IP de quem chamou (Cloudflare), para limites de quem não está logado. */
export async function clientIp() {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

const BUCKET = "hit";

/** Conta mais uma tentativa em `key` (janela de `ttlSec`, mínimo 60 s); false quando passaria de `max`. */
export async function allowHit(key: string, max: number, ttlSec: number): Promise<boolean> {
  try {
    return (await reserveAttempt(key, BUCKET, max, Math.max(60, ttlSec))).ok;
  } catch (e) {
    console.error("rate limit", e);
    return false;
  }
}

/** Já passou de `max` tentativas em `key` nos últimos `ttlSec`? (só lê; conte com `addHit` e a mesma janela) */
export async function limitReached(key: string, max: number, ttlSec = 600): Promise<boolean> {
  try {
    return (await countAttempts(key, BUCKET, Math.max(60, ttlSec))) >= max;
  } catch (e) {
    console.error("rate limit", e);
    return true;
  }
}

/** Conta uma tentativa em `key` (janela de `ttlSec`), sem limite (o padrão "só o erro conta" usa com limitReached). */
export async function addHit(key: string, ttlSec: number): Promise<void> {
  try {
    await reserveAttempt(key, BUCKET, Number.MAX_SAFE_INTEGER, Math.max(60, ttlSec));
  } catch (e) {
    console.error("rate limit", e);
  }
}
