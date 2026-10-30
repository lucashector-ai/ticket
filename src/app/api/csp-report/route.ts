/*
 * Avisos de violação da CSP (src/lib/csp.ts) mandados pelo navegador. Só registra no log do Worker, de forma
 * resumida: diretiva, origem bloqueada e o primeiro trecho do caminho da página (sem códigos de ingresso,
 * tokens ou parâmetros), para decidir quando a política pode passar de "só avisar" para "bloquear".
 */
type Report = { "violated-directive"?: string; "effective-directive"?: string; "blocked-uri"?: string; "document-uri"?: string; effectiveDirective?: string; blockedURL?: string; documentURL?: string };

const origin = (u?: string) => {
  if (!u) return "";
  try { return new URL(u).origin; } catch { return u.slice(0, 40); }
};
const section = (u?: string) => {
  try { return `/${new URL(u ?? "").pathname.split("/")[1] ?? ""}`; } catch { return ""; }
};

export async function POST(req: Request) {
  const text = await req.text().catch(() => "");
  if (!text || text.length > 16_000) return new Response(null, { status: 204 });
  let list: Report[] = [];
  try {
    const j = JSON.parse(text) as { "csp-report"?: Report } | { type?: string; body?: Report }[];
    list = Array.isArray(j) ? j.filter((x) => x.type === "csp-violation" && x.body).map((x) => x.body!) : j["csp-report"] ? [j["csp-report"]] : [];
  } catch { /* corpo inválido: ignora */ }
  for (const r of list.slice(0, 10)) {
    const directive = r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? "";
    console.warn("csp", directive, origin(r["blocked-uri"] ?? r.blockedURL), section(r["document-uri"] ?? r.documentURL));
  }
  return new Response(null, { status: 204 });
}
