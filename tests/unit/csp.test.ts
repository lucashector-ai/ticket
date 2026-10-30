import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { contentSecurityPolicy, cspHeaderName, newNonce } from "@/lib/csp";
import { LD_SEEN_SCRIPT } from "@/lib/inline-scripts";

/* CSP das páginas (rodada 3): o que precisa estar na política para o site funcionar e para barrar script injetado. */
const dir = (p: string, name: string) => p.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("CSP", () => {
  afterEach(() => { delete process.env.CSP_MODE; });

  it("scripts: só com o nonce do pedido (strict-dynamic) e o script escrito na página pelo hash; sem eval em produção", () => {
    const n = newNonce();
    const p = contentSecurityPolicy(n, false);
    const s = dir(p, "script-src");
    expect(s).toContain(`'nonce-${n}'`);
    expect(s).toContain("'strict-dynamic'");
    expect(s).toContain(`'sha256-${createHash("sha256").update(LD_SEEN_SCRIPT).digest("base64")}'`);
    expect(s).not.toContain("'unsafe-eval'");
    expect(s).toContain("'wasm-unsafe-eval'"); // só WebAssembly (VLibras), não eval
    expect(dir(p, "object-src")).toBe("object-src 'none'");
    expect(dir(p, "base-uri")).toBe("base-uri 'self'");
    expect(dir(p, "frame-ancestors")).toBe("frame-ancestors 'self'");
  });

  it("libera os terceiros que o site usa: Turnstile, Stripe, Spotify, VLibras, Google Fonts e ViaCEP", () => {
    const p = contentSecurityPolicy("x", false);
    for (const h of ["https://challenges.cloudflare.com", "https://js.stripe.com", "https://open.spotify.com", "https://vlibras.gov.br"]) expect(dir(p, "frame-src")).toContain(h);
    for (const h of ["https://viacep.com.br", "https://*.stripe.com", "https://fonts.googleapis.com"]) expect(dir(p, "connect-src")).toContain(h);
    expect(dir(p, "font-src")).toContain("https://fonts.gstatic.com");
  });

  it("nonce novo a cada pedido; modo padrão só avisa (Report-Only), CSP_MODE=enforce bloqueia", () => {
    expect(newNonce()).not.toBe(newNonce());
    expect(cspHeaderName()).toBe("Content-Security-Policy-Report-Only");
    process.env.CSP_MODE = "enforce";
    expect(cspHeaderName()).toBe("Content-Security-Policy");
  });

  it("em desenvolvimento libera eval (mensagens de erro do React) e o websocket da recarga", () => {
    const p = contentSecurityPolicy("x", true);
    expect(dir(p, "script-src")).toContain("'unsafe-eval'");
    expect(dir(p, "connect-src")).toContain("ws:");
  });
});
