import { describe, expect, it } from "vitest";
import { cleanHtml } from "@/lib/mail/design";

/** HTML dos blocos de texto do e-mail marketing: vem do navegador do produtor e vai para o editor e para os e-mails. */
describe("cleanHtml (XSS no e-mail marketing)", () => {
  it("tira script, eventos, imagens e estilos", () => {
    const out = cleanHtml(`oi<script>alert(1)</script><img src=x onerror=alert(1)><b onclick="alert(1)">x</b><style>*{}</style><svg onload=alert(1)>`);
    expect(out).not.toMatch(/script|onerror|onclick|onload|<img|<svg|<style/i);
    expect(out).toContain("<b>x</b>");
  });
  it("link só http(s) ou mailto, sem quebrar o atributo", () => {
    expect(cleanHtml(`<a href="javascript:alert(1)">x</a>`)).toBe("<a>x</a>");
    expect(cleanHtml(`<a href='https://ok.com/?a="b'>x</a>`)).toBe(`<a href="https://ok.com/?a=&quot;b">x</a>`);
    expect(cleanHtml(`<a href=" data:text/html,<script>">x</a>`)).not.toMatch(/data:|<script/);
  });
  it("atributo com > não escapa da tag", () => {
    const out = cleanHtml(`<b title=">"onmouseover=alert(1)>x</b>`);
    expect(out).not.toMatch(/<[^>]*onmouseover/i);
  });
});
