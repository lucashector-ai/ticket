import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { getSessionUser } from "@/lib/auth/server";
import { safeNextParam } from "@/lib/auth/next-param";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function EntrarPage({ searchParams }: Props) {
  const { next: rawNext } = await searchParams;
  const next = safeNextParam(rawNext);
  const user = await getSessionUser();
  if (user) redirect(next);
  return (
    <div className="pg-entrar">
      <SiteHeader user={null} variant="default" activePath="/entrar" />
      <AuthCard>
        <LoginForm next={next} />
      </AuthCard>
    </div>
  );
}
