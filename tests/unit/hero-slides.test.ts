import { describe, expect, it } from "vitest";
import { heroOrderToken, heroSlideInput, mergeHero, safeHref } from "@/lib/hero-slides";

/*
 * Banner livre do carrossel da home (hero_slides): link de destino, validação da central e ordem junto com os
 * eventos do banner. Sem banco.
 */
const base = {
  id: null, label: "Produtor, seu evento começa aqui", href: "/produtores", cta: "Crie seu evento", kind: "html" as const,
  html: "<!doctype html><p>oi</p>", image: null, width: 1440, height: 800, bg: "#edff3c", active: true,
};

describe("safeHref (link do banner livre)", () => {
  it("aceita caminho do site e https", () => {
    expect(safeHref("/produtores")).toBe("/produtores");
    expect(safeHref(" /eventos/x?y=1#a ")).toBe("/eventos/x?y=1#a");
    expect(safeHref("/")).toBe("/");
    expect(safeHref("https://ticketswin.com.br/produtores")).toBe("https://ticketswin.com.br/produtores");
  });
  it("recusa outro site disfarçado, javascript:, data:, http: e usuário na URL", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "http://site.com", "https://user:pw@site.com", "https://", "produtores", "/a b", "/a\nb", ""]) {
      expect(safeHref(bad), bad).toBeNull();
    }
  });
});

describe("heroSlideInput (central)", () => {
  it("normaliza e separa HTML de imagem", () => {
    const r = heroSlideInput.parse(base);
    expect(r).toMatchObject({ href: "/produtores", bg: "#EDFF3C", html: "<!doctype html><p>oi</p>", image: null, width: 1440, height: 800, cta: "Crie seu evento" });
    const img = heroSlideInput.parse({ ...base, kind: "image", image: "/midia/banners/a.webp", cta: "" });
    expect(img).toMatchObject({ html: null, image: "/midia/banners/a.webp", cta: null });
  });
  it("HTML acima de 300 KB é recusado com a mesma mensagem do banner de evento", () => {
    const r = heroSlideInput.safeParse({ ...base, html: "x".repeat(300_001) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/300 KB/);
    expect(heroSlideInput.safeParse({ ...base, html: "x".repeat(300_000) }).success).toBe(true);
  });
  it("link externo sem https, imagem de fora do site, tamanho e cor fora do formato são recusados", () => {
    expect(heroSlideInput.safeParse({ ...base, href: "//evil.com" }).error?.issues[0]?.message).toMatch(/começar com \//);
    expect(heroSlideInput.safeParse({ ...base, kind: "image", image: "https://x.com/a.png" }).success).toBe(false);
    expect(heroSlideInput.safeParse({ ...base, width: 100 }).success).toBe(false);
    expect(heroSlideInput.safeParse({ ...base, height: 5000 }).success).toBe(false);
    expect(heroSlideInput.safeParse({ ...base, bg: "red" }).success).toBe(false);
    expect(heroSlideInput.safeParse({ ...base, label: "x" }).success).toBe(false);
    expect(heroSlideInput.safeParse({ ...base, html: "   " }).success).toBe(false);
  });
});

describe("ordem do carrossel", () => {
  it("banner livre na posição 0 vem antes dos eventos; empate: banner livre primeiro; eventos de reserva no fim", () => {
    const out = mergeHero(
      [{ order: 1, item: "baile" }, { order: 2, item: "sintonia" }, { order: 3, item: "terreiro" }],
      [{ position: 0, item: "produtores" }, { position: 2, item: "outro" }],
    ).map((x) => `${x.kind}:${x.item}`);
    expect(out).toEqual(["free:produtores", "event:baile", "free:outro", "event:sintonia", "event:terreiro"]);
    expect(mergeHero([{ order: null, item: "a" }, { order: null, item: "b" }], [{ position: 5, item: "s" }]).map((x) => x.item)).toEqual(["s", "a", "b"]);
  });
  it("token da ordem única", () => {
    expect(heroOrderToken.safeParse("e:7b1e0c55-2f4a-4d6b-9a51-50d0c7e0a001").success).toBe(true);
    expect(heroOrderToken.safeParse("s:7b1e0c55-2f4a-4d6b-9a51-50d0c7e0a001").success).toBe(true);
    expect(heroOrderToken.safeParse("x:7b1e0c55-2f4a-4d6b-9a51-50d0c7e0a001").success).toBe(false);
    expect(heroOrderToken.safeParse("e:nao-e-uuid").success).toBe(false);
  });
});
