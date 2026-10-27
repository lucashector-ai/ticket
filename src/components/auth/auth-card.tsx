import Link from "next/link";
import { BrandMark, BrandWord } from "@/components/brand-logo";

/** Cartão central das páginas de autenticação (design "entrar"). Vai dentro de um `.pg-entrar`. */
export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="lx">
      <span className="lx-glow g1" aria-hidden="true" />
      <span className="lx-glow g2" aria-hidden="true" />
      <span className="lx-glow g3" aria-hidden="true" />
      <span className="lx-veil" aria-hidden="true" />
      <div className="lx-card">
        <main className="lx-f">
          <div className="lx-in">
            <Link className="lg2" href="/" aria-label="Tickets Win — voltar ao início">
              <BrandMark size={40} />
              <span className="lg2-t"><BrandWord height={16} /></span>
            </Link>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
