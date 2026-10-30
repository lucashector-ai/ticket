import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/*
 * Teste de carga (pnpm test:load): só com TEST_DATABASE_URL (branch Neon de TESTE) e fora do `pnpm test`.
 * Mede latência (p50/p95), erros e confere o estoque no fim. Ver tests/load/.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: { include: ["tests/load/**/*.load.ts"], environment: "node", testTimeout: 600_000, hookTimeout: 120_000, fileParallelism: false },
});
