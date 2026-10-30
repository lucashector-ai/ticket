"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import { EventCard } from "@/components/event-card";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { useToast } from "@/components/toast";
import type { EventCard as EventCardData } from "@/lib/data/events";
import { Description } from "./description";
import { Lineup } from "./lineup";
import { OrganizerCard } from "./organizer-card";
import { PlayerBar, usePlayer } from "./player";
import { QueueGate } from "@/components/queue-gate";
import { LaunchCard } from "./launch-card";
import { LaunchScreen } from "./launch-screen";
import { launchTarget, MiniCountdown } from "./countdown";
import { TicketsCard } from "./tickets-card";
import type { EventoData } from "./types";
import { useTickets } from "./use-tickets";
import { VenueMap } from "./venue-map";
import { brl } from "@/lib/format";
import { BuySheet, firstStep, useBuySheet } from "./buy-sheet";
import { ResaleCard } from "./resale-card";
import { LD_KEY, LD_SEEN_SCRIPT } from "@/lib/inline-scripts";

type Props = {
  e: EventoData;
  user: HeaderUser;
  loggedIn: boolean;
  initialFollowing: boolean;
  similar: EventCardData[];
  viewerEmail: string;
  /** escolha vinda da URL (voltou do checkout) */
  initialItens?: string;
  /** ?comprar=1: abre a escolha de ingressos assim que a página carrega */
  openBuy?: boolean;
};


/** Carga direta (link, recarregar, voltar do checkout): esconde o loader antes da primeira pintura
 *  se ele já apareceu nesta sessão. Na navegação interna quem esconde é o useLayoutEffect.
 *  No cliente vira text/plain (não executa e não gera aviso do React), como no guia do Next. */
function LdSeenScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: LD_SEEN_SCRIPT }}
    />
  );
}

/** celular e tablet: a escolha de ingressos abre em tela cheia em vez do cartão ao lado */
const narrow = () => window.matchMedia("(max-width: 1024px)").matches;

export function EventoView({ e, user, loggedIn, initialFollowing, similar, viewerEmail, initialItens = "", openBuy = false }: Props) {
  const router = useRouter();
  const { flash } = useToast();
  const tickets = useTickets(e, initialItens);
  const sheet = useBuySheet();
  const player = usePlayer();
  const [ld, setLd] = useState<"on" | "out" | "">("on");

  // Loader de entrada ("Preparando seus ingressos"), como no design: só na primeira página de
  // evento da sessão (decisão DM-1). Voltar do checkout ou abrir outro evento não espera de novo.
  // Na carga direta, o LdSeenScript já esconde o loader antes da primeira pintura.
  const ldSeen = useRef<boolean | null>(null);
  useLayoutEffect(() => {
    if (ldSeen.current === null) {
      ldSeen.current = false;
      try { ldSeen.current = sessionStorage.getItem(LD_KEY) === "1"; sessionStorage.setItem(LD_KEY, "1"); } catch { /* sem storage: mostra */ }
    }
    if (ldSeen.current) { setLd(""); return; }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setLd("out"), reduce ? 50 : 600);
    const t2 = setTimeout(() => setLd(""), reduce ? 100 : 900);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const onShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) { await navigator.share({ title: e.title, text: `${e.title} · ${e.dateFull}`, url }); return; }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
    try { await navigator.clipboard.writeText(url); flash("Link copiado"); } catch { flash("Não foi possível compartilhar."); }
  };
  const onBack = (ev: React.MouseEvent) => {
    if (window.history.length > 1) { ev.preventDefault(); router.back(); }
  };
  // antes da abertura (ou na pré-venda sem o link), o cartão de ingressos vira contagem regressiva
  const waiting = e.launch.phase !== "open" && !e.launch.access;
  /** leva até o cartão de ingressos e dá um destaque nele */
  const goTickets = () => {
    if (!waiting && narrow()) { startBuy(); return; }
    const el = document.getElementById("ingressos");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };
  /**
   * Abre a compra em tela cheia: com ingressos de um setor só já escolhidos, direto na lista deles; sem escolha,
   * ou com escolha em mais de um setor/data, no começo (lá cada setor e data mostra quantos já tem).
   */
  const startBuy = () => {
    const pickedAll = e.tiers.filter((x) => (tickets.qty[x.id] ?? 0) > 0);
    const picked = pickedAll[0];
    const spread = new Set(pickedAll.map((x) => `${x.sessionId ?? ""}|${x.sector ?? ""}`)).size > 1;
    if (!picked || spread) { tickets.setSector(null); sheet.go(firstStep(e, picked?.sessionId ?? tickets.session)); return; }
    if (picked.sessionId && e.sessions.length > 1) tickets.setSession(picked.sessionId);
    const sectors = new Set(e.tiers.filter((x) => e.sessions.length <= 1 || x.sessionId === picked.sessionId).map((x) => x.sector).filter(Boolean));
    tickets.setSector(sectors.size > 1 ? picked.sector : null);
    sheet.go("ingressos");
  };
  const mbarGo = () => {
    if (waiting) document.getElementById("ingressos")?.scrollIntoView({ behavior: "smooth", block: "center" });
    else if (tickets.nq) tickets.checkout();
    else startBuy();
  };
  /* ?comprar=1 (voltar do checkout, "Alterar ingressos"): reabre a escolha; o parâmetro sai da URL */
  useEffect(() => {
    if (!openBuy) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("comprar");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    if (waiting) return;
    const id = requestAnimationFrame(() => {
      if (narrow()) startBuy();
      else document.getElementById("ingressos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(id);
    // só na chegada à página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* o botão flutuante some enquanto a chamada de compra logo abaixo do nome está na tela */
  const buyRef = useRef<HTMLDivElement>(null);
  const [inlineBuy, setInlineBuy] = useState(true);
  useEffect(() => {
    const el = buyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([en]) => setInlineBuy(en.isIntersecting), { rootMargin: "-68px 0px 0px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  /* revenda (#revenda): no celular a lista fica na coluna principal */
  useEffect(() => {
    if (window.location.hash !== "#revenda" || !narrow()) return;
    const id = requestAnimationFrame(() => document.getElementById("revenda-m")?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      {/* no fundo lima da tela de contagem, o topo fica no padrão (texto escuro) */}
      <SiteHeader user={user} variant="default" onImage={!(waiting && e.launch.openAt && e.launch.page.theme === "lima")} />
      <div id="topo">
        {waiting && e.launch.openAt ? (
          <LaunchScreen slug={e.slug} email={viewerEmail} x={{
            page: e.launch.page, title: e.title, when: `${e.dateFull}${e.timed ? ` · ${e.startTime}` : ""}`, where: [e.venue, e.city].filter(Boolean).join(", "),
            bannerId: e.bannerId, flyerId: e.flyerId, lineup: e.lineup.map((a) => a.name),
            phase: e.launch.phase === "presale" ? "presale" : "soon", openAt: e.launch.openAt, presaleAt: e.launch.presaleAt,
          }} />
        ) : (
        <section className="ehero" aria-labelledby="ev-t">
          <div className="ebg" aria-hidden="true" style={{ backgroundColor: e.accentColor }}>
            <div className="ebg-in"><FlyerArt id={e.flyerId} /></div>
          </div>
          <span className="ebg-tint" aria-hidden="true" />
          <div className="ehero-in">
            <nav className="crumb2" aria-label="Navegação">
              <Link className="gpill" href="/explorar" onClick={onBack}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
                Voltar
              </Link>
              <Link href="/explorar">Eventos</Link>
              <span aria-hidden="true">/</span>
              <span>{e.category ?? "Evento"}</span>
            </nav>
            <div className="m16">
              <div className="m16-art2"><BannerArt id={e.bannerId} fit="card" poster={e.bannerId === e.flyerId} /></div>
              <div className="cover-acts">
                <button className="gbtn" type="button" onClick={onShare} aria-label="Compartilhar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
                </button>
              </div>
            </div>
          </div>
        </section>
        )}
      </div>

      <main className="wrap" id="sobre" style={{ scrollMarginTop: 80 }}>
        <div className="body2">
          <div className="col">
            <div className="et-l">
              <h1 className="et-h" id="ev-t">{e.title}</h1>
              <ul className="et-info2">
                <li>
                  <span className="ibx" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
                    </svg>
                  </span>
                  <div>
                    <b>{e.dateFull}{e.timed && <> · {e.startTime}</>}</b>
                    {e.doors && <span>{e.doors}</span>}
                  </div>
                </li>
                <li>
                  <span className="ibx" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" />
                    </svg>
                  </span>
                  <div>
                    <b>
                      {e.venue}
                      <a className="mapchip" href={e.mapsUrl} target="_blank" rel="noreferrer">Ver no mapa</a>
                    </b>
                    <span>{e.addr}</span>
                  </div>
                </li>
              </ul>
              <div className="et-buy" ref={buyRef}>
                <div>
                  <span>{waiting ? (e.launch.phase === "presale" ? "Venda geral abre em" : e.launch.presaleAt ? "Pré-venda começa em" : "Vendas abrem em") : e.minPriceCents > 0 ? "Ingressos a partir de" : "Ingressos"}</span>
                  {waiting && launchTarget(e.launch) ? <MiniCountdown target={launchTarget(e.launch)!} /> : <b>{e.minPriceCents > 0 ? brl(e.minPriceCents) : e.tiers.some((t) => t.priceCents === 0) ? "Grátis" : "Escolha o seu"}</b>}
                </div>
                <button className="et-go" type="button" onClick={goTickets}>
                  {waiting ? (e.launch.phase === "soon" && e.launch.presaleAt ? "Quero a pré-venda" : "Me avise") : "Comprar ingressos"}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </button>
              </div>
            </div>

            {!waiting && e.resale.offers.length > 0 && <div className="rsl-m"><ResaleCard e={e} anchor="revenda-m" /></div>}
            <Description paragraphs={e.paragraphs} />
            <Lineup lineup={e.lineup} timed={e.timed} p={player} />
            {e.venueMap && <VenueMap e={e} t={tickets} onSector={waiting ? undefined : (name) => { tickets.setSector(name); sheet.go("ingressos"); }} />}

            <div className="blk-s">
              <h2>O que você deve saber</h2>
              <div className="infos">
                <div className="info">
                  <i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></i>
                  <div><b>Abertura dos portões</b><span>{e.doors ?? "A confirmar"}</span></div>
                </div>
                <div className="info">
                  <i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 12h6" /></svg></i>
                  <div><b>Classificação</b><span>{e.age ?? "Livre"}</span></div>
                </div>
                <div className="info">
                  <i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M4 12h10M4 17h7" /></svg></i>
                  <div><b>Meia-entrada</b><span>{e.halfPrice ?? "Conforme a lei, com documento."}</span></div>
                </div>
                <div className="info">
                  <i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4" /></svg></i>
                  <div><b>Cancelamento</b><span>{e.refund ?? "Política de reembolso do produtor."}</span></div>
                </div>
              </div>
            </div>

            <div className="blk-s" id="local" style={{ scrollMarginTop: 100 }}>
              <h2>Local</h2>
              {/* desenho decorativo; o nome, o endereço e o link "Como chegar" estão em texto dentro dele */}
              <div className="map">
                <span className="pin" aria-hidden="true"><i /></span>
                <div className="pin-c">
                  <div>
                    <b>{e.venue}</b>
                    <span>{e.addr}</span>
                  </div>
                  <a href={e.mapsUrl} target="_blank" rel="noreferrer">Como chegar</a>
                </div>
              </div>
            </div>

            {e.organizer && <OrganizerCard o={e.organizer} eventSlug={e.slug} loggedIn={loggedIn} initialFollowing={initialFollowing} />}
          </div>

          <aside className={waiting ? "side" : "side side-tk"}>
            {waiting ? <LaunchCard e={e} email={viewerEmail} compact={!!e.launch.openAt} /> : <TicketsCard e={e} t={tickets} />}
          </aside>
        </div>

        {similar.length > 0 && (
          <section className="more" aria-labelledby="mr-t">
            <div className="more-h">
              <h2 id="mr-t">Você também pode curtir</h2>
              <Link href="/explorar">Ver todos →</Link>
            </div>
            <div className="grid">
              {similar.map((c) => <EventCard key={c.id} e={c} className="card" />)}
            </div>
          </section>
        )}
      </main>

      <div className={inlineBuy && !tickets.nq ? "mbar off" : "mbar"} aria-hidden={inlineBuy && !tickets.nq ? true : undefined}>
        {waiting ? (
          <div>
            <span>{e.launch.phase === "presale" ? "Venda geral abre em" : e.launch.presaleAt ? "Pré-venda começa em" : "Vendas abrem em"}</span>
            {launchTarget(e.launch) ? <MiniCountdown target={launchTarget(e.launch)!} /> : <b>Em breve</b>}
          </div>
        ) : (
          <div>
            <span>{tickets.nq ? `${tickets.nq} ${tickets.nq === 1 ? "ingresso" : "ingressos"}` : e.minPriceCents > 0 ? "A partir de" : "Ingressos"}</span>
            <b>{tickets.nq ? (tickets.subtotal ? brl(tickets.totalWithFee) : "Grátis") : e.minPriceCents > 0 ? brl(e.minPriceCents) : e.tiers.some((x) => x.priceCents === 0) ? "Grátis" : "Escolha"}</b>
          </div>
        )}
        <button type="button" onClick={mbarGo} disabled={tickets.pending} tabIndex={inlineBuy && !tickets.nq ? -1 : undefined}>
          {waiting ? (e.launch.phase === "soon" && e.launch.presaleAt ? "Pré-venda" : "Me avise") : tickets.pending ? "Abrindo…" : tickets.nq ? "Continuar" : "Comprar ingressos"}
          {!waiting && tickets.nq > 0 && !tickets.pending && <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>}
        </button>
      </div>

      {ld && (
        <div className={ld === "out" ? "ld out" : "ld"} suppressHydrationWarning role="status" aria-live="polite" aria-label={`Carregando ingressos de ${e.title}`}>
          <div className="ld-in">
            <div className="ld-tk">
              <div className="ld-main">
                <span className="ld-k">Tickets Win · Ingresso</span>
                <b className="ld-t">{e.title}</b>
                <span className="ld-d">{e.dateFull} · {e.city}</span>
                <span className="ld-bar"><i /></span>
              </div>
              <div className="ld-stub"><span className="ld-code" /></div>
            </div>
            <p className="ld-p">Preparando seus ingressos<span className="ld-dots"><i>.</i><i>.</i><i>.</i></span></p>
          </div>
        </div>
      )}
      {ld === "on" && <LdSeenScript />}

      {!waiting && (
        <BuySheet e={e} t={tickets} s={sheet} onMap={() => {
          sheet.close();
          setTimeout(() => document.getElementById("mapa")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
        }} />
      )}
      <PlayerBar p={player} />
      {e.queueOn && !waiting && <QueueGate eventId={e.id} title={e.title} />}
    </>
  );
}
