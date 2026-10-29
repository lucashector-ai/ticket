import { createNeonAuth } from "@neondatabase/auth/next/server";
import { cache } from "react";

type NeonAuth = ReturnType<typeof createNeonAuth>;

function createAuth() {
  return createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      sameSite: "lax",
    },
  });
}

let instance: NeonAuth | undefined;

/** Instância criada só no primeiro uso, para o build não depender dos segredos. */
export const auth = new Proxy({} as NeonAuth, {
  get(_target, prop, receiver) {
    instance ??= createAuth();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

/**
 * Sessão do Neon Auth + segunda etapa. `pending`: entrou com senha/Google, mas ainda falta o código
 * da verificação em duas etapas; até lá o site trata a pessoa como deslogada.
 */
export const getAuthState = cache(async () => {
  const { data } = await auth.getSession();
  const user = data?.user ?? null;
  const sessionId = (data?.session as { id?: string } | undefined)?.id ?? null;
  const token = (data?.session as { token?: string } | undefined)?.token ?? null;
  if (!user || !sessionId) return { user: null, sessionId: null, token: null, pending: false } as const;
  // import tardio: o proxy (middleware) também importa este arquivo e não precisa do banco
  const { mfaSettings, sessionCleared } = await import("@/lib/mfa");
  if (await sessionCleared(user.id, sessionId)) return { user, sessionId, token, pending: false } as const;
  const { method } = await mfaSettings(user.id);
  return { user, sessionId, token, pending: !!method } as const;
});

export async function getSessionUser() {
  const s = await getAuthState();
  return s.pending ? null : s.user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
