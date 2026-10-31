import { neon } from "@neondatabase/serverless";

/*
 * Fim da suíte (globalSetup do vitest): apaga os perfis das contas fictícias "qa-test-…" que os testes de
 * integração criam ao fazer pedidos (o checkout grava nome, CPF e celular no perfil). Cada arquivo apaga os
 * próprios eventos e pedidos; os perfis ficavam (achado do Marcos na rodada 3: ~35 sobrando).
 */
export default function setup() {
  return async function teardown() {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) return;
    if (process.env.DATABASE_URL_PROD && process.env.DATABASE_URL_PROD === url) throw new Error("TEST_DATABASE_URL é a produção: recusado.");
    const sql = neon(url);
    await sql`delete from user_profiles where user_id like 'qa-test-%'`;
    // tentativas contadas pelos limitadores (SEC-301/302) das contas, IPs e chaves fictícias desta rodada
    await sql`delete from security_events where kind like 'try:%' and user_id like '%qa-test-%'`;
  };
}
