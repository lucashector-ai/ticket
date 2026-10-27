"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import { useFavorites } from "@/components/favorites";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { brl } from "@/lib/format";
import { CategoryGrid } from "./category-grid";
import { applyFilters, DEFAULT_FILTERS, exploreHref, type Filters } from "./filters";
import { HomeCard, SkeletonCard } from "./home-card";
import { Newsletter } from "./newsletter";
import { QuickView } from "./quick-view";
import type { CityOpt, HomeCategory, HomeEvent } from "./types";

type Props = {
  user: HeaderUser;
  events: HomeEvent[];
  heroEvents: HomeEvent[];
  categories: HomeCategory[];
  cityOpts: CityOpt[];
};

const FIRST_N = 8;
const SKELETONS = [0, 1, 2, 3, 4, 5, 6, 7];

function reduced() {
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

export function HomeClient({ user, events, heroEvents, categories, cityOpts }: Props) {
  const router = useRouter();
  const { favs } = useFavorites();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [swap, setSwap] = useState(false);
  const [lockH, setLockH] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const qRef = useRef<HTMLInputElement>(null);
  const hovRef = useRef(false);
  const unlockRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* primeira carga: esqueletos por 650ms, como no original */
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 650);
    return () => { clearTimeout(t); if (unlockRef.current) clearTimeout(unlockRef.current); };
  }, []);

  /* barra de busca "grudada" ao rolar além da dobra */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const h = window.innerHeight || 900;
      setStuck(y > h - 250);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* trava o scroll com o modal aberto */
  useEffect(() => {
    document.documentElement.style.overflow = openSlug ? "hidden" : "";
    return () => { document.documentElement.style.overflow = ""; };
  }, [openSlug]);

  /* vitrine: autoplay a cada 7s (pausa no hover, com modal aberto, com a busca grudada ou com reduced-motion) */
  const heroCount = heroEvents.length;
  const nextSlide = useCallback(() => setHeroIdx((i) => (i + 1) % Math.max(1, heroCount)), [heroCount]);
  const prevSlide = useCallback(() => setHeroIdx((i) => (i + heroCount - 1) % Math.max(1, heroCount)), [heroCount]);
  useEffect(() => {
    if (heroCount < 2 || openSlug || stuck) return;
    const id = setInterval(() => { if (hovRef.current || reduced()) return; nextSlide(); }, 7000);
    return () => clearInterval(id);
  }, [heroCount, openSlug, stuck, nextSlide]);

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  }, []);

  /* troca de filtros com a grade travada na altura atual (evita pulo) e re-animação dos cards */
  const refilter = useCallback((patch: Partial<Filters>) => {
    setLockH(gridRef.current?.offsetHeight ?? 0);
    setSwap(true);
    setShowAll(false);
    setFilters((f) => ({ ...f, ...patch }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      setSwap(false);
      if (unlockRef.current) clearTimeout(unlockRef.current);
      unlockRef.current = setTimeout(() => setLockH(0), 900);
    }));
  }, []);

  const focusSearch = useCallback(() => {
    const el = qRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }, []);

  const submitSearch = useCallback(() => {
    if (filters.query.trim()) router.push(exploreHref(filters));
    else focusSearch();
  }, [filters, router, focusSearch]);

  const close = useCallback(() => setOpenSlug(null), []);
  const openEv = useCallback((slug: string) => setOpenSlug(slug), []);

  const view = useMemo(() => applyFilters(events, filters, favs), [events, filters, favs]);
  const top = useMemo(() => [...events].sort((a, b) => b.popularity - a.popularity).slice(0, 5), [events]);
  const feat = useMemo(() => events.find((e) => e.slug === "marea") ?? null, [events]);
  const openEvent = useMemo(() => (openSlug ? [...events, ...heroEvents].find((e) => e.slug === openSlug) ?? null : null), [openSlug, events, heroEvents]);

  const ok = !loading && !swap;
  const first = showAll ? view : view.slice(0, FIRST_N);
  const hasRest = ok && !showAll && view.length > FIRST_N;
  const hero = heroEvents[heroIdx] ?? heroEvents[0];
  const topScroll = (dir: number) => topRef.current?.scrollBy({ left: dir * 408, behavior: reduced() ? "auto" : "smooth" });

  return (
    <div style={{ position: "relative", minHeight: "100vh", background: "#FFFFFF", color: "#111111" }}>
      <SiteHeader
        user={user}
        variant="home"
        onImage
        activePath="/"
        cities={cityOpts}
        city={filters.city}
        onCity={(v) => refilter({ city: v })}
        query={filters.query}
        onQuery={(v) => setFilters((f) => ({ ...f, query: v }))}
        onSearchSubmit={submitSearch}
        stuck={stuck}
      />

      <main id="inicio">
        {/* VITRINE */}
        <section className="hero2" aria-labelledby="hero-t">
          <h1 className="sr" id="hero-t">Descubra os eventos que valem sair de casa.</h1>
          <div
            className={openSlug ? "bnx paused" : "bnx"}
            aria-roledescription="carrossel"
            aria-label="Eventos em destaque"
            onMouseEnter={() => { hovRef.current = true; }}
            onMouseLeave={() => { hovRef.current = false; }}
            onTouchStart={(ev) => { touchX.current = ev.touches[0]?.clientX ?? null; }}
            onTouchEnd={(ev) => {
              const x0 = touchX.current, x1 = ev.changedTouches[0]?.clientX;
              touchX.current = null;
              if (x0 == null || x1 == null || Math.abs(x1 - x0) < 40) return;
              if (x1 < x0) nextSlide(); else prevSlide();
            }}
          >
            {heroEvents.map((b, i) => (
              <div key={b.slug} className={i === heroIdx ? "bnx-i on" : "bnx-i"} aria-hidden={i !== heroIdx}>
                <span className="cfh-w"><BannerArt id={b.bannerId} fit="fill" /></span>
                <span className="cfh-t"><FlyerArt id={b.flyerId} /></span>
                {/* celular: banner 16:9 em destaque sobre o próprio banner desfocado */}
                <span className="cfh-m">
                  <span className="cfh-mb"><BannerArt id={b.bannerId} fit="card" /></span>
                  <span className="cfh-mi">
                    <span className="cfh-mk">{b.categoryLabel}</span>
                    <b>{b.title}</b>
                    <span>{b.dateNice} · {b.city}</span>
                  </span>
                </span>
              </div>
            ))}
            <span className="bn-shade" aria-hidden="true" />
            <span className="bnx-dim" aria-hidden="true" />
            {hero && (
              <Link className="bn-hit" href={`/eventos/${hero.slug}`} aria-label={`Ver ingressos de ${hero.title}, ${hero.dateNice}, ${hero.city}`} />
            )}
            {heroCount > 1 && (
              <div className="bnm-dots" role="tablist" aria-label="Banners">
                {heroEvents.map((b, i) => (
                  <button key={b.slug} type="button" role="tab" aria-selected={i === heroIdx} aria-label={`Banner ${i + 1}: ${b.title}`} className={i === heroIdx ? "on" : undefined} onClick={() => setHeroIdx(i)} />
                ))}
              </div>
            )}
            {heroCount > 1 && (
              <>
                <button className="bn-arr2 bn-prev" type="button" onClick={prevSlide} aria-label="Banner anterior">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5" /></svg>
                </button>
                <button className="bn-arr2 bn-next" type="button" onClick={nextSlide} aria-label="Próximo banner">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 3.5L11 8l-4.5 4.5" /></svg>
                </button>
              </>
            )}
          </div>

          {/* BUSCA RÁPIDA */}
          <div className={stuck ? "qwrap stuck" : "qwrap"}>
            <div className="wrap">
              <div className="qbar" role="search">
                <Link className="qb-logo" href="/" aria-label="Onde — voltar ao início">
                  <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#111111" /><circle cx="15.6" cy="8.4" r="3.4" fill="#D3F55B" /></svg>
                  <span>Onde</span>
                </Link>
                <label className="qb-s">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
                  <span className="sr">Buscar eventos</span>
                  <input
                    ref={qRef}
                    type="search"
                    placeholder="Buscar evento, artista ou local"
                    value={filters.query}
                    onChange={(ev) => setFilters((f) => ({ ...f, query: ev.target.value }))}
                    onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); router.push(exploreHref(filters)); } }}
                    autoComplete="off"
                  />
                </label>
                <span className="qb-sep" aria-hidden="true" />
                <button className={filters.date === "hoje" ? "qb-c on" : "qb-c"} type="button" onClick={() => refilter({ date: filters.date === "hoje" ? "any" : "hoje", onlyFavs: false })} aria-pressed={filters.date === "hoje"}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5" /></svg>
                  <span>Hoje</span>
                </button>
                <button className={filters.date === "fds" ? "qb-c on" : "qb-c"} type="button" onClick={() => refilter({ date: filters.date === "fds" ? "any" : "fds", onlyFavs: false })} aria-pressed={filters.date === "fds"}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
                  <span>Fim de semana</span>
                </button>
                <span className="qb-act">
                  <Link className="qb-lk" href="#categorias">Categorias</Link>
                  <Link className="qb-ib" href={user ? "/meus-ingressos" : "/entrar"} aria-label={user ? "Sua conta" : "Entrar"}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1.3-3.8 4.2-5.8 7.5-5.8s6.2 2 7.5 5.8" /></svg>
                    {favs.length > 0 && <span className="badge">{favs.length}</span>}
                  </Link>
                  <Link className="qb-new" href="/produtores">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" /></svg>
                    <span>Criar evento</span>
                  </Link>
                </span>
                <Link className="qb-stub" href={exploreHref(filters)} aria-label="Explorar eventos">
                  <span className="qb-nl">Explorar eventos</span>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* EVENTOS EM DESTAQUE */}
        <section className="sec sheet-up" id="destaque" aria-labelledby="ev-t" style={{ scrollMarginTop: 72 }}>
          <span className="grab" aria-hidden="true" />
          <div className="wrap">
            <div className="sh rv">
              <div>
                <h2 className="h2" id="ev-t" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Eventos em destaque</h2>
              </div>
            </div>
            <div className="gwrap" ref={gridRef} style={{ minHeight: lockH || undefined }}>
              {loading && (
                <div className="grid" aria-busy="true" aria-label="Carregando eventos">
                  {SKELETONS.map((k) => <SkeletonCard key={k} />)}
                </div>
              )}
              {ok && view.length > 0 && (
                <div className="grid">
                  {first.map((e, i) => (
                    <HomeCard key={e.slug} e={e} delay={`${(Math.min(i, 8) * 0.06).toFixed(2)}s`} onOpen={openEv} />
                  ))}
                </div>
              )}
              {ok && view.length === 0 && (
                <div className="empty">
                  <svg width="56" height="56" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="11" fill="#111111" />
                    <circle className="sig-ring" cx="15.6" cy="8.4" r="3.4" fill="none" stroke="#D3F55B" strokeWidth=".6" />
                    <circle cx="15.6" cy="8.4" r="3.4" fill="#D3F55B" />
                  </svg>
                  <h3>Nenhum evento encontrado</h3>
                  <p>Tente outra data, outra cidade ou uma busca mais ampla. Sempre tem algo acontecendo.</p>
                  <button className="btn-p" type="button" onClick={() => refilter(DEFAULT_FILTERS)}>Limpar filtros</button>
                </div>
              )}
            </div>
            {hasRest && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 48 }}>
                <button className="btn-g" type="button" onClick={() => setShowAll(true)}>
                  Ver mais
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                </button>
              </div>
            )}
          </div>
        </section>

        {/* FAIXA ESPECIAL (Marea) */}
        {feat && (
          <section className="strip-b" id="especial" aria-labelledby="sb-t" style={{ scrollMarginTop: 72 }}>
            <div className="sb2 rv">
              <span className="sb2-sun" aria-hidden="true" />
              <span className="sb2-sea" aria-hidden="true">
                <svg viewBox="0 0 600 40" preserveAspectRatio="none">
                  <path d="M0 12 Q 25 4 50 12 T 100 12 T 150 12 T 200 12 T 250 12 T 300 12 T 350 12 T 400 12 T 450 12 T 500 12 T 550 12 T 600 12" fill="none" stroke="#F3E7D3" strokeOpacity=".45" strokeWidth="1.5" />
                  <path d="M0 30 Q 25 22 50 30 T 100 30 T 150 30 T 200 30 T 250 30 T 300 30 T 350 30 T 400 30 T 450 30 T 500 30 T 550 30 T 600 30" fill="none" stroke="#F3E7D3" strokeOpacity=".25" strokeWidth="1.5" />
                </svg>
              </span>
              <span className="sb2-k" aria-hidden="true">EVENTO ESPECIAL · ED.02</span>
              <h2 className="sb2-t" id="sb-t">{feat.title}</h2>
              <span className="sb2-m" aria-hidden="true">21—22 NOV · PRAIA DO SANTINHO, FLORIPA · A PARTIR DE {brl(feat.minPriceCents)} →</span>
              <Link className="sb-hit" href={`/eventos/${feat.slug}`} aria-label={`Ver ingressos do ${feat.title}, 21 e 22 de novembro, Praia do Santinho, Florianópolis`} />
            </div>
          </section>
        )}

        {/* TOP DA SEMANA */}
        <section className="sec" id="top" aria-labelledby="tp-t" style={{ paddingTop: 96, scrollMarginTop: 72 }}>
          <div className="wrap">
            <div className="sh rv" style={{ alignItems: "flex-end" }}>
              <div>
                <h2 className="h2" id="tp-t" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Os 5 mais procurados da semana</h2>
                <p style={{ fontSize: 15, marginTop: 6 }}>O que todo mundo está salvando agora.</p>
              </div>
              <div className="tnav">
                <button type="button" onClick={() => topScroll(-1)} aria-label="Anteriores">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5" /></svg>
                </button>
                <button type="button" onClick={() => topScroll(1)} aria-label="Próximos">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6.5 3.5L11 8l-4.5 4.5" /></svg>
                </button>
              </div>
            </div>
          </div>
          <div className="toprow" ref={topRef}>
            {top.map((e, i) => (
              <article className="topi rv" key={e.slug}>
                <span className="topn" aria-hidden="true">{i + 1}</span>
                <HomeCard e={e} rank={i + 1} className="card topc" onOpen={openEv} />
              </article>
            ))}
          </div>
        </section>

        {/* CATEGORIAS + NEWSLETTER */}
        <section className="sec" id="categorias" aria-labelledby="ct-t" style={{ scrollMarginTop: 72 }}>
          <div className="wrap">
            <div className="sh rv">
              <div>
                <h2 className="h2" id="ct-t">Explore por categoria</h2>
                <p style={{ fontSize: 15, marginTop: 6 }}>Do show de arena à instalação de arte. Escolha o clima da sua próxima saída.</p>
              </div>
            </div>
            <CategoryGrid categories={categories} onPick={(slug) => { refilter({ cat: slug, onlyFavs: false }); scrollTo("destaque"); }} />
            <Newsletter />
          </div>
        </section>
      </main>

      <SiteFooter />

      {openEvent && <QuickView e={openEvent} onClose={close} />}
    </div>
  );
}
