import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LegalNav } from "@/components/legal-nav";
import { getHeaderUser } from "@/components/inst-shell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Legal", template: "%s · Tickets Win" } };

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const user = await getHeaderUser();
  return (
    <div className="pg-inst">
      <SiteHeader user={user} variant="default" />
      <main className="wrap in-layout">
        <LegalNav />
        <article className="prose">{children}</article>
      </main>
      <SiteFooter />
    </div>
  );
}
