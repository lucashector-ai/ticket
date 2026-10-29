import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/reset-form";
import { getSessionUser } from "@/lib/auth/server";
import { checkResetLink } from "@/lib/actions/senha";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Criar nova senha", robots: { index: false }, referrer: "no-referrer" };

/** Destino do link "Criar nova senha" do e-mail. */
export default async function RedefinirSenhaPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const t = typeof sp.t === "string" ? sp.t : "";
  const [user, link] = await Promise.all([getSessionUser(), t ? checkResetLink(t) : Promise.resolve({ ok: false as const, to: undefined })]);
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;
  return (
    <div className="pg-entrar">
      <SiteHeader user={headerUser} variant="default" />
      <AuthCard>
        {link.ok
          ? <ResetForm token={t} to={link.to ?? ""} loggedIn={!!user} />
          : (
            <div className="lx-box">
              <h1 className="lx-t">Link expirado</h1>
              <p className="lx-s">Este link já foi usado ou passou dos 15 minutos. Peça um novo para criar a senha.</p>
              <Link className="lx-btn" href={user ? "/conta/seguranca" : "/esqueci-senha"}>Pedir novo link</Link>
            </div>
          )}
      </AuthCard>
    </div>
  );
}
