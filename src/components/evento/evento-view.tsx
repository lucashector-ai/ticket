"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import { EventCard } from "@/components/event-card";
import { useFavorites } from "@/components/favorites";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { useToast } from "@/components/toast";
import type { EventCard as EventCardData } from "@/lib/data/events";
import { Description } from "./description";
import { Lineup } from "./lineup";
import { OrganizerCard } from "./organizer-card";
import { PlayerBar, usePlayer } from "./player";
import { QueueGate } from "@/components/queue-gate";
import { LaunchCard } from "./launch-card";
import { TicketsCard } from "./tickets-card";
import type { EventoData } from "./types";
import { useTickets } from "./use-tickets";
import { VenueMap } from "./venue-map";
import { brl } from "@/lib/format";

type Props = {
  e: EventoData;
  user: HeaderUser;
  loggedIn: boolean;
  initialFollowing: boolean;
  similar: EventCardData[];
  viewerEmail: string;
};

export function EventoView({ e, user, loggedIn, initialFollowing, similar, viewerEmail }: Props) {
  const router = useRouter();
  const { flash } = useToast();
  const { isFav, toggle } = useFavorites();
  const tickets = useTickets(e);
  const player = usePlayer();
  const [ld, setLd] = useState<"on" | "out" | "">("on");

  // Loader de entrada ("Preparando seus ingressos"), como no design.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t1 = setTimeout(() => setLd("out"), reduce ? 50 : 1000);
    const t2 = setTimeout(() => setLd(""), reduce ? 100 : 1450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const fav = isFav(e.slug);
  const onFav = async () => {
    const saved = await toggle(e.slug);
    flash(saved ? `${e.title} foi salvo` : "Removido dos salvos");
  };
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
    const el = document.getElementById("ingressos");
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  };
  const mbarGo = () => {
    if (tickets.nq && !waiting) tickets.checkout();
    else document.getElementById("ingressos")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <SiteHeader user={user} variant="default" onImage />
      <div id="topo">
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
              <div className="m16-art2"><BannerArt id={e.bannerId} fit="card" /></div>
              <div className="cover-acts">
                <button className={fav ? "gbtn on" : "gbtn"} type="button" onClick={onFav} aria-pressed={fav} aria-label={fav ? "Remover dos salvos" : "Salvar evento"}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill={fav ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.4a4.6 4.6 0 0 1 8 3.1c0 6.1-8 11-8 11z" /></svg>
                </button>
                <button className="gbtn" type="button" onClick={onShare} aria-label="Compartilhar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      <main className="wrap">
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
              <div className="et-buy">
                <div>
                  <span>{waiting ? (e.launch.phase === "presale" ? "Pré-venda para cadastrados" : e.launch.presaleAt ? "Pré-venda em breve" : "Vendas em breve") : e.minPriceCents > 0 ? "Ingressos a partir de" : "Ingressos"}</span>
                  <b>{e.minPriceCents > 0 ? brl(e.minPriceCents) : waiting ? "Fique de olho" : e.tiers.some((t) => t.priceCents === 0) ? "Grátis" : "Escolha o seu"}</b>
                </div>
                <button className="et-go" type="button" onClick={goTickets}>
                  {waiting ? (e.launch.phase === "soon" && e.launch.presaleAt ? "Quero a pré-venda" : "Me avise") : "Comprar ingressos"}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </button>
              </div>
            </div>

            <Description paragraphs={e.paragraphs} />
            <Lineup lineup={e.lineup} timed={e.timed} p={player} />
            {e.venueMap && <VenueMap e={e} t={tickets} />}

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
              <div className="map" role="img" aria-label={`Mapa ilustrativo de ${e.venue}`}>
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

          <aside className="side">
            {waiting ? <LaunchCard e={e} email={viewerEmail} /> : <TicketsCard e={e} t={tickets} />}
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

      <div className="mbar">
        {waiting ? (
          <div>
            <span>{e.launch.phase === "presale" ? "Pré-venda para cadastrados" : e.launch.presaleAt ? "Pré-venda em breve" : "Vendas em breve"}{e.minPriceCents > 0 ? " · a partir de" : ""}</span>
            <b>{e.minPriceCents > 0 ? brl(e.minPriceCents) : "Em breve"}</b>
          </div>
        ) : (
          <div>
            <span>{tickets.qtyLabel}</span>
            <b>{brl(tickets.total)}</b>
          </div>
        )}
        <button type="button" onClick={mbarGo} disabled={tickets.pending}>{waiting ? (e.launch.phase === "soon" && e.launch.presaleAt ? "Pré-venda" : "Me avise") : tickets.nq ? "Continuar" : "Escolher"}</button>
      </div>

      {ld && (
        <div className={ld === "out" ? "ld out" : "ld"} role="status" aria-live="polite" aria-label={`Carregando ingressos de ${e.title}`}>
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

      <PlayerBar p={player} />
      {e.queueOn && !waiting && <QueueGate eventId={e.id} title={e.title} />}
    </>
  );
}
