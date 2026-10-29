"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HelpIcon } from "@/lib/help/articles";
import { CatIcon, IcArrow, IcChevron, IcClose } from "./icons";

export type TopicArticle = { slug: string; title: string; summary: string };
export type Topic = { slug: string; title: string; desc: string; icon: HelpIcon; articles: TopicArticle[] };

type Props = { fans: Topic[]; prod: Topic[] };

/** mesma duração da transição de .hp-slot em ajuda.css */
const OPEN_MS = 420;
const HEADER_OFFSET = 96;

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const slotId = (key: string) => `hp-pnl-${key}`;

/**
 * "Escolha um assunto": cartões que abrem, logo abaixo da linha do cartão, uma caixa com todos os artigos
 * do assunto (acordeão). Abre também por âncora (/ajuda#reembolsos), inclusive em hashchange e em links
 * para a própria página.
 */
export function HelpTopics({ fans, prod }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [cols, setCols] = useState(3);
  const grid = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const openRef = useRef<string | null>(null);
  useEffect(() => { openRef.current = open; }, [open]);
  const all = [...fans, ...prod];
  const slugs = all.map((t) => t.slug).join(" ");

  // quantas colunas o grid tem agora (3 / 2 / 1 conforme a largura)
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const read = () => {
      const n = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      setCols((c) => (c === n ? c : n));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardOf = (slug: string) => root.current?.querySelector<HTMLElement>(`[data-topic="${slug}"]`) ?? null;

  /** depois de abrir: garante o cartão e a caixa visíveis (sem esconder o cartão atrás do cabeçalho) */
  const reveal = useCallback((slug: string, mode: "card" | "nearest", delay: number) => {
    window.setTimeout(() => {
      const card = root.current?.querySelector<HTMLElement>(`[data-topic="${slug}"]`);
      const panel = card && document.getElementById(card.getAttribute("aria-controls") ?? "");
      if (!card || !panel) return;
      const behavior: ScrollBehavior = reduced() ? "auto" : "smooth";
      const cTop = card.getBoundingClientRect().top;
      if (mode === "card") {
        window.scrollTo({ top: window.scrollY + cTop - HEADER_OFFSET, behavior });
        return;
      }
      const pBottom = panel.getBoundingClientRect().bottom;
      const over = pBottom - window.innerHeight + 24;
      if (over > 0) window.scrollBy({ top: Math.min(over, cTop - HEADER_OFFSET), behavior });
    }, delay);
  }, []);

  // âncoras: no carregamento, em hashchange/popstate e em cliques em links para /ajuda#assunto nesta página
  useEffect(() => {
    const known = new Set(slugs.split(" "));
    const fromHash = (hash: string) => {
      const s = decodeURIComponent(hash.replace(/^#/, ""));
      return known.has(s) ? s : null;
    };
    const go = (s: string) => {
      window.dispatchEvent(new Event("hp:clear-search"));
      const prev = openRef.current;
      setOpen(s);
      // se outra caixa estava aberta, espera ela fechar para medir a posição certa
      reveal(s, "card", prev && prev !== s && !reduced() ? OPEN_MS : 60);
    };
    const sync = () => {
      const s = fromHash(window.location.hash);
      if (s) go(s);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin !== window.location.origin || u.pathname !== window.location.pathname) return;
      const s = fromHash(u.hash);
      if (!s) return;
      e.preventDefault(); // o Link do Next não navega (nem pula sem animação); a gente cuida
      window.history.pushState(window.history.state, "", u.pathname + u.search + u.hash);
      go(s);
    };
    const t = window.setTimeout(sync, 0);
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    document.addEventListener("click", onClick, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
      document.removeEventListener("click", onClick, true);
    };
  }, [slugs, reveal]);

  const setHash = (s: string | null) => {
    try {
      const u = new URL(window.location.href);
      u.hash = s ?? "";
      window.history.replaceState(window.history.state, "", u.pathname + u.search + (s ? u.hash : ""));
    } catch { /* sem URL: segue sem sincronizar */ }
  };

  const toggle = (s: string) => {
    const next = open === s ? null : s;
    setOpen(next);
    setHash(next);
    if (next) reveal(next, "nearest", reduced() ? 0 : OPEN_MS);
  };

  const close = (focus = true) => {
    const was = open;
    setOpen(null);
    setHash(null);
    if (focus && was) cardOf(was)?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    e.stopPropagation();
    close();
  };

  // linhas do grid: depois do último cartão de cada linha entra uma caixa que ocupa a largura toda
  const rowOf = (i: number) => Math.floor(i / cols);
  const openIdx = fans.findIndex((t) => t.slug === open);
  const items: React.ReactNode[] = [];
  fans.forEach((t, i) => {
    const r = rowOf(i);
    items.push(<Card key={t.slug} topic={t} open={open === t.slug} controls={slotId(`r${r}`)} onToggle={toggle} />);
    if ((i + 1) % cols === 0 || i === fans.length - 1) {
      const cur = openIdx >= 0 && rowOf(openIdx) === r ? fans[openIdx] : null;
      items.push(<Slot key={`slot-${r}`} id={slotId(`r${r}`)} topic={cur} onClose={close} />);
    }
  });

  return (
    <div className="hp-topics-w" ref={root} onKeyDown={onKeyDown}>
      <div className="hp-cats" ref={grid} role="group" aria-label="Assuntos para quem compra">
        {items}
      </div>
      {prod.map((t) => {
        const on = open === t.slug;
        return (
          <div className="hp-prod-w" key={t.slug}>
            <button
              type="button"
              className={on ? "hp-prod on" : "hp-prod"}
              data-topic={t.slug}
              aria-expanded={on}
              aria-controls={slotId(t.slug)}
              onClick={() => toggle(t.slug)}
            >
              <span className="hp-ic"><CatIcon name={t.icon} /></span>
              <span className="hp-prod-t">
                <small>Para produtores</small>
                <b>Produz eventos? Tem uma área só sua.</b>
                <span className="hp-prod-d">{t.desc}</span>
              </span>
              <span className="hp-prod-go">{t.articles.length} artigos <IcChevron /></span>
            </button>
            <Slot id={slotId(t.slug)} topic={on ? t : null} onClose={close} />
          </div>
        );
      })}
    </div>
  );
}

function Card({ topic: t, open, controls, onToggle }: { topic: Topic; open: boolean; controls: string; onToggle: (s: string) => void }) {
  return (
    <button
      type="button"
      className={open ? "hp-cat on" : "hp-cat"}
      data-topic={t.slug}
      aria-expanded={open}
      aria-controls={controls}
      onClick={() => onToggle(t.slug)}
    >
      <span className="hp-ic"><CatIcon name={t.icon} /></span>
      <b>{t.title}</b>
      <span className="hp-cat-d">{t.desc}</span>
      <span className="hp-cat-n">{t.articles.length} artigos <IcChevron /></span>
    </button>
  );
}

/** Caixa sanfonada: anima a altura ao abrir/fechar e ao trocar de assunto na mesma linha. */
function Slot({ id, topic, onClose }: { id: string; topic: Topic | null; onClose: (focus?: boolean) => void }) {
  // mantém o último assunto na tela enquanto a caixa fecha
  const [shown, setShown] = useState<Topic | null>(topic);
  if (topic && topic !== shown) setShown(topic);
  const box = useRef<HTMLDivElement>(null);
  const isOpen = topic !== null;
  const prev = useRef<{ slug: string | null; open: boolean; h: number }>({ slug: null, open: false, h: 0 });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { prev.current.h = el.offsetHeight; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // troca de assunto com a caixa já aberta (mesma linha): anima da altura antiga para a nova
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const p = prev.current;
    const slug = shown?.slug ?? null;
    const to = el.offsetHeight;
    const switched = p.open && isOpen && p.slug !== slug;
    const from = p.h;
    prev.current = { slug, open: isOpen, h: to };
    if (!switched || !from || from === to || reduced() || typeof el.animate !== "function") return;
    el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 380, easing: "cubic-bezier(.22,1,.36,1)" });
  }, [shown, isOpen]);

  const hid = `${id}-t`;
  return (
    <div
      className={isOpen ? "hp-slot on" : "hp-slot"}
      id={id}
      role={isOpen ? "region" : undefined}
      aria-labelledby={isOpen ? hid : undefined}
      inert={!isOpen}
    >
      <div className="hp-slot-in">
        <div className="hp-pnl-w" ref={box}>
          {shown && (
            <div className="hp-pnl" key={shown.slug}>
              <header className="hp-pnl-h">
                <span className="hp-ic sm"><CatIcon name={shown.icon} size={20} /></span>
                <div>
                  <h3 id={hid}>{shown.title}</h3>
                  <p>{shown.desc} <span className="hp-pnl-n">· {shown.articles.length} artigos</span></p>
                </div>
                <button type="button" className="hp-pnl-x" onClick={() => onClose()} aria-label={`Fechar artigos de ${shown.title}`}>
                  <IcClose size={18} />
                </button>
              </header>
              <ul className="hp-pnl-l">
                {shown.articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/ajuda/${a.slug}`}>
                      <b>{a.title}</b>
                      <span>{a.summary}</span>
                      <span className="hp-pnl-a" aria-hidden="true"><IcArrow /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
