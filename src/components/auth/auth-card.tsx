import Link from "next/link";

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
            <Link className="lg2" href="/" aria-label="Onde — voltar ao início">
              <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="#111111" />
                <circle cx="15.6" cy="8.4" r="3.4" fill="#D3F55B" />
              </svg>
              <span className="lg2-t">Onde</span>
            </Link>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
