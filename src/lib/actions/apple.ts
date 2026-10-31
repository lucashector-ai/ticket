"use server";

import { cookies } from "next/headers";
import { APPLE_DONE_COOKIE, completeAppleSignIn, openApple } from "@/lib/auth/apple";
import { safeNextParam } from "@/lib/auth/next-param";
import { logEmails } from "@/lib/email";

/** Termina o "Entrar com a Apple" (chamado pela página /entrar/apple). Devolve para onde ir. */
export async function finishAppleSignIn(): Promise<string> {
  const jar = await cookies();
  const d = await openApple(jar.get(APPLE_DONE_COOKIE)?.value);
  jar.delete({ name: APPLE_DONE_COOKIE, path: "/entrar/apple" });
  const fail = async (why: string, next = "/", code = "erro") => {
    await logEmails("apple-login", [{ to: "", subject: why.slice(0, 120) }], false, why.slice(0, 300));
    return `/entrar?next=${encodeURIComponent(next)}&apple=${code}`;
  };
  if (!d) return fail("cookie da volta da Apple ausente ou vencido");
  const next = safeNextParam(d.next);
  const r = await completeAppleSignIn({ ...d, next }).catch((e) => ({ ok: false as const, why: String(e) }));
  if (r.ok) return r.to;
  return fail(r.why, next, "pending" in r && r.pending ? "pendente" : "erro");
}
