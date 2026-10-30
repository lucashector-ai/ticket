"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { useToast } from "@/components/toast";
import { saveEvent } from "@/lib/actions/criar";
import { effTypes, emptyDraft, num, parseBrDateTime, parseCity, STEP_LABELS, toCents, type DbMap, type Draft } from "@/lib/criar/model";
import { Phone } from "./preview";
import { PreviewModal } from "./preview-modal";
import { InfoStep, OndeStep, QuandoStep, TipoStep } from "./steps";
import { ArtesStep, IngressosStep, MapaStep, RevisarStep, VendasStep } from "./steps-tk";
import { type Ctx, type PvField } from "./shared";

type Saved = { eventId: string; slug: string; status: "published" | "draft"; unlisted: boolean };
type Props = { initial: Draft | null; defaults?: Partial<Draft>; eventId: string | null; slug: string | null; dbMap: DbMap | null; startStep?: number };

const LOCAL_KEY = "onde:criar-evento:novo";
const noopSubscribe = () => () => {};
const REVIEW = STEP_LABELS.length;

/** Derivados do formulário usados pelas etapas, pela prévia e pela revisão. */
export function derive(d: Draft) {
  const sessions = [...d.sessions].sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1));
  const nSess = Math.max(1, sessions.length);
  let totalQty = 0, gross = 0, nTypes = 0, priced = true;
  for (const k of d.sectors) for (const t of effTypes(k, d.autoMeia)) {
    nTypes++;
    totalQty += num(t.qty) * nSess;
    gross += t.free ? 0 : num(t.qty) * num(t.price) * nSess;
    if ((!t.free && toCents(t.price) <= 0) || num(t.qty) <= 0 || !t.name.trim()) priced = false;
  }
  const tour = d.mode === "turne";
  const placeOk = tour ? sessions.length > 0 && sessions.every((s) => s.venue.trim() && parseCity(s.city)) : !!d.venue.name.trim() && !!parseCity(d.venue.city);
  const saleOk = !d.saleStart.trim() || !!parseBrDateTime(d.saleStart);
  const ok = [
    !!d.cat, d.title.trim().length >= 2, sessions.length > 0, placeOk,
    d.tmode !== "mapa" || (d.map === "done" && !!d.plan), nTypes > 0 && priced,
    !!d.media.poster, saleOk && (d.teaser.theme !== "foto" || !!d.teaser.image),
  ];
  return { sessions, totalQty, gross, net: d.fee ? gross : gross * 0.9, nTypes, ok, tour };
}
export type Derived = ReturnType<typeof derive>;

export function CriarFlow({ initial, defaults, eventId: initialId, slug: initialSlug, dbMap: initialMap, startStep = 0 }: Props) {
  const { flash } = useToast();
  const [d, setD] = useState<Draft>(() => initial ?? { ...emptyDraft(), ...defaults });
  const [step, setStep] = useState(startStep);
  const [saved, setSaved] = useState<Saved | null>(initialId && initialSlug ? { eventId: initialId, slug: initialSlug, status: "draft", unlisted: false } : null);
  const [dbMap, setDbMap] = useState<DbMap>(initialMap ?? { sessions: {}, types: {} });
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [lf, setLf] = useState<{ f: PvField | null; tick: number }>({ f: null, tick: 0 });
  const [localState, setLocalState] = useState<"idle" | "dirty" | "saved">("idle");
  const [pm, setPm] = useState<null | "pagina" | "contagem">(null);

  /* rascunho de evento novo guardado neste navegador (volta se fechar a aba) */
  const stored = useSyncExternalStore(noopSubscribe, () => (initialId ? null : readLocal()), () => null);
  const [restored, setRestored] = useState(false);
  if (!restored && stored) {
    setRestored(true);
    try { const base = emptyDraft(); const s = JSON.parse(stored) as Draft; setD({ ...base, ...s, teaser: { ...base.teaser, ...s.teaser } }); } catch { /* rascunho corrompido: ignora */ }
  }
  // celular/tablet: a etapa atual sempre à vista na faixa de etapas (que rola de lado)
  const stepsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = stepsRef.current, cur = nav?.querySelector<HTMLElement>(".cv-sb.cur");
    if (!nav || !cur || nav.scrollWidth <= nav.clientWidth) return;
    const a = nav.getBoundingClientRect(), r = cur.getBoundingClientRect();
    nav.scrollBy({ left: r.left - a.left - (a.width - r.width) / 2, behavior: "smooth" });
  }, [step]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (initialId || saved) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); setLocalState("saved"); } catch { /* sem armazenamento local */ }
    }, 600);
    return () => clearTimeout(t);
  }, [d, initialId, saved]);

  const mark = useCallback((f?: PvField) => { if (f) setLf((o) => ({ f, tick: o.tick + 1 })); setLocalState("dirty"); }, []);
  const set = useCallback((p: Partial<Draft>, f?: PvField) => { setD((o) => ({ ...o, ...p })); mark(f); }, [mark]);
  const upd = useCallback((fn: (o: Draft) => Draft, f?: PvField) => { setD(fn); mark(f); }, [mark]);
  const go = useCallback((i: number) => { setStep(i); setPublished(false); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  const ctx: Ctx = { d, set, upd, flash, go, nid: (p) => p + Math.random().toString(36).slice(2, 9) };
  const x = useMemo(() => derive(d), [d]);

  async function publish() {
    if (!d.title.trim()) { flash("Dê um nome ao evento antes de publicar."); go(1); return; }
    setBusy(true);
    const r = await saveEvent({ draft: d, eventId: saved?.eventId ?? null, dbMap });
    setBusy(false);
    if (!r.ok) { flash(r.error); if (r.step != null) go(r.step); return; }
    setSaved({ eventId: r.eventId, slug: r.slug, status: r.status, unlisted: r.unlisted });
    setDbMap(r.dbMap);
    setPublished(true);
    if (r.status === "published") { setConfetti(true); setTimeout(() => setConfetti(false), 3600); }
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ok */ }
    window.history.replaceState(null, "", `/criar-evento?editar=${r.eventId}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const next = () => {
    if (busy) return;
    if (step === REVIEW) { void publish(); return; }
    if (step < 2 && !x.ok[step]) {
      flash(step === 0 ? "Escolha o tipo do evento." : "Dê um nome ao evento.");
      // leva direto ao que falta (o aviso some sozinho; o foco fica)
      document.querySelector<HTMLElement>(step === 0 ? ".cv-l button" : '.cv-l input[aria-label="Nome do evento"]')?.focus();
      return;
    }
    go(step + 1);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key !== "Enter" || published || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.closest(".cv-noenter")) return;
    e.preventDefault();
    next();
  };

  const pct = published ? 100 : Math.round((Math.min(step, REVIEW) / REVIEW) * 100);
  const status = saved ? (saved.status === "published" ? "Publicado" : "Rascunho na sua conta") : localState === "saved" ? "Rascunho salvo neste navegador" : "Rascunho";
  const goLabel = step === REVIEW ? (d.vis === "rascunho" ? "Salvar rascunho" : saved?.status === "published" ? "Salvar alterações" : "Publicar evento") : step === REVIEW - 1 ? "Revisar" : "Continuar";
  const stepView = [
    <TipoStep key={0} c={ctx} />, <InfoStep key={1} c={ctx} x={x} />, <QuandoStep key={2} c={ctx} x={x} />, <OndeStep key={3} c={ctx} x={x} />,
    <MapaStep key={4} c={ctx} />, <IngressosStep key={5} c={ctx} x={x} />, <ArtesStep key={6} c={ctx} />, <VendasStep key={7} c={ctx} />,
    <RevisarStep key={8} c={ctx} x={x} />,
  ][step];

  return (
    <div className="cv" onKeyDown={onKey}>
      <header className="cv-top">
        <Link href="/" aria-label="Tickets Win: início" className="cv-logo"><BrandLogo height={24} /></Link>
        <span className="cv-save"><i aria-hidden="true" />{status}</span>
        <nav className="cv-steps" aria-label="Etapas" ref={stepsRef}>
          {STEP_LABELS.map((l, i) => {
            const cur = !published && step === i, done = x.ok[i] && (i < step || published);
            return (
              <button key={l} className={cur ? "cv-sb cur" : done ? "cv-sb ok" : "cv-sb"} type="button" onClick={() => go(i)} aria-current={cur ? "step" : undefined}
                aria-label={`${i + 1}. ${l}${done ? " (concluída)" : ""}`}>
                <span className="n">{done ? <Check size={12} /> : i + 1}</span><span className="l">{l}</span>
              </button>
            );
          })}
        </nav>
        <div className="cv-x">
          <button className="cv-gh pv" type="button" onClick={() => setPm(step === 7 && d.saleStart.trim() ? "contagem" : "pagina")}><Eye />Ver prévia</button>
          <Link className="cv-gh" href="/painel">Sair</Link>
        </div>
      </header>
      <div className="cv-prog" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>

      <div className="cv-grid">
        <main className="cv-l">
          {published && saved ? <Done saved={saved} d={d} flash={flash} onEdit={() => go(REVIEW)} /> : stepView}
        </main>
        <aside className="cv-r" aria-label="Prévia da página do evento">
          <div className="cv-sticky">
            <span className="cv-pvk"><i aria-hidden="true" />{step === 7 && d.saleStart.trim() && !published ? "Prévia ao vivo · tela antes da abertura" : "Prévia ao vivo · como o público vai ver"}</span>
            <Phone d={d} x={x} lf={lf} teaser={step === 7 && !published} />
            <button className="cv-pvo" type="button" onClick={() => setPm(step === 7 && d.saleStart.trim() ? "contagem" : "pagina")}><Eye />Abrir em tamanho real</button>
          </div>
        </aside>
      </div>

      {!published && (
        <div className="cv-act">
          {step > 0 && <button className="cv-bk" type="button" onClick={() => go(step - 1)}>← Voltar</button>}
          <button className={step === REVIEW ? "cv-go pub" : step < 2 && !x.ok[step] ? "cv-go dis" : "cv-go"} type="button" onClick={next} disabled={busy}>
            {busy ? "Salvando…" : goLabel}
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
          </button>
          <span className="cv-kb">ou aperte <b>Enter ↵</b></span>
          <button className="cv-pvm" type="button" onClick={() => setPm(step === 7 && d.saleStart.trim() ? "contagem" : "pagina")} aria-label="Ver prévia"><Eye /></button>
          {step < REVIEW && <button className="cv-adv" type="button" onClick={() => go(REVIEW)}>Ir para a revisão</button>}
        </div>
      )}

      {pm && <PreviewModal d={d} x={x} start={pm} onClose={() => setPm(null)} />}

      {confetti && (
        <div className="cv-cf" aria-hidden="true">
          {Array.from({ length: 56 }, (_, c) => (
            <i key={c} style={{ left: `${(c * 37) % 100}%`, background: ["#D3F55B", "#111111", "#FF5B1F", "#2C55F5", "#FF4FD8"][c % 5], animationDelay: `${(c * 53) % 700}ms`, ["--dx" as string]: `${((c * 71) % 160) - 80}px`, ["--r" as string]: `${((c * 97) % 720) - 360}deg` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Done({ saved, d, flash, onEdit }: { saved: Saved; d: Draft; flash: (m: string) => void; onEdit: () => void }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const url = `${origin}/eventos/${saved.slug}`;
  const draft = saved.status === "draft";
  const copy = async () => { try { await navigator.clipboard.writeText(url); flash("Link copiado"); } catch { flash("Não foi possível copiar."); } };
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: d.title, url }); return; } } catch { return; }
    await copy();
  };
  return (
    <section className="cv-done">
      <span className="cv-bd" aria-hidden="true"><Check size={44} /></span>
      <h1 className="cv-q" style={{ marginTop: 28 }}>{draft ? "Rascunho salvo" : "Seu evento está no ar!"}</h1>
      <p className="cv-s">
        {draft ? "Só você vê este evento. Publique quando estiver pronto."
          : `Publicamos ${d.title}.${saved.unlisted ? " Ele fica fora da busca: só entra quem tiver o link." : ""}${d.saleStart.trim() ? ` A página mostra a contagem até as vendas abrirem (${d.saleStart}).` : " A página já pode receber vendas."}`}
      </p>
      <div className="cv-lk"><span>{url.replace(/^https?:\/\//, "")}</span><button type="button" onClick={() => void copy()}>Copiar link</button></div>
      <div className="cv-nx">
        <Link href={`/eventos/${saved.slug}`} target="_blank"><span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg></span>{draft ? "Ver prévia" : "Ver página do evento"}</Link>
        <button type="button" onClick={() => void share()}><span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13" /></svg></span>Compartilhar</button>
        <Link href={`/painel/evento/${saved.eventId}`}><span className="ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round"><path d="M4 19V10M10 19V5M16 19v-6M22 19H2" /></svg></span>Acompanhar vendas</Link>
      </div>
      <button className="cv-lnk" type="button" onClick={onEdit}>Continuar editando</button>
    </section>
  );
}

function Eye() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export function Check({ size = 14, color = "currentColor" }: { size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}

function readLocal() {
  try { return localStorage.getItem(LOCAL_KEY); } catch { return null; }
}
