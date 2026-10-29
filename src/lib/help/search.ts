/* Busca da central de ajuda: pura e pequena, roda no navegador sobre o índice gerado no servidor. */

export type SearchDoc = { slug: string; cat: string; catTitle: string; title: string; summary: string; t: string; s: string; b: string };

/** minúsculas, sem acento e sem pontuação: "Pré-venda!" → "pre venda" */
export function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
}

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Todas as palavras precisam aparecer; título vale mais que resumo, que vale mais que o corpo. */
export function searchDocs(docs: SearchDoc[], query: string, limit = 12): SearchDoc[] {
  const words = fold(query).split(" ").filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return [];
  const scored: { d: SearchDoc; n: number }[] = [];
  for (const d of docs) {
    let n = 0;
    let all = true;
    for (const w of words) {
      const inT = d.t.includes(w), inS = d.s.includes(w), inB = d.b.includes(w);
      if (!inT && !inS && !inB) { all = false; break; }
      n += (inT ? 6 : 0) + (inS ? 3 : 0) + (inB ? 1 : 0);
      if (inT && new RegExp(`(^| )${esc(w)}`).test(d.t)) n += 2;
    }
    if (all) scored.push({ d, n });
  }
  return scored.sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.d);
}
