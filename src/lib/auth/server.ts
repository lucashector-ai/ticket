import { createNeonAuth } from "@neondatabase/auth/next/server";

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

export async function getSessionUser() {
  const { data } = await auth.getSession();
  return data?.user ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
