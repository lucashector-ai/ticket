/*
 * Peças comuns dos testes e2e (Playwright):
 *   E2E_BROWSER=chromium|firefox|webkit  navegador (padrão: chromium)
 *   E2E_STATE=<arquivo>                  sessão salva (storageState) da conta de teste, no lugar de E2E_EMAIL/E2E_PASSWORD
 *   E2E_CSP=enforce                      troca o cabeçalho Content-Security-Policy-Report-Only das páginas pelo que
 *                                        bloqueia (como seria com CSP_MODE=enforce) e falha em qualquer violação
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export const browserName = process.env.E2E_BROWSER ?? "chromium";
export const browserType = () => {
  if (!["chromium", "firefox", "webkit"].includes(browserName)) throw new Error(`E2E_BROWSER inválido: ${browserName}`);
  return require("playwright")[browserName];
};

/**
 * Opções de abertura do navegador. Com a CSP trocada no meio do caminho (respostas reescritas pelo Playwright), o
 * Chromium passa a tratar a página como de "fora" e barra o localhost (Local Network Access); aqui isso é desligado.
 */
export const launchOpts = (extra = []) => ({
  args: browserName === "chromium" ? [...extra, ...(process.env.E2E_CSP === "enforce" ? ["--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests"] : [])] : [],
});

/** Credenciais ou sessão salva: o que faltar para entrar. */
export const missingLogin = () => (process.env.E2E_STATE ? [] : ["E2E_EMAIL", "E2E_PASSWORD"].filter((k) => !process.env[k]));

/** Entra com e-mail e senha, a não ser que a sessão salva já tenha vindo no contexto. */
export async function login(page) {
  if (process.env.E2E_STATE) return;
  await page.goto("/entrar", { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', process.env.E2E_EMAIL);
  await page.fill('input[type="password"]', process.env.E2E_PASSWORD);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 20_000 });
}

/** Opções de contexto com a sessão salva (se houver). */
export const stateOpt = () => (process.env.E2E_STATE ? { storageState: process.env.E2E_STATE } : {});

/**
 * WebKit não manda cookie "Secure" para http://localhost (Chromium e Firefox tratam localhost como seguro), e o
 * cookie de sessão do Neon Auth é __Secure-…. Num contexto aberto com a sessão salva, o WebKit recebe o cabeçalho
 * Cookie em cada pedido ao site, montado com os cookies desse contexto (contexto de visitante: nada muda).
 */
async function webkitCookieHeader(ctx) {
  if (browserName !== "webkit") return null;
  const list = (await ctx.cookies()).filter((c) => c.domain === "localhost" || c.domain === "127.0.0.1");
  return list.length ? list.map((c) => `${c.name}=${c.value}`).join("; ") : null;
}

/**
 * Prepara o contexto: liga a vigilância da CSP (toda violação vai para `list`) e, com E2E_CSP=enforce, as páginas
 * passam a receber a política no modo que bloqueia. No WebKit com sessão salva, também manda o cookie da sessão.
 */
export async function watchCsp(ctx, list) {
  await ctx.exposeBinding("__twCsp", (_src, v) => list.push(v));
  await ctx.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      const w = /** @type {any} */ (window);
      w.__twCsp?.(`${e.effectiveDirective} ${e.blockedURI} (${location.pathname})`);
    });
  });
  const cookie = await webkitCookieHeader(ctx);
  const enforce = process.env.E2E_CSP === "enforce";
  if (!cookie && !enforce) return;
  const base = process.env.E2E_BASE ?? "http://localhost:3042";
  await ctx.route("**/*", (route) => handle(route).catch(() => { /* navegador fechado no meio de um pedido */ }));
  async function handle(route) {
    const req = route.request();
    const ours = req.url().startsWith(base);
    const headers = cookie && ours ? { ...req.headers(), cookie } : undefined;
    const doc = req.resourceType() === "document";
    // o WebKit ignora o Cookie trocado em route.continue: com a sessão, o pedido sai daqui (route.fetch)
    if (!ours || (!headers && !(enforce && doc))) return route.continue();
    const res = await route.fetch({ maxRedirects: 0, ...(headers ? { headers } : {}) });
    const out = { ...res.headers() };
    const policy = enforce && doc ? out["content-security-policy-report-only"] : undefined;
    if (policy) {
      delete out["content-security-policy-report-only"];
      out["content-security-policy"] = policy;
    }
    // limite conhecido: no WebKit, um redirecionamento (3xx) devolvido por aqui trava a navegação; nos testes com
    // sessão no WebKit, abra direto o endereço final
    return route.fulfill({ response: res, headers: out });
  }
}
