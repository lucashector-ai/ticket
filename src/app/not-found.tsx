import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getHeaderUser } from "@/components/inst-shell";

export const metadata: Metadata = { title: "Página não encontrada" };

export default async function NotFound() {
  const user = await getHeaderUser();
  return (
    <div className="pg-inst">
      <SiteHeader user={user} variant="default" />
      <main className="wrap in-404">
        <p className="big" aria-hidden="true">404</p>
        <h1>Essa página não está no mapa.</h1>
        <p>O link pode ter mudado, o evento pode ter saído do ar ou o endereço foi digitado errado. Vamos te levar para onde a coisa acontece.</p>
        <div className="in-acts">
          <Link className="btn-p" href="/">
            Voltar ao início
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </Link>
          <Link className="btn-g" href="/explorar">Explorar eventos</Link>
          <Link className="btn-g" href="/ajuda">Central de ajuda</Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
