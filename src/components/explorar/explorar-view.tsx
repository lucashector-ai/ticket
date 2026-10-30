"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EventCard } from "@/components/event-card";
import { FlyerArt } from "@/components/art/flyer";
import type { EventCard as EventCardData } from "@/lib/data/events";
import { BrandMark } from "@/components/brand-logo";
import {
  applyFilters, chipDefs, DATE_OPTS, DEFAULT_FILTERS, filtersToParams, isDefault, MAIN_CATS, PAGE_SIZE, parseFilters, PRICE_OPTS, sameFilters, SORT_OPTS,
  type Filters,
} from "./filters";

const subscribeNoop = () => () => {};

export type CityOpt = { slug: string; name: string; uf: string };
export type CatOpt = { slug: string; name: string; coverFlyer: string | null };

type Props = {
  /** todos os eventos ao vivo (refiltro em memória) */
  events: EventCardData[];
  cities: CityOpt[];
  categories: CatOpt[];
  /** filtros lidos da URL no server */
  initial: Filters;
  /** primeira lista, já filtrada no server (SSR) */
  initialResults: EventCardData[];
};

const SKELETONS = [0, 1, 2, 3, 4, 5, 6, 7];

function Chev() {
  return (
    <svg className="chev" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M2 3.5l3 3 3-3" />
    </svg>
  );
}

function CatIcon({ slug }: { slug: string }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (slug) {
    case "shows": return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg>;
    case "festas": return <svg {...p}><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>;
    case "festivais": return <svg {...p}><path d="M3 20h18M5 20L12 5l7 15M12 5v15M12 5V2.5l3 1.2-3 1.3" /></svg>;
    case "eletronica": return <svg {...p}><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0" /></svg>;
    case "hiphop": return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5" /></svg>;
    case "arte": return <svg {...p}><rect x="3.5" y="4" width="17" height="16" rx="2.5" /><path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5.5" /><circle cx="15.5" cy="8.5" r="1.5" /></svg>;
    default: return <svg {...p}><path d="M3.5 8.5a2 2 0 0 0 2-2h13a2 2 0 0 0 2 2v7a2 2 0 0 0-2 2h-13a2 2 0 0 0-2-2z" /><path d="M14 6.5v11" strokeDasharray="1.5 2" /></svg>;
  }
}

export function ExplorarView({ events, cities, categories, initial, initialResults }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters] = useState<Filters>(initial);
  const [swap, setSwap] = useState(false);
  const [lockH, setLockH] = useState(0);
  const [shown, setShown] = useState(PAGE_SIZE);
  /** query strings que esta página enviou para a URL (para ignorar o eco atrasado do router.replace, mesmo com cliques rápidos) */
  const [pushedKeys, setPushedKeys] = useState<string[]>([]);

  const gridRef = useRef<HTMLDivElement>(null);
  const unlockT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // false no SSR/hidratação, true depois de montar: só então o fuso do navegador existe
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  /* URL → estado (voltar/avançar, links compartilhados): ajuste de estado durante o render quando a URL muda por fora */
  const spKey = searchParams.toString();
  const [seenKey, setSeenKey] = useState(spKey);
  if (spKey !== seenKey) {
    setSeenKey(spKey);
    const i = pushedKeys.indexOf(spKey);
    if (i >= 0) {
      // eco de um replace nosso: consome uma vez (um voltar para a mesma URL depois conta como navegação externa)
      setPushedKeys((p) => { const j = p.indexOf(spKey); return j < 0 ? p : [...p.slice(0, j), ...p.slice(j + 1)]; });
    } else {
      const fromUrl = parseFilters(searchParams);
      if (!sameFilters(fromUrl, filters)) { setFilters(fromUrl); setShown(PAGE_SIZE); }
    }
  }

  const syncUrl = useCallback((f: Filters, debounce = 0) => {
    const push = () => {
      urlT.current = null;
      const qs = filtersToParams(f).toString();
      setPushedKeys((p) => [...p.slice(-9), qs]);
      router.replace(qs ? `/explorar?${qs}` : "/explorar", { scroll: false });
    };
    if (urlT.current) clearTimeout(urlT.current);
    if (debounce) urlT.current = setTimeout(push, debounce);
    else push();
  }, [router]);

  /** Troca de filtro com skeleton de um frame e altura travada (swap/lockH da home). */
  const refilter = useCallback((patch: Partial<Filters>, opts?: { debounce?: number }) => {
    const next = { ...filters, ...patch };
    setLockH(gridRef.current?.offsetHeight ?? 0);
    setSwap(true);
    setFilters(next);
    setShown(PAGE_SIZE);
    requestAnimationFrame(() => {
      setSwap(false);
      if (unlockT.current) clearTimeout(unlockT.current);
      unlockT.current = setTimeout(() => setLockH(0), 900);
    });
    syncUrl(next, opts?.debounce ?? 0);
  }, [filters, syncUrl]);

  useEffect(() => () => { if (unlockT.current) clearTimeout(unlockT.current); if (urlT.current) clearTimeout(urlT.current); }, []);

  /* lista: no SSR/hidratação é a do server; depois de montar, refiltro em memória */
  const results = useMemo(() => (mounted ? applyFilters(events, filters) : initialResults), [mounted, events, filters, initialResults]);

  const clearAll = useCallback(() => refilter({ ...DEFAULT_FILTERS }), [refilter]);

  const scrollToResults = useCallback(() => {
    const el = document.getElementById("resultados");
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, []);

  /* derivados */
  const chips = useMemo(() => chipDefs(filters), [filters]);
  const cityOpts = useMemo(() => [{ value: "all", label: "Todas" }, ...cities.map((c) => ({ value: c.slug, label: c.name }))], [cities]);
  const cityName = cities.find((c) => c.slug === filters.city || c.name === filters.city)?.name;
  const count = results.length;
  const countWord = count === 1 ? "evento" : "eventos";
  const sortLabel = SORT_OPTS.find((s) => s.value === filters.sort)?.label ?? "Data";
  const visible = results.slice(0, shown);
  const hasMore = results.length > shown;
  const showSkeleton = swap;
  const isEmpty = !swap && results.length === 0;
  const mainCats = useMemo(() => MAIN_CATS.map((s) => categories.find((c) => c.slug === s)).filter((c): c is CatOpt => !!c), [categories]);
  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of categories) m.set(c.slug, events.filter((e) => e.kinds.includes(c.slug)).length);
    return m;
  }, [categories, events]);

  return (
    <>
      {/* CABEÇALHO */}
      <section className="xhead" aria-labelledby="xp-t">
        <div className="wrap">
          <span className="xkick"><span className="dot" aria-hidden="true" />Agenda completa</span>
          <h1 className="h1 xt" id="xp-t">Explorar eventos</h1>
          <p className="sub xs" aria-live="polite">
            {showSkeleton ? "Carregando eventos…" : <><b>{count}</b> {countWord} em {cityName ?? "todo o Brasil"}</>}
          </p>

          <form className="xq" role="search" onSubmit={(e) => { e.preventDefault(); syncUrl(filters); scrollToResults(); }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" />
            </svg>
            <label className="sr" htmlFor="xq-in">Buscar eventos</label>
            <input id="xq-in" type="search" placeholder="Buscar evento, artista ou local" value={filters.q} onChange={(e) => refilter({ q: e.target.value }, { debounce: 300 })} autoComplete="off" />
            {filters.q && (
              <button className="qx" type="button" onClick={() => refilter({ q: "" })} aria-label="Limpar busca">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
              </button>
            )}
            <button className="xq-go" type="submit" aria-label="Buscar">
              <span>Buscar</span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </button>
          </form>

          <div className="fbar">
            <label className="fld">
              <span>Cidade</span>
              <select value={cityOpts.some((o) => o.value === filters.city) ? filters.city : "all"} onChange={(e) => refilter({ city: e.target.value })}>
                {cityOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Chev />
            </label>
            <label className="fld">
              <span>Data</span>
              <select value={filters.date} onChange={(e) => refilter({ date: e.target.value as Filters["date"] })}>
                {DATE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Chev />
            </label>
            <label className="fld">
              <span>Preço</span>
              <select value={filters.max ?? ""} onChange={(e) => refilter({ max: e.target.value ? Number(e.target.value) : null })}>
                {PRICE_OPTS.map((o) => <option key={o.label} value={o.value ?? ""}>{o.label}</option>)}
              </select>
              <Chev />
            </label>
            <label className="fld">
              <span>Ordenar</span>
              <select value={filters.sort} onChange={(e) => refilter({ sort: e.target.value as Filters["sort"] })}>
                {SORT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Chev />
            </label>
          </div>

          <div className="chipsr">
            <div className="chips" role="group" aria-label="Categorias">
              {chips.map((c) => (
                <button key={c.id} className={c.on ? "chip on" : "chip"} type="button" aria-pressed={c.on} onClick={() => refilter(c.patch)}>{c.label}</button>
              ))}
            </div>
            <button className="clr" type="button" onClick={clearAll} hidden={isDefault(filters)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      {/* RESULTADOS */}
      <section className="xres" id="resultados" aria-labelledby="xr-t" style={{ scrollMarginTop: "80px" }}>
        <div className="wrap">
          <div className="sh">
            <h2 className="h2" id="xr-t">{showSkeleton ? "Eventos" : `${count} ${countWord}`}</h2>
            <span className="cnt">Ordenado por <b>{sortLabel}</b></span>
          </div>
          <div className="gwrap" ref={gridRef} style={lockH ? { minHeight: lockH } : undefined}>
            {showSkeleton && (
              <div className="grid" aria-busy="true" aria-label="Carregando eventos">
                {SKELETONS.map((k) => (
                  <div className="card sk" key={k}>
                    <div className="cimg" />
                    <div className="sk-l" style={{ width: "70%", height: 16 }} />
                    <div className="sk-l" style={{ width: "50%" }} />
                    <div className="sk-l" style={{ width: "60%", marginBottom: 12 }} />
                  </div>
                ))}
              </div>
            )}
            {!showSkeleton && results.length > 0 && (
              <div className="grid">
                {visible.map((e, i) => <EventCard key={e.slug} e={e} className="card" delay={`${(Math.min(i, 8) * 0.06).toFixed(2)}s`} />)}
              </div>
            )}
            {isEmpty && (
              <div className="empty">
                <BrandMark size={56} />
                <h3>Nenhum evento encontrado</h3>
                <p>Tente outra data, outra cidade ou uma busca mais ampla. Sempre tem algo acontecendo.</p>
                <button className="btn-p" type="button" onClick={clearAll}>Limpar filtros</button>
              </div>
            )}
          </div>
          {!showSkeleton && hasMore && (
            <div className="xmore">
              <p>Mostrando {visible.length} de {count} eventos</p>
              <button className="btn-g" type="button" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                Ver mais
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" /></svg>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* CATEGORIAS */}
      <section className="sec xcats" id="categorias" aria-labelledby="ct-t" style={{ scrollMarginTop: "72px" }}>
        <div className="wrap">
          <div className="sh rv">
            <div>
              <h2 className="h2" id="ct-t">Explore por categoria</h2>
              <p>Do show de arena à instalação de arte. Escolha o clima da sua próxima saída.</p>
            </div>
          </div>
          <div className="catg">
            {mainCats.map((c, i) => {
              const n = catCounts.get(c.slug) ?? 0;
              const on = filters.cat === c.slug;
              return (
                <button
                  key={c.slug}
                  className={`cat rv${i === 0 ? " big" : ""}${on ? " on" : ""}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`Ver eventos de ${c.name}`}
                  onClick={() => { refilter({ cat: on ? "all" : c.slug }); scrollToResults(); }}
                >
                  <span className="cat-ic" aria-hidden="true"><CatIcon slug={c.slug} /></span>
                  <span className="cat-n">
                    <b>{c.name}</b>
                    <span>{n === 1 ? "1 evento" : `${n} eventos`}</span>
                  </span>
                  <span className="cat-pic" aria-hidden="true"><FlyerArt id={c.coverFlyer ?? "baile"} /></span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
