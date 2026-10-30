import { describe, expect, it } from "vitest";
import { ART_FRAME_CSP, ART_FRAME_HTML, ART_FRAME_SCRIPT } from "@/lib/art-frame";
import { GET } from "@/app/api/arte-html/route";

/* Palco das artes em HTML dos banners: isolado do site, com CSP própria (o script da arte roda com a CSP da página bloqueando). */
describe("palco das artes em HTML", () => {
  it("CSP própria: sandbox sem mesma origem, sem rede, sem formulário e só dentro do próprio site", () => {
    expect(ART_FRAME_CSP).toContain("sandbox allow-scripts");
    expect(ART_FRAME_CSP).not.toContain("allow-same-origin");
    expect(ART_FRAME_CSP).toContain("connect-src 'none'");
    expect(ART_FRAME_CSP).toContain("form-action 'none'");
    expect(ART_FRAME_CSP).toContain("frame-ancestors 'self'");
    expect(ART_FRAME_CSP).toContain("script-src 'unsafe-inline'");
  });
  it("a rota devolve a página fixa com a CSP e sem dados", async () => {
    const r = GET();
    expect(r.headers.get("content-security-policy")).toBe(ART_FRAME_CSP);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(await r.text()).toBe(ART_FRAME_HTML);
  });
  it("o palco só aceita o HTML da página que o emoldura", () => {
    expect(ART_FRAME_SCRIPT).toContain("e.source!==parent");
    expect(ART_FRAME_HTML).toContain(ART_FRAME_SCRIPT);
  });
});
