#!/usr/bin/env node
/*
 * Portão do `pnpm audit --prod --json` no CI (.github/workflows/security.yml).
 * Falha quando há aviso alto ou crítico que não está em .github/audit-allowlist.json, ou cujo prazo de revisão
 * venceu. Falha da própria consulta (registro do npm fora do ar, resposta sem JSON) só gera um aviso: o CI não
 * trava por instabilidade de terceiro, e o aviso aparece no resumo da execução.
 * Uso: node .github/scripts/audit-gate.mjs <audit.json> [allowlist.json]
 */
import { readFileSync } from "node:fs";

const [auditPath, allowPath = ".github/audit-allowlist.json"] = process.argv.slice(2);
const BLOCK = new Set(["high", "critical"]);

function warn(msg) {
  console.log(`::warning title=pnpm audit::${msg}`);
}

let audit;
try {
  audit = JSON.parse(readFileSync(auditPath, "utf8"));
} catch (e) {
  warn(`não foi possível ler o resultado do audit (${e.message}); verificação não executada`);
  process.exit(0);
}
if (!audit || typeof audit !== "object" || audit.error || !audit.advisories) {
  warn(`o audit não respondeu como esperado (${JSON.stringify(audit?.error ?? "sem advisories").slice(0, 200)}); verificação não executada`);
  process.exit(0);
}

const allow = new Map(JSON.parse(readFileSync(allowPath, "utf8")).avisos.map((a) => [a.ghsa, a]));
const today = new Date().toISOString().slice(0, 10);
let failed = 0;

for (const a of Object.values(audit.advisories)) {
  const id = a.github_advisory_id ?? String(a.id);
  const where = [...new Set((a.findings ?? []).flatMap((f) => f.paths ?? []))].slice(0, 3).join(" | ");
  const line = `${a.severity.padEnd(8)} ${a.module_name}@${a.vulnerable_versions} ${id} — ${a.title} [${where}]`;
  if (!BLOCK.has(a.severity)) {
    console.log(`  info   ${line}`);
    continue;
  }
  const ok = allow.get(id);
  if (!ok) {
    console.log(`::error title=Dependência vulnerável::${line}`);
    failed++;
  } else if (ok.revisar_ate < today) {
    console.log(`::error title=Exceção vencida (${ok.revisar_ate})::${line} — reavalie e atualize .github/audit-allowlist.json`);
    failed++;
  } else {
    console.log(`  aceito ${line} (até ${ok.revisar_ate}; ${ok.referencia})`);
  }
}

const meta = audit.metadata?.vulnerabilities ?? {};
console.log(`\nResumo: ${JSON.stringify(meta)}; bloqueantes sem exceção: ${failed}`);
process.exit(failed ? 1 : 0);
