"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

/*
 * Acessibilidade da Tickets Win: aba escondida no canto esquerdo (abre com clique ou Alt+A).
 * Cada opção liga uma classe no <html> (estilos em styles/a11y.css) e fica salva neste aparelho.
 * Libras usa o VLibras (governo federal), carregado só quando a pessoa liga.
 */

type Prefs = { zoom: 0 | 1 | 2; contrast: boolean; gray: boolean; links: boolean; font: boolean; spacing: boolean; still: boolean; cursor: boolean; guide: boolean };
const EMPTY: Prefs = { zoom: 0, contrast: false, gray: false, links: false, font: false, spacing: false, still: false, cursor: false, guide: false };
const KEY = "tw:a11y";
const CLS: Record<Exclude<keyof Prefs, "zoom">, string> = { contrast: "a11y-contrast", gray: "a11y-gray", links: "a11y-links", font: "a11y-font", spacing: "a11y-space", still: "a11y-still", cursor: "a11y-cursor", guide: "a11y-guide" };
const HIDE_ON = ["/portaria", "/checkin"];

function parse(raw: string): Prefs {
  try { return { ...EMPTY, ...JSON.parse(raw || "{}") }; } catch { return EMPTY; }
}
const readRaw = () => { try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(KEY, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(KEY, cb); };
};

function apply(p: Prefs) {
  const h = document.documentElement;
  h.classList.toggle("a11y-z1", p.zoom === 1);
  h.classList.toggle("a11y-z2", p.zoom === 2);
  for (const [k, c] of Object.entries(CLS)) h.classList.toggle(c, !!p[k as keyof typeof CLS]);
  if (p.font && !document.getElementById("a11y-font")) {
    const l = Object.assign(document.createElement("link"), { id: "a11y-font", rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap" });
    document.head.appendChild(l);
  }
}

/** VLibras: marcação + script oficial, só na primeira vez que a pessoa liga Libras. */
function openLibras() {
  const w = window as unknown as { VLibras?: { Widget: new (url: string) => unknown } };
  const click = () => document.querySelector<HTMLElement>("[vw-access-button]")?.click();
  if (document.querySelector("[vw]")) { click(); return; }
  const root = document.createElement("div");
  root.setAttribute("vw", ""); root.className = "enabled";
  root.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
  document.body.appendChild(root);
  const s = Object.assign(document.createElement("script"), { src: "https://vlibras.gov.br/app/vlibras-plugin.js", async: true });
  s.onload = () => {
    if (!w.VLibras) return;
    new w.VLibras.Widget("https://vlibras.gov.br/app");
    // o VLibras só começa no "load" da página, que já passou
    window.dispatchEvent(new Event("load"));
    setTimeout(click, 1200);
  };
  document.body.appendChild(s);
}

/** Lê em voz alta o texto selecionado ou o conteúdo principal da página. */
function speak(onEnd: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  const sel = window.getSelection()?.toString().trim();
  const main = document.querySelector("main") ?? document.body;
  const text = sel || Array.from(main.querySelectorAll("h1,h2,h3,p,li,dd,blockquote")).map((e) => (e as HTMLElement).innerText.trim()).filter(Boolean).join(". ").slice(0, 6000);
  if (!text) return false;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "pt-BR";
  u.rate = 1;
  const v = synth.getVoices().find((x) => x.lang?.toLowerCase().startsWith("pt"));
  if (v) u.voice = v;
  u.onend = onEnd; u.onerror = onEnd;
  synth.speak(u);
  return true;
}

const I = {
  person: <><circle cx="12" cy="4.5" r="1.8" /><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3 6M12 14.5l3 6" /></>,
  text: <><path d="M4 7V5h10v2M9 5v14M7 19h4" /><path d="M14 12h7M17.5 12v7M16 19h3" /></>,
  contrast: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>,
  gray: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  font: <><path d="M5 19L10 5h1l5 14M7 14h7" /><path d="M17 19v-6a2 2 0 0 1 4 0v6M17 16h4" /></>,
  space: <><path d="M4 6h16M4 12h16M4 18h16" /><path d="M2 4v16M22 4v16" /></>,
  still: <><circle cx="12" cy="12" r="8.5" /><path d="M10 9v6M14 9v6" /></>,
  cursor: <path d="M6 3l12 7-5.5 1.5L10 17z" />,
  guide: <><path d="M3 12h18" /><rect x="3" y="9" width="18" height="6" rx="2" /></>,
  speak: <><path d="M4 9v6h4l5 4V5L8 9z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  libras: <><path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V5a1.5 1.5 0 0 1 3 0v5M13 10V6a1.5 1.5 0 0 1 3 0v6" /><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 15.5L4 12a1.5 1.5 0 0 1 2.8-1L8 13" /></>,
};
const Ico = ({ d, size = 20 }: { d: React.ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export function A11yWidget() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const raw = useSyncExternalStore(subscribe, readRaw, () => "");
  const p = useMemo(() => parse(raw), [raw]);
  const [reading, setReading] = useState(false);
  const tab = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const guide = useRef<HTMLDivElement>(null);

  // preferências salvas (neste aparelho) valem desde o primeiro carregamento
  useEffect(() => { apply(p); }, [p]);

  const update = useCallback((patch: Partial<Prefs>) => {
    const n = { ...parse(readRaw()), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* modo privado: vale só até recarregar */ apply(n); }
    window.dispatchEvent(new Event(KEY));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "a" || e.key === "A" || e.code === "KeyA")) { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen((o) => { if (o) tab.current?.focus(); return false; });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>("button")?.focus(); }, [open]);

  // guia de leitura: faixa que acompanha o ponteiro
  useEffect(() => {
    if (!p.guide) return;
    const move = (e: PointerEvent) => { if (guide.current) guide.current.style.transform = `translateY(${e.clientY - 22}px)`; };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [p.guide]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  if (HIDE_ON.some((x) => path?.startsWith(x))) return null;

  const active = p.zoom > 0 || Object.keys(CLS).some((k) => p[k as keyof typeof CLS]);
  const toggles: [Exclude<keyof Prefs, "zoom">, string, React.ReactNode][] = [
    ["contrast", "Alto contraste", I.contrast],
    ["gray", "Tons de cinza", I.gray],
    ["links", "Destacar links e foco", I.link],
    ["font", "Fonte mais legível", I.font],
    ["spacing", "Mais espaço no texto", I.space],
    ["still", "Parar animações", I.still],
    ["cursor", "Cursor grande", I.cursor],
    ["guide", "Guia de leitura", I.guide],
  ];

  return (
    <div className="a11y-root">
      <button
        ref={tab}
        type="button"
        className={`a11y-tab${open ? " open" : ""}${active ? " on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="Acessibilidade (Alt+A)"
      >
        <span className="a11y-ic"><Ico d={I.person} size={22} /></span>
        <span className="a11y-lbl">Acessibilidade <kbd>Alt+A</kbd></span>
      </button>

      {open && (
        <div ref={panel} id="a11y-panel" className="a11y-panel" role="dialog" aria-label="Opções de acessibilidade">
          <div className="a11y-hd">
            <b>Acessibilidade</b>
            <button type="button" className="a11y-x" onClick={() => { setOpen(false); tab.current?.focus(); }} aria-label="Fechar">
              <Ico d={<path d="M6 6l12 12M18 6L6 18" />} size={18} />
            </button>
          </div>

          <div className="a11y-wide">
            <button type="button" className={`a11y-opt${p.zoom ? " on" : ""}`} onClick={() => update({ zoom: ((p.zoom + 1) % 3) as Prefs["zoom"] })} aria-label={`Tamanho do texto: ${["normal", "grande", "maior"][p.zoom]}`}>
              <Ico d={I.text} /><span>Tamanho do texto</span>
              <i className="a11y-steps" aria-hidden="true">{[0, 1, 2].map((n) => <em key={n} className={p.zoom >= n ? "on" : undefined} />)}</i>
            </button>
          </div>

          <div className="a11y-grid">
            {toggles.map(([k, label, icon]) => (
              <button key={k} type="button" className={`a11y-opt${p[k] ? " on" : ""}`} aria-pressed={p[k]} onClick={() => update({ [k]: !p[k] } as Partial<Prefs>)}>
                <Ico d={icon} /><span>{label}</span>
              </button>
            ))}
            <button type="button" className={`a11y-opt${reading ? " on" : ""}`} aria-pressed={reading} onClick={() => {
              if (reading) { window.speechSynthesis?.cancel(); setReading(false); return; }
              if (speak(() => setReading(false))) setReading(true);
            }}>
              <Ico d={I.speak} /><span>{reading ? "Parar leitura" : "Ler em voz alta"}</span>
            </button>
            <button type="button" className="a11y-opt" onClick={() => { openLibras(); setOpen(false); }}>
              <Ico d={I.libras} /><span>Libras (VLibras)</span>
            </button>
          </div>

          <p className="a11y-tip">Dica: selecione um trecho antes de tocar em <b>Ler em voz alta</b> para ouvir só ele.</p>
          <div className="a11y-ft">
            <button type="button" onClick={() => { update(EMPTY); window.speechSynthesis?.cancel(); setReading(false); }} disabled={!active}>Redefinir tudo</button>
            <Link href="/legal/acessibilidade" onClick={() => setOpen(false)}>Sobre a acessibilidade</Link>
          </div>
        </div>
      )}

      {p.guide && <div ref={guide} className="a11y-guide-bar" aria-hidden="true" />}
    </div>
  );
}
