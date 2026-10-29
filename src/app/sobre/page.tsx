import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getHeaderUser } from "@/components/inst-shell";
import { BrandMark } from "@/components/brand-logo";
import { Spotlight } from "@/components/produtores-landing/motion";
import { SobreMotion } from "@/components/sobre/motion";

export const dynamic = "force-dynamic";

const DESCRIPTION =
  "A Tickets Win nasceu do amor pela música: uma plataforma de ingressos feita por quem vive de show e festa, com taxa clara antes de pagar, QR que muda na transferência e gente de verdade no atendimento.";

export const metadata: Metadata = {
  title: "Sobre nós",
  description: DESCRIPTION,
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: "Sobre nós · Tickets Win",
    description: DESCRIPTION,
    url: "/sobre",
    type: "website",
    locale: "pt_BR",
    siteName: "Tickets Win",
  },
};

const HELP_EMAIL = "ajuda@ticketswin.com.br";
const MKT_EMAIL = "marketing@ticketswin.com.br";
const WHATSAPP = "https://wa.me/5511927488081";

const MARQUEE = ["Amor pela música", "Pista cheia", "Ingresso na mão", "Sem letra miúda", "Sem dor de cabeça", "Nos vemos no show"];
const MARQUEE_2 = ["Feito por quem vai", "Taxa antes de pagar", "QR que muda", "Gente que responde", "Revenda oficial", "Fila justa"];

const QUOTE = "Pra ser sincero, a gente cansou de site de ingresso que, no final, só faz a gente passar raiva.";
const QUOTE_HL = 2; // últimas palavras destacadas

const TIMELINE = [
  { y: "2022", t: "A ideia", s: "Numa conversa entre fãs de música nasce a vontade de fazer o site de ingressos que a gente mesmo gostaria de usar." },
  { y: "2024", t: "Desenhando", s: "Começa o desenho desta versão. Tela por tela, testando, jogando fora e começando de novo até ficar simples de verdade." },
  { y: "2026", t: "No ar", s: "Finalmente saiu do papel. É a Tickets Win que você está usando agora, e ela continua mudando com o que você conta pra gente." },
];

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="sob-k">
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const ICONS = {
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2z",
  swap: "M7 7h11l-3-3M17 17H6l3 3M18 7l-3 3M6 17l3-3",
  queue: "M8 7a2 2 0 1 0 0-.01M16 7a2 2 0 1 0 0-.01M4 20v-2a4 4 0 0 1 8 0v2M12 20v-2a4 4 0 0 1 8 0v2",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12zM8.5 12h.01M12 12h.01M15.5 12h.01",
  mail: "M4 6h16v12H4zM4 7l8 6 8-6",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
} as const;

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function MarqueeRow({ items }: { items: string[] }) {
  const row = (k: string) => (
    <div className="sob-mqr" key={k}>
      {items.map((w) => (
        <span key={w}>
          {w}
          <BrandMark size={22} className="sob-mqm" />
        </span>
      ))}
    </div>
  );
  return <div className="sob-mqi">{[row("a"), row("b")]}</div>;
}

export default async function SobrePage() {
  const user = await getHeaderUser();
  const words = QUOTE.split(" ");
  return (
    <div className="pg-sob">
      <SiteHeader user={user} variant="default" activePath="/sobre" />
      <main className="sob-main">
        <SobreMotion />

        {/* ---------- hero ---------- */}
        <section className="sob-w sob-hero" aria-labelledby="sob-h1">
          <div className="sob-hero-tx">
            <Kicker>Sobre nós</Kicker>
            <h1 className="sob-h1" id="sob-h1">
              <span className="ln"><span>Tudo começou</span></span>
              <span className="ln"><span>pelo amor</span></span>
              <span className="ln"><span>à <em>música</em>.</span></span>
            </h1>
            <p className="sob-lead">
              A Tickets Win é feita por gente que vive de show, festa e festival, e que cansou de terminar a compra do ingresso com raiva. Então a gente resolveu fazer diferente.
            </p>
            <div className="sob-cta">
              <a className="sob-btn" href="#historia">Conheça a história <Arrow /></a>
              <a className="sob-btn g" href="#contato">Fale com a gente</a>
            </div>
          </div>

          <div className="sob-vis" aria-hidden="true">
            <div className="sob-stage">
              <div className="sob-glow" />
              <div className="sob-disc">
                <BrandMark size={74} className="sob-label" />
              </div>
              <div className="sob-sheen" />
              <div className="sob-arm"><i /></div>
              <div className="sob-eq">
                {Array.from({ length: 26 }, (_, i) => (
                  <i key={i} className={i % 5 === 2 ? "l" : undefined} style={{ "--d": `${((i * 37) % 11) * -0.13}s`, "--h": `${30 + ((i * 53) % 70)}%` } as React.CSSProperties} />
                ))}
              </div>
            </div>
            <div className="sob-sticker" data-par="-0.08">
              <svg viewBox="0 0 120 120">
                <defs>
                  <path id="sob-circ" d="M60 60m-44 0a44 44 0 1 1 88 0a44 44 0 1 1-88 0" />
                </defs>
                <text>
                  <textPath href="#sob-circ" textLength="272" lengthAdjust="spacing">FEITO POR QUEM AMA MÚSICA • DESDE 2022 •</textPath>
                </text>
              </svg>
              <span>♪</span>
            </div>
            <div className="sob-stub" data-par="0.1">
              <div>
                <small>A ideia</small>
                <b>2022</b>
              </div>
              <span className="sob-stub-a"><Arrow /></span>
              <div>
                <small>No ar</small>
                <b>2026</b>
              </div>
              <span className="sob-stub-t">Do papel pra pista</span>
            </div>
          </div>
        </section>

        {/* ---------- marquee ---------- */}
        <div className="sob-mq" aria-hidden="true">
          <div className="sob-mqb k"><MarqueeRow items={MARQUEE_2} /></div>
          <div className="sob-mqb"><MarqueeRow items={MARQUEE} /></div>
        </div>

        {/* ---------- história ---------- */}
        <section className="sob-w sob-sec" id="historia" aria-labelledby="sob-hist">
          <div className="sob-story">
            <div className="sob-story-h sob-rv">
              <Kicker>Nossa história</Kicker>
              <h2 className="sob-h2" id="sob-hist">Antes de ser empresa, a gente era plateia.</h2>
            </div>
            <div className="sob-prose">
              <p className="big sob-rv">
                Tudo começou pelo amor à música. Antes de qualquer linha de código, a gente era (e continua sendo) público: gente que conta os dias pro show, guarda o ingresso de recordação e sai do festival sem voz, já pensando no próximo.
              </p>
              <p className="sob-rv">
                Nossos fundadores são apaixonados por música e por eventos. E, de tanto viver isso, a gente também conhecia muito bem a parte chata: a taxa que só aparece na última tela, a revenda duvidosa, o atendimento que some justo quando você mais precisa.
              </p>
              <p className="sob-rv">
                A ideia da Tickets Win nasceu em <b>2022</b>. Desde <b>2024</b> a gente vem desenhando, apagando e redesenhando a versão que você está vendo agora, e foi só em <b>2026</b> que ela finalmente saiu do papel. Demorou? Demorou. Mas a gente preferiu fazer direito.
              </p>
              <p className="sob-rv">
                Hoje a Tickets Win existe pra facilitar a vida de quem faz o evento acontecer, mas principalmente a de quem está do outro lado: o público. A ideia é simples. Uma plataforma que escuta quem compra, resolve o problema de verdade e não deixa ninguém com dor de cabeça.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- citação ---------- */}
        <section className="sob-w sob-sec" aria-label="Por que a Tickets Win existe">
          <figure className="sob-quote" data-prog="0.45">
            <blockquote>
              <p>
                {words.map((w, i) => (
                  <span key={i} className={i >= words.length - QUOTE_HL ? "sob-hl" : undefined} style={{ "--i": i, "--n": words.length } as React.CSSProperties}>
                    {w}{i < words.length - 1 ? " " : ""}
                  </span>
                ))}
              </p>
            </blockquote>
            <figcaption>— Fundadores da Tickets Win</figcaption>
          </figure>
        </section>

        {/* ---------- linha do tempo ---------- */}
        <section className="sob-w sob-sec" id="linha-do-tempo" aria-labelledby="sob-tl">
          <div className="sob-hh sob-rv">
            <div>
              <Kicker>Linha do tempo</Kicker>
              <h2 className="sob-h2" id="sob-tl">Do papel pra pista.</h2>
            </div>
            <p className="sob-lead nar">Quatro anos entre a primeira ideia e o site no ar. Sem pressa: a gente queria acertar.</p>
          </div>
          <ol className="sob-tl" data-prog="0.55">
            {TIMELINE.map((s, i) => (
              <li key={s.y} className={`sob-tli sob-rv${i === TIMELINE.length - 1 ? " now" : ""}`} style={{ "--i": i, "--k": i / (TIMELINE.length - 1) } as React.CSSProperties}>
                <span className="sob-dot" aria-hidden="true"><i /></span>
                <div className="sob-tlc">
                  <span className="y">{s.y}</span>
                  <b>{s.t}</b>
                  <p>{s.s}</p>
                  {i === TIMELINE.length - 1 && (
                    <span className="sob-here"><i aria-hidden="true" />Você está aqui</span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- promessas ---------- */}
        <section className="sob-w sob-dark" id="promessas" aria-labelledby="sob-pr">
          <div className="sob-hh sob-rv">
            <div>
              <Kicker>Nossos combinados</Kicker>
              <h2 className="sob-h2" id="sob-pr">O que a gente prometeu<br className="hide-m" /> pra nós mesmos.</h2>
            </div>
            <p className="sob-lead nar">Tudo que nos irritava como público virou regra aqui dentro.</p>
          </div>
          <Spotlight className="sob-pg">
            <article className="sob-pc lime sob-rv" data-spot style={{ "--i": 0 } as React.CSSProperties}>
              <span className="big">7,99%</span>
              <div>
                <b>Taxa clara, antes de pagar</b>
                <p>Quando o evento tem taxa de serviço, ela é de 7,99% e aparece separadinha no resumo, antes de você confirmar. E se o produtor decidir absorver a taxa, você vê isso também. Sem letra miúda, sem susto na última tela.</p>
              </div>
            </article>
            <article className="sob-pc sob-rv" data-spot style={{ "--i": 1 } as React.CSSProperties}>
              <span className="ic"><Icon d={ICONS.qr} /></span>
              <b>QR code que muda na transferência</b>
              <p>Passou o ingresso pra um amigo? O QR antigo é cancelado na hora e quem recebe ganha um novo. Print velho não entra, e o golpe perde a graça.</p>
            </article>
            <article className="sob-pc sob-rv" data-spot style={{ "--i": 2 } as React.CSSProperties}>
              <span className="ic"><Icon d={ICONS.swap} /></span>
              <b>Revenda oficial, com teto</b>
              <p>Não vai mais conseguir ir? Nos eventos com revenda liberada, você anuncia aqui mesmo, com preço máximo definido pelo produtor. Quem compra recebe um QR novinho.</p>
            </article>
            <article className="sob-pc sob-rv" data-spot style={{ "--i": 3 } as React.CSSProperties}>
              <span className="ic"><Icon d={ICONS.queue} /></span>
              <b>Fila justa quando lota</b>
              <p>Em dia de muita procura, a fila virtual libera as pessoas por ordem de chegada. Sem atalho pra ninguém.</p>
            </article>
            <article className="sob-pc sob-rv" data-spot style={{ "--i": 4 } as React.CSSProperties}>
              <span className="ic"><Icon d={ICONS.chat} /></span>
              <b>Gente que responde</b>
              <p>Deu problema? Fala com a gente por e-mail ou WhatsApp. A plataforma foi pensada pra ouvir o público, e isso começa no atendimento.</p>
            </article>
          </Spotlight>
        </section>

        {/* ---------- dois lados ---------- */}
        <section className="sob-w sob-sec" aria-labelledby="sob-lados">
          <div className="sob-rv">
            <Kicker>Pra quem é</Kicker>
            <h2 className="sob-h2" id="sob-lados">Pros dois lados do palco.</h2>
          </div>
          <div className="sob-sides">
            <article className="sob-side lime sob-rv" style={{ "--i": 0 } as React.CSSProperties}>
              <span className="sob-tag">principalmente</span>
              <small>Pra quem vai</small>
              <b>Você, que só quer chegar e curtir.</b>
              <p>Achar o evento, entender exatamente quanto vai pagar, comprar e entrar sem estresse. E, se der problema, saber que tem alguém do outro lado pra resolver.</p>
              <Link className="sob-more" href="/explorar">Explorar eventos <Arrow /></Link>
            </article>
            <article className="sob-side sob-rv" style={{ "--i": 1 } as React.CSSProperties}>
              <small>Pra quem faz</small>
              <b>Quem coloca o evento de pé.</b>
              <p>Produzir já dá trabalho demais. A gente cuida da venda, dos ingressos e da portaria pra sobrar tempo pro que importa: a noite que você está preparando.</p>
              <Link className="sob-more" href="/produtores">Tickets Win para produtores <Arrow /></Link>
            </article>
          </div>
        </section>

        {/* ---------- contato ---------- */}
        <section className="sob-w sob-sec" id="contato" aria-labelledby="sob-ct">
          <div className="sob-contact sob-rv">
            <BrandMark size={520} className="bg" />
            <div className="sob-ct-h">
              <Kicker>Fale com a gente</Kicker>
              <h2 id="sob-ct">Ficou alguma dúvida? Chama a gente.</h2>
              <p>Do outro lado tem gente que gosta de evento tanto quanto você. Escreveu, a gente responde.</p>
            </div>
            <div className="sob-ct-g">
              <article className="sob-cc">
                <span className="ic"><Icon d={ICONS.help} /></span>
                <b>Ajuda e suporte</b>
                <p>Problema com ingresso, pagamento, transferência ou revenda? Conta pra gente o que aconteceu.</p>
                <ul className="sob-cl">
                  <li>
                    <Icon d={ICONS.mail} size={18} />
                    <a href={`mailto:${HELP_EMAIL}`}>{HELP_EMAIL}</a>
                  </li>
                  <li>
                    <Icon d={ICONS.chat} size={18} />
                    <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp +55 11 92748-8081</a>
                  </li>
                </ul>
                <div className="sob-cta">
                  <a className="sob-btn" href={WHATSAPP} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp <Arrow /></a>
                  <Link className="sob-btn g" href="/ajuda">Central de ajuda</Link>
                </div>
                <Link className="sob-more" href="/contato">Outras formas de contato <Arrow /></Link>
              </article>
              <article className="sob-cc ink">
                <span className="ic"><Icon d={ICONS.mail} /></span>
                <b>Imprensa e parcerias</b>
                <p>Pautas, entrevistas, parcerias com marcas, casas de show e festivais. Bora conversar.</p>
                <ul className="sob-cl">
                  <li>
                    <Icon d={ICONS.mail} size={18} />
                    <a href={`mailto:${MKT_EMAIL}`}>{MKT_EMAIL}</a>
                  </li>
                </ul>
                <div className="sob-cta">
                  <a className="sob-btn l" href={`mailto:${MKT_EMAIL}`}>Mandar e-mail <Arrow /></a>
                </div>
              </article>
            </div>
            <p className="sob-sign">Nos vemos na pista. <span>— Equipe Tickets Win</span></p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
