import { NextResponse } from "next/server";
import { citiesOf, findCity, searchCities, UF_NAMES } from "@/lib/cidades";

const CACHE = { "cache-control": "public, max-age=86400, s-maxage=604800" };

/**
 * Cidades do Brasil (IBGE).
 *   GET /api/cidades                 → estados [{ uf, nome }]
 *   GET /api/cidades?uf=SP           → cidades de SP (capital primeiro, depois em ordem alfabética)
 *   GET /api/cidades?q=florian       → até 10 cidades de todo o Brasil [{ nome, uf }]
 *   GET /api/cidades?nome=X&uf=SP    → a cidade com esse nome, com a grafia oficial (ou null)
 */
export function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const uf = (p.get("uf") ?? "").trim().toUpperCase();
  if (p.has("nome")) return NextResponse.json(findCity((p.get("nome") ?? "").slice(0, 80), uf || undefined), { headers: CACHE });
  if (p.has("q")) return NextResponse.json(searchCities((p.get("q") ?? "").slice(0, 80)), { headers: CACHE });
  if (uf) {
    const list = citiesOf(uf);
    return list ? NextResponse.json(list, { headers: CACHE }) : NextResponse.json({ error: "Estado desconhecido." }, { status: 404 });
  }
  return NextResponse.json(Object.entries(UF_NAMES).map(([u, nome]) => ({ uf: u, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), { headers: CACHE });
}
