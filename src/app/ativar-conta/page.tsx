import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { ActivateForm } from "@/components/auth/activate-form";
import { getSessionUser } from "@/lib/auth/server";
import { safeNextParam } from "@/lib/auth/next-param";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ativar conta", robots: { index: false } };

/** Segunda etapa do cadastro: o código do e-mail de ativação (também abre pelo botão do e-mail). */
export default async function AtivarContaPage({ searchParams }: { searchParams: Promise<{ email?: string; next?: string | string[] }> }) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  const asked = typeof sp.email === "string" ? sp.email.slice(0, 254) : "";
  // logado e sem outro e-mail no link: é a própria conta
  const known = !!user && (!asked || asked.toLowerCase() === user.email.toLowerCase());
  const email = known ? user!.email : asked;
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;
  const next = safeNextParam(sp.next);
  return (
    <div className="pg-entrar">
      <SiteHeader user={headerUser} variant="default" />
      <AuthCard>
        <ActivateForm initialEmail={email} known={known} verified={known && !!user?.emailVerified} next={next.startsWith("/ativar-conta") ? "/" : next} />
      </AuthCard>
    </div>
  );
}
