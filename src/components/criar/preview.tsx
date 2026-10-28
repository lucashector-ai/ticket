"use client";

import { BannerArt } from "@/components/art/banner";
import { useNowSec } from "@/components/evento/countdown";
import { LaunchScreen, type LaunchScreenData } from "@/components/evento/launch-screen";
import { effTypes, num, parseBrDateTime, type Draft } from "@/lib/criar/model";
import { KIND_COLOR } from "@/lib/criar/plan";
import type { Derived } from "./flow";
import { brMoney, MO, parseIso, type PvField } from "./shared";

const WDL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const hm = (t: string) => { const m = /^(\d{2}):(\d{2})$/.exec(t); return m ? `${+m[1]}h${m[2] === "00" ? "" : m[2]}` : ""; };

/** Textos da prévia derivados do formulário (data, local, preços, tela de contagem). */
export function pvInfo(d: Draft, x: Derived, nowSec: number) {
  const s0 = x.sessions[0];
  const openAt = parseBrDateTime(d.saleStart);
  const presaleAt = d.presaleStart.trim() ? parseBrDateTime(d.presaleStart) : null;
  const venue = x.tour ? `Turnê · ${new Set(x.sessions.map((s) => s.city).filter(Boolean)).size || 0} cidades` : d.venue.name || "Local do evento";
  const city = x.tour ? x.sessions.map((s) => s.city.split(/\s[–-]/)[0]).filter(Boolean).join(", ") || "Cidades" : d.venue.city || "Cidade";
  const when = !s0 ? "Escolha a data" : x.sessions.length === 1 ? (() => { const t = parseIso(s0.date); return `${WDL[t.getDay()]}, ${t.getDate()} ${MO[t.getMonth()]}`; })() : `${x.sessions.length} datas · ${x.sessions.slice(0, 4).map((s) => { const t = parseIso(s.date); return `${t.getDate()}/${t.getMonth() + 1}`; }).join(", ")}`;
  const time = s0 ? `${hm(s0.time)}${s0.end ? ` às ${hm(s0.end)}` : ""} · portões ${hm(s0.doors)}` : "Horário";
  const teaser: LaunchScreenData | null = openAt ? {
    page: d.teaser, title: d.title.trim() || "Nome do evento", when, where: x.tour ? venue : [d.venue.name, d.venue.city.split(/\s[–-]/)[0]].filter(Boolean).join(", "),
    bannerId: d.media.banner ?? d.media.poster ?? "none", flyerId: d.media.poster ?? "none", lineup: d.lineup.map((a) => a.name).filter(Boolean),
    phase: presaleAt && presaleAt.getTime() < nowSec * 1000 ? "presale" : "soon", openAt: openAt.toISOString(), presaleAt: presaleAt?.toISOString() ?? null,
  } : null;
  const secs = d.sectors.map((k) => {
    const types = effTypes(k, d.autoMeia);
    const prices = types.flatMap((t) => (t.free ? [0] : num(t.price) > 0 ? [num(t.price)] : []));
    return { k, types, from: prices.length ? Math.min(...prices) : null };
  });
  const all = secs.flatMap((z) => (z.from === null ? [] : [z.from]));
  const minP = all.length ? Math.min(...all) : null;
  const cat = d.cat === "Outros" ? d.catOther || "Outro" : d.cat || "Categoria";
  return { s0, venue, city, when, time, teaser, secs, minP, cat, title: d.title.trim() || "Nome do evento", grouped: d.sectors.length > 1 || d.tmode === "mapa" };
}
export const priceTxt = (d: Draft, t: { free?: boolean; price: string }) => (t.free ? "Grátis" : num(t.price) ? `${brMoney(num(t.price))}${d.fee ? " + taxas" : ""}` : "R$ —");

/** Celular ao lado do formulário: a página do evento (ou a tela de contagem) atualizando a cada mudança. */
export function Phone({ d, x, lf, teaser }: { d: Draft; x: Derived; lf: { f: PvField | null; tick: number }; teaser: boolean }) {
  const nowSec = useNowSec();
  const hl = (f: PvField) => (lf.f === f ? ` hl${lf.tick % 2}` : "");
  const v = pvInfo(d, x, nowSec);
  const { s0, venue, when } = v;

  if (teaser && v.teaser) {
    return (
      <div className="cv-ph"><div className="sc ls-host"><LaunchScreen preview x={v.teaser} /></div></div>
    );
  }

  const secs = v.secs.slice(0, 3), minP = v.minP;
  const plan = d.tmode === "mapa" && d.map === "done" ? d.plan : null;
  const color = (sid: string | null, kind: string) => (sid ? d.sectors.find((k) => k.id === sid)?.color : null) ?? (kind === "setor" ? "#8A8A90" : KIND_COLOR[kind as keyof typeof KIND_COLOR] ?? "#555");
  return (
    <div className="cv-ph"><div className="sc">
      <div className={`pv-bn${hl("banner")}`}>
        {d.media.banner ? <BannerArt id={d.media.banner} fit="fill" /> : (
          <span className="pv-ph"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9A9A92" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></svg>O banner do evento entra aqui</span>
        )}
      </div>
      <div className="pv-b">
        <div className="pv-tags"><span className={`pv-cat${hl("type")}`}>{d.cat === "Outros" ? d.catOther || "Outro" : d.cat || "Categoria"}</span><span className={`pv-age${hl("age")}`}>{d.age}</span></div>
        <h2 className={`pv-t hlw${hl("name")}${d.title.trim() ? "" : " ph0"}`}>{d.title.trim() || "Nome do evento"}</h2>
        <div className={`pv-r hlw${hl("when")}`}><span className="i"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /></svg></span><span><b>{when}</b><span className="s">{s0 ? `${hm(s0.time)}${s0.end ? ` às ${hm(s0.end)}` : ""} · portões ${hm(s0.doors)}` : "Horário"}</span></span></div>
        <div className={`pv-r hlw${hl("where")}`}><span className="i"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg></span><span><b>{venue}</b><span className="s">{x.tour ? x.sessions.map((s) => s.city.split(/\s[–-]/)[0]).filter(Boolean).join(", ") || "Cidades" : d.venue.city || "Cidade"}</span></span></div>
        {v.teaser && <div className={`pv-sale${hl("sale")}`}><i />Vendas abrem {d.saleStart.replace(/\/\d{4}/, "")}</div>}
        <p className={`pv-d hlw${hl("desc")}`}>{d.desc.trim() ? `${d.desc.slice(0, 220)}${d.desc.length > 220 ? "…" : ""}` : "A descrição do evento aparece aqui."}</p>
        {d.lineup.length > 0 && <div className={`pv-lu${hl("desc")}`}>{d.lineup.slice(0, 5).map((a) => <span key={a.id}>{a.name}</span>)}</div>}
        {plan && (
          <div className={`pv-map${hl("map")}`}>
            <div className="pl" style={{ aspectRatio: `${plan.width} / ${plan.depth}` }}>
              {plan.areas.map((a, i) => (
                <i key={a.id} style={{ left: `${(a.x / plan.width) * 100}%`, top: `${(a.y / plan.depth) * 100}%`, width: `${(a.w / plan.width) * 100}%`, height: `${(a.d / plan.depth) * 100}%`, background: color(a.sector, a.kind), animationDelay: `${i * 60}ms` }} />
              ))}
            </div>
            <span className="t">Mapa 3D · toque para escolher</span>
          </div>
        )}
        <div className={`pv-tk hlw${hl("tk")}`}>
          <b className="pv-h">Ingressos</b>
          {secs.map(({ k, types, from }, i) => (
            <div key={k.id} className="pv-sec">
              {(d.sectors.length > 1 || d.tmode === "mapa") && <div className="pv-sh"><i style={{ background: k.color }} /><b>{k.name}</b><span className="s">{from === null ? "" : from === 0 ? "Grátis" : `a partir de ${brMoney(from)}`}</span></div>}
              {(i === 0 || d.sectors.length === 1) && types.slice(0, 3).map((t) => (
                <div key={t.id} className="pv-ti"><b>{t.name}</b><strong>{t.free ? "Grátis" : num(t.price) ? `${brMoney(num(t.price))}${d.fee ? " +tx" : ""}` : "R$ —"}</strong></div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="pv-buy"><div><span>{minP === null ? "Defina os ingressos" : minP === 0 ? "Tem ingresso grátis" : `a partir de ${brMoney(minP)}`}</span><em>{d.saleStart.trim() ? "Me avise" : "Comprar"}</em></div></div>
    </div></div>
  );
}
