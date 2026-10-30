/** Percentil (ms) de uma lista de durações. */
export function pct(list: number[], p: number) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]);
}
export async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; v: T | null; err: unknown }> {
  const t = performance.now();
  try { const v = await fn(); return { ms: performance.now() - t, v, err: null }; } catch (err) { return { ms: performance.now() - t, v: null, err }; }
}
/** CPF válido (dígitos verificadores certos) a partir de um número, só para testes. */
export function cpfOf(n: number) {
  const base = String(100_000_000 + n).slice(-9).split("").map(Number);
  const dv = (d: number[]) => { const s = d.reduce((a, x, i) => a + x * (d.length + 1 - i), 0) % 11; return s < 2 ? 0 : 11 - s; };
  const d1 = dv(base), d2 = dv([...base, d1]);
  const c = [...base, d1, d2].join("");
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}
