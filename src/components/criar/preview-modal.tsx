"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BannerArt } from "@/components/art/banner";
import { useNowSec } from "@/components/evento/countdown";
import { LaunchScreen } from "@/components/evento/launch-screen";
import { MapStage, VIEW_3D, type MapView } from "@/components/mapa3d";
import { KIND_COLOR } from "@/lib/criar/plan";
import { eventSlug, type Draft } from "@/lib/criar/model";
import type { Derived } from "./flow";
import { Phone, priceTxt, pvInfo } from "./preview";

type Tab = "pagina" | "contagem";
type Device = "desktop" | "celular";

/** Prévia em tamanho real: a página do evento (ou a tela antes da abertura) no computador ou no celular. */
export function PreviewModal({ d, x, onClose, start = "pagina" }: { d: Draft; x: Derived; onClose: () => void; start?: Tab }) {
  const nowSec = useNowSec();
  const v = pvInfo(d, x, nowSec);
  const [tab, setTab] = useState<Tab>(start === "contagem" && v.teaser ? "contagem" : "pagina");
  const [dev, setDev] = useState<Device>("desktop");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = o; };
  }, [onClose]);

  return createPortal(
    <div className="pg-criar">
      <div className="cv-pm" role="dialog" aria-modal="true" aria-label="Prévia do evento" onClick={onClose}>
        <div className="cv-pm-bar" onClick={(e) => e.stopPropagation()}>
          <div className="cv-seg sm dark">
            <button className={tab === "pagina" ? "sg on" : "sg"} type="button" onClick={() => setTab("pagina")}>Página do evento</button>
            <button className={tab === "contagem" ? "sg on" : "sg"} type="button" onClick={() => setTab("contagem")} disabled={!v.teaser} title={v.teaser ? undefined : "Marque uma data de abertura na etapa Vendas"}>Antes da abertura</button>
          </div>
          <div className="cv-seg sm dark">
            <button className={dev === "desktop" ? "sg on" : "sg"} type="button" onClick={() => setDev("desktop")} aria-label="Computador"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg></button>
            <button className={dev === "celular" ? "sg on" : "sg"} type="button" onClick={() => setDev("celular")} aria-label="Celular"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg></button>
          </div>
          <button className="cv-pm-x" type="button" onClick={onClose} aria-label="Fechar prévia">×</button>
        </div>
        <div className={`cv-pm-stage ${dev}`} onClick={(e) => e.stopPropagation()}>
          {dev === "celular" ? (
            <Phone d={d} x={x} lf={{ f: null, tick: 0 }} teaser={tab === "contagem"} />
          ) : (
            <div className="cv-br">
              <div className="cv-br-top"><i /><i /><i /><span>ticketswin.com.br/eventos/{eventSlug(d.title || "meu-evento")}</span></div>
              <div className="cv-br-sc" key={tab}>
                {tab === "contagem" && v.teaser ? <LaunchScreen preview phone={false} x={v.teaser} /> : <PageMock d={d} x={x} />}
              </div>
            </div>
          )}
        </div>
        <span className="cv-pm-h">Prévia · nada é publicado até você salvar · Esc para fechar</span>
      </div>
    </div>,
    document.body,
  );
}

/** A página do evento no computador, montada com o que já foi preenchido. */
function PageMock({ d, x }: { d: Draft; x: Derived }) {
  const nowSec = useNowSec();
  const v = pvInfo(d, x, nowSec);
  const [view, setView] = useState<MapView>(VIEW_3D);
  const [sel, setSel] = useState<string | null>(null);
  const plan = d.tmode === "mapa" && d.map === "done" ? d.plan : null;
  const secById = new Map(d.sectors.map((k) => [k.id, k]));
  const paragraphs = d.desc.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="cv-pg">
      <div className="cv-pg-hero">{d.media.banner || d.media.poster ? <BannerArt id={(d.media.banner ?? d.media.poster)!} fit="fill" poster={!d.media.banner} /> : <span className="ph">O banner do evento entra aqui</span>}</div>
      <div className="cv-pg-g">
        <div className="l">
          <div className="tags"><span>{v.cat}</span><span className="dk">{d.age}</span></div>
          <h1>{v.title}</h1>
          <div className="rows">
            <div><i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /></svg></i><span><b>{v.when}</b><small>{v.time}</small></span></div>
            <div><i><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg></i><span><b>{v.venue}</b><small>{v.city}</small></span></div>
          </div>
          <h2>Sobre o evento</h2>
          {paragraphs.length ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="mute">A descrição do evento aparece aqui.</p>}
          {d.lineup.length > 0 && (
            <>
              <h2>Line-up</h2>
              <div className="lu">{d.lineup.map((a) => <span key={a.id}><b>{a.name}</b>{a.time && <small>{a.time}</small>}</span>)}</div>
            </>
          )}
          {plan && (
            <>
              <h2>Mapa do local</h2>
              <div className="m3 m3w">
                <MapStage plan={plan} sel={sel} onPick={setSel} view={view} setView={setView}
                  look={(a) => {
                    if (a.kind !== "setor") return { name: a.name, color: a.color ?? KIND_COLOR[a.kind] };
                    const k = a.sector ? secById.get(a.sector) : undefined;
                    return { name: k?.name || a.name, color: k?.color ?? "#B9B2A4" };
                  }} />
              </div>
            </>
          )}
          <h2>O que você deve saber</h2>
          <div className="pgx-info">
            <div><b>Classificação</b><span>{d.age}{d.minors && d.age !== "Livre" && d.age !== "18+" ? " · menores acompanhados" : ""}</span></div>
            <div><b>Abertura dos portões</b><span>{v.s0 ? v.s0.doors : "A confirmar"}</span></div>
            <div><b>Cancelamento</b><span>Regra de Cancelamentos e reembolsos do painel{d.refund.trim() ? ` · Observação do produtor: ${d.refund.trim()}` : ""}</span></div>
            <div><b>Ingresso</b><span>Digital, com QR code{d.transfer ? " · transferível" : ""}</span></div>
          </div>
        </div>
        <aside className="pgx-r">
          <div className="pgx-tk">
            <div className="tk-h"><b>Ingressos</b>{v.minP !== null && <small>{v.minP === 0 ? "Tem ingresso grátis" : `a partir de R$ ${v.minP.toLocaleString("pt-BR")}`}</small>}</div>
            {v.secs.map(({ k, types, from }) => (
              <div key={k.id} className="tk-s">
                {v.grouped && <div className="tk-sh"><i style={{ background: k.color }} /><b>{k.name}</b><small>{from === null ? "" : from === 0 ? "Grátis" : `a partir de R$ ${from.toLocaleString("pt-BR")}`}</small></div>}
                {types.map((t) => (
                  <div key={t.id} className="tk-t">
                    <span><b>{t.name}</b>{t.desc && <small>{t.desc}</small>}<em>{priceTxt(d, t)}</em></span>
                    <span className="pgx-q"><i>−</i>0<i className="p">+</i></span>
                  </div>
                ))}
              </div>
            ))}
            <div className="tk-go">{v.teaser ? "Me avise na abertura" : "Continuar para pagamento"}</div>
          </div>
        </aside>
      </div>
    </div>
  );
}
