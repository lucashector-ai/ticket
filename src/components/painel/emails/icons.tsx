import type { BlockType } from "@/lib/mail/design";

/* Ícones da paleta de blocos (traço de 1.8, como o resto do painel). */
const D: Record<BlockType, string> = {
  evento: "M4 5h16v14H4zM4 9h16M8 3v4M16 3v4M8 13h4",
  eventos: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  ingressos: "M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4zM10 8v8",
  lineup: "M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  cupom: "M3 12V5h7l10 10-7 7zM7.5 8.5h.01",
  contagem: "M12 8v5l3 2M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM9 2h6",
  local: "M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12zM12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  titulo: "M5 6V4h14v2M12 4v16M9 20h6",
  texto: "M4 6h16M4 10h16M4 14h12M4 18h8",
  imagem: "M4 4h16v16H4zM4 16l4-4 4 4 3-3 5 5M15 9h.01",
  botao: "M3 8h18v8H3zM8 12h8",
  redes: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
  divisor: "M4 12h16",
  espaco: "M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4",
};

export function BlockIcon({ t }: { t: BlockType }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={D[t]} /></svg>;
}
