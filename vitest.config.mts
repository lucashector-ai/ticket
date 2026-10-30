import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * Testes automatizados (pnpm test). Unitários em tests/unit (sem banco, sem rede).
 * Os de integração em tests/db só rodam com TEST_DATABASE_URL apontando para um branch Neon de TESTE
 * (nunca a produção); sem ela, são pulados.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      // "server-only" quebra fora do Next; nos testes vira um módulo vazio
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // limpa os perfis das contas fictícias "qa-test-…" no fim (só com TEST_DATABASE_URL)
    globalSetup: ["tests/db/teardown.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
