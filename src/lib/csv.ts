/**
 * Célula de CSV para Excel/Planilhas: aspas dobradas e sem fórmula. Texto que começa com =, +, -, @ (ou tab)
 * vira texto com um apóstrofo na frente: um nome de comprador como "=HYPERLINK(...)" não roda na planilha
 * do produtor. Números saem como número.
 */
export function csvCell(v: string | number): string {
  if (typeof v === "number") return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Planilha em CSV (separador ";" e BOM, como o Excel do Brasil abre direto). */
export function csvBlob(rows: (string | number)[][]): Blob {
  return new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
}
