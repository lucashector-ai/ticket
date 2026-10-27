/** Normaliza o `?next=` para um caminho interno seguro. */
export function safeNextParam(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  if (typeof s !== "string") return "/";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}
