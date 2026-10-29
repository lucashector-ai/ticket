import { createHash } from "node:crypto";

/*
 * Imagem da prévia do link (WhatsApp, Instagram, iMessage...). As artes enviadas são PNG grandes e o WhatsApp
 * ignora imagem pesada, então a prévia sai de /api/og/evento/[slug]: uma cópia em JPG leve, gerada uma vez.
 * Preferência: banner (horizontal, vira o cartão grande); sem banner, o cartaz.
 */
export function eventShareArt(e: { flyerId: string; bannerId: string | null }) {
  if (e.bannerId?.startsWith("/midia/")) return { src: e.bannerId, wide: true };
  if (e.flyerId.startsWith("/midia/")) return { src: e.flyerId, wide: false };
  return null;
}

/** muda quando a arte muda, para o WhatsApp não ficar com a prévia antiga */
export const artVersion = (src: string) => createHash("sha256").update(src).digest("hex").slice(0, 12);
