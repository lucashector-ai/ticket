"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SpotifyArtistSearch, SpotifyIcon, type SpotifyHit } from "@/components/spotify-search";
import { pickPlace, searchVenues, type VenueHit } from "@/lib/actions/criar";
import { AGES, EVENT_TYPES, num, parseCity, ROLES, type DraftSession, type EventMode, type VenuePlace } from "@/lib/criar/model";
import { CityField, CityStatePicker } from "./city-picker";
import { initials } from "@/lib/format";
import type { Derived } from "./flow";
import { isoDate, MO, MONTHS, parseIso, Spark, WD, XIcon, type Ctx } from "./shared";

export const TOTAL = 8;

export function StepHead({ n, k, q, s }: { n: number; k: string; q: string; s?: string }) {
  return (
    <>
      <span className="cv-k"><b>{n} de {TOTAL}</b> · {k}</span>
      <h1 className="cv-q">{q}</h1>
      {s && <p className="cv-s">{s}</p>}
    </>
  );
}

export function Ico({ d, size = 22, stroke = "#111" }: { d: string; size?: number; stroke?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

export function Toggle({ on, onClick, title, sub, className = "" }: { on: boolean; onClick: () => void; title: string; sub?: string; className?: string }) {
  return (
    <button className={`cv-tgl${on ? " on" : ""} ${className}`} type="button" role="switch" aria-checked={on} onClick={onClick}>
      <span className="sw" aria-hidden="true" />
      <span className="tx"><b>{title}</b>{sub && <span className="s">{sub}</span>}</span>
    </button>
  );
}

/* =========================== 1. TIPO =========================== */
const FORMATS: [EventMode, string][] = [["unica", "Uma data"], ["temporada", "Várias datas"], ["turne", "Turnê"]];

export function TipoStep({ c }: { c: Ctx }) {
  const { d, set, upd } = c;
  const pickMode = (m: EventMode) => upd((o) => {
    let ss = o.sessions, venue = o.venue;
    if (m === "unica" && ss.length > 1) ss = [ss[0]];
    if (m === "turne") ss = ss.map((x) => ({ ...x, venue: x.venue || o.venue.name, city: x.city || o.venue.city }));
    else {
      if (!venue.name && ss[0]?.venue) venue = { name: ss[0].venue, city: ss[0].city };
      ss = ss.map((x) => ({ ...x, venue: venue.name, city: venue.city }));
    }
    return { ...o, mode: m, sessions: ss, venue };
  }, "when");
  return (
    <section className="cv-st">
      <span className="cv-k"><b>1 de {TOTAL}</b> · leva uns 5 minutos no total</span>
      <h1 className="cv-q">Que evento você vai criar?</h1>
      <p className="cv-s">Escolha o que mais combina. Isso ajusta as próximas perguntas para você.</p>
      <div className="cv-b cv-tg">
        {EVENT_TYPES.map((t, i) => {
          const on = d.cat === t.cat;
          return (
            <button key={t.cat} className={on ? "cv-tc on" : "cv-tc"} type="button" onClick={() => set({ cat: t.cat }, "type")} style={{ animationDelay: `${i * 40}ms` }} aria-pressed={on}>
              <span className="ic"><Ico d={t.icon} /></span>
              {on && <span className="ck" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>}
              <b>{t.cat === "Outros" ? "Outro" : t.cat}<small>{t.sub}</small></b>
            </button>
          );
        })}
      </div>
      {d.cat === "Outros" && (
        <input className="cv-in cv-pop" type="text" value={d.catOther} maxLength={60} onChange={(e) => set({ catOther: e.target.value }, "type")} placeholder="Qual é a categoria? Ex.: Stand-up, Feira, Exposição" aria-label="Outra categoria" autoFocus />
      )}
      <label className="cv-lb">Acontece em… <span>(dá para mudar depois)</span></label>
      <div className="cv-seg" role="radiogroup" aria-label="Formato">
        {FORMATS.map(([id, l]) => <button key={id} className={d.mode === id ? "sg on" : "sg"} type="button" role="radio" aria-checked={d.mode === id} onClick={() => pickMode(id)}>{l}</button>)}
      </div>
      <p className="cv-note">{d.mode === "unica" ? "Um dia, um local." : d.mode === "temporada" ? "Mesmo local em dias diferentes. O público escolhe a data antes do ingresso." : "Cidades e locais diferentes: cada data com o seu endereço."}</p>
    </section>
  );
}

/* =========================== 2. INFORMAÇÕES =========================== */
const SUG: Record<string, string[]> = {
  Festa: ["Noite Sem Fim", "Baile da Virada", "Pista Aberta", "Fervo de Sexta"], Show: ["Ao Vivo na Arena", "Turnê Céu Aberto", "Acústico de Domingo", "Noite de Estreia"],
  Festival: ["Festival Maré Alta", "Sol & Som", "Três Palcos", "Festival Primavera"], Teatro: ["Sessão das Oito", "Cena Aberta", "Palco Nu", "A Última Sessão"],
  Curso: ["Masterclass de Produção", "Workshop Intensivo", "Imersão de Fim de Semana", "Aula Aberta"], Esporte: ["Corrida Noturna", "Copa de Bairro", "Desafio 10K", "Noite de Luta"],
  Gastronomia: ["Mesa Longa", "Jantar a Seis Mãos", "Feira de Sabores", "Noite do Vinho"], Outros: ["Encontro Anual", "Edição Especial", "Noite Única", "Experiência 01"],
};
const AGE_SUB: Record<string, string> = { Livre: "Todas as idades", "12+": "A partir de 12", "14+": "A partir de 14", "16+": "A partir de 16", "18+": "Só maiores" };
const AV_BG = ["#D3F55B", "#7DA2FF", "#FF8AD8", "#FFB547", "#7DF9FF", "#C9B6FF"];

export function InfoStep({ c, x }: { c: Ctx; x: Derived }) {
  const { d, set, upd } = c;
  const [typing, setTyping] = useState(false);
  const [draftArtist, setDraftArtist] = useState("");
  const ty = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (ty.current) clearInterval(ty.current); }, []);

  async function writeAi() {
    if (typing) return;
    if (d.title.trim().length < 2) { c.flash("Dê um nome ao evento antes."); return; }
    setTyping(true);
    const s = x.sessions[0];
    const r = await fetch("/api/criar/descricao", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: d.title, cat: d.cat === "Outros" ? d.catOther : d.cat, age: d.age, venue: x.tour ? "" : d.venue.name, city: x.tour ? x.sessions.map((y) => y.city).filter(Boolean).join(", ") : d.venue.city,
        when: s ? `${x.sessions.length > 1 ? `${x.sessions.length} datas, a partir de ` : ""}${s.date} às ${s.time}` : "", lineup: d.lineup.map((a) => a.name).filter(Boolean), current: d.desc,
      }),
    }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!r?.ok || !j?.text) { setTyping(false); c.flash(j?.error ?? "Não foi possível escrever agora."); return; }
    // efeito de digitação
    const txt = j.text;
    let i = 0;
    set({ desc: "" }, "desc");
    ty.current = setInterval(() => {
      i += 4;
      if (i >= txt.length) { if (ty.current) clearInterval(ty.current); set({ desc: txt }, "desc"); setTyping(false); return; }
      set({ desc: txt.slice(0, i) });
    }, 18);
  }

  const setArt = (id: string, patch: Partial<(typeof d.lineup)[number]>) => upd((o) => ({ ...o, lineup: o.lineup.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), "desc");
  const addArtist = (name: string, sp?: SpotifyHit) => {
    const v = name.trim();
    if (!v) { c.flash("Digite o nome do artista."); return; }
    if (sp && d.lineup.some((a) => a.spotifyId === sp.id)) { c.flash(`${sp.name} já está no line-up.`); setDraftArtist(""); return; }
    upd((o) => ({ ...o, lineup: [...o.lineup, { id: c.nid("a"), name: v, role: o.lineup.length ? "Convidado" : "Headliner", time: "", end: "", days: null, ...(sp ? { spotifyId: sp.id, image: sp.image } : {}) }] }), "desc");
    setDraftArtist("");
  };
  const sugs = SUG[d.cat] ?? SUG.Festa;
  return (
    <section className="cv-st">
      <StepHead n={2} k="informações" q="Como o evento se chama?" />
      <div className="cv-b">
        <input className="cv-big" type="text" value={d.title} onChange={(e) => set({ title: e.target.value }, "name")} placeholder="Ex.: Baile do Futuro" maxLength={80} aria-label="Nome do evento" autoFocus />
        <div className="cv-cnt"><span>Nomes curtos vendem mais: aparecem inteiros no celular.</span><span>{d.title.length}/80</span></div>
      </div>
      {d.title.trim().length < 2 && (
        <>
          <label className="cv-lb">Sem ideia? Toque para usar</label>
          <div className="cv-chips">{sugs.map((g, i) => <button key={g} className="cv-chip" type="button" onClick={() => set({ title: g }, "name")} style={{ animationDelay: `${i * 50}ms` }}>{g}</button>)}</div>
        </>
      )}
      <label className="cv-lb">Faixa etária</label>
      <div className="cv-ages">
        {AGES.map((a) => <button key={a} className={d.age === a ? "ag on" : "ag"} type="button" onClick={() => set({ age: a }, "age")}><b>{a}</b><span className="s">{AGE_SUB[a]}</span></button>)}
      </div>
      {d.age !== "Livre" && d.age !== "18+" && (
        <Toggle className="cv-pop" on={d.minors} onClick={() => set({ minors: !d.minors }, "age")} title="Menores podem entrar acompanhados" sub="Com pai, mãe ou responsável legal maior de 18 anos, com documento." />
      )}
      <label className="cv-lb">Descrição <span>(opcional)</span></label>
      <div className="cv-ta">
        <textarea value={d.desc} onChange={(e) => set({ desc: e.target.value }, "desc")} maxLength={6000} placeholder="Conte o clima, quem toca e o que a pessoa vai viver." aria-label="Descrição" readOnly={typing} />
        {typing && <span className="cv-caret" aria-hidden="true" />}
        <button className={typing ? "cv-ai busy" : "cv-ai"} type="button" onClick={() => void writeAi()}><Spark size={15} />{typing ? "Escrevendo…" : d.desc ? "Reescrever com IA" : "Escrever com IA"}</button>
        <span className="cv-ta-n">{d.desc.length} caracteres</span>
      </div>

      <label className="cv-lb">Line-up <span>({d.lineup.length} {d.lineup.length === 1 ? "artista" : "artistas"} · opcional)</span></label>
      <div className="cv-lu">
        {d.lineup.map((a, i) => (
          <div key={a.id} className="cv-lur" style={{ animationDelay: `${i * 40}ms` }}>
            {a.image ? (
              <span className="av img" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.image} alt="" /><SpotifyIcon size={13} />
              </span>
            ) : <span className="av" style={{ background: AV_BG[i % AV_BG.length] }} aria-hidden="true">{initials(a.name) || "?"}</span>}
            <input className="nm" type="text" value={a.name} onChange={(e) => setArt(a.id, { name: e.target.value, spotifyId: undefined, image: undefined })} placeholder="Nome do artista" aria-label="Nome do artista" />
            <div className="rl">{ROLES.map((r) => <button key={r} className={a.role === r ? "on" : ""} type="button" onClick={() => setArt(a.id, { role: r })}>{r}</button>)}</div>
            <label className="tm"><span>Início</span><input type="time" value={a.time} onChange={(e) => setArt(a.id, { time: e.target.value })} aria-label={`Horário de ${a.name}`} /></label>
            <label className="tm"><span>Fim</span><input type="time" value={a.end} onChange={(e) => setArt(a.id, { end: e.target.value })} aria-label={`Fim de ${a.name}`} /></label>
            <button className="cv-rm" type="button" onClick={() => upd((o) => ({ ...o, lineup: o.lineup.filter((b) => b.id !== a.id) }))} aria-label={`Remover ${a.name}`}>×</button>
            {x.sessions.length > 1 && (
              <div className="dy">
                <span>Toca em</span>
                <button className={a.days ? "" : "on"} type="button" onClick={() => setArt(a.id, { days: null })}>Todas as datas</button>
                {x.sessions.map((s) => {
                  const dt = parseIso(s.date);
                  const on = !!a.days && a.days.includes(s.id);
                  return (
                    <button key={s.id} className={on ? "on" : ""} type="button" onClick={() => {
                      let cur = a.days ? [...a.days] : [];
                      cur = cur.includes(s.id) ? cur.filter((y) => y !== s.id) : [...cur, s.id];
                      setArt(a.id, { days: !cur.length || cur.length === x.sessions.length ? null : cur });
                    }}>{WD[dt.getDay()]} {dt.getDate()}</button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <div className="cv-lu-add cv-noenter">
          <SpotifyArtistSearch value={draftArtist} onChange={setDraftArtist} onPick={(a) => addArtist(a.name, a)} onPlain={(v) => addArtist(v)} placeholder="Busque o artista no Spotify ou digite o nome" />
          <button className="cv-dark" type="button" onClick={() => addArtist(draftArtist)}>+ Adicionar</button>
        </div>
        <span className="cv-help">Escolhido na lista do Spotify, o artista ganha foto e player na página dele. Sem horário? Deixe em branco.</span>
      </div>
    </section>
  );
}

/* =========================== 3. QUANDO =========================== */
const toMin = (t: string) => { const m = /^(\d{2}):(\d{2})$/.exec(t); return m ? +m[1] * 60 + +m[2] : 0; };
const fromMin = (m: number) => { const v = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`; };
const hLabel = (t: string) => { const m = toMin(t); return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`; };

function TimeBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="cv-tmb">
      <small>{label}</small>
      <div className="r">
        <input type="time" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={label} />
        <span className="cv-stp"><button type="button" onClick={() => onChange(fromMin(toMin(value) - 30))} aria-label={`${label} mais cedo`}>−</button><button type="button" onClick={() => onChange(fromMin(toMin(value) + 30))} aria-label={`${label} mais tarde`}>+</button></span>
      </div>
    </div>
  );
}

export function QuandoStep({ c, x }: { c: Ctx; x: Derived }) {
  const { d, upd } = c;
  const multi = d.mode !== "unica";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startCal = x.sessions[0] ? parseIso(x.sessions[0].date) : today;
  const [cal, setCal] = useState({ y: startCal.getFullYear(), m: startCal.getMonth() });
  const base = x.sessions[0] ?? { doors: "19:00", time: "21:00", end: "", cap: "500" };
  const has = (key: string) => d.sessions.some((s) => s.date === key);
  const pick = (key: string) => upd((o) => {
    if (o.sessions.some((s) => s.date === key)) return { ...o, sessions: multi ? o.sessions.filter((s) => s.date !== key) : o.sessions };
    const b = o.sessions[0] ?? { doors: "19:00", time: "21:00", end: "", cap: "500" };
    const nx: DraftSession = { id: c.nid("s"), date: key, doors: b.doors, time: b.time, end: b.end ?? "", cap: b.cap, venue: o.mode === "turne" ? "" : o.venue.name, city: o.mode === "turne" ? "" : o.venue.city };
    return { ...o, sessions: multi ? [...o.sessions, nx] : [{ ...nx, id: o.sessions[0]?.id ?? nx.id }] };
  }, "when");
  const setAll = (patch: Partial<DraftSession>) => upd((o) => ({ ...o, sessions: o.sessions.map((s) => ({ ...s, ...patch })) }), "when");
  const setOne = (id: string, patch: Partial<DraftSession>) => upd((o) => ({ ...o, sessions: o.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }), "when");

  // próximas sextas e sábados
  const quick: { key: string; k: string; dt: Date }[] = [];
  for (let k = 0; k < 15 && quick.length < 4; k++) {
    const dt = new Date(today.getTime() + k * 864e5), wd = dt.getDay();
    if (wd === 5 || wd === 6) quick.push({ key: isoDate(dt.getFullYear(), dt.getMonth(), dt.getDate()), dt, k: k < 7 ? (wd === 5 ? "Esta sexta" : "Este sábado") : (wd === 5 ? "Próxima sexta" : "Próximo sábado") });
  }
  const first = new Date(cal.y, cal.m, 1), dim = new Date(cal.y, cal.m + 1, 0).getDate();
  const end = base.end || "";
  const s0 = x.sessions[0];
  const hint = !s0 ? "" : parseIso(s0.date).getDay() >= 5 && toMin(s0.time) >= 21 * 60
    ? "Boa escolha: festas de sexta e sábado à noite costumam vender mais rápido."
    : "Dica: anuncie com pelo menos 3 semanas de antecedência para vender o 1º lote inteiro.";
  return (
    <section className="cv-st cv-wide">
      <StepHead n={3} k="data e horário" q={multi ? "Quais são as datas?" : "Quando vai ser?"} s={multi ? "Toque em quantos dias quiser. Cada data vira uma sessão, e o público escolhe a dele." : "Toque numa data. Sextas e sábados estão marcados."} />
      <div className="cv-b cv-qd">
        {quick.map((q, i) => (
          <button key={q.key} className={has(q.key) ? "qb on" : "qb"} type="button" onClick={() => pick(q.key)} style={{ animationDelay: `${i * 50}ms` }}>
            <small>{q.k}</small><b>{q.dt.getDate()} {MO[q.dt.getMonth()]}</b><span>{["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][q.dt.getDay()]}</span>
          </button>
        ))}
      </div>
      <div className="cv-wh">
        <div className="cv-cal">
          <div className="h">
            <span>{MONTHS[cal.m][0].toUpperCase() + MONTHS[cal.m].slice(1)} {cal.y}</span>
            <span className="n">
              <button type="button" onClick={() => setCal(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))} aria-label="Mês anterior">‹</button>
              <button type="button" onClick={() => setCal(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))} aria-label="Próximo mês">›</button>
            </span>
          </div>
          <div className="g">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((w, i) => <span key={i} className="wd">{w}</span>)}
            {Array.from({ length: first.getDay() }, (_, i) => <span key={`o${i}`} />)}
            {Array.from({ length: dim }, (_, i) => {
              const day = i + 1, key = isoDate(cal.y, cal.m, day), dt = new Date(cal.y, cal.m, day);
              const past = dt < today, on = has(key), wk = dt.getDay() === 5 || dt.getDay() === 6;
              return <button key={key} className={past ? "cd off" : on ? "cd on" : wk ? "cd wk" : "cd"} type="button" disabled={past} onClick={() => pick(key)} aria-pressed={on} aria-label={`${day} de ${MONTHS[cal.m]}`}>{day}</button>;
            })}
          </div>
        </div>
        <div className="cv-tmc">
          <TimeBox label="Começa" value={base.time} onChange={(v) => setAll({ time: v })} />
          <TimeBox label="Termina" value={end || fromMin(toMin(base.time) + 360)} onChange={(v) => setAll({ end: v })} />
          <TimeBox label="Abertura dos portões" value={base.doors} onChange={(v) => setAll({ doors: v })} />
        </div>
      </div>
      {x.sessions.length > 1 && (
        <div className="cv-ss">
          <label className="cv-lb" style={{ margin: "0 0 8px" }}>{x.sessions.length} datas <span>· horário diferente em alguma? Ajuste aqui</span></label>
          {x.sessions.map((s, i) => {
            const dt = parseIso(s.date);
            return (
              <div key={s.id} className="row" style={{ animationDelay: `${i * 30}ms` }}>
                <span className="dd"><small>{WD[dt.getDay()]}</small><b>{dt.getDate()}</b><small>{MO[dt.getMonth()]}</small></span>
                <label><span>Portões</span><input type="time" value={s.doors} onChange={(e) => setOne(s.id, { doors: e.target.value })} /></label>
                <label><span>Começa</span><input type="time" value={s.time} onChange={(e) => setOne(s.id, { time: e.target.value })} /></label>
                <label><span>Termina</span><input type="time" value={s.end ?? ""} onChange={(e) => setOne(s.id, { end: e.target.value })} /></label>
                <button className="cv-rm" type="button" onClick={() => upd((o) => ({ ...o, sessions: o.sessions.filter((y) => y.id !== s.id) }), "when")} aria-label={`Remover ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`}>×</button>
              </div>
            );
          })}
        </div>
      )}
      {hint && <div className="cv-hint"><Spark size={16} /><span>{s0 ? `${hLabel(base.time)} às ${hLabel(end || fromMin(toMin(base.time) + 360))}, portões ${hLabel(base.doors)}. ` : ""}{hint}</span></div>}
    </section>
  );
}

/* =========================== 4. ONDE =========================== */
type Picked = { name: string; city: string; cap: number | null; place: VenuePlace | null };

/** Busca de locais (cadastrados + Google). Um token por sessão de busca: o Google cobra a sessão só no local escolhido. */
function useVenueSearch(q: string, active: boolean) {
  const [hits, setHits] = useState<VenueHit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const tok = useRef("");
  useEffect(() => {
    if (!active) return;
    if (!tok.current) tok.current = crypto.randomUUID();
    let alive = true;
    const t = setTimeout(() => { void searchVenues(q, tok.current).then((r) => { if (alive) setHits(r); }); }, q.trim().length >= 3 ? 300 : 180);
    return () => { alive = false; clearTimeout(t); };
  }, [q, active]);
  const pick = async (v: VenueHit): Promise<Picked> => {
    if (!v.placeId) return { name: v.name, city: v.city, cap: v.cap, place: null };
    setBusy(v.placeId);
    const r = await pickPlace(v.placeId, tok.current).catch(() => null);
    tok.current = "";
    setBusy(null);
    // sem detalhes do Google: a cidade sai do próprio texto da sugestão ("Rio Vermelho, Florianópolis - SC")
    const fromAddr = parseCity(v.addr.split(",").pop() ?? "");
    return { name: v.name, city: r?.city || (fromAddr ? `${fromAddr.name} – ${fromAddr.uf}` : ""), cap: null, place: r?.place ?? null };
  };
  return { hits, busy, pick };
}

function VenueHits({ hits, busy, onPick, children }: { hits: VenueHit[]; busy: string | null; onPick: (v: VenueHit) => void; children?: ReactNode }) {
  return (
    <div className="cv-vl">
      {hits.map((v, i) => (
        <button key={v.placeId ?? v.name + v.city} className={v.placeId && busy === v.placeId ? "vr ld" : "vr"} type="button" disabled={!!busy} onClick={() => onPick(v)} style={{ animationDelay: `${i * 40}ms` }}>
          <span className={v.placeId ? "pin g" : "pin"}><Ico d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z" size={18} /></span>
          <span className="tx"><b>{v.name}</b><span className="s">{[v.addr, v.city].filter(Boolean).join(" · ")}</span></span>
          {v.cap ? <em>até {v.cap.toLocaleString("pt-BR")} pessoas</em> : !v.placeId ? <em>Na Tickets Win</em> : null}
        </button>
      ))}
      {children}
      {hits.some((v) => v.placeId) && <span className="cv-gattr">Locais do Google Maps</span>}
    </div>
  );
}

/** Campo de local de uma data da turnê, com as mesmas sugestões da busca principal. */
function TourVenue({ s, label, onChange }: { s: DraftSession; label: string; onChange: (patch: Partial<DraftSession>) => void }) {
  const [open, setOpen] = useState(false);
  const { hits, busy, pick } = useVenueSearch(s.venue, open && s.venue.trim().length >= 2);
  return (
    <div className="cv-ac" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <input className="cv-in" value={s.venue} onFocus={() => setOpen(true)} onChange={(e) => { onChange({ venue: e.target.value }); setOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} placeholder="Local (ex.: Arena Norte)" aria-label={label} autoComplete="off" />
      {open && s.venue.trim().length >= 2 && hits.length > 0 && (
        <div className="cv-acl" onMouseDown={(e) => e.preventDefault()}>
          <VenueHits hits={hits} busy={busy} onPick={(v) => { void pick(v).then((p) => { onChange({ venue: p.name, ...(p.city ? { city: p.city } : {}), place: p.place ?? undefined, ...(p.cap ? { cap: String(p.cap) } : {}) }); setOpen(false); }); }} />
        </div>
      )}
    </div>
  );
}

export function OndeStep({ c, x }: { c: Ctx; x: Derived }) {
  const { d, upd } = c;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(!d.venue.name.trim());
  const { hits, busy, pick } = useVenueSearch(q, editing && !x.tour);
  /** `place`: undefined mantém o lugar do Google já escolhido; null tira (local digitado à mão). */
  const setVenue = (name: string, city: string, cap?: number | null, place?: VenuePlace | null) => {
    upd((o) => {
      const pl = place === undefined ? o.venue.place : place ?? undefined;
      return { ...o, venue: { name, city, ...(pl ? { place: pl } : {}) }, sessions: o.sessions.map((s) => ({ ...s, venue: name, city, ...(cap ? { cap: String(cap) } : {}) })) };
    }, "where");
    setEditing(false);
  };
  const cap = x.sessions[0]?.cap ?? "500";
  const setCap = (v: number) => upd((o) => ({ ...o, sessions: o.sessions.map((s) => ({ ...s, cap: String(Math.max(0, v)) })) }), "where");

  if (x.tour) {
    const setOne = (id: string, patch: Partial<DraftSession>) => upd((o) => ({ ...o, sessions: o.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) }), "where");
    return (
      <section className="cv-st cv-wide">
        <StepHead n={4} k="locais" q="Onde vai ser cada data?" s="Na turnê, cada data tem o seu local e cidade. Digite a cidade e escolha na lista." />
        <div className="cv-b cv-tour">
          {!x.sessions.length && <div className="cv-empty">Escolha as datas na etapa anterior.<button className="cv-lnk" type="button" onClick={() => c.go(2)}>Ir para Quando</button></div>}
          {x.sessions.map((s, i) => {
            const dt = parseIso(s.date);
            return (
              <div key={s.id} className="row" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="dd"><small>{WD[dt.getDay()]}</small><b>{dt.getDate()}</b><small>{MO[dt.getMonth()]}</small></span>
                <TourVenue s={s} label={`Local de ${dt.getDate()}/${dt.getMonth() + 1}`} onChange={(p) => setOne(s.id, p)} />
                <CityField value={s.city} onChange={(v) => setOne(s.id, { city: v, place: undefined })} label={`Cidade de ${dt.getDate()}/${dt.getMonth() + 1}`} />
                <input className="cv-in cap" inputMode="numeric" value={s.cap} onChange={(e) => setOne(s.id, { cap: e.target.value.replace(/\D/g, "") })} aria-label="Lotação" title="Lotação" />
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  const cityOk = !!parseCity(d.venue.city);
  return (
    <section className="cv-st">
      <StepHead n={4} k="local" q="Onde vai ser?" />
      <div className="cv-b">
        {editing ? (
          <>
            <label className="cv-srch">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque pelo nome do lugar ou da cidade" aria-label="Buscar local" autoFocus />
            </label>
            <VenueHits hits={hits} busy={busy} onPick={(v) => { void pick(v).then((p) => setVenue(p.name, p.city, p.cap, p.place)); }}>
              {q.trim().length > 1 && (
                <button className="vr new" type="button" disabled={!!busy} onClick={() => setVenue(q.trim(), d.venue.city, null, null)}>
                  <span className="pin">+</span><span className="tx"><b>Usar “{q.trim()}”</b><span className="s">Local novo: você informa a cidade em seguida</span></span>
                </button>
              )}
            </VenueHits>
          </>
        ) : (
          <>
            <div className="cv-map">
              <div className="gr" /><div className="rd" /><div className="rd2" /><div className="pk" />
              <span className="ring" />
              <svg className="mp" width="44" height="54" viewBox="0 0 44 54" aria-hidden="true"><path d="M22 54S2 34 2 21a20 20 0 0 1 40 0c0 13-20 33-20 33z" fill="#111" /><circle cx="22" cy="21" r="8" fill="#D3F55B" /></svg>
              <div className="cv-mcard"><span className="tx"><b>{d.venue.name}</b><span className="s">{d.venue.place?.addr || d.venue.city || "Falta a cidade"}</span></span><button className="chg" type="button" onClick={() => { setQ(""); setEditing(true); }}>Trocar</button></div>
            </div>
            <label className="cv-fl cv-nm"><span>Nome do local</span><input className="cv-in" value={d.venue.name} onChange={(e) => setVenue(e.target.value, d.venue.city)} /></label>
            <CityStatePicker value={d.venue.city} onChange={(v, auto) => setVenue(d.venue.name, v, null, auto ? undefined : null)} autoFocus={!cityOk} />
            <div className="cv-tmb cap">
              <small>Lotação do local</small>
              <div className="r">
                <input inputMode="numeric" value={cap} onChange={(e) => setCap(num(e.target.value.replace(/\D/g, "")))} aria-label="Lotação" />
                <span className="cv-stp"><button type="button" onClick={() => setCap(num(cap) - 50)} aria-label="Menos 50">−</button><button type="button" onClick={() => setCap(num(cap) + 50)} aria-label="Mais 50">+</button></span>
              </div>
            </div>
            <div className="cv-hint"><Spark size={16} /><span>{cityOk ? `Lotação de ${num(cap).toLocaleString("pt-BR")} pessoas. Usamos isso para sugerir os ingressos.` : "Escolha o estado e a cidade onde vai ser o evento."}</span></div>
          </>
        )}
      </div>
    </section>
  );
}

export { XIcon };
