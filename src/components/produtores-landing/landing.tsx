import Link from "next/link";
import { FlyerArt } from "@/components/art/flyer";
import { BrandMark } from "@/components/brand-logo";
import { HeroVisual } from "./hero-visual";
import { Num, RevealOnScroll, SnapRail, Spotlight } from "./motion";
import { Simulator } from "./simulator";
import { Faq } from "./faq";
import { SectionDock } from "./dock";
import { Map3D } from "./map3d";
import { Tips } from "./tips";

export const CONTACT = "mailto:produtores@ticketswin.com.br?subject=Quero%20vender%20ingressos%20na%20Tickets%20Win";

const d = (i: number) => ({ "--i": i }) as React.CSSProperties;

function Check({ color = "#111", size = 18, w = 2.2 }: { color?: string; size?: number; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

function Kicker({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="pdl-k" style={style}>
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

const PRODUCERS = ["Futuro Produções", "Maré Alta Eventos", "Ácida Records", "Coletivo Subsolo", "Liga Nacional de Rima", "Ventania Cultural", "Casa Tangente", "Terreiro Coletivo"];

// mapa de assentos do card "Lugar marcado": t = vendido, p = escolhendo agora, o = livre
const SEATS = "ttpttttttooo" + "tpottttttoto" + "otottotoottt" + "tptootottopp" + "otttoototott" + "ttppotpttpot" + "ttootttotttt";

const CAL = ["D", "S", "T", "Q", "Q", "S", "S"];
const CAL_ON = new Set([6, 7, 20, 21]);
const CAL_X = new Set([13, 14, 15]);

const STEPS = [
  { n: 1, t: "~5 min", b: "Crie o evento", p: "Formato, datas, setores e ingressos num passo a passo guiado. Salva sozinho enquanto você preenche." },
  { n: 2, t: "1 clique", b: "Publique e divulgue", p: "Página pronta para celular, link curto, cupons, promoters e e-mails para o seu público." },
  { n: 3, t: "2 dias", b: "Receba rápido", p: "O líquido das vendas é liberado 2 dias depois do evento. Você saca pelo Banco Tickets Win quando quiser." },
];

const PRICE_LIST = [
  "Sem mensalidade e sem taxa de adesão",
  "Eventos gratuitos não pagam nada",
  "Saldo liberado 2 dias depois do evento",
  "Saque quando quiser pelo Banco Tickets Win",
  "Todos os recursos inclusos, inclusive o mapa 3D",
];

const SECURITY = [
  { b: "Análise de cada compra", p: "Todas as transações no cartão passam por verificação antifraude antes de aprovar." },
  { b: "Dados protegidos", p: "Não guardamos dados de cartão. Pagamentos processados em ambiente certificado." },
  { b: "QR que não se copia", p: "O código muda ao transferir e é validado uma única vez na portaria." },
  { b: "Conexão segura", p: "Tudo trafega em HTTPS, com verificação diária contra malware e phishing." },
];

export function ProdutoresLanding() {
  return (
    <main className="pdl-main">
      <RevealOnScroll />

      {/* ---------- hero ---------- */}
      <section className="pdl-w pdl-hero" id="pdl-hero" aria-labelledby="pdl-h1">
        <div className="pdl-hero-tx">
          <Kicker>Tickets Win para produtores</Kicker>
          <h1 className="pdl-h1" id="pdl-h1">
            <span className="ln"><span>Do primeiro lote ao</span></span>
            <span className="ln"><span><em>ingresso esgotado.</em></span></span>
          </h1>
          <p className="pdl-lead">Crie o evento em minutos, venda com mapa, lotes e meia-entrada, acompanhe tudo ao vivo e receba 2 dias depois do evento. Sem mensalidade.</p>
          <div className="pdl-cta">
            <Link className="pdl-btn" href="/criar-evento">Criar meu evento <Arrow /></Link>
            <a className="pdl-btn g" href={CONTACT}>Falar com vendas</a>
          </div>
          <div className="pdl-ticks">
            <span><Check />Taxa única de 7,99%</span>
            <span><Check />Repasse 2 dias após o evento</span>
            <span><Check />Evento gratuito não paga</span>
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* ---------- produtores (marquee) ---------- */}
      <section className="pdl-w pdl-logos" aria-label="Produtores na plataforma">
        <span>Produtores de todos os tamanhos já vendem com a gente</span>
        <div className="pdl-mq">
          <div className="pdl-mqi">
            {[...PRODUCERS, ...PRODUCERS].map((p, i) => (
              <b key={i} aria-hidden={i >= PRODUCERS.length ? true : undefined}>{p}</b>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- tipos de evento ---------- */}
      <section className="pdl-w pdl-sec" id="tipos" aria-labelledby="pdl-tipos">
        <div className="pdl-hh pdl-rv">
          <div>
            <Kicker>Para todo tipo de evento</Kicker>
            <h2 className="pdl-h2" id="pdl-tipos">Do baile no galpão<br />ao festival de três dias.</h2>
          </div>
          <p className="pdl-lead nar">Um jeito de vender para cada formato, sem precisar de outra ferramenta.</p>
        </div>
        <SnapRail className="pdl-tipos" count={3} label="Tipos de evento">
          <Link className="pdl-tp pdl-rv" href="/criar-evento" style={d(0)}>
            <div className="pdl-tpv">
              <div className="pdl-fan" aria-hidden="true">
                <div><FlyerArt id="subsolo" /></div>
                <div><FlyerArt id="baile" /></div>
                <div><FlyerArt id="noite" /></div>
              </div>
            </div>
            <div className="pdl-tpi">
              <b>Festas e shows</b>
              <p>Venda por lotes com virada automática, meia-entrada e check-in pelo celular.</p>
              <ul><li>Lotes</li><li>Meia social</li><li>Promoters</li></ul>
              <span className="pdl-more">Saiba mais <Arrow /></span>
            </div>
          </Link>
          <Link className="pdl-tp pdl-rv" href="/criar-evento" style={d(1)}>
            <div className="pdl-tpv">
              <span className="pdl-stage" aria-hidden="true">PALCO</span>
              <div className="pdl-seat" aria-hidden="true">
                {SEATS.split("").map((c, i) => (
                  <i key={i} className={c === "o" ? undefined : c} style={c === "p" ? ({ "--j": i % 7 } as React.CSSProperties) : undefined} />
                ))}
              </div>
            </div>
            <div className="pdl-tpi">
              <b>Lugar marcado e mapa 3D</b>
              <p>Desenhe o mapa à mão, a IA transforma em 3D. O público escolhe o lugar vendo o palco.</p>
              <ul><li>Assentos</li><li>Setores</li><li>Camarotes</li></ul>
              <span className="pdl-more">Saiba mais <Arrow /></span>
            </div>
          </Link>
          <Link className="pdl-tp pdl-rv" href="/criar-evento" style={d(2)}>
            <div className="pdl-tpv">
              <div className="pdl-cal" aria-hidden="true">
                {CAL.map((c, i) => <span key={`h${i}`} className="h">{c}</span>)}
                {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => (
                  <span key={n} className={CAL_ON.has(n) ? "o" : CAL_X.has(n) ? "x" : undefined} style={CAL_ON.has(n) || CAL_X.has(n) ? ({ "--j": n % 5 } as React.CSSProperties) : undefined}>{n}</span>
                ))}
              </div>
            </div>
            <div className="pdl-tpi">
              <b>Festivais, temporadas e turnês</b>
              <p>Várias datas e cidades no mesmo evento, com calendário e ingresso por sessão.</p>
              <ul><li>Multi-datas</li><li>Passaporte</li><li>Turnê</li></ul>
              <span className="pdl-more">Saiba mais <Arrow /></span>
            </div>
          </Link>
        </SnapRail>
      </section>

      {/* ---------- como funciona ---------- */}
      <section className="pdl-w pdl-sec" id="como" aria-labelledby="pdl-como">
        <div className="pdl-rv">
          <Kicker>Como funciona</Kicker>
          <h2 className="pdl-h2" id="pdl-como">No ar hoje, vendendo hoje.</h2>
        </div>
        <ol className="pdl-steps pdl-rv">
          {STEPS.map((s, i) => (
            <li className="pdl-st" key={s.n} style={d(i)}>
              <span className="n" aria-hidden="true">{s.n}</span>
              <span className="t">{s.t}</span>
              <b>{s.b}</b>
              <p>{s.p}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- recursos (bento) ---------- */}
      <section className="pdl-w pdl-sec" id="recursos" aria-labelledby="pdl-rec">
        <div className="pdl-hh pdl-rv">
          <div>
            <Kicker>Recursos</Kicker>
            <h2 className="pdl-h2" id="pdl-rec">Tudo que o evento precisa.<br />Num lugar só.</h2>
          </div>
          <Link className="pdl-btn g" href="/criar-evento">Experimentar grátis</Link>
        </div>
        <Spotlight className="pdl-bento">
          <div className="pdl-bx pdl-big pdl-rv" data-spot style={d(0)}>
            <span className="pdl-new">Novo · com IA</span>
            <b className="xl">Mapa 3D a partir de um rascunho</b>
            <p>Tire foto do desenho do espaço. A IA reconhece palco, pista, camarotes e bar e monta o mapa 3D que o público vê na compra.</p>
            <Map3D />
          </div>
          <div className="pdl-bx pdl-wide pdl-rv" data-spot style={d(1)}>
            <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 19V10M10 19V5M16 19v-6M22 19H2" /></svg></span>
            <b>Painel ao vivo</b>
            <p>Vendas por dia, por setor e por origem, atualizando enquanto você olha. Nada de esperar relatório.</p>
            <div className="pdl-pills" aria-hidden="true"><span>+<Num value={38} /> vendas/h</span><span>Instagram <Num value={42} />%</span></div>
          </div>
          <div className="pdl-bx pdl-lm pdl-rv" data-spot style={d(2)}>
            <span className="ic scan"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2M4 12h16" /></svg></span>
            <b>Check-in no celular</b>
            <p>App da portaria no navegador, sem instalar nada. Cada QR entra uma vez só.</p>
          </div>
          <div className="pdl-bx pdl-rv" data-spot style={d(3)}>
            <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" /></svg></span>
            <b>Meia e meia social</b>
            <p>Sugerimos o preço da meia social. Você decide.</p>
          </div>
          <div className="pdl-bx pdl-rv" data-spot style={d(4)}>
            <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg></span>
            <b>Cupons e promoters</b>
            <p>Links rastreados e comissão automática por venda.</p>
          </div>
          <div className="pdl-bx pdl-rv" data-spot style={d(5)}>
            <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" /></svg></span>
            <b>Compra em grupo</b>
            <p>Um amigo reserva e cada um paga a sua parte pelo link.</p>
          </div>
          <div className="pdl-bx pdl-wide pdl-rv" data-spot style={d(6)}>
            <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 14.5h2" /></svg></span>
            <b>Ingresso na carteira do celular</b>
            <p>Salvo na carteira digital do público, com transferência e revenda seguras.</p>
          </div>
          <div className="pdl-bx pdl-full pdl-rv" data-spot style={d(7)}>
            <span className="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="M9 12l2 2 4-4" /></svg></span>
            <div className="tx">
              <b>Pagamento seguro e antifraude</b>
              <p>Cada compra no cartão passa por análise antifraude antes de ser aprovada, dentro do checkout da Tickets Win.</p>
            </div>
            <div className="pdl-mini"><span>Pix</span><span>Cartão em até 6x</span><span>Até 3x sem juros</span></div>
          </div>
        </Spotlight>
      </section>

      {/* ---------- preços ---------- */}
      <section className="pdl-w pdl-sec" id="precos" aria-labelledby="pdl-prc">
        <div className="pdl-hh pdl-rv">
          <div>
            <Kicker>Preços</Kicker>
            <h2 className="pdl-h2" id="pdl-prc">Uma taxa. Sem letra miúda.</h2>
          </div>
          <p className="pdl-lead nar">Você só paga quando vende. Simule e veja quanto cai na sua conta.</p>
        </div>
        <div className="pdl-price">
          <div className="pdl-pl pdl-rv" style={d(0)}>
            <Kicker style={{ color: "rgba(255,255,255,.55)" }}>Plano único</Kicker>
            <div className="big" aria-label="7,99%">
              <Num value={7.99} fmt="dec2" dur={1300} />
              <small>%</small>
            </div>
            <div className="pdl-sub">por ingresso pago vendido. Você escolhe se repassa ao comprador.</div>
            <ul>
              {PRICE_LIST.map((t, i) => (
                <li key={t} style={d(i)}><i><Check color="#D3F55B" size={12} w={3} /></i>{t}</li>
              ))}
            </ul>
            <Link className="pdl-btn l" href="/criar-evento">Começar agora <Arrow /></Link>
          </div>
          <div className="pdl-rv" style={d(1)}>
            <Simulator />
          </div>
        </div>
      </section>

      {/* ---------- segurança ---------- */}
      <section className="pdl-w pdl-dark" id="seguranca" aria-labelledby="pdl-seg">
        <div className="pdl-rv">
          <Kicker>Segurança</Kicker>
          <h2 className="pdl-h2" id="pdl-seg">Pode relaxar.<br />Aqui a venda é segura.</h2>
          <p className="pdl-lead">Monitoramos cada compra o tempo todo, para você se preocupar só com o evento.</p>
        </div>
        <Spotlight className="pdl-sg">
          {SECURITY.map((s, i) => (
            <div className="pdl-sgc pdl-rv" data-spot key={s.b} style={d(i)}>
              <span className="n">0{i + 1}</span>
              <b>{s.b}</b>
              <p>{s.p}</p>
            </div>
          ))}
        </Spotlight>
      </section>

      {/* ---------- depoimentos ---------- */}
      <section className="pdl-w pdl-sec" id="cases" aria-labelledby="pdl-cases">
        <div className="pdl-rv">
          <Kicker>Quem produz com a gente</Kicker>
          <h2 className="pdl-h2" id="pdl-cases">Contado por quem lota.</h2>
        </div>
        <SnapRail className="pdl-dep" count={3} label="Depoimentos">
          <figure className="pdl-q f pdl-rv" style={d(0)}>
            <blockquote><p>“Virar lote era uma noite sem dormir. Agora vira sozinho, e eu acompanho a venda do celular, na fila do mercado.”</p></blockquote>
            <div className="pdl-num">
              <div><b><Num value={64} /></b><span>eventos realizados</span></div>
              <div><b><Num value={4.8} fmt="dec1" /></b><span>nota do público</span></div>
            </div>
            <figcaption className="pdl-qa"><span className="av" aria-hidden="true">FP</span><span><b>Futuro Produções</b><span>Bailes e festas · São Paulo</span></span></figcaption>
          </figure>
          <figure className="pdl-q pdl-rv" style={d(1)}>
            <blockquote><p>“O mapa 3D mudou o camarote. A pessoa vê de onde vai assistir e compra o setor mais caro sem medo.”</p></blockquote>
            <figcaption className="pdl-qa"><span className="av" aria-hidden="true">MA</span><span><b>Maré Alta Eventos</b><span>Festival · Florianópolis</span></span></figcaption>
          </figure>
          <figure className="pdl-q pdl-rv" style={d(2)}>
            <blockquote><p>“Repasse dois dias depois do evento e financeiro pronto no painel. Paro de correr atrás de planilha e foco no line-up.”</p></blockquote>
            <figcaption className="pdl-qa"><span className="av" aria-hidden="true">ÁR</span><span><b>Ácida Records</b><span>Selo e festa · Porto Alegre</span></span></figcaption>
          </figure>
        </SnapRail>
      </section>

      {/* ---------- faq ---------- */}
      <section className="pdl-w pdl-sec pdl-faq" id="faq" aria-labelledby="pdl-faqh">
        <div className="pdl-faq-l pdl-rv">
          <Kicker>Dúvidas</Kicker>
          <h2 className="pdl-h2" id="pdl-faqh">Perguntas frequentes</h2>
          <p className="pdl-lead sm">Não achou? Escreva para o nosso time de produtores, a gente responde em até um dia útil.</p>
          <a className="pdl-btn g" href={CONTACT}>Falar com o time</a>
        </div>
        <Faq />
      </section>

      {/* ---------- cta final ---------- */}
      <section className="pdl-w" aria-labelledby="pdl-final">
        <div className="pdl-final pdl-rv">
          <BrandMark size={460} className="bg" />
          <div>
            <h2 id="pdl-final">Seu próximo evento começa aqui.</h2>
            <p>Crie grátis em minutos. Você só paga quando vender o primeiro ingresso.</p>
          </div>
          <div className="pdl-cta">
            <Link className="pdl-btn" href="/criar-evento">Criar meu evento <Arrow /></Link>
            <a className="pdl-btn w" href={CONTACT}>Pedir demonstração</a>
          </div>
        </div>
      </section>

      {/* ---------- dicas ---------- */}
      <section className="pdl-w pdl-sec" aria-labelledby="pdl-tips">
        <div className="pdl-hh pdl-rv">
          <h2 className="pdl-h2 s" id="pdl-tips">Conteúdo para produzir melhor</h2>
          <Link className="pdl-more" href="/criar-evento">Começar agora <Arrow /></Link>
        </div>
        <Tips />
      </section>

      <SectionDock />
    </main>
  );
}
