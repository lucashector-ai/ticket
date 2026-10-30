"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import { uploadImage } from "@/components/criar/shared";
import { EventCard } from "@/components/event-card";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { useToast } from "@/components/toast";
import { createPost, deletePost, replyReview, setProducerImage, setProducerNotify, submitReview } from "@/lib/actions/produtor";
import { toggleFollow } from "@/lib/actions/social";
import type { EventCard as EventCardData } from "@/lib/data/events";
import { kLabel } from "@/lib/format";
import { EditSheet, type ProducerForm } from "./edit-sheet";

export type ProdutorProps = {
  user: HeaderUser;
  loggedIn: boolean;
  isOwner: boolean;
  org: ProducerForm & { id: string; slug: string; initials: string; verified: boolean; since: string };
  followers: number;
  following: boolean;
  notify: boolean;
  next: { slug: string; title: string; bannerId: string; dateLong: string; venue: string; city: string; uf: string; price: string; countdown: string; soldPct: number } | null;
  upcoming: EventCardData[];
  past: { slug: string; title: string; flyerId: string; date: string; venue: string; city: string; uf: string; rating: string | null; reviews: number }[];
  posts: { id: string; body: string; imageUrl: string | null; when: string; event: { slug: string; title: string } | null }[];
  reviews: { id: string; name: string; initials: string; rating: number; body: string | null; tags: string[]; reply: string | null; event: string; when: string }[];
  rating: { avg: string; n: number; dist: number[] };
  canReview: { id: string; title: string }[];
  venues: { name: string; city: string; n: number }[];
  myEvents: { id: string; title: string }[];
};

type Tab = "prox" | "nov" | "pass" | "aval" | "sobre";

const Star = ({ size = 14, cls }: { size?: number; cls?: string }) => (
  <svg className={cls} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" /></svg>
);
const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
);
const Bell = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
);
const Camera = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
);
const REVIEW_TAGS = ["Som", "Organização", "Lugar", "Bar", "Atendimento", "Line-up", "Segurança", "Entrada rápida"];
const POLICY_DEFAULT = {
  cancel: "Até 7 dias após a compra, com 48h de antecedência do evento.",
  meia: "Conforme a Lei 12.933. Documento na entrada.",
  transfer: "Liberada em Meus ingressos até o início do evento.",
  access: "",
};

export function ProdutorView(p: ProdutorProps) {
  const router = useRouter();
  const { flash } = useToast();
  const o = p.org;
  const [tab, setTab] = useState<Tab>(p.next || p.upcoming.length || !p.posts.length ? "prox" : "nov");
  const [following, setFollowing] = useState(p.following);
  const [notify, setNotify] = useState(p.notify);
  const [followers, setFollowers] = useState(p.followers);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();
  const goLogin = () => router.push(`/entrar?next=${encodeURIComponent(`/produtor/${o.slug}`)}`);

  const onFollow = () => {
    if (!p.loggedIn) { goLogin(); return; }
    const nx = !following;
    setFollowing(nx); setFollowers((n) => n + (nx ? 1 : -1)); if (!nx) setNotify(false);
    flash(nx ? `Você agora segue ${o.name}` : `Você deixou de seguir ${o.name}`);
    start(async () => { const r = await toggleFollow("organizer", o.id).catch(() => null); if (r) setFollowing(r.following); });
  };
  const onBell = (on = !notify) => {
    if (!p.loggedIn) { goLogin(); return; }
    if (on && !following) { setFollowing(true); setFollowers((n) => n + 1); }
    setNotify(on);
    flash(on ? "Avisos ligados: você fica sabendo da pré-venda primeiro." : "Avisos desligados.");
    start(async () => { await setProducerNotify(o.id, on).catch(() => null); });
  };
  const share = async () => {
    const url = window.location.href;
    try { if (typeof navigator.share === "function") { await navigator.share({ title: `${o.name} · Tickets Win`, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(url); flash("Link copiado."); } catch { flash("Não foi possível copiar o link."); }
  };

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "prox", label: "Próximos", n: p.upcoming.length + (p.next ? 1 : 0) },
    { id: "nov", label: "Novidades", n: p.posts.length },
    { id: "pass", label: "Passados", n: p.past.length },
    { id: "aval", label: "Avaliações", n: p.rating.n },
    { id: "sobre", label: "Sobre" },
  ];

  return (
    <>
      <SiteHeader user={p.user} variant="default" />
      <main className="wrap pf">
        <section className="pf-hero" aria-labelledby="pf-n">
          <div className="pf-cover">
            {o.coverUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={o.coverUrl} alt="" />
              : (
                <div className="pf-pat" aria-hidden="true">
                  {["", " b", ""].map((c, i) => <span key={i} className={`pp-r${c}`}>{o.name} · {o.name} · {o.name}</span>)}
                </div>
              )}
            <span className="pf-cv-sh" aria-hidden="true" />
            {p.isOwner && <ImageButton orgId={o.id} kind="cover" label="Trocar capa" />}
          </div>
          <div className="pf-id">
            <div className="pf-avw">
              <span className="pf-av" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.avatarUrl ? <img src={o.avatarUrl} alt="" /> : o.initials}
              </span>
              {p.isOwner && <ImageButton orgId={o.id} kind="avatar" label="" />}
            </div>
            <div className="pf-txt">
              <div className="pf-nr">
                <h1 className="pf-n" id="pf-n">{o.name}</h1>
                {o.verified && (
                  <span className="pf-ver">
                    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.5-1 3.1 1 3.1-2.9 1.5-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.5 1-3.1-1-3.1 2.9-1.5.9-3.1 3.2.4z" fill="#111111" /><path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#D3F55B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Produtor verificado
                  </span>
                )}
                {p.isOwner && <span className="own-k">Sua página</span>}
              </div>
              {o.tagline
                ? <p className="pf-tag">{o.tagline}</p>
                : p.isOwner && <p className="pf-tag empty-own">Adicione uma frase que resuma seus eventos.</p>}
              <ul className="pf-stats">
                <li><b className="st-v">{kLabel(followers)}</b><span className="st-k">seguidores</span></li>
                <li><b className="st-v">{p.past.length}</b><span className="st-k">eventos realizados</span></li>
                <li>{p.rating.n ? <b className="st-v">{p.rating.avg}<Star /></b> : <b className="st-v">Novo</b>}<span className="st-k">{p.rating.n ? `${p.rating.n} ${p.rating.n === 1 ? "avaliação" : "avaliações"}` : "sem avaliações"}</span></li>
                <li><b className="st-v">{o.since}</b><span className="st-k">na Tickets Win desde</span></li>
              </ul>
            </div>
            <div className="pf-act">
              {p.isOwner ? (
                <button className="edit-b" type="button" onClick={() => setEditing(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
                  Editar perfil
                </button>
              ) : (
                <>
                  <button className={following ? "fol on" : "fol"} type="button" onClick={onFollow} aria-pressed={following}>
                    {following && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                    {following ? "Seguindo" : "Seguir"}
                  </button>
                  <button className={notify ? "pf-ic on" : "pf-ic"} type="button" onClick={() => onBell()} aria-pressed={notify} aria-label={notify ? "Desligar avisos" : "Avisar da pré-venda"} title={notify ? "Desligar avisos" : "Avisar da pré-venda"}><Bell /></button>
                </>
              )}
              <button className="pf-ic" type="button" onClick={share} aria-label="Compartilhar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
              </button>
            </div>
          </div>
        </section>

        <nav className="pf-tabs" aria-label="Seções do produtor">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? "tb on" : "tb"} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id}>
              {t.label}{t.n ? <span className="tb-n">{t.n}</span> : null}
            </button>
          ))}
        </nav>

        {tab === "prox" && <Upcoming p={p} notify={notify} onBell={() => onBell(true)} />}
        {tab === "nov" && <Posts p={p} />}
        {tab === "pass" && <Past p={p} />}
        {tab === "aval" && <Reviews p={p} />}
        {tab === "sobre" && <About p={p} onEdit={() => setEditing(true)} />}
      </main>
      {editing && <EditSheet orgId={o.id} initial={o} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh(); }} />}
    </>
  );
}

/** Botão de câmera do dono: troca a capa ou a foto na hora. */
function ImageButton({ orgId, kind, label }: { orgId: string; kind: "avatar" | "cover"; label: string }) {
  const router = useRouter();
  const { flash } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const up = await uploadImage(f);
    if (!up.ok) { setBusy(false); flash(up.error); return; }
    const r = await setProducerImage(orgId, kind, up.url);
    setBusy(false);
    if (ref.current) ref.current.value = "";
    if (!r.ok) { flash(r.error); return; }
    flash(kind === "cover" ? "Capa atualizada." : "Foto atualizada.");
    router.refresh();
  };
  return (
    <label className="pf-cam" aria-label={kind === "cover" ? "Trocar capa" : "Trocar foto"}>
      <input ref={ref} className="sr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pick(e.target.files?.[0])} disabled={busy} />
      <Camera />{busy ? "Enviando…" : label}
    </label>
  );
}

function Upcoming({ p, notify, onBell }: { p: ProdutorProps; notify: boolean; onBell: () => void }) {
  const [city, setCity] = useState("Todas");
  const cities = useMemo(() => ["Todas", ...new Set(p.upcoming.map((e) => e.city).filter(Boolean))], [p.upcoming]);
  const rest = city === "Todas" ? p.upcoming : p.upcoming.filter((e) => e.city === city);
  const n = p.next;
  return (
    <div className="pane">
      {n && (
        <article className="nx">
          <Link className="nx-art" href={`/eventos/${n.slug}`} tabIndex={-1} aria-hidden="true"><BannerArt id={n.bannerId} fit="card" /></Link>
          <div className="nx-i">
            <span className="nx-k"><span className="nx-dot" aria-hidden="true" />Próximo evento · {n.countdown}</span>
            <h2 className="nx-t">{n.title}</h2>
            <p className="nx-d">{n.dateLong}</p>
            <p className="nx-w">{n.venue}{n.city ? ` · ${n.city}, ${n.uf}` : ""}</p>
            {n.soldPct > 0 && <div className="nx-sell"><span className="nx-bar"><i style={{ width: `${n.soldPct}%` }} /></span><span className="nx-sl">{n.soldPct}% vendido</span></div>}
            <div className="nx-f"><span className="nx-p">A partir de<b className="nx-pv">{n.price}</b></span><Link className="go3" href={`/eventos/${n.slug}`}>Ver ingressos<Arrow /></Link></div>
          </div>
        </article>
      )}
      {!n && <div className="empty">{p.isOwner ? "Você não tem eventos à venda agora. Que tal criar o próximo?" : "Nenhum evento anunciado por enquanto."}{p.isOwner && <><br /><br /><Link className="go3" href="/criar-evento">Criar evento</Link></>}</div>}

      {p.upcoming.length > 0 && (
        <>
          <div className="sec-h" style={{ marginTop: n ? 0 : 48 }}>
            <h2 className="sec-t">Agenda</h2>
            {cities.length > 2 && <div className="cities">{cities.map((c) => <button key={c} className={city === c ? "cty on" : "cty"} type="button" onClick={() => setCity(c)}>{c}</button>)}</div>}
          </div>
          {rest.length ? <div className="grid pf-grid">{rest.map((e) => <EventCard key={e.slug} e={e} className="card" />)}</div> : <div className="empty">Nenhum outro evento nessa cidade por enquanto.</div>}
        </>
      )}

      {!p.isOwner && (
        <div className={notify ? "alrt on" : "alrt"}>
          <span className="al-ic" aria-hidden="true"><Bell /></span>
          <div className="al-i">
            <b className="al-t">{notify ? "Avisos ligados" : `Fique sabendo antes da pré-venda`}</b>
            <span className="al-s">{notify ? `Você recebe um aviso quando ${p.org.name} anunciar datas novas.` : `Siga ${p.org.name} e ligue os avisos para garantir o primeiro lote.`}</span>
          </div>
          {!notify && <button className="go3 limeb" type="button" onClick={onBell}>Seguir e ativar avisos</button>}
        </div>
      )}
    </div>
  );
}

function Posts({ p }: { p: ProdutorProps }) {
  const router = useRouter();
  const { flash } = useToast();
  const o = p.org;
  const [body, setBody] = useState("");
  const [img, setImg] = useState<string | null>(null);
  const [ev, setEv] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const r = await uploadImage(f);
    setBusy(false);
    if (file.current) file.current.value = "";
    if (!r.ok) { flash(r.error); return; }
    setImg(r.url);
  };
  const publish = async () => {
    setBusy(true);
    const r = await createPost(o.id, { body, imageUrl: img, eventId: ev || null });
    setBusy(false);
    if (!r.ok) { flash(r.error); return; }
    setBody(""); setImg(null); setEv("");
    flash("Publicado.");
    router.refresh();
  };
  const remove = async (id: string) => {
    if (!window.confirm("Apagar esta publicação?")) return;
    const r = await deletePost(id);
    if (!r.ok) { flash(r.error); return; }
    router.refresh();
  };
  return (
    <div className="pane feed">
      {p.isOwner && (
        <div className="cmp">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Conte uma novidade: line-up confirmado, virada de lote, fotos do último evento…" aria-label="Nova publicação" />
          {img && (
            <div className="cmp-pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="Foto da publicação" />
              <button type="button" onClick={() => setImg(null)} aria-label="Tirar foto">×</button>
            </div>
          )}
          <div className="cmp-r">
            <label className="chip-b">
              <input ref={file} className="sr" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void pick(e.target.files?.[0])} />
              <Camera />Foto
            </label>
            {p.myEvents.length > 0 && (
              <select value={ev} onChange={(e) => setEv(e.target.value)} aria-label="Ligar a um evento">
                <option value="">Ligar a um evento (opcional)</option>
                {p.myEvents.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
              </select>
            )}
            <button className="cmp-go" type="button" onClick={() => void publish()} disabled={busy || (!body.trim() && !img)}>{busy ? "Aguarde…" : "Publicar"}</button>
          </div>
        </div>
      )}
      {p.posts.length === 0 && <div className="empty">{p.isOwner ? "Suas novidades aparecem aqui para quem segue você." : "Nenhuma novidade por enquanto."}</div>}
      {p.posts.map((x) => (
        <article className="post" key={x.id}>
          <div className="post-h">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="post-av" aria-hidden="true">{o.avatarUrl ? <img src={o.avatarUrl} alt="" /> : o.initials}</span>
            <span className="post-id"><b className="post-n">{o.name}</b><span className="post-w">{x.when}</span></span>
            {p.isOwner && <button className="post-x" type="button" onClick={() => void remove(x.id)}>Apagar</button>}
          </div>
          {x.body && <p className="post-t">{x.body}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {x.imageUrl && <img className="post-img" src={x.imageUrl} alt="" loading="lazy" />}
          {x.event && <Link className="post-ev" href={`/eventos/${x.event.slug}`}>{x.event.title}<Arrow /></Link>}
        </article>
      ))}
    </div>
  );
}

function Past({ p }: { p: ProdutorProps }) {
  if (!p.past.length) return <div className="pane"><div className="empty">Nenhum evento realizado na Tickets Win ainda.</div></div>;
  return (
    <div className="pane">
      <div className="sec-h"><h2 className="sec-t">Eventos que já aconteceram</h2><span className="sec-s">{p.past.length} {p.past.length === 1 ? "evento" : "eventos"} desde {p.org.since}</span></div>
      <div className="grid pf-grid">
        {p.past.map((c) => (
          <article className="hcard past" key={c.slug}>
            <div className="hc-img"><div className="in"><FlyerArt id={c.flyerId} /></div></div>
            <h3 className="hc-t">{c.title}</h3>
            <p className="hc-d">{c.date}</p>
            <p className="hc-w">{c.venue}{c.city && <span className="hc-city">{c.city}, {c.uf}</span>}</p>
            <div className="pst">
              {c.rating ? <span className="pst-r"><Star />{c.rating}</span> : <span>Sem avaliações</span>}
              {c.reviews > 0 && <span className="pst-a">{c.reviews} {c.reviews === 1 ? "avaliação" : "avaliações"}</span>}
            </div>
            <Link className="hc-open" href={`/eventos/${c.slug}`} aria-label={`Ver ${c.title}`} />
          </article>
        ))}
      </div>
    </div>
  );
}

function Reviews({ p }: { p: ProdutorProps }) {
  const [filter, setFilter] = useState<"all" | "5" | "rep">("all");
  const list = p.reviews.filter((r) => filter === "all" || (filter === "5" ? r.rating === 5 : !!r.reply));
  const avgN = Number(p.rating.avg.replace(",", ".")) || 0;
  return (
    <div className="pane rv2" style={p.rating.n ? undefined : { gridTemplateColumns: "minmax(0,1fr)", maxWidth: 760 }}>
      {p.rating.n > 0 && <aside className="rv-sum">
        <b className="rv-big">{p.rating.avg}</b>
        <div className="rv-stars" aria-label={`Nota ${p.rating.avg} de 5`}>{[1, 2, 3, 4, 5].map((k) => <Star key={k} size={20} cls={k <= Math.round(avgN) ? "sf" : "se"} />)}</div>
        <span className="rv-n">{p.rating.n} {p.rating.n === 1 ? "avaliação" : "avaliações"} de quem comprou pela Tickets Win</span>
        <div className="rv-bars">
          {p.rating.dist.map((pct, i) => (
            <div className="rb" key={i}><span className="rb-k">{5 - i}</span><span className="rb-b"><i style={{ width: `${pct}%` }} /></span><span className="rb-v">{pct}%</span></div>
          ))}
        </div>
      </aside>}
      <div className="rv-list">
        {p.canReview.length > 0 && <ReviewForm events={p.canReview} />}
        {p.reviews.length > 0 && (
          <div className="cities">
            {([["all", "Todas"], ["5", "5 estrelas"], ["rep", "Com resposta"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "cty on" : "cty"} type="button" onClick={() => setFilter(k)}>{l}</button>)}
          </div>
        )}
        {list.length === 0 && <div className="empty">{p.reviews.length ? "Nenhuma avaliação com esse filtro." : "Ainda não há avaliações. Quem vai a um evento com ingresso da Tickets Win pode avaliar depois."}</div>}
        {list.map((r) => (
          <article className="rvw" key={r.id}>
            <div className="rvw-h">
              <span className="rvw-av" style={{ background: "#F2FBD6" }} aria-hidden="true">{r.initials}</span>
              <div className="rvw-id"><b className="rvw-n">{r.name}</b><span className="rvw-m">{r.event} · {r.when}</span></div>
              <span className="rvw-s" aria-label={`${r.rating} estrelas`}>{[1, 2, 3, 4, 5].map((k) => <Star key={k} cls={k <= r.rating ? "sf" : "se"} />)}</span>
            </div>
            {r.body && <p className="rvw-t">{r.body}</p>}
            <div className="rvw-tags">
              <span className="rvw-ok"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Comprou ingresso</span>
              {r.tags.map((t) => <span className="rvw-tag" key={t}>{t}</span>)}
            </div>
            {r.reply && <div className="rvw-rep"><b className="rp-n">Resposta de {p.org.name}</b><span className="rp-t">{r.reply}</span></div>}
            {p.isOwner && <ReplyBox id={r.id} current={r.reply} />}
          </article>
        ))}
      </div>
    </div>
  );
}

function ReviewForm({ events }: { events: { id: string; title: string }[] }) {
  const router = useRouter();
  const { flash } = useToast();
  const [ev, setEv] = useState(events[0].id);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!rating) { flash("Escolha de 1 a 5 estrelas."); return; }
    setBusy(true);
    const r = await submitReview({ eventId: ev, rating, body, tags });
    setBusy(false);
    if (!r.ok) { flash(r.error); return; }
    flash("Obrigado pela avaliação!");
    setRating(0); setBody(""); setTags([]);
    router.refresh();
  };
  return (
    <div className="rvf">
      <b>Você foi{events.length === 1 ? ` em ${events[0].title}` : ""}. Como foi?</b>
      {events.length > 1 && <select value={ev} onChange={(e) => setEv(e.target.value)} aria-label="Evento">{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</select>}
      <div className="rvf-st" role="radiogroup" aria-label="Nota">
        {[1, 2, 3, 4, 5].map((k) => <button key={k} type="button" role="radio" aria-checked={rating === k} aria-label={`${k} estrelas`} className={k <= rating ? "on" : ""} onClick={() => setRating(k)}><Star size={30} /></button>)}
      </div>
      <div className="rvf-tg">{REVIEW_TAGS.map((t) => <button key={t} type="button" className={tags.includes(t) ? "on" : ""} onClick={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t].slice(0, 6)))}>{t}</button>)}</div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} placeholder="Conte como foi (opcional)" aria-label="Comentário" />
      <button className="go3 limeb" type="button" onClick={() => void send()} disabled={busy}>{busy ? "Enviando…" : "Publicar avaliação"}</button>
    </div>
  );
}

function ReplyBox({ id, current }: { id: string; current: string | null }) {
  const router = useRouter();
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current ?? "");
  if (!open) return <button className="rp-b" type="button" onClick={() => setOpen(true)}>{current ? "Editar resposta" : "Responder"}</button>;
  return (
    <div className="rp-f">
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} placeholder="Agradeça, explique ou conte o que vai melhorar." aria-label="Resposta" autoFocus />
      <div style={{ display: "flex", gap: 8 }}>
        <button className="go3" style={{ height: 40, padding: "0 18px", fontSize: 14 }} type="button" onClick={async () => { const r = await replyReview(id, text); if (!r.ok) { flash(r.error); return; } setOpen(false); router.refresh(); }}>Salvar resposta</button>
        <button className="cty" type="button" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}

function About({ p, onEdit }: { p: ProdutorProps; onEdit: () => void }) {
  const o = p.org;
  const bio = o.bio.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const pol = [
    ["Cancelamento", o.policies.cancel || POLICY_DEFAULT.cancel],
    ["Meia-entrada", o.policies.meia || POLICY_DEFAULT.meia],
    ["Transferência", o.policies.transfer || POLICY_DEFAULT.transfer],
    ["Acessibilidade", o.policies.access || POLICY_DEFAULT.access],
  ].filter(([, v]) => v);
  const insta = o.instagram ? `https://instagram.com/${o.instagram}` : null;
  const wa = o.whatsapp.replace(/\D/g, "");
  return (
    <div className="pane ab2" id="sobre">
      <div className="ab-main">
        <h2 className="sec-t">Sobre</h2>
        {bio.length ? bio.map((t, i) => <p className="ab-p" key={i}>{t}</p>) : (
          p.isOwner
            ? <p className="ab-p empty-own">Conte a história de {o.name}: há quanto tempo produz, o estilo dos eventos, o que o público pode esperar. <button className="rp-b" type="button" onClick={onEdit}>Escrever agora</button></p>
            : <p className="ab-p">{o.name} produz eventos na Tickets Win desde {o.since}.</p>
        )}
        {p.venues.length > 0 && (
          <>
            <h3 className="ab-h3">Onde {o.name} faz eventos</h3>
            <div className="ab-ven">
              {p.venues.map((v) => (
                <div className="vnu" key={`${v.name}${v.city}`}>
                  <span className="ven-i" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg></span>
                  <div><b className="ven-n">{v.name}</b><span className="ven-c">{v.city} · {v.n} {v.n === 1 ? "evento" : "eventos"}</span></div>
                </div>
              ))}
            </div>
          </>
        )}
        <h3 className="ab-h3">Política padrão</h3>
        <ul className="pol">{pol.map(([k, v]) => <li key={k}><b className="pol-k">{k}</b><span className="pol-v">{v}</span></li>)}</ul>
      </div>
      <aside className="ab-side">
        <div className="ctc">
          <b className="ct-t">Fale com {o.name}</b>
          <span className="ct-s">{o.contactEmail || wa ? "Dúvidas sobre ingressos, acessibilidade ou parcerias." : "Contato ainda não informado."}</span>
          {o.contactEmail && <a className="go3 block" href={`mailto:${o.contactEmail}?subject=${encodeURIComponent("Contato pela Tickets Win")}`}>Enviar mensagem</a>}
          <div className="ct-l">
            {insta && <a className="ct-a" href={insta} target="_blank" rel="noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>@{o.instagram}</a>}
            {o.website && <a className="ct-a" href={o.website} target="_blank" rel="noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18" /></svg>{o.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
            {wa && <a className="ct-a" href={`https://wa.me/${wa.length <= 11 ? `55${wa}` : wa}`} target="_blank" rel="noreferrer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" /></svg>WhatsApp</a>}
            {o.contactEmail && <span className="ct-a"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 7l9 6 9-6" /></svg>{o.contactEmail}</span>}
          </div>
          {(o.legalName || o.cnpj || o.cityName) && (
            <div className="ct-meta">
              {o.legalName && <span className="ctm">Razão social: {o.legalName}</span>}
              {o.cnpj && <span className="ctm">CNPJ: {o.cnpj}</span>}
              {o.cityName && <span className="ctm">Base: {o.cityName}{o.uf ? `, ${o.uf}` : ""}</span>}
            </div>
          )}
        </div>
        {!p.isOwner && <a className="rep" href={`mailto:ajuda@ticketswin.com.br?subject=${encodeURIComponent(`Denúncia: perfil ${o.name}`)}`}>Denunciar este perfil</a>}
      </aside>
    </div>
  );
}
