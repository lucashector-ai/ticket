/**
 * Segredo das assinaturas próprias (QR do ingresso, cookie da portaria, sessão do banco, 2FA): o mesmo
 * NEON_AUTH_COOKIE_SECRET do login. Sem ele, falha: um valor padrão no código deixaria QR e cookies forjáveis.
 */
export function signingSecret(): string {
  const s = process.env.NEON_AUTH_COOKIE_SECRET?.trim();
  if (!s) throw new Error("NEON_AUTH_COOKIE_SECRET não configurada");
  return s;
}
