/**
 * Cliente de login do Neon Auth carregado só quando precisa (botão do Google, confirmar o código da conta):
 * são ~250 KB de JavaScript que saem do carregamento inicial de /entrar, /cadastro, /ativar-conta e /checkout.
 */
export const loadAuthClient = () => import("@/lib/auth/client").then((m) => m.authClient);
