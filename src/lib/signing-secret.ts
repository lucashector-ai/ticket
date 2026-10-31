import { createHmac } from "node:crypto";

/*
 * Chaves das assinaturas e cifras próprias da Tickets Win (SEC-200): QR do ingresso, cookie da portaria, sessão do
 * banco, 2FA (cookie da segunda etapa, códigos por e-mail, códigos de recuperação) e a cifra do segredo do app
 * autenticador.
 *
 * Sem variável nova (como hoje): tudo usa o NEON_AUTH_COOKIE_SECRET, o mesmo segredo do login, exatamente como antes.
 * Nada muda nos QR já enviados, no 2FA cadastrado nem nos acessos da portaria.
 *
 * Com TW_SIGNING_SECRET (segredo novo, só nosso): cada finalidade ganha a própria chave, derivada por HKDF-SHA256
 * (info = "tickets-win:<finalidade>"); o que é assinado ou cifrado daqui em diante usa a chave nova, e a conferência
 * aceita também as chaves anteriores, para nada quebrar:
 *   - TW_SIGNING_SECRET_OLD: o TW_SIGNING_SECRET anterior (durante uma troca dele);
 *   - o segredo antigo (TW_LEGACY_SECRET, ou o NEON_AUTH_COOKIE_SECRET enquanto TW_LEGACY_SECRET não existe):
 *       · QR, portaria, códigos de recuperação e app autenticador (duram meses): enquanto houver segredo antigo;
 *       · banco e 2FA da sessão (duram minutos): só enquanto o NEON_AUTH_COOKIE_SECRET ainda é o antigo
 *         (TW_LEGACY_SECRET não definido). Depois da troca do segredo do login, o valor antigo deixa de abrir o banco
 *         e de liberar sessão.
 * O segredo do app autenticador e os códigos de recuperação são regravados com a chave nova no primeiro uso.
 * Plano de troca para o dono: docs/security/security-fixes.md (SEC-200).
 */

export type KeyPurpose = "qr" | "portaria" | "banco" | "mfa" | "recovery" | "totp";
const LONG_LIVED: ReadonlySet<KeyPurpose> = new Set(["qr", "portaria", "recovery", "totp"]);

const env = (k: string) => process.env[k]?.trim() || "";

/** Segredo do login (NEON_AUTH_COOKIE_SECRET). Sem ele, falha: um valor padrão deixaria QR e cookies forjáveis. */
export function signingSecret(): string {
  const s = env("NEON_AUTH_COOKIE_SECRET");
  if (!s) throw new Error("NEON_AUTH_COOKIE_SECRET não configurada");
  return s;
}

/** HKDF-SHA256 (RFC 5869) com 32 bytes de saída. */
export function hkdf(ikm: string, info: string): Buffer {
  const prk = createHmac("sha256", "tickets-win:hkdf:v1").update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([Buffer.from(info), Buffer.from([1])])).digest();
}

/** Uma chave: `raw` (o segredo antigo, usado como sempre foi) ou `derived` (32 bytes da HKDF). */
export type Key = { kind: "raw"; value: string } | { kind: "derived"; value: Buffer };

const derived = (secret: string, p: KeyPurpose): Key => ({ kind: "derived", value: hkdf(secret, `tickets-win:${p}`) });

/** Chave atual de uma finalidade (assina e cifra). */
export function currentKey(p: KeyPurpose): Key {
  const tw = env("TW_SIGNING_SECRET");
  return tw ? derived(tw, p) : { kind: "raw", value: signingSecret() };
}

/** Chaves aceitas na conferência, a atual primeiro (ver o comentário do topo). */
export function acceptedKeys(p: KeyPurpose): Key[] {
  const tw = env("TW_SIGNING_SECRET");
  if (!tw) return [{ kind: "raw", value: signingSecret() }];
  const out: Key[] = [derived(tw, p)];
  const old = env("TW_SIGNING_SECRET_OLD");
  if (old && old !== tw) out.push(derived(old, p));
  const legacy = env("TW_LEGACY_SECRET");
  if (legacy) {
    if (LONG_LIVED.has(p)) out.push({ kind: "raw", value: legacy });
  } else {
    const neon = env("NEON_AUTH_COOKIE_SECRET");
    if (neon) out.push({ kind: "raw", value: neon });
  }
  return out;
}

/** HMAC-SHA256 em base64url com uma chave (o segredo antigo entra como texto, como sempre). */
export const hmacWith = (k: Key, msg: string) => createHmac("sha256", k.value).update(msg).digest("base64url");
