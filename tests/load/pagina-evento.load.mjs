/*
 * Carga na página do evento (HTTP, visitante sem login): rodadas de 10, 50 e 100 acessos ao mesmo tempo.
 * Só contra o servidor LOCAL (banco de teste). Mede p50/p95 e erros (status ≠ 200 ou página sem o título).
 *
 *   LOAD_BASE=http://localhost:3042 LOAD_PATH=/eventos/<slug> LOAD_ROUNDS=10,50,100 node tests/load/pagina-evento.load.mjs
 */
const base = process.env.LOAD_BASE ?? "http://localhost:3042";
const path = process.env.LOAD_PATH ?? "/eventos/qa-romano-checkout";
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) { console.error("só contra o servidor local"); process.exit(2); }
const rounds = (process.env.LOAD_ROUNDS ?? "10,50,100").split(",").map(Number);
const pct = (l, p) => { const s = [...l].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] ?? 0); };

// aquece (compilação sob demanda do modo dev não entra na medida)
await fetch(base + path).then((r) => r.text());
for (const n of rounds) {
  const lat = []; let bad = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: n }, async () => {
    const t = performance.now();
    try {
      const r = await fetch(base + path, { headers: { "accept": "text/html" } });
      const html = await r.text();
      if (r.status !== 200 || !html.includes("<title>")) bad++;
    } catch { bad++; }
    lat.push(performance.now() - t);
  }));
  console.log(`CARGA página ${path} n=${n} | p50=${pct(lat, 50)}ms p95=${pct(lat, 95)}ms | total ${Math.round(performance.now() - t0)}ms | erros=${bad}`);
  await new Promise((r) => setTimeout(r, 2000));
}
