import { describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: async () => ({ env: {} }) }));
const { wideArt, hasRealBanner, ART_SIZES } = await import("@/lib/event-art");

/*
 * Arte horizontal de e-mail, aviso e passe (DM-2: o banner é opcional e, sem ele, o evento guarda o cartaz como
 * banner). Antes, e-mail e passe usavam o cartaz em pé como se fosse banner.
 */
const poster = "/midia/eventos/abc/cartaz.png", banner = "/midia/eventos/abc/banner.png";

describe("arte horizontal do evento", () => {
  it("só cartaz (bannerId = flyerId): banner montado, nunca o cartaz em pé", () => {
    const e = { slug: "so-cartaz", flyerId: poster, bannerId: poster, media: null };
    expect(hasRealBanner(e)).toBe(false);
    const mail = wideArt(e), pass = wideArt(e, "carteira");
    expect(mail).not.toBe(poster);
    expect(mail).toMatch(/^\/api\/arte\/so-cartaz\?f=email&v=[0-9a-f]{10}$/);
    expect(pass).toMatch(/^\/api\/arte\/so-cartaz\?f=carteira&v=/);
  });

  it("evento sem banner gravado (bannerId nulo) também usa o banner montado", () => {
    expect(wideArt({ slug: "x", flyerId: poster, bannerId: null })).toMatch(/^\/api\/arte\/x\?f=email/);
  });

  it("com banner de verdade: o próprio banner no e-mail; recorte 3:1 na carteira", () => {
    const e = { slug: "com-banner", flyerId: poster, bannerId: banner };
    expect(wideArt(e)).toBe(banner);
    expect(wideArt(e, "carteira")).toMatch(/^\/api\/arte\/com-banner\?f=carteira&v=/);
  });

  it("a versão muda quando a arte muda (e-mail já enviado mantém a imagem dele)", () => {
    const a = wideArt({ slug: "x", flyerId: poster, bannerId: null });
    const b = wideArt({ slug: "x", flyerId: "/midia/eventos/abc/outro.png", bannerId: null });
    expect(a).not.toBe(b);
  });

  it("evento de demonstração (arte pronta): imagem de compartilhamento; sem arte: nada", () => {
    expect(wideArt({ slug: "baile", flyerId: "baile", bannerId: "baile", media: { share: "/demo/baile.jpg" } })).toBe("/demo/baile.jpg");
    expect(wideArt({ slug: "baile", flyerId: "baile", bannerId: null, media: null })).toBeNull();
  });

  it("tamanhos fixos: 16:9 no e-mail e 3:1 na carteira", () => {
    expect(ART_SIZES.email.w / ART_SIZES.email.h).toBeCloseTo(16 / 9, 2);
    expect(ART_SIZES.carteira.w / ART_SIZES.carteira.h).toBeCloseTo(1032 / 336, 2);
  });
});
