import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getHeaderUser } from "@/components/inst-shell";
import { ProdutoresLanding } from "@/components/produtores-landing/landing";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "Crie seu evento em minutos e venda ingressos com lotes, meia-entrada e mapa 3D. Taxa única de 7,99% por ingresso, sem mensalidade, painel ao vivo e repasse 2 dias após o evento.";

export const metadata: Metadata = {
  title: "Para produtores",
  description: DESCRIPTION,
  alternates: { canonical: "/produtores" },
  openGraph: {
    title: "Tickets Win para produtores: do primeiro lote ao ingresso esgotado",
    description: DESCRIPTION,
    url: "/produtores",
    type: "website",
    locale: "pt_BR",
    siteName: "Tickets Win",
  },
};

export default async function ProdutoresPage() {
  const user = await getHeaderUser();
  return (
    <div className="pg-pdl">
      <SiteHeader user={user} variant="default" activePath="/produtores" />
      <ProdutoresLanding />
      <SiteFooter />
    </div>
  );
}
