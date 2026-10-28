"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { saveEvent } from "@/lib/actions/criar";
import { emptyDraft, effTypes, num, type DbMap, type Draft } from "@/lib/criar/model";
import { MapaPane } from "./mapa";
import { DatasPane, FormatoPane, InfoPane, IngressosPane, PublicarPane } from "./panes";
import { brMoney, parseIso, WD, MO, type Ctx } from "./shared";

type Saved = { eventId: string; slug: string; status: "published" | "draft"; unlisted: boolean };
type Props = { initial: Draft | null; defaults?: Partial<Draft>; eventId: string | null; slug: string | null; dbMap: DbMap | null };

const LOCAL_KEY = "onde:criar-evento:novo";
const noopSubscribe = () => () => {};

export function CriarFlow({ initial, defaults, eventId: initialId, slug: initialSlug, dbMap: initialMap }: Props) {
  const { flash } = useToast();
  const [d, setD] = useState<Draft>(() => initial ?? { ...emptyDraft(), ...defaults });
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState<Saved | null>(initialId && initialSlug ? { eventId: initialId, slug: initialSlug, status: "draft", unlisted: false } : null);
  const [dbMap, setDbMap] = useState<DbMap>(initialMap ?? { sessions: {}, types: {} });
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pvSess, setPvSess] = useState(0);
  const [pvOpen, setPvOpen] = useState<Record<string, boolean>>({ [d.sectors[0]?.id ?? "k1"]: true });
  const [localState, setLocalState] = useState<"idle" | "dirty" | "saved">("idle");

  /* rascunho de evento novo guardado neste navegador (volta se fechar a aba) */
  const stored = useSyncExternalStore(noopSubscribe, () => (initialId ? null : readLocal()), () => null);
  const [restored, setRestored] = useState(false);
  if (!restored && stored) {
    setRestored(true);
    try { setD({ ...emptyDraft(), ...(JSON.parse(stored) as Draft) }); } catch { /* rascunho corrompido: ignora */ }
  }
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (initialId || saved) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); setLocalState("saved"); } catch { /* sem armazenamento local */ }
    }, 600);
    return () => clearTimeout(t);
  }, [d, initialId, saved]);

  const set = useCallback((p: Partial<Draft>) => { setD((o) => ({ ...o, ...p })); setLocalState("dirty"); }, []);
  const upd = useCallback((fn: (o: Draft) => Draft) => { setD(fn); setLocalState("dirty"); }, []);
  const go = useCallback((i: number) => { setStep(i); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  const ctx: Ctx = { d, set, upd, flash, go, nid: (p) => p + Math.random().toString(36).slice(2, 9) };

  /* ---------- derivados ---------- */
  const mapMode = d.tmode === "mapa", tour = d.mode === "turne";
  const sessions = useMemo(() => [...d.sessions].sort((a, b) => (a.date < b.date ? -1 : 1)), [d.sessions]);
  const nSess = Math.max(1, sessions.length);
  let totalQty = 0, gross = 0, nTypes = 0;
  for (const k of d.sectors) for (const t of effTypes(k, d.autoMeia)) { nTypes++; totalQty += num(t.qty) * nSess; gross += t.free ? 0 : num(t.qty) * num(t.price) * nSess; }
  const net = d.fee ? gross : gross * 0.9;
  const catName = d.cat === "Outros" ? d.catOther || "Outros" : d.cat;
  const cities = sessions.map((x) => x.city).filter((c, i, a) => c && a.indexOf(c) === i);
  const labels = ["Formato", "Informações", tour ? "Datas e cidades" : "Datas e local", mapMode ? "Setores e ingressos" : "Ingressos", "Mapa 3D", "Publicar"];
  const subs = [
    `${{ unica: "Data única", temporada: "Várias datas", turne: "Turnê" }[d.mode]} · ${mapMode ? "com mapa" : "sem mapa"}`,
    d.title ? `${catName} · ${d.age}` : "Falta o nome",
    `${sessions.length} ${sessions.length === 1 ? "data" : "datas"}${tour ? ` · ${cities.length} cidades` : ""}`,
    `${mapMode ? `${d.sectors.length} setores · ` : ""}${nTypes} tipos`,
    !mapMode ? "Não usado" : d.map === "done" ? "Pronto" : "Gerar com IA",
    published ? (saved?.status === "draft" ? "Rascunho" : "Publicado") : "Revisar",
  ];
  const doneFlags = [true, !!d.title, sessions.length > 0, nTypes > 0, d.map === "done" || !mapMode, published];
  const doneCount = doneFlags.filter(Boolean).length;
  const last = step === 5;

  async function publish() {
    if (!d.title.trim()) { flash("Dê um nome ao evento antes de publicar."); go(1); return; }
    if (!sessions.length && d.vis !== "rascunho") { flash("Adicione pelo menos uma data."); go(2); return; }
    setBusy(true);
    const r = await saveEvent({ draft: d, eventId: saved?.eventId ?? null, dbMap });
    setBusy(false);
    if (!r.ok) { flash(r.error); if (r.step != null) go(r.step); return; }
    setSaved({ eventId: r.eventId, slug: r.slug, status: r.status, unlisted: r.unlisted });
    setDbMap(r.dbMap);
    setPublished(true);
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ok */ }
    window.history.replaceState(null, "", `/criar-evento?editar=${r.eventId}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------- prévia do comprador ---------- */
  const pvS = sessions[pvSess] ?? sessions[0];
  const whereTxt = pvS ? (() => { const dt = parseIso(pvS.date); return `${WD[dt.getDay()]}, ${dt.getDate()} ${MO[dt.getMonth()]} · ${pvS.time} · ${(tour ? pvS.venue : d.venue.name) || "Local"}`; })() : "Sem data definida";

  if (published && saved) {
    const url = `${typeof window === "undefined" ? "" : window.location.host}/eventos/${saved.slug}`;
    const isDraft = saved.status === "draft";
    return (
      <main className="wrap ce">
        <div className="pub">
          <span className="pub-ok" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          <h1 className="pub-h">{isDraft ? "Rascunho salvo" : "Evento publicado!"}</h1>
          <p className="pub-p">
            {isDraft ? "Só você vê este evento. Publique quando estiver pronto."
              : saved.unlisted ? "Seu evento está no ar, visível só para quem tiver o link."
                : `Seu evento está no ar e já aparece na busca.${d.saleStart.trim() ? ` As vendas abrem em ${d.saleStart}.` : " As vendas já estão abertas."}`}
          </p>
          <div className="pub-link">
            <span className="pl-v">{url}</span>
            <button className="b-pri sm" type="button" onClick={() => { navigator.clipboard?.writeText(`https://${url}`).catch(() => {}); flash("Link copiado"); }}>Copiar link</button>
          </div>
          <div className="pub-a">
            <Link className="b-sec" href={`/eventos/${saved.slug}`}>{isDraft ? "Ver prévia do evento" : "Ver página do evento"}</Link>
            <button className="b-ghost" type="button" onClick={() => setPublished(false)}>Continuar editando</button>
          </div>
          <div className="pub-s">
            <div className="er"><span className="er-k">Datas</span><b className="er-v">{sessions.length}</b></div>
            <div className="er"><span className="er-k">Setores</span><b className="er-v">{d.sectors.length}</b></div>
            <div className="er"><span className="er-k">Ingressos à venda</span><b className="er-v">{totalQty.toLocaleString("pt-BR")}</b></div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap ce">
      <div className="ce-top">
        <div>
          <span className="ce-k">Tickets Win para produtores</span>
          <h1 className="ce-h">{d.title || "Novo evento"}</h1>
        </div>
        <div className="ce-ta">
          {saved ? (
            <span className="ce-save"><span className="sv-dot" aria-hidden="true" />{saved.status === "draft" ? "Rascunho na sua conta" : "Publicado · alterações só valem ao salvar"}</span>
          ) : localState === "saved" ? (
            <span className="ce-save"><span className="sv-dot" aria-hidden="true" />Rascunho salvo neste navegador</span>
          ) : null}
          {saved ? (
            <Link className="b-sec" href={`/eventos/${saved.slug}`}>Ver como comprador</Link>
          ) : (
            <button className="b-sec" type="button" onClick={() => flash("A prévia ao lado mostra o que o comprador vê.")}>Ver como comprador</button>
          )}
        </div>
      </div>

      <div className="ce-g">
        <nav className="ce-nav" aria-label="Etapas">
          {labels.map((l, i) => {
            const cls = i === step ? "nv cur" : doneFlags[i] && i < step ? "nv ok" : "nv";
            return (
              <button key={l} className={cls} type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
                <span className="nv-n">{i + 1}</span>
                <span className="nv-i"><b className="nv-t">{l}</b><span className="nv-s">{subs[i]}</span></span>
              </button>
            );
          })}
          <div className="nv-prog"><span className="nv-bar"><i style={{ width: `${Math.round((doneCount / 6) * 100)}%` }} /></span><span className="nv-p">{doneCount} de 6 etapas prontas</span></div>
        </nav>

        <section className="ce-main">
          {step === 0 && <FormatoPane c={ctx} />}
          {step === 1 && <InfoPane c={ctx} sessions={sessions} />}
          {step === 2 && <DatasPane c={ctx} sessions={sessions} onSessionsChange={() => setPvSess(0)} />}
          {step === 3 && <IngressosPane c={ctx} sessions={sessions} />}
          {step === 4 && <MapaPane c={ctx} />}
          {step === 5 && (
            <PublicarPane c={ctx} sessions={sessions} nTypes={nTypes} totalQty={totalQty} gross={gross} net={net} subs={subs} />
          )}

          <div className="ce-foot">
            {step > 0 && <button className="b-ghost" type="button" onClick={() => go(step - 1)}>Voltar</button>}
            <span className="cf-sp" />
            <button className="b-pri" type="button" disabled={busy} onClick={() => (last ? void publish() : go(step + 1))}>
              {busy ? "Salvando…" : last ? (d.vis === "rascunho" ? "Salvar rascunho" : saved?.status === "published" ? "Salvar alterações" : "Publicar evento") : "Continuar"}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
            </button>
          </div>
        </section>

        <aside className="ce-pv" aria-label="Prévia para o comprador">
          <div className="pv">
            <span className="pv-k">Como o comprador vê</span>
            <div className="pv-ev">
              <div className="pv-art"><FlyerArt id={d.media.poster ?? "none"} /></div>
              <div className="pv-ei"><b className="pv-t">{d.title || "Novo evento"}</b><span className="pv-d">{whereTxt}</span></div>
            </div>
            {sessions.length > 1 && (
              <>
                <span className="pv-l">Escolha a data</span>
                <div className="pv-dates">
                  {sessions.map((x, i) => {
                    const dt = parseIso(x.date);
                    return (
                      <button key={x.id} className={i === pvSess ? "pd on" : "pd"} type="button" onClick={() => setPvSess(i)}>
                        <span className="pd-w">{WD[dt.getDay()]}</span><b className="pd-d">{dt.getDate()} {MO[dt.getMonth()]}</b>
                        <span className="pd-c">{tour ? (x.city || "Cidade").split(/\s[–-]/)[0] : x.time}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <span className="pv-l">Ingressos</span>
            <div className="acc">
              {d.sectors.map((k) => {
                const types = effTypes(k, d.autoMeia);
                const prices = types.flatMap((t) => (t.free ? [0] : num(t.price) > 0 ? [num(t.price)] : []));
                const open = !!pvOpen[k.id];
                return (
                  <div key={k.id} className={open ? "ac open" : "ac"}>
                    <button className="acc-h" type="button" onClick={() => setPvOpen((o) => ({ ...o, [k.id]: !o[k.id] }))} aria-expanded={open}>
                      <span className="acc-sw" style={{ background: k.color }} aria-hidden="true" />
                      <b className="acc-t">{k.name}</b>
                      <span className="acc-from">{prices.length ? (Math.min(...prices) === 0 ? "Grátis" : `a partir de ${brMoney(Math.min(...prices))}`) : ""}</span>
                      <span className="acc-c" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg></span>
                    </button>
                    {open && (
                      <div className="acc-b">
                        {types.map((t) => (
                          <div key={t.id} className="acc-ty">
                            <b className="at-n">{t.name}</b>
                            {t.desc && <span className="at-d">{t.desc}</span>}
                            <div className="at-r">
                              <span className="at-p">{t.free ? "Grátis" : brMoney(num(t.price))}<span className="at-tx">{d.fee && !t.free ? "+ taxas" : ""}</span></span>
                              <span className="at-q"><span className="at-v">0</span><span className="at-plus" aria-hidden="true">+</span></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function readLocal() {
  try { return localStorage.getItem(LOCAL_KEY); } catch { return null; }
}

