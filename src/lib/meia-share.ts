/* Cota de meia-entrada (decisão do dono): 40% dos lugares de cada setor (e de cada data). Usada na tela e no servidor. */
export const MEIA_SHARE = 0.4;

/** Quantas meias cabem num setor com `capacity` lugares (soma das quantidades de todos os tipos do setor). */
export const meiaCap = (capacity: number) => Math.floor(Math.max(0, capacity) * MEIA_SHARE + 1e-9);
