/*
 * Integração com o banco: só com TEST_DATABASE_URL (um branch Neon de TESTE, nunca a produção).
 * Os dados criados aqui usam slug/usuário "qa-test-…" e são apagados no fim de cada arquivo.
 */
import { randomBytes } from "node:crypto";

export const TEST_DB = process.env.TEST_DATABASE_URL ?? "";
if (TEST_DB) {
  if (process.env.DATABASE_URL_PROD && process.env.DATABASE_URL_PROD === TEST_DB) throw new Error("TEST_DATABASE_URL é a produção: recusado.");
  process.env.DATABASE_URL = TEST_DB;
  // assinatura do QR nos testes (o valor real só existe no servidor)
  process.env.NEON_AUTH_COOKIE_SECRET ||= "segredo-so-dos-testes";
}
export const qaId = (p: string) => `qa-test-${p}-${randomBytes(4).toString("hex")}`;

/** CPF válido aleatório (dígitos verificadores certos), formatado: cada pessoa fictícia com o seu (SEC-305). */
export function qaCpf() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (d.every((x) => x === d[0])) d[0] = (d[0] + 1) % 10;
  for (const len of [9, 10]) {
    const sum = d.slice(0, len).reduce((s, x, i) => s + x * (len + 1 - i), 0);
    const r = (sum * 10) % 11;
    d.push(r === 10 ? 0 : r);
  }
  const s = d.join("");
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}
