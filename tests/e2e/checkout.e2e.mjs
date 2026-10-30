/*
 * E2E do checkout no modo de teste (sem Stripe): escolhe ingressos, preenche os dados, gera o Pix de teste,
 * confirma e confere a tela final. Só contra o servidor LOCAL com o banco de TESTE.
 *
 *   E2E_BASE=http://localhost:3042 E2E_EMAIL=... E2E_PASSWORD=... E2E_EVENT=<slug> E2E_TYPE=<ticketTypeId> \
 *   NODE_PATH=$(npm root -g) node tests/e2e/checkout.e2e.mjs
 *
 * E2E_CPF: CPF válido de teste (padrão: um número de exemplo, que não pertence a ninguém conhecido).
 * Sai com código 1 se algum passo falhar.
 */
import { createRequire } from "node:module";

// require (e não import): respeita o NODE_PATH do Playwright instalado globalmente
const { chromium } = createRequire(import.meta.url)("playwright");

const base = process.env.E2E_BASE ?? "http://localhost:3042";
const need = ["E2E_EMAIL", "E2E_PASSWORD", "E2E_EVENT", "E2E_TYPE"].filter((k) => !process.env[k]);
if (need.length) { console.error("faltam:", need.join(", ")); process.exit(2); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) { console.error("só contra o servidor local"); process.exit(2); }

const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FALHOU"} ${what}`); if (!cond) process.exitCode = 1; };
const b = await chromium.launch();
try {
  const ctx = await b.newContext({ baseURL: base, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto("/entrar", { waitUntil: "networkidle" });
  await p.fill('input[type="email"]', process.env.E2E_EMAIL);
  await p.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await p.keyboard.press("Enter");
  await p.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 20_000 });
  ok(true, "login");

  await p.goto(`/checkout?evento=${encodeURIComponent(process.env.E2E_EVENT)}&itens=${process.env.E2E_TYPE}:1`, { waitUntil: "networkidle" });
  const cpf = p.locator('input[placeholder="000.000.000-00"]');
  if (await cpf.count()) await cpf.fill(process.env.E2E_CPF ?? "529.982.247-25");
  // caixa "Quero receber novidades do produtor" (D-03): começa desmarcada; o teste marca
  const optIn = p.locator('button[role="checkbox"]', { hasText: "Quero receber novidades" });
  ok(await optIn.count() === 1 && (await optIn.getAttribute("aria-checked")) === "false", "caixa de novidades do produtor desmarcada");
  await optIn.click();
  ok((await optIn.getAttribute("aria-checked")) === "true", "caixa marcada");
  await p.click("text=Ir para pagamento");
  await p.click("text=Gerar código Pix");
  await p.waitForSelector("text=Já fiz o pagamento", { timeout: 20_000 });
  ok(true, "Pix de teste gerado");
  await p.click("text=Já fiz o pagamento");
  await p.waitForSelector("text=Pedido confirmado!", { timeout: 20_000 });
  const body = await p.evaluate(() => document.body.innerText);
  const num = /PEDIDO #(\d+)/.exec(body)?.[1];
  ok(!!num, `número do pedido na confirmação${num ? ` (#${num}: confira orders.producer_opt_in = true no banco de teste)` : ""}`);
  ok(errors.length === 0, `sem erro de JavaScript na página${errors.length ? `: ${errors.join("; ")}` : ""}`);
} catch (e) {
  ok(false, `fluxo interrompido: ${e.message.split("\n")[0]}`);
} finally {
  await b.close();
}
