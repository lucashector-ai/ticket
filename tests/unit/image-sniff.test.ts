import { describe, expect, it } from "vitest";
import { sniffImage } from "@/lib/image-sniff";

const bytes = (...v: (number | string)[]) => new Uint8Array(v.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("sniffImage (upload de imagens)", () => {
  it("reconhece JPG, PNG, WebP e GIF pelos bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImage(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImage(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(bytes("GIF89a"))).toBe("image/gif");
  });
  it("recusa HTML, SVG e arquivo vazio com nome de imagem", () => {
    expect(sniffImage(bytes("<html><script>"))).toBeNull();
    expect(sniffImage(bytes("<svg xmlns="))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
