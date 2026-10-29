import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { ActivateForm } from "@/components/auth/activate-form";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ativar conta", robots: { index: false } };

/** Confirmação do e-mail com o código do e-mail de ativação. */
export default async function AtivarContaPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  const email = (typeof sp.email === "string" ? sp.email : user?.email ?? "").slice(0, 254);
  const headerUser = user ? { id: user.id, name: user.name, email: user.email, image: user.image } : null;
  const verified = !!user?.emailVerified && (!sp.email || sp.email.toLowerCase() === user.email?.toLowerCase());
  return (
    <div className="pg-entrar">
      <SiteHeader user={headerUser} variant="default" />
      <AuthCard>
        <ActivateForm initialEmail={email} verified={verified} />
      </AuthCard>
    </div>
  );
}
