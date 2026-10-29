import municipios from "@/lib/data/municipios.json";

/*
 * Municípios do Brasil (lista oficial do IBGE, 5.570 cidades), por estado. Em cada estado a capital vem primeiro.
 * Servido pela API /api/cidades para os campos de cidade do site.
 */

export const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo",
  GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

const BY_UF = municipios as Record<string, string[]>;

/** sem acento, minúsculo, sem pontuação: "FLORIANOPOLIS" e "Florianópolis" viram a mesma chave */
export const cityKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const citiesOf = (uf: string) => BY_UF[uf.toUpperCase()] ?? null;

/** Busca pelo nome em todo o Brasil: começa com o texto primeiro, depois contém. */
export function searchCities(q: string, limit = 10) {
  const k = cityKey(q);
  if (k.length < 2) return [];
  const starts: { nome: string; uf: string }[] = [], has: typeof starts = [];
  for (const [uf, list] of Object.entries(BY_UF)) {
    for (const nome of list) {
      const ck = cityKey(nome);
      if (ck.startsWith(k)) starts.push({ nome, uf });
      else if (k.length >= 3 && ck.includes(k)) has.push({ nome, uf });
    }
  }
  const ord = (a: { nome: string }, b: { nome: string }) => cityKey(a.nome).localeCompare(cityKey(b.nome));
  return [...starts.sort(ord), ...has.sort(ord)].slice(0, limit);
}

/** O município com esse nome (sem acento/maiúscula); sem estado, só se o nome for único no Brasil. */
export function findCity(name: string, uf?: string) {
  const k = cityKey(name);
  if (!k) return null;
  const hits: { nome: string; uf: string }[] = [];
  for (const [u, list] of Object.entries(BY_UF)) {
    if (uf && u !== uf.toUpperCase()) continue;
    for (const nome of list) if (cityKey(nome) === k) hits.push({ nome, uf: u });
  }
  return hits.length === 1 ? hits[0] : null;
}
