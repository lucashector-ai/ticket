import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forgot-form";
import { getSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Esqueci a senha" };

export default async function EsqueciSenhaPage({ searchParams }: { searchParams: Promise<{ email?: string; codigo?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/");
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email.slice(0, 254) : "";
  return (
    <div className="pg-entrar">
      <SiteHeader user={null} variant="default" activePath="/entrar" />
      <AuthCard>
        <ForgotForm initialEmail={email} withCode={sp.codigo === "1"} />
      </AuthCard>
    </div>
  );
}
