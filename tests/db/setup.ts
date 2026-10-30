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
