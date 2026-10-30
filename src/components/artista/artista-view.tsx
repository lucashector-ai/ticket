"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { SiteHeader, type HeaderUser } from "@/components/site-header";
import { useToast } from "@/components/toast";
import { toggleFollow } from "@/lib/actions/social";
import { updateArtistBio } from "@/lib/actions/artista";
import { connectArtistSpotify } from "@/lib/actions/spotify";
import { SpotifyArtistSearch, SpotifyIcon } from "@/components/spotify-search";
import { BustIcon, HeroArt } from "./hero-art";

export type ArtistaTrack = { title: string; plays: string; duration: string; grad: string };
export type ArtistaShow = { slug: string; title: string; venue: string; city: string; day: string; mon: string; own: boolean };
export type ArtistaSimilar = { slug: string; name: string; genre: string; grad: string; fg: string; image: string | null };
export type ArtistaSpotify = { id: string; url: string; image: string | null; genres: string[]; releases: { id: string; name: string; type: string; year: string; image: string | null; url: string }[] };

export type ArtistaProps = {
  user: HeaderUser;
  loggedIn: boolean;
  slug: string;
  name: string;
  genre: string;
  city: string;
  verified: boolean;
  /** "1,2 mi ouvintes mensais" / "80 mil seguidores no Spotify"; null quando não há número */
  listeners: string | null;
  palette: { bg: string; fg: string; accent: string };
  avatarGrad: string;
  bio: string[];
  /** quando o "Sobre" vem de fora (Wikipédia) */
  bioSource: { name: string; url: string } | null;
  /** texto escrito pelo produtor (vazio = usa Wikipédia/nada) */
  bioRaw: string;
  /** foto do artista (Spotify ou enviada) */
  image: string | null;
  stats: { fans: string; shows: string; cities: string };
  links: { spotify: string | null; youtube: string | null; instagram: string | null; deezer: string | null };
  tracks: ArtistaTrack[];
  shows: ArtistaShow[];
  similar: ArtistaSimilar[];
  following: boolean;
  artistId: string;
  /** dono de evento com este artista: pode ligar a página ao Spotify */
  canEdit: boolean;
  spotify: ArtistaSpotify | null;
};

const PREVIEW = 30;

function Eq({ paused = false }: { paused?: boolean }) {
  return (
    <span className={paused ? "eq pz" : "eq"} aria-hidden="true"><i /><i /><i /><i /></span>
  );
}

const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8L13.4 8z" fill="currentColor" /></svg>
);
const PauseIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
    <rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" />
  </svg>
);

export function ArtistaView(p: ArtistaProps) {
  const router = useRouter();
  const { flash } = useToast();
  const [following, setFollowing] = useState(p.following);
  const [, startTransition] = useTransition();

  // player mock (prévia de 30s por faixa, sem áudio)
  const [track, setTrack] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);

  const plStart = (ti: number) => {
    if (track === ti) { setPaused((v) => !v); return; }
    setTrack(ti); setPos(0); setPaused(false);
  };

  useEffect(() => {
    if (track === null || paused) return;
    const iv = setInterval(() => {
      setPos((cur) => {
        const next = cur + 0.25;
        if (next >= PREVIEW) {
          const n = track + 1;
          if (n < p.tracks.length) { setTrack(n); return 0; }
          setTrack(null); return 0;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(iv);
  }, [track, paused, p.tracks.length]);

  const mine = track !== null;
  const on = mine && !paused;
  const heroLabel = on ? "Tocando" : mine ? "Continuar" : "Ouvir artista";
  const playTop = () => {
    if (mine) setPaused((v) => !v);
    else if (p.tracks.length) plStart(0);
    else if (p.spotify) document.getElementById("ouvir")?.scrollIntoView({ behavior: "smooth", block: "center" });
    else flash("Prévia disponível em breve.");
  };

  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/explorar");
  };

  const onFollow = () => {
    if (!p.loggedIn) {
      flash("Entre para seguir artistas.");
      router.push(`/entrar?next=${encodeURIComponent(`/artistas/${p.slug}`)}`);
      return;
    }
    const next = !following;
    setFollowing(next);
    flash(next ? `Você agora segue ${p.name}` : `Você deixou de seguir ${p.name}`);
    startTransition(async () => {
      try {
        const r = await toggleFollow("artist", p.artistId);
        if (!r.auth) { setFollowing(false); router.push(`/entrar?next=${encodeURIComponent(`/artistas/${p.slug}`)}`); return; }
        setFollowing(r.following);
      } catch {
        setFollowing(!next);
        flash("Não foi possível atualizar. Tente de novo.");
      }
    });
  };

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : `/artistas/${p.slug}`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: `${p.name} · Tickets Win`, url });
        return;
      }
    } catch { return; }
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copiado.");
    } catch {
      flash("Não foi possível copiar o link.");
    }
  };

  const sec = Math.floor(pos);
  const cur = track !== null ? p.tracks[track] : null;
  const pct = Math.round((pos / PREVIEW) * 1000) / 10;
  const social = [
    { key: "spotify", label: "Spotify", href: p.links.spotify, icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.6c2.5-.7 5.2-.4 7.3.8M8.6 15.4c2-.5 4-.3 5.6.6" /></svg>
    ) },
    { key: "youtube", label: "YouTube", href: p.links.youtube, icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" /></svg>
    ) },
    { key: "instagram", label: "Instagram", href: p.links.instagram, icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>
    ) },
    { key: "deezer", label: "Deezer", href: p.links.deezer, icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 16v-2M8 16v-5M12 16V8M16 16v-6M20 16v-3" /></svg>
    ) },
  ].filter((s) => !!s.href);

  return (
    <>
      <SiteHeader user={p.user} variant="default" onImage />
      <div id="topo">
        <section className="ah2" aria-labelledby="ar-t">
          <div className="ah2-top">
            <nav className="crumb2" aria-label="Navegação">
              <button className="gpill" type="button" onClick={back}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
                Voltar
              </button>
              <span>Artistas</span>
              <span aria-hidden="true">/</span>
              <span>{p.genre}</span>
            </nav>
          </div>
          <div className="ah2-in">
            <div className="ah-id">
              {p.verified && (
                <span className="ah-ver">
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2l2.4 2.2 3.2-.4.9 3.1 2.9 1.5-1 3.1 1 3.1-2.9 1.5-.9 3.1-3.2-.4L12 22l-2.4-2.2-3.2.4-.9-3.1-2.9-1.5 1-3.1-1-3.1 2.9-1.5.9-3.1 3.2.4z" fill="#D3F55B" />
                    <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#111111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Artista verificado
                </span>
              )}
              <h1 className="ah-n" id="ar-t">{p.name}</h1>
              <p className="ah-m">
                {p.genre}{p.city ? ` · ${p.city}` : ""}{p.listeners && <> · <b>{p.listeners.split(" ")[0]}</b> {p.listeners.split(" ").slice(1).join(" ")}</>}
              </p>
              <div className="ah-acts">
                <button className="ah-play" type="button" onClick={playTop}>
                  <span className="ap-i">{on ? <Eq /> : <PlayIcon />}</span>
                  {heroLabel}
                </button>
                <button className={following ? "ah-fol on" : "ah-fol"} type="button" onClick={onFollow} aria-pressed={following}>
                  {following ? "Seguindo" : "Seguir"}
                </button>
                <button className="gbtn" type="button" onClick={share} aria-label="Compartilhar">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>
                </button>
              </div>
            </div>
            <div className="ah2-ph">
              {p.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img className="ah2-img" src={p.image} alt={`Foto de ${p.name}`} />
                : <HeroArt accent={p.palette.accent} />}
            </div>
          </div>
        </section>

        <main className="wrap">
          <div className="ab">
            <div className="col">
              <div className="blk-s">
                <h2>Sobre</h2>
                {p.canEdit
                  ? <BioEditor artistId={p.artistId} name={p.name} bio={p.bio} raw={p.bioRaw} source={p.bioSource} />
                  : <>
                      {p.bio.map((t, i) => <p className="ab-bio" key={i}>{t}</p>)}
                      {p.bioSource && <p className="ab-src">Fonte: <a href={p.bioSource.url} target="_blank" rel="noreferrer">{p.bioSource.name}</a></p>}
                    </>}
                {p.spotify && p.spotify.genres.length > 0 && (
                  <div className="ab-gen">{p.spotify.genres.map((g) => <span key={g}>{g}</span>)}</div>
                )}
                <div className="ab-st">
                  <div><b className="st-v">{p.stats.fans}</b><span className="st-l">Seguidores na Tickets Win</span></div>
                  <div><b className="st-v">{p.stats.shows}</b><span className="st-l">Próximos shows</span></div>
                  <div><b className="st-v">{p.stats.cities}</b><span className="st-l">Cidades na agenda</span></div>
                </div>
              </div>

              {p.tracks.length > 0 && (
                <div className="blk-s">
                  <h2>Mais ouvidas</h2>
                  <ul className="tr">
                    {p.tracks.map((t, j) => {
                      const isCur = track === j;
                      const playing = isCur && !paused;
                      return (
                        <li key={j}>
                          <button className={isCur ? "tr-r on" : "tr-r"} type="button" onClick={() => plStart(j)} aria-label={`${playing ? "Pausar" : "Ouvir"} ${t.title}`}>
                            <span className="tr-n">{playing ? <Eq /> : j + 1}</span>
                            <span className="tr-c" style={{ background: t.grad }} />
                            <span className="tr-t"><b>{t.title}</b><span className="tr-pl">{t.plays}</span></span>
                            <span className="tr-d">{t.duration}</span>
                            <span className="tr-p" aria-hidden="true">{playing ? <PauseIcon /> : <PlayIcon size={16} />}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {p.spotify && !p.tracks.length && (
                <div className="blk-s" id="ouvir">
                  <h2>Ouça agora</h2>
                  <iframe className="sp-emb" title={`${p.name} no Spotify`} src={`https://open.spotify.com/embed/artist/${p.spotify.id}?utm_source=generator&theme=0`}
                    height="352" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
                </div>
              )}

              {p.spotify && p.spotify.releases.length > 0 && (
                <div className="blk-s">
                  <h2>Lançamentos</h2>
                  <div className="rel">
                    {p.spotify.releases.map((r) => (
                      <a className="rel-i" key={r.id} href={r.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.image ? <img src={r.image} alt="" loading="lazy" /> : <span className="rel-ph" />}
                        <b>{r.name}</b>
                        <span>{[r.type, r.year].filter(Boolean).join(" · ")}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {p.canEdit && <SpotifyLink artistId={p.artistId} name={p.name} linked={!!p.spotify} />}

              {social.length > 0 && (
                <div className="blk-s">
                  <h2>Ouça e acompanhe</h2>
                  <div className="ab-pl">
                    {social.map((s) => (
                      <a className="plc" key={s.key} href={s.href!} target="_blank" rel="noreferrer">{s.icon}{s.label}</a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="ab-side" aria-labelledby="sh-t">
              <div className="shw">
                <div className="shw-h">
                  <h2 id="sh-t">Próximos shows</h2>
                  <span className="shw-n">{p.shows.length} {p.shows.length === 1 ? "data" : "datas"}</span>
                </div>
                {p.shows.length === 0 && <p className="sh-w" style={{ padding: "10px 0 4px" }}>Nenhuma data anunciada por enquanto.</p>}
                {p.shows.map((w) => (
                  <div className={w.own ? "sh-r hl" : "sh-r"} key={w.slug}>
                    <span className="sh-d">
                      <span className="sh-dd">{w.day}</span>
                      <span className="sh-dm">{w.mon}</span>
                    </span>
                    <div className="sh-i">
                      <b>{w.title}</b>
                      <span className="sh-w">{w.venue}{w.city ? ` · ${w.city}` : ""}</span>
                      <Link className="sh-go" href={`/eventos/${w.slug}`}>
                        Ingressos
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" /></svg>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <section className="more" aria-labelledby="sim-t">
            <div className="more-h">
              <h2 id="sim-t">Artistas parecidos</h2>
              <Link href="/explorar">Ver todos →</Link>
            </div>
            <div className="sim">
              {p.similar.map((m) => (
                <Link className="sim-b" href={`/artistas/${m.slug}`} key={m.slug}>
                  <span className="sim-ph" style={{ background: m.grad, color: m.fg }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {m.image ? <img src={m.image} alt="" loading="lazy" /> : <BustIcon />}
                  </span>
                  <b>{m.name}</b>
                  <span className="sim-g">{m.genre}</span>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>

      {cur && (
        <div className="pl" role="region" aria-label="Prévia tocando">
          <span className="pl-c" style={{ background: cur.grad, color: p.palette.fg }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.image ? <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} /> : <BustIcon />}
          </span>
          <div className="pl-t">
            <b>{cur.title}</b>
            <span className="pl-s">
              <Eq paused={paused} />
              {p.name} · Prévia 0:{sec < 10 ? "0" : ""}{sec} / 0:{PREVIEW}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button className="pl-b" type="button" onClick={() => setPaused((v) => !v)} aria-label={paused ? "Continuar" : "Pausar"}>
              {paused ? <PlayIcon size={16} /> : <PauseIcon />}
            </button>
            <button className="pl-x" type="button" onClick={() => setTrack(null)} aria-label="Fechar prévia">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
            </button>
          </div>
          <span className="pl-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        </div>
      )}
    </>
  );
}

/** Para quem tem evento com o artista: liga a página ao perfil do Spotify. */
function SpotifyLink({ artistId, name, linked }: { artistId: string; name: string; linked: boolean }) {
  const router = useRouter();
  const { flash } = useToast();
  const [open, setOpen] = useState(!linked);
  const [q, setQ] = useState(name);
  const [busy, startBusy] = useTransition();
  const link = (spotify: string) => startBusy(async () => {
    const r = await connectArtistSpotify(artistId, spotify).catch(() => ({ ok: false as const, error: "Não foi possível ligar agora." }));
    if (!r.ok) { flash(r.error); return; }
    flash("Página ligada ao Spotify.");
    setOpen(false);
    router.refresh();
  });
  if (!open) {
    return <button className="sp-chg" type="button" onClick={() => setOpen(true)}><SpotifyIcon size={14} />Trocar perfil do Spotify</button>;
  }
  return (
    <div className="sp-own">
      <div className="sp-own-h"><SpotifyIcon size={22} /><div><b>{linked ? "Trocar o perfil do Spotify" : "Ligue esta página ao Spotify"}</b><span>Só você vê isto. Escolha o artista e a página ganha foto, gêneros, lançamentos e o player. Também dá para colar o link do perfil.</span></div></div>
      <SpotifyArtistSearch value={q} onChange={setQ} onPick={(a) => link(a.id)} onPlain={(v) => link(v)} placeholder="Nome do artista ou link do Spotify" />
      {busy && <span className="sp-own-b">Ligando…</span>}
      {linked && <button className="sp-chg" type="button" onClick={() => setOpen(false)}>Cancelar</button>}
    </div>
  );
}

/** Para quem tem evento com o artista: escreve o "Sobre" (vale mais que a Wikipédia). */
function BioEditor({ artistId, name, bio, raw, source }: { artistId: string; name: string; bio: string[]; raw: string; source: { name: string; url: string } | null }) {
  const router = useRouter();
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(raw || bio.join("\n\n"));
  const [busy, startBusy] = useTransition();
  const save = () => startBusy(async () => {
    const r = await updateArtistBio(artistId, text).catch(() => ({ ok: false as const, error: "Não foi possível salvar agora." }));
    if (!r.ok) { flash(r.error); return; }
    flash("Sobre atualizado.");
    setOpen(false);
    router.refresh();
  });
  if (open) {
    return (
      <div className="bio-ed">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={7} placeholder={`Conte quem é ${name}: estilo, trajetória, lançamentos recentes.`} aria-label={`Sobre ${name}`} autoFocus />
        <span className="bio-h">Separe os parágrafos com uma linha em branco. Deixe vazio para voltar a usar a Wikipédia, quando houver.</span>
        <div className="bio-a">
          <button className="bio-s" type="button" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
          <button className="sp-chg" type="button" onClick={() => setOpen(false)}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <>
      {bio.length ? bio.map((t, i) => <p className="ab-bio" key={i}>{t}</p>) : <p className="ab-bio" style={{ color: "#9A9AA0" }}>Ainda não há texto sobre {name}.</p>}
      {source && <p className="ab-src">Fonte: <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a></p>}
      <button className="sp-chg" style={{ marginTop: 12 }} type="button" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
        {raw ? "Editar o Sobre" : "Escrever o Sobre (só você vê este botão)"}
      </button>
    </>
  );
}
