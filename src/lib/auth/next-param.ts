/** Caractere de controle (tab, quebra de linha...): o navegador ignora dentro de um endereço. */
const hasControl = (s: string) => Array.from(s).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

/**
 * Normaliza o `?next=` para um caminho interno seguro.
 * Recusa "//x", "/\x" e caracteres de controle: o navegador trata "\" como "/" e ignora tab/quebra de
 * linha, então "/\evil.com" ou "/<tab>/evil.com" virariam um endereço de outro site.
 */
export function safeNextParam(v: unknown): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return "/";
  return s.startsWith("/") && !s.startsWith("//") && !s.includes("\\") && !hasControl(s) ? s : "/";
}
