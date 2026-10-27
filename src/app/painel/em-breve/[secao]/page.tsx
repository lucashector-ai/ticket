import type { Metadata } from "next";
import Link from "next/link";

const NOMES: Record<string, string> = { publico: "Público", marketing: "Marketing", equipe: "Equipe e portaria", configuracoes: "Configurações" };
type Props = { params: Promise<{ secao: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { secao } = await params;
  return { title: NOMES[secao] ?? "Em breve" };
}

/** Seções do painel que ainda vão ganhar design. */
export default async function EmBreve({ params }: Props) {
  const { secao } = await params;
  return (
    <div className="pane">
      <div className="empty2 big">
        <b className="em-t">{NOMES[secao] ?? "Em breve"}</b>
        <span className="em-s">Esta seção chega na próxima fase do painel.</span>
        <Link className="b2 dark" href="/painel">Voltar ao início</Link>
      </div>
    </div>
  );
}
