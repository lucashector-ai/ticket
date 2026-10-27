import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="fg">
          <div>
            <Link className="logo" href="/" aria-label="Onde — voltar ao início">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#111111" /><circle cx="15.6" cy="8.4" r="3.4" fill="#D3F55B" /></svg>
              Onde
            </Link>
            <p style={{ fontSize: 15, lineHeight: 1.55, color: "#6E6E73", margin: "16px 0 0", maxWidth: 300 }}>A forma mais simples de descobrir e viver os melhores eventos da sua cidade.</p>
            <div className="soc">
              <a href="https://instagram.com" aria-label="Instagram" target="_blank" rel="noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".6" fill="currentColor" /></svg></a>
              <a href="https://tiktok.com" aria-label="TikTok" target="_blank" rel="noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.6 2.3 4.3 5 4.5" /></svg></a>
              <a href="https://open.spotify.com" aria-label="Spotify" target="_blank" rel="noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.8c2.5-.7 5.2-.4 7.3.8M8.6 15.8c2-.5 3.9-.3 5.5.6" /></svg></a>
              <a href="https://youtube.com" aria-label="YouTube" target="_blank" rel="noreferrer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></svg></a>
            </div>
          </div>
          <div>
            <h4>Plataforma</h4>
            <ul>
              <li><Link href="/explorar">Explorar eventos</Link></li>
              <li><Link href="/#categorias">Categorias</Link></li>
              <li><Link href="/#destaque">Destaques</Link></li>
              <li><Link href="/produtores">Criar evento</Link></li>
            </ul>
          </div>
          <div>
            <h4>Ajuda</h4>
            <ul>
              <li><Link href="/ajuda">Central de ajuda</Link></li>
              <li><Link href="/meus-ingressos">Meus ingressos</Link></li>
              <li><Link href="/ajuda#reembolsos">Reembolsos</Link></li>
              <li><Link href="/ajuda#meia-entrada">Meia-entrada</Link></li>
            </ul>
          </div>
          <div>
            <h4>Empresa</h4>
            <ul>
              <li><Link href="/sobre">Sobre</Link></li>
              <li><Link href="/produtores">Para produtores</Link></li>
              <li><Link href="/sobre#carreiras">Carreiras</Link></li>
              <li><Link href="/sobre#imprensa">Imprensa</Link></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><Link href="/legal/termos">Termos de uso</Link></li>
              <li><Link href="/legal/privacidade">Privacidade</Link></li>
              <li><Link href="/legal/cookies">Cookies</Link></li>
              <li><Link href="/legal/acessibilidade">Acessibilidade</Link></li>
            </ul>
          </div>
        </div>
        <div className="fb">
          <span>© 2026 Onde. Todos os direitos reservados.</span>
          <span>Onde Tecnologia Ltda · São Paulo – SP</span>
          <span>Feito no Brasil</span>
        </div>
      </div>
    </footer>
  );
}
