"use client";

import { useRef, useState } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { BannerArt } from "@/components/art/banner";
import { SpotifyArtistSearch, SpotifyIcon, type SpotifyHit } from "@/components/spotify-search";
import {
  AGES, CATEGORIES, effTypes, KIND_LABEL, limitOf, MAX_LIMIT, MEIA_DESC, num, PALETTE, ROLES,
  type DraftSector, type DraftSession, type DraftType, type EventMode, type MediaKey, type TicketMode, type TypeKind,
} from "@/lib/criar/model";
import { initials } from "@/lib/format";
import { brMoney, Chevron, isoDate, MO, MONTHS, parseIso, shortMoney, Spark, uploadImage, UploadIcon, WD, XIcon, type Ctx } from "./shared";

/* =========================== 1. FORMATO =========================== */
const MODES: { id: EventMode; title: string; desc: string; example: string; dots: string[] }[] = [
  { id: "unica", title: "Data única", desc: "Um dia, um local. Festa, show, palestra.", example: "Ex.: Baile do Futuro · 31 Out", dots: ["a"] },
  { id: "temporada", title: "Várias datas", desc: "Mesmo local em dias diferentes. O público escolhe a data.", example: "Ex.: Banda X · Qui, Sex e Sáb", dots: ["a", "b", "c"] },
  { id: "turne", title: "Turnê", desc: "Cidades e locais diferentes, cada data com seu endereço.", example: "Ex.: SP, Rio e BH", dots: ["a", "l", "b", "l"] },
];
const TMODES: { id: TicketMode; title: string; desc: string }[] = [
  { id: "mapa", title: "Por setor, com mapa", desc: "Pista, premium, camarote… Cada setor com vários tipos (inteira, meia, social) e mapa 3D do local." },
  { id: "simples", title: "Ingressos simples", desc: "Uma lista de tipos sem mapa. Ideal para festas e eventos menores." },
];

export function FormatoPane({ c }: { c: Ctx }) {
  const { d, upd } = c;
  const pickMode = (m: EventMode) => upd((o) => {
    let ss = o.sessions;
    let venue = o.venue;
    if (m === "unica" && ss.length > 1) ss = [ss[0]];
    if (m === "turne") ss = ss.map((x) => ({ ...x, venue: x.venue || o.venue.name, city: x.city || o.venue.city }));
    else {
      if (!venue.name && ss[0]?.venue) venue = { name: ss[0].venue, city: ss[0].city };
      ss = ss.map((x) => ({ ...x, venue: venue.name, city: venue.city }));
    }
    return { ...o, mode: m, sessions: ss, venue };
  });
  const pickTmode = (m: TicketMode) => upd((o) => {
    if (m === "simples" && o.sectors.length > 1) {
      const all = o.sectors.flatMap((k) => k.types.map((t) => ({ ...t, name: `${k.name} · ${t.name}` })));
      return { ...o, tmode: m, sectors: [{ id: "k1", name: "Ingressos", color: "#D3F55B", open: true, types: all }] };
    }
    return { ...o, tmode: m };
  });
  return (
    <div className="pane">
      <h2 className="ce-ph">Que tipo de evento é?</h2>
      <p className="pp">Isso define como as datas e os locais aparecem para o público. Dá para mudar depois.</p>
      <div className="modes" role="radiogroup" aria-label="Tipo de evento">
        {MODES.map((m) => (
          <button key={m.id} className={d.mode === m.id ? "md on" : "md"} type="button" role="radio" aria-checked={d.mode === m.id} onClick={() => pickMode(m.id)}>
            <span className="md-ill" aria-hidden="true">{m.dots.map((x, i) => <i key={i} className={x} />)}</span>
            <b className="md-t">{m.title}</b>
            <span className="md-s">{m.desc}</span>
            <span className="md-e">{m.example}</span>
          </button>
        ))}
      </div>
      <h3 className="ph3">Como os ingressos são vendidos?</h3>
      <div className="modes two" role="radiogroup" aria-label="Venda de ingressos">
        {TMODES.map((m) => (
          <button key={m.id} className={d.tmode === m.id ? "md on" : "md"} type="button" role="radio" aria-checked={d.tmode === m.id} onClick={() => pickTmode(m.id)}>
            <span className="md-ico" aria-hidden="true">
              {m.id === "mapa"
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" /></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6z" /></svg>}
            </span>
            <b className="md-t">{m.title}</b>
            <span className="md-s">{m.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* =========================== 2. INFORMAÇÕES =========================== */
const MEDIA: { id: MediaKey; title: string; ratio: string; ratioLabel: string; w: number; h: number; req: boolean; usage: string }[] = [
  { id: "poster", title: "Cartaz", ratio: "3 / 4", ratioLabel: "Vertical 3:4", w: 1080, h: 1440, req: true, usage: "Cards da home, busca, Meus ingressos e stories." },
  { id: "banner", title: "Banner do evento", ratio: "16 / 9", ratioLabel: "Horizontal 16:9", w: 1920, h: 1080, req: true, usage: "Topo da página do evento." },
  { id: "home", title: "Destaque na home", ratio: "21 / 9", ratioLabel: "Panorâmico 21:9", w: 2520, h: 1080, req: false, usage: "Carrossel da home quando o evento é destaque. Mantenha textos no centro: as laterais são cortadas no celular." },
  { id: "strip", title: "Faixa promocional", ratio: "5 / 1", ratioLabel: "Faixa 5:1", w: 2400, h: 480, req: false, usage: "Faixa entre as seções da home e nos e-mails." },
  { id: "share", title: "Prévia de link", ratio: "1.91 / 1", ratioLabel: "Link 1,91:1", w: 1200, h: 630, req: false, usage: "Imagem que aparece quando o link é enviado no WhatsApp e nas redes." },
];
const AV_BG = ["#D3F55B", "#7DA2FF", "#FF8AD8", "#FFB547", "#7DF9FF", "#C9B6FF"];

function MediaItem({ c, m }: { c: Ctx; m: (typeof MEDIA)[number] }) {
  const url = c.d.media[m.id];
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const size = `${m.w} × ${m.h}`;
  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const r = await uploadImage(f, { w: m.w, h: m.h, label: m.title });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!r.ok) { c.flash(r.error); return; }
    c.upd((o) => ({ ...o, media: { ...o.media, [m.id]: r.url } }));
    c.flash(`${m.title} enviado: ${f.name}`);
  }
  return (
    <div className={`mi${url ? " ok" : ""}${m.id === "poster" ? " tall" : ""}`}>
      <div className="mi-fr" style={{ aspectRatio: m.ratio }}>
        {url ? (
          <>
            {m.id === "poster"
              ? <div className="mi-in"><FlyerArt id={url} /></div>
              : <div className="mi-bn"><BannerArt id={url} fit="fill" /></div>}
            <span className="mi-ok" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
          </>
        ) : (
          <button className="mi-drop" type="button" disabled={busy} onClick={() => input.current?.click()}>
            <UploadIcon /><span className="mi-dt">{busy ? "Enviando…" : `Enviar ${m.ratioLabel}`}</span><span className="mi-ds">{size} px</span>
          </button>
        )}
        <input ref={input} className="sr" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-label={`Arquivo: ${m.title}`} onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      <div className="mi-i">
        <div className="mi-h"><b className="mi-t">{m.title}</b><span className={m.req ? "rq" : "rq soft"}>{m.req ? "Obrigatório" : "Opcional"}</span></div>
        <span className="mi-s">{m.ratioLabel} · {size} px</span>
        <span className="mi-u">{m.usage}</span>
        {url && (
          <div className="mi-f">
            <span className="mi-fn">{url.split("/").pop()}</span>
            <button className="mi-x" type="button" onClick={() => input.current?.click()} style={{ color: "#111" }}>Trocar</button>
            <button className="mi-x" type="button" onClick={() => c.upd((o) => ({ ...o, media: { ...o.media, [m.id]: undefined } }))}>Remover</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function InfoPane({ c, sessions }: { c: Ctx; sessions: DraftSession[] }) {
  const { d, set, upd } = c;
  const [draftArtist, setDraftArtist] = useState("");
  const mediaDone = MEDIA.filter((m) => d.media[m.id]).length;
  const setArt = (id: string, patch: Partial<(typeof d.lineup)[number]>) => upd((o) => ({ ...o, lineup: o.lineup.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  const addArtist = (name: string, sp?: SpotifyHit) => {
    const v = name.trim();
    if (!v) { c.flash("Digite o nome do artista."); return; }
    if (sp && d.lineup.some((a) => a.spotifyId === sp.id)) { c.flash(`${sp.name} já está no line-up.`); setDraftArtist(""); return; }
    upd((o) => ({ ...o, lineup: [...o.lineup, { id: c.nid("a"), name: v, role: o.lineup.length ? "Convidado" : "Headliner", time: "", end: "", days: null, ...(sp ? { spotifyId: sp.id, image: sp.image } : {}) }] }));
    setDraftArtist("");
  };
  return (
    <div className="pane">
      <h2 className="ce-ph">Informações do evento</h2>
      <p className="pp">O que aparece no topo da página e nos cards da home.</p>
      <div className="mh">
        <div><b className="mh-t">Imagens do evento</b><span className="mh-s">Envie cada formato no tamanho exato. Usamos a imagem como está, sem cortar nem gerar versões. JPG ou PNG, até 10 MB cada.</span></div>
        <span className="mh-c">{mediaDone} de 5 enviadas · 2 obrigatórias</span>
      </div>
      <div className="media">{MEDIA.map((m) => <MediaItem key={m.id} c={c} m={m} />)}</div>
      <div className="fgrid">
        <label className="lf span2"><span className="lf-l">Nome do evento</span><input className="in" type="text" value={d.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: Aurora — Turnê Brasil 2026" /></label>
        <div className="lf span2"><span className="lf-l">Categoria</span>
          <div className="chips">{CATEGORIES.map((x) => <button key={x} className={d.cat === x ? "chip2 on" : "chip2"} type="button" onClick={() => set({ cat: x })}>{x}</button>)}</div>
          {d.cat === "Outros" && <input className="in" type="text" value={d.catOther} maxLength={60} onChange={(e) => set({ catOther: e.target.value })} placeholder="Escreva a categoria. Ex.: Stand-up, Gastronomia, Esporte" aria-label="Outra categoria" />}
        </div>
        <label className="lf span2"><span className="lf-l">Descrição</span><textarea className="in ta" rows={5} value={d.desc} maxLength={6000} onChange={(e) => set({ desc: e.target.value })} placeholder="Conte o que torna esse evento especial." /><span className="lf-h">{d.desc.length} caracteres · aparece em Sobre o evento</span></label>
        <div className="lf span2"><span className="lf-l">Classificação etária</span>
          <div className="chips">{AGES.map((x) => <button key={x} className={d.age === x ? "chip2 on" : "chip2"} type="button" onClick={() => set({ age: x })}>{x}</button>)}</div>
        </div>
        <div className="lf span2">
          <div className="lu-hd"><span className="lf-l">Line-up e horários</span><span className="lf-h">{d.lineup.length} {d.lineup.length === 1 ? "artista" : "artistas"}</span></div>
          <div className="lus">
            {d.lineup.map((a, i) => {
              const ids = sessions.map((x) => x.id);
              return (
                <div key={a.id} className="lur">
                  {a.image
                    ? (
                      <span className="lur-av img" aria-hidden="true">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.image} alt="" />
                        <SpotifyIcon size={14} />
                      </span>
                    )
                    : <span className="lur-av" style={{ background: AV_BG[i % AV_BG.length] }} aria-hidden="true">{initials(a.name) || "?"}</span>}
                  <input className="in lur-n" type="text" value={a.name} onChange={(e) => setArt(a.id, { name: e.target.value, spotifyId: undefined, image: undefined })} placeholder="Nome do artista" aria-label="Nome do artista" title={a.spotifyId ? "Ligado ao Spotify. Mudar o nome desfaz a ligação." : undefined} />
                  <div className="lur-role">{ROLES.map((r) => <button key={r} className={a.role === r ? "rl on" : "rl"} type="button" onClick={() => setArt(a.id, { role: r })}>{r}</button>)}</div>
                  <label className="lur-t"><span className="tl-l2">Início</span><input className="in sm2" type="time" value={a.time} onChange={(e) => setArt(a.id, { time: e.target.value })} aria-label={`Horário de ${a.name}`} /></label>
                  <label className="lur-t"><span className="tl-l2">Fim</span><input className="in sm2" type="time" value={a.end} onChange={(e) => setArt(a.id, { end: e.target.value })} aria-label={`Fim de ${a.name}`} /></label>
                  <button className="ty-x" type="button" onClick={() => upd((o) => ({ ...o, lineup: o.lineup.filter((b) => b.id !== a.id) }))} aria-label={`Remover ${a.name}`}><XIcon /></button>
                  {sessions.length > 1 && (
                    <div className="lur-d">
                      <span className="tl-l2">Toca em</span>
                      <button className={a.days ? "dy" : "dy on"} type="button" onClick={() => setArt(a.id, { days: null })}>Todas as datas</button>
                      {sessions.map((x) => {
                        const dt = parseIso(x.date);
                        const on = !a.days || a.days.includes(x.id);
                        return (
                          <button key={x.id} className={a.days && on ? "dy on" : "dy"} type="button" onClick={() => {
                            let cur = a.days ? [...a.days] : [];
                            if (!a.days) cur = [x.id];
                            else if (cur.includes(x.id)) cur = cur.filter((y) => y !== x.id);
                            else cur.push(x.id);
                            setArt(a.id, { days: !cur.length || cur.length === ids.length ? null : cur });
                          }}>{WD[dt.getDay()]} {dt.getDate()}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="lu-add2">
            <SpotifyArtistSearch value={draftArtist} onChange={setDraftArtist} onPick={(a) => addArtist(a.name, a)} onPlain={(v) => addArtist(v)} placeholder="Busque o artista no Spotify ou digite o nome" />
            <button className="b-sec" type="button" onClick={() => addArtist(draftArtist)}>+ Adicionar artista</button>
          </div>
          <span className="lf-h">Escolha o artista na lista do Spotify: a página dele ganha foto, gêneros, lançamentos e o player. Sem horário definido? Deixe em branco: a página do evento mostra o line-up sem horários.</span>
        </div>
      </div>
    </div>
  );
}

/* =========================== 3. DATAS E LOCAIS =========================== */
export function DatasPane({ c, sessions, onSessionsChange }: { c: Ctx; sessions: DraftSession[]; onSessionsChange: () => void }) {
  const { d, upd } = c;
  const tour = d.mode === "turne", single = d.mode === "unica";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startCal = sessions[0] ? parseIso(sessions[0].date) : today;
  const [cal, setCal] = useState({ y: startCal.getFullYear(), m: startCal.getMonth() });
  const setSess = (id: string, patch: Partial<DraftSession>) => upd((o) => ({ ...o, sessions: o.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const first = new Date(cal.y, cal.m, 1), dim = new Date(cal.y, cal.m + 1, 0).getDate();

  const pickDay = (key: string) => {
    upd((o) => {
      if (o.sessions.some((x) => x.date === key)) return { ...o, sessions: o.sessions.filter((x) => x.date !== key) };
      const base = o.sessions[0] ?? { doors: "19:00", time: "21:00", cap: "500" };
      const nx: DraftSession = { id: c.nid("s"), date: key, doors: base.doors, time: base.time, cap: base.cap, venue: tour ? "" : o.venue.name, city: tour ? "" : o.venue.city };
      return { ...o, sessions: o.mode === "unica" ? [nx] : [...o.sessions, nx] };
    });
    onSessionsChange();
  };
  const addSession = () => upd((o) => {
    const lastD = o.sessions.length ? parseIso(o.sessions.map((x) => x.date).sort().pop()!) : new Date(today);
    lastD.setDate(lastD.getDate() + 7);
    return { ...o, sessions: [...o.sessions, { id: c.nid("s"), date: isoDate(lastD.getFullYear(), lastD.getMonth(), lastD.getDate()), doors: "19:00", time: "21:00", cap: "500", venue: "", city: "" }] };
  });
  return (
    <div className="pane">
      <h2 className="ce-ph">{tour ? "Datas e cidades da turnê" : single ? "Data e local" : "Datas e local"}</h2>
      <p className="pp">{tour ? "Cada data tem seu próprio local e cidade. Toque nos dias do calendário ou adicione datas uma a uma." : single ? "Escolha o dia no calendário e os horários." : "Mesmo local em vários dias. Toque nos dias do calendário para criar cada data; o comprador escolhe a data antes do ingresso."}</p>
      {!tour && (
        <div className="fgrid">
          <label className="lf"><span className="lf-l">Local</span><input className="in" type="text" value={d.venue.name} onChange={(e) => { const v = e.target.value; upd((o) => ({ ...o, venue: { ...o.venue, name: v }, sessions: o.sessions.map((x) => ({ ...x, venue: v })) })); }} placeholder="Ex.: Arena Norte" /></label>
          <label className="lf"><span className="lf-l">Cidade</span><input className="in" type="text" value={d.venue.city} onChange={(e) => { const v = e.target.value; upd((o) => ({ ...o, venue: { ...o.venue, city: v }, sessions: o.sessions.map((x) => ({ ...x, city: v })) })); }} placeholder="Ex.: São Paulo – SP" /></label>
        </div>
      )}
      <div className="calw">
        <div className="cal">
          <div className="cal-h">
            <button className="cal-n" type="button" onClick={() => setCal(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))} aria-label="Mês anterior"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3L5 8l5 5" /></svg></button>
            <b className="cal-t">{MONTHS[cal.m][0].toUpperCase() + MONTHS[cal.m].slice(1)} de {cal.y}</b>
            <button className="cal-n" type="button" onClick={() => setCal(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))} aria-label="Próximo mês"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3l5 5-5 5" /></svg></button>
          </div>
          <div className="cal-w" aria-hidden="true"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div>
          <div className="cal-g">
            {Array.from({ length: first.getDay() }, (_, i) => <span key={`o${i}`} className="cday out" />)}
            {Array.from({ length: dim }, (_, i) => {
              const day = i + 1, key = isoDate(cal.y, cal.m, day), dt = new Date(cal.y, cal.m, day);
              const past = dt < today, has = d.sessions.some((x) => x.date === key);
              const cls = `cday${past ? " past" : ""}${has ? " on" : ""}${dt.getTime() === today.getTime() ? " today" : ""}`;
              return (
                <button key={key} className={cls} type="button" disabled={past} onClick={() => pickDay(key)} aria-label={`${day} de ${MONTHS[cal.m]}`} aria-pressed={has}>
                  <span className="cd-n">{day}</span>{has && tour && <i className="cd-m" />}
                </button>
              );
            })}
          </div>
          <span className="cal-f">{single ? "Data única: escolher outro dia substitui o atual." : "Toque para adicionar ou remover uma data."}</span>
        </div>
        <div className="sess">
          <div className="ss-h"><b className="ss-t">{sessions.length} {sessions.length === 1 ? "data" : "datas"}</b>{tour && <button className="b-sec sm" type="button" onClick={addSession}>+ Adicionar data</button>}</div>
          {!sessions.length && <div className="ss-empty">Toque nos dias do calendário para criar as datas.</div>}
          {sessions.map((x) => {
            const dt = parseIso(x.date);
            const lbl = `${dt.getDate()} ${MO[dt.getMonth()]}`;
            return (
              <div key={x.id} className="ss">
                <div className="ss-d"><span className="ss-wd">{WD[dt.getDay()]}</span><b className="ss-dd">{dt.getDate()}</b><span className="ss-mo">{MO[dt.getMonth()]}</span></div>
                <div className="ss-f">
                  {tour && (
                    <div className="ss-row">
                      <input className="in sm2" type="text" value={x.venue} onChange={(e) => setSess(x.id, { venue: e.target.value })} placeholder="Local" aria-label={`Local da data ${lbl}`} />
                      <input className="in sm2" type="text" value={x.city} onChange={(e) => setSess(x.id, { city: e.target.value })} placeholder="Cidade – UF" aria-label={`Cidade da data ${lbl}`} />
                    </div>
                  )}
                  <div className="ss-row">
                    <label className="tlb"><span className="tl-l">Portões</span><input className="in sm2 t" type="time" value={x.doors} onChange={(e) => setSess(x.id, { doors: e.target.value })} /></label>
                    <label className="tlb"><span className="tl-l">Início</span><input className="in sm2 t" type="time" value={x.time} onChange={(e) => setSess(x.id, { time: e.target.value })} /></label>
                    <label className="tlb"><span className="tl-l">Lotação</span><input className="in sm2 t" type="text" inputMode="numeric" value={x.cap} onChange={(e) => setSess(x.id, { cap: e.target.value.replace(/\D/g, "") })} /></label>
                  </div>
                </div>
                <button className="ss-x" type="button" onClick={() => { upd((o) => ({ ...o, sessions: o.sessions.filter((y) => y.id !== x.id) })); onSessionsChange(); }} aria-label={`Remover data ${lbl}`}><XIcon /></button>
              </div>
            );
          })}
          {sessions.length > 1 && (
            <button className="copyall" type="button" onClick={() => { const f = sessions[0]; upd((o) => ({ ...o, sessions: o.sessions.map((x) => ({ ...x, doors: f.doors, time: f.time, cap: f.cap })) })); c.flash("Horários aplicados em todas as datas"); }}>Aplicar horários da primeira data em todas</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================== 4. SETORES E INGRESSOS =========================== */
const ADD_TYPES: { kind: TypeKind; label: string; name: string; desc: string; free?: boolean; limit: string }[] = [
  { kind: "inteira", label: "Inteira", name: "Inteira", desc: "", limit: "6" },
  { kind: "meia", label: "Meia-entrada", name: "Meia-entrada", desc: MEIA_DESC, limit: "6" },
  { kind: "social", label: "Meia-social", name: "Meia-social", desc: "Meia-entrada solidária: quem compra doa 1 kg de alimento ou parte do valor vai para [instituição].", limit: "6" },
  { kind: "outro", label: "Gratuito", name: "Ingresso gratuito", desc: "", free: true, limit: "2" },
  { kind: "outro", label: "Personalizado", name: "Novo tipo", desc: "", limit: "2" },
];
const MAP_SECTORS = ["Pista", "Pista Premium", "Camarote", "Área VIP", "Arquibancada", "Cadeira numerada"];

function SectorCard({ c, k, multiDates }: { c: Ctx; k: DraftSector; multiDates: boolean }) {
  const { d, upd } = c;
  const setSector = (fn: (z: DraftSector) => DraftSector) => upd((o) => ({ ...o, sectors: o.sectors.map((z) => (z.id === k.id ? fn(z) : z)) }));
  const setType = (tid: string, patch: Partial<DraftType>) => setSector((z) => ({ ...z, types: z.types.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));
  const types = effTypes(k, d.autoMeia);
  let inteira = 0, cap = 0;
  for (const t of types) { cap += num(t.qty); if (t.kind === "inteira" && !t.free) inteira = num(t.price); }
  const ro = () => c.flash("Desligue a meia automática para editar este tipo.");
  return (
    <div className={k.open ? "sc open" : "sc"}>
      <div className="sc-h">
        <span className="sc-sw" style={{ background: k.color }} aria-hidden="true" />
        <input className="sc-name" type="text" value={k.name} maxLength={80} onChange={(e) => setSector((z) => ({ ...z, name: e.target.value }))} aria-label="Nome do setor" />
        <span className="sc-meta">{types.length} {types.length === 1 ? "tipo" : "tipos"} · {cap.toLocaleString("pt-BR")} lugares</span>
        {d.sectors.length > 1 && <button className="ty-x" type="button" onClick={() => upd((o) => ({ ...o, sectors: o.sectors.filter((z) => z.id !== k.id) }))} aria-label={`Remover setor ${k.name}`}><XIcon /></button>}
        <button className="sc-tg" type="button" onClick={() => setSector((z) => ({ ...z, open: !z.open }))} aria-expanded={k.open} aria-label={`Abrir ${k.name}`}><Chevron /></button>
      </div>
      {k.open && (
        <div className="sc-b">
          {types.map((t) => {
            const sug = Math.round(inteira * 0.6), cur = num(t.price), isSoc = t.kind === "social" && inteira > 0 && !t.free, lim = limitOf(t);
            return (
              <div key={t.id} className="ty">
                <div className="ty-r1">
                  <span className={`kd ${t.kind}`}>{KIND_LABEL[t.kind]}</span>
                  <input className="in ty-n" type="text" value={t.name} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { name: e.target.value })} aria-label="Nome do tipo de ingresso" />
                  {t.free
                    ? <button className="ty-pr ty-free" type="button" onClick={() => setType(t.id, { free: false })} title="Clique para cobrar por este ingresso">Grátis</button>
                    : <label className="ty-pr"><span className="ty-cur">R$</span><input className="in ty-p" type="text" inputMode="decimal" value={t.price} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { price: e.target.value.replace(/[^\d,]/g, "") })} aria-label={`Preço de ${t.name}`} placeholder="0" /></label>}
                  <label className="ty-pr"><input className="in ty-q" type="text" inputMode="numeric" value={t.qty} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { qty: e.target.value.replace(/\D/g, "") })} aria-label={`Quantidade de ${t.name}`} /><span className="ty-cur">un.</span></label>
                  <button className="ty-x" type="button" onClick={t.auto ? ro : () => setSector((z) => ({ ...z, types: z.types.filter((u) => u.id !== t.id) }))} aria-label={`Remover ${t.name}`}><XIcon /></button>
                </div>
                <textarea className="in ty-d" rows={2} value={t.desc} readOnly={t.auto} onClick={t.auto ? ro : undefined} onChange={(e) => setType(t.id, { desc: e.target.value })} placeholder="Descrição (opcional): quem pode comprar, o que inclui, documento exigido." />
                <div className="ty-r2">
                  {!t.auto && (
                    <button className={t.free ? "ty-tg on" : "ty-tg"} type="button" role="switch" aria-checked={!!t.free} onClick={() => setType(t.id, { free: !t.free })}>
                      <span className="sw" aria-hidden="true"><i /></span>Ingresso grátis
                    </button>
                  )}
                  <span className="ty-lim">
                    <span className="ty-lim-l">Limite por pessoa</span>
                    <button type="button" onClick={t.auto ? ro : () => setType(t.id, { limit: String(Math.max(1, lim - 1)) })} disabled={!t.auto && lim <= 1} aria-label={`Diminuir limite de ${t.name}`}>−</button>
                    <b aria-live="polite">{lim}</b>
                    <button type="button" onClick={t.auto ? ro : () => setType(t.id, { limit: String(Math.min(MAX_LIMIT, lim + 1)) })} disabled={!t.auto && lim >= MAX_LIMIT} aria-label={`Aumentar limite de ${t.name}`}>+</button>
                  </span>
                  <span className="ty-meta">{multiDates ? "Todas as datas" : "Data única"}</span>
                  {t.auto && <span className="ty-auto">Gerado da Inteira</span>}
                </div>
                {isSoc && (
                  <div className="sug">
                    <Spark />
                    <span className="sug-t">Sugestão: {brMoney(sug)} (entre a meia de {brMoney(inteira / 2)} e a inteira){cur && (cur <= inteira / 2 || cur >= inteira) ? " · valor fora da faixa comum" : ""}</span>
                    {cur !== sug && <button className="sug-b" type="button" onClick={() => setType(t.id, { price: String(sug) })}>Usar</button>}
                  </div>
                )}
              </div>
            );
          })}
          <div className="add-ty">
            <span className="add-l">Adicionar tipo:</span>
            {ADD_TYPES.map((a) => (
              <button key={a.label} className="add-b" type="button" onClick={() => {
                const price = a.kind === "meia" && inteira ? String(inteira / 2).replace(".", ",") : "";
                setSector((z) => ({ ...z, open: true, types: [...z.types, { id: c.nid("t"), kind: a.kind, name: a.name, price, qty: "100", desc: a.desc, free: a.free, limit: a.limit }] }));
              }}>+ {a.label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function IngressosPane({ c, sessions }: { c: Ctx; sessions: DraftSession[] }) {
  const { d, set, upd } = c;
  const mapMode = d.tmode === "mapa";
  const setCp = (id: string, patch: Partial<(typeof d.coupons)[number]>) => upd((o) => ({ ...o, coupons: o.coupons.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  return (
    <div className="pane">
      <h2 className="ce-ph">{mapMode ? "Setores e ingressos" : "Ingressos"}</h2>
      <p className="pp">{mapMode ? "Cada setor do mapa (Pista, Premium, Camarote…) pode ter vários tipos: inteira, meia-entrada (50% por lei), meia-social (um pouco acima da meia, valor definido por você) ou um tipo próprio, cada um com preço, quantidade e descrição." : "Crie os tipos de ingresso. Cada um tem preço (ou é grátis), quantidade, descrição e um limite por pessoa."}</p>
      <div className="opts">
        <button className={d.autoMeia ? "opt on" : "opt"} type="button" role="switch" aria-checked={d.autoMeia} onClick={() => set({ autoMeia: !d.autoMeia })}><span className="sw" aria-hidden="true"><i /></span><span className="op-i"><b className="op-t">Criar meia-entrada automaticamente</b><span className="op-s">Todo tipo Inteira ganha uma Meia-entrada por 50% do valor (Lei 12.933).</span></span></button>
        <button className={d.fee ? "opt on" : "opt"} type="button" role="switch" aria-checked={d.fee} onClick={() => set({ fee: !d.fee })}><span className="sw" aria-hidden="true"><i /></span><span className="op-i"><b className="op-t">Repassar taxa ao comprador</b><span className="op-s">O preço aparece com &quot;+ taxas&quot;. Desligado, a taxa de 10% sai do seu repasse.</span></span></button>
        <button className={d.transfer ? "opt on" : "opt"} type="button" role="switch" aria-checked={d.transfer} onClick={() => set({ transfer: !d.transfer })}><span className="sw" aria-hidden="true"><i /></span><span className="op-i"><b className="op-t">Permitir transferência</b><span className="op-s">O fã pode enviar o ingresso para outra pessoa pelo e-mail. O QR antigo deixa de valer na hora.</span></span></button>
        <button className={d.resale ? "opt on" : "opt"} type="button" role="switch" aria-checked={d.resale} onClick={() => set({ resale: !d.resale })}><span className="sw" aria-hidden="true"><i /></span><span className="op-i"><b className="op-t">Permitir revenda oficial</b><span className="op-s">Quem não puder ir revende aqui, com preço máximo de 120% e QR novo para o comprador. Dá para ajustar no painel.</span></span></button>
      </div>
      <div className="secs">
        {d.sectors.map((k) => <SectorCard key={k.id} c={c} k={k} multiDates={sessions.length > 1} />)}
        <div className="add-sec">
          <span className="add-l">{mapMode ? "Adicionar setor:" : "Adicionar:"}</span>
          {(mapMode ? MAP_SECTORS : ["Novo grupo"]).map((n) => (
            <button key={n} className="add-b" type="button" onClick={() => upd((o) => ({
              ...o,
              sectors: [...o.sectors.map((z) => ({ ...z, open: false })), { id: c.nid("k"), name: n, color: PALETTE.find((x) => !o.sectors.some((z) => z.color === x)) ?? PALETTE[o.sectors.length % PALETTE.length], open: true, types: [{ id: c.nid("t"), kind: "inteira", name: "Inteira", price: "", qty: "100", desc: "", limit: "6" }] }],
            }))}>+ {n}</button>
          ))}
        </div>
      </div>
      <div className="cps">
        <div className="cps-h"><div><h3 className="ph3 m0">Cupons de desconto</h3><span className="mh-s">Crie códigos para divulgadores, parceiros ou pré-venda. O comprador digita no checkout.</span></div>
          <button className="b-sec" type="button" onClick={() => upd((o) => ({ ...o, coupons: [...o.coupons, { id: c.nid("c"), code: "", kind: "pct", value: "10", limit: "100", until: "", scope: "all" }] }))}>+ Novo cupom</button>
        </div>
        {!d.coupons.length && <div className="ss-empty">Nenhum cupom ainda.</div>}
        {d.coupons.map((cp) => {
          const secName = cp.scope === "all" ? "todos os ingressos" : d.sectors.find((k) => k.id === cp.scope)?.name ?? "setor removido";
          return (
            <div key={cp.id} className="cp">
              <div className="cp-r1">
                <span className="cp-tk" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12V4h8l9 9-8 8z" /><circle cx="7.5" cy="8.5" r="1.3" /></svg></span>
                <input className="in cp-code" type="text" value={cp.code} maxLength={40} placeholder="CODIGO10" onChange={(e) => setCp(cp.id, { code: e.target.value.toUpperCase().replace(/\s/g, "") })} aria-label="Código do cupom" />
                <div className="cp-seg"><button className={cp.kind === "pct" ? "on" : ""} type="button" onClick={() => setCp(cp.id, { kind: "pct" })}>%</button><button className={cp.kind === "brl" ? "on" : ""} type="button" onClick={() => setCp(cp.id, { kind: "brl" })}>R$</button></div>
                <input className="in cp-v" type="text" inputMode="decimal" value={cp.value} onChange={(e) => setCp(cp.id, { value: e.target.value.replace(/[^\d,]/g, "") })} aria-label="Valor do desconto" />
                <button className="ty-x" type="button" onClick={() => upd((o) => ({ ...o, coupons: o.coupons.filter((x) => x.id !== cp.id) }))} aria-label={`Remover cupom ${cp.code}`}><XIcon /></button>
              </div>
              <div className="cp-r2">
                <label className="cp-f"><span className="tl-l2">Limite de usos</span><input className="in sm2" type="text" inputMode="numeric" value={cp.limit} onChange={(e) => setCp(cp.id, { limit: e.target.value.replace(/\D/g, "") })} /></label>
                <label className="cp-f"><span className="tl-l2">Válido até</span><input className="in sm2" type="text" value={cp.until} onChange={(e) => setCp(cp.id, { until: e.target.value })} placeholder="dd/mm/aaaa" /></label>
                <div className="cp-f"><span className="tl-l2">Vale para</span>
                  <div className="cp-sc">
                    {[{ id: "all", name: "Todos" }, ...d.sectors.map((k) => ({ id: k.id, name: k.name }))].map((o) => (
                      <button key={o.id} className={cp.scope === o.id ? "dy on" : "dy"} type="button" onClick={() => setCp(cp.id, { scope: o.id })}>{o.name}</button>
                    ))}
                  </div>
                </div>
              </div>
              <span className="cp-sum">{cp.kind === "pct" ? `${cp.value || "0"}% de desconto` : `${brMoney(num(cp.value))} de desconto por ingresso`} em {secName} · até {cp.limit || "∞"} usos{cp.until ? ` · válido até ${cp.until}` : " · sem data de validade"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================== 6. PUBLICAR =========================== */
const VIS = [
  { id: "publico", title: "Público", desc: "Aparece na busca e na home." },
  { id: "link", title: "Só com link", desc: "Fora da busca. Ideal para pré-venda." },
  { id: "rascunho", title: "Rascunho", desc: "Só você vê. Publique depois." },
] as const;

export function PublicarPane({ c, sessions, nTypes, totalQty, gross, net, subs }: { c: Ctx; sessions: DraftSession[]; nTypes: number; totalQty: number; gross: number; net: number; subs: string[] }) {
  const { d, set, go } = c;
  const mapMode = d.tmode === "mapa", tour = d.mode === "turne";
  const catName = d.cat === "Outros" ? d.catOther || "Outros" : d.cat;
  const checklist = [
    { title: "Formato", detail: subs[0], warn: false, i: 0 },
    { title: d.title || "Sem nome", detail: `${catName} · ${d.age} · ${d.lineup.length} artistas · ${d.media.poster && d.media.banner ? "imagens ok" : `falta ${!d.media.poster ? "o cartaz" : "o banner 16:9"}`}`, warn: !d.title || d.desc.length < 40 || !d.media.poster || !d.media.banner, i: 1 },
    { title: `${d.coupons.length} ${d.coupons.length === 1 ? "cupom" : "cupons"}`, detail: d.coupons.map((x) => x.code).join(" · ") || "Nenhum cupom", warn: false, i: 3 },
    { title: `${sessions.length} ${sessions.length === 1 ? "data" : "datas"}`, detail: sessions.map((x) => { const dt = parseIso(x.date); return `${WD[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}${tour && x.city ? ` ${x.city.split(/\s[–-]/)[0]}` : ""}`; }).join(" · ") || "Nenhuma data", warn: !sessions.length, i: 2 },
    { title: `${nTypes} tipos de ingresso`, detail: `${mapMode ? `${d.sectors.length} setores · ` : ""}${totalQty.toLocaleString("pt-BR")} ingressos no total`, warn: !nTypes, i: 3 },
    { title: mapMode ? (d.map === "done" ? "Mapa 3D pronto" : "Mapa ainda não gerado") : "Sem mapa", detail: mapMode ? (d.map === "done" ? "Áreas ligadas aos setores" : "Gere o mapa para o público escolher o setor") : "Venda por lista", warn: mapMode && d.map !== "done", i: 4 },
  ];
  return (
    <div className="pane">
      <h2 className="ce-ph">Revisar e publicar</h2>
      <p className="pp">Confira o resumo. Depois de publicar você ainda pode editar preços, abrir lotes e adicionar datas.</p>
      <div className="chk">
        {checklist.map((ck) => (
          <div key={ck.title + ck.i} className={ck.warn ? "ckr warn" : "ckr"}>
            <span className="ck-i" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <span className="ck-i2"><b className="ck-t">{ck.title}</b><span className="ck-s">{ck.detail}</span></span>
            <button className="ck-e" type="button" onClick={() => go(ck.i)}>Editar</button>
          </div>
        ))}
      </div>
      <h3 className="ph3">Visibilidade</h3>
      <div className="modes three" role="radiogroup" aria-label="Visibilidade">
        {VIS.map((v) => (
          <button key={v.id} className={d.vis === v.id ? "md on" : "md"} type="button" role="radio" aria-checked={d.vis === v.id} onClick={() => set({ vis: v.id })}><b className="md-t">{v.title}</b><span className="md-s">{v.desc}</span></button>
        ))}
      </div>
      <div className="fgrid" style={{ marginTop: 24 }}>
        <label className="lf"><span className="lf-l">Início das vendas</span><input className="in" type="text" value={d.saleStart} onChange={(e) => set({ saleStart: e.target.value })} placeholder="Já (ou 28/10/2026 às 10:00)" /></label>
        <label className="lf"><span className="lf-l">Política de cancelamento</span><input className="in" type="text" value={d.refund} onChange={(e) => set({ refund: e.target.value })} /></label>
      </div>
      <div className="earn">
        <div className="er"><span className="er-k">Ingressos à venda</span><b className="er-v">{totalQty.toLocaleString("pt-BR")}</b></div>
        <div className="er"><span className="er-k">Receita bruta estimada</span><b className="er-v">{shortMoney(gross)}</b></div>
        <div className="er"><span className="er-k">Seu repasse estimado</span><b className="er-v">{shortMoney(net)}</b></div>
      </div>
    </div>
  );
}
