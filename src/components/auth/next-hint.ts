/** Para onde a pessoa ia antes de pedirmos o login, em palavras ("para criar seu evento"); null se não ajuda. */
export function nextHint(next: string): string | null {
  const p = next.split("?")[0];
  if (/^\/(criar-evento|produtores|painel|meus-eventos)(\/|$)/.test(p)) return "para criar e gerenciar seus eventos";
  if (/^\/(ingressos|meus-ingressos)(\/|$)/.test(p)) return "para ver seus ingressos";
  if (/^\/checkout(\/|$)/.test(p)) return "para finalizar a compra";
  return null;
}
