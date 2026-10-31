import "server-only";
import { headers } from "next/headers";
import { releaseAttempt, reserveAttempt } from "@/lib/attempts";

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

export type Miss = { ok: false } | { ok: true; release: () => Promise<void> };

/**
 * Freio em que "só o palpite errado conta" (código da portaria, cupom), sem brecha de rajada (SEC-400).
 * A tentativa é RESERVADA antes de conferir o palpite, de forma atômica e com o limite: com N pedidos simultâneos,
 * no máximo `max` chegam à conferência. Quem acertou chama `release()` e a reserva é devolvida (o link de um cupom
 * aberto por muita gente na mesma rede não trava ninguém); o erro fica contado. Falha fechada.
 */
export async function reserveMiss(key: string, max: number, ttlSec = 600): Promise<Miss> {
  try {
    const r = await reserveAttempt(key, BUCKET, max, Math.max(60, ttlSec));
    if (!r.ok) return { ok: false };
    return {
      ok: true,
      release: async () => {
        try { await releaseAttempt(r.id); } catch (e) { console.error("rate limit", e); }
      },
    };
  } catch (e) {
    console.error("rate limit", e);
    return { ok: false };
  }
}
