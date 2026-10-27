import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { SpotifyArtistData, SpotifyRelease } from "@/db/schema";

/*
 * Spotify Web API. O app está em modo de desenvolvimento, que desde fev/2026 não tem
 * "top tracks", popularidade nem seguidores do artista, e só libera o login de usuários
 * cadastrados no painel. Por isso tudo aqui trata cada campo como opcional.
 */

const API = "https://api.spotify.com/v1";
const ACCOUNTS = "https://accounts.spotify.com";
export const USER_SCOPES = "user-top-read user-follow-read";

function creds() {
  const id = process.env.SPOTIFY_CLIENT_ID, secret = process.env.SPOTIFY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}
export const spotifyEnabled = () => !!creds();

const basic = (c: { id: string; secret: string }) => `Basic ${btoa(`${c.id}:${c.secret}`)}`;

/** Token do app (client credentials), guardado no KV até perto de expirar. */
async function appToken(): Promise<string | null> {
  const c = creds();
  if (!c) return null;
  const { env } = await getCloudflareContext({ async: true });
  const cached = await env.KV.get("spotify:app-token");
  if (cached) return cached;
  const r = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { authorization: basic(c), "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  }).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json()) as { access_token: string; expires_in: number };
  await env.KV.put("spotify:app-token", j.access_token, { expirationTtl: Math.max(60, j.expires_in - 120) });
  return j.access_token;
}

async function api<T>(path: string, token: string | null): Promise<T | null> {
  if (!token) return null;
  const r = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json().catch(() => null)) as T | null;
}

type SImage = { url: string; width?: number | null };
type SArtist = { id: string; name: string; images?: SImage[]; genres?: string[]; followers?: { total?: number }; external_urls?: { spotify?: string } };
type SAlbum = { id: string; name: string; album_type?: string; release_date?: string; images?: SImage[]; external_urls?: { spotify?: string } };

/** Maior imagem até ~640px (o Spotify devolve 640, 320 e 160). */
const pickImage = (imgs: SImage[] | undefined, max = 640) =>
  (imgs ?? []).filter((i) => (i.width ?? 0) <= max).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ?? imgs?.[0]?.url ?? null;

export type SpotifyHit = { id: string; name: string; image: string | null; genres: string[] };

/** "https://open.spotify.com/intl-pt/artist/ID?si=…", "spotify:artist:ID" ou o próprio ID. */
export function spotifyArtistId(v: string): string | null {
  const s = v.trim();
  const m = s.match(/open\.spotify\.com\/(?:intl-[\w-]+\/)?artist\/([A-Za-z0-9]{22})/) ?? s.match(/^spotify:artist:([A-Za-z0-9]{22})$/) ?? s.match(/^([A-Za-z0-9]{22})$/);
  return m?.[1] ?? null;
}

export async function searchArtists(q: string): Promise<SpotifyHit[] | null> {
  const token = await appToken();
  if (!token) return null;
  const direct = spotifyArtistId(q);
  if (direct) {
    const a = await api<SArtist>(`/artists/${direct}`, token);
    return a ? [{ id: a.id, name: a.name, image: pickImage(a.images, 320), genres: a.genres ?? [] }] : [];
  }
  const j = await api<{ artists?: { items?: SArtist[] } }>(`/search?type=artist&market=BR&limit=8&q=${encodeURIComponent(q)}`, token);
  if (!j) return null;
  return (j.artists?.items ?? []).map((a) => ({ id: a.id, name: a.name, image: pickImage(a.images, 320), genres: a.genres ?? [] }));
}

/** Dados do artista para a página: foto, gêneros e lançamentos recentes. */
export async function fetchArtist(id: string): Promise<SpotifyArtistData | null> {
  const token = await appToken();
  const a = await api<SArtist>(`/artists/${id}`, token);
  if (!a) return null;
  const albums = await api<{ items?: SAlbum[] }>(`/artists/${id}/albums?include_groups=album,single&market=BR&limit=10`, token);
  const seen = new Set<string>();
  const releases: SpotifyRelease[] = [];
  for (const al of albums?.items ?? []) {
    const key = al.name.toLowerCase();
    if (seen.has(key)) continue; // a mesma faixa costuma vir repetida (versões, mercados)
    seen.add(key);
    releases.push({
      id: al.id, name: al.name, type: al.album_type === "album" ? "Álbum" : al.album_type === "compilation" ? "Coletânea" : "Single",
      year: (al.release_date ?? "").slice(0, 4), image: pickImage(al.images, 320),
      url: al.external_urls?.spotify ?? `https://open.spotify.com/album/${al.id}`,
    });
  }
  releases.sort((x, y) => y.year.localeCompare(x.year));
  return {
    name: a.name, url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}`,
    image: pickImage(a.images), genres: (a.genres ?? []).slice(0, 4),
    followers: typeof a.followers?.total === "number" ? a.followers.total : null,
    releases: releases.slice(0, 8),
    about: await fetchAbout(a.name, a.genres ?? []).catch(() => null),
  };
}

/* ---------- "Sobre" pela Wikipédia (o Spotify não expõe a bio na API) ---------- */

const WIKI_UA = { "user-agent": "TicketsWin/1.0 (https://ticket.oobo-site.workers.dev)", accept: "application/json" };
const fold = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const MUSIC = /m[uú]sic|cantor|cantora|banda|dj\b|rapper|rap\b|produtor|compositor|grupo musical|duo|singer|musician|band\b|record producer|songwriter|disc jockey|rapper|group/i;

/** Resumo da Wikipédia (pt, depois en) só quando o título bate com o nome e o texto é sobre música. */
export async function fetchAbout(name: string, genres: string[]): Promise<SpotifyArtistData["about"]> {
  for (const lang of ["pt", "en"]) {
    const q = `${name} ${lang === "pt" ? "música" : "music"} ${genres[0] ?? ""}`.trim();
    const sr = await fetch(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=3&srsearch=${encodeURIComponent(q)}`, { headers: WIKI_UA }).catch(() => null);
    const hits = ((await sr?.json().catch(() => null)) as { query?: { search?: { title: string }[] } } | null)?.query?.search ?? [];
    const want = fold(name);
    const hit = hits.find((h) => { const t = fold(h.title); return t === want || t.startsWith(`${want} `); });
    if (!hit) continue;
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`, { headers: WIKI_UA }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { type?: string; extract?: string; description?: string; content_urls?: { desktop?: { page?: string } } } | null;
    if (!j?.extract || j.type === "disambiguation") continue;
    if (!MUSIC.test(`${j.description ?? ""} ${j.extract.slice(0, 400)}`)) continue;
    return { text: j.extract, source: lang === "pt" ? "Wikipédia" : "Wikipedia (em inglês)", url: j.content_urls?.desktop?.page ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title)}` };
  }
  return null;
}

/* ---------- conta do usuário (OAuth) ---------- */

/** Volta do OAuth: só caminhos internos. */
export function safeNext(v: string | null) {
  return v && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(v) ? v : "/";
}
export function withFlag(path: string, flag: string) {
  const [p, hash] = path.split("#");
  return `${p}${p.includes("?") ? "&" : "?"}spotify=${flag}${hash ? `#${hash}` : ""}`;
}


export function authorizeUrl(state: string, redirectUri: string) {
  const c = creds();
  if (!c) return null;
  const q = new URLSearchParams({ response_type: "code", client_id: c.id, scope: USER_SCOPES, redirect_uri: redirectUri, state, show_dialog: "false" });
  return `${ACCOUNTS}/authorize?${q}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string | null> {
  const c = creds();
  if (!c) return null;
  const r = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { authorization: basic(c), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
  }).catch(() => null);
  if (!r?.ok) return null;
  return ((await r.json()) as { access_token?: string }).access_token ?? null;
}

export type SpotifyMe = { id: string; name: string | null; artists: { id: string; name: string }[] };

/** Perfil e artistas que a pessoa mais ouve e segue. null = conta não liberada no app (modo de desenvolvimento). */
export async function fetchMe(token: string): Promise<SpotifyMe | null> {
  const me = await api<{ id: string; display_name?: string | null }>("/me", token);
  if (!me) return null;
  const [long, mid, followed] = await Promise.all([
    api<{ items?: SArtist[] }>("/me/top/artists?time_range=long_term&limit=50", token),
    api<{ items?: SArtist[] }>("/me/top/artists?time_range=medium_term&limit=50", token),
    api<{ artists?: { items?: SArtist[] } }>("/me/following?type=artist&limit=50", token),
  ]);
  const map = new Map<string, string>();
  for (const a of [...(mid?.items ?? []), ...(long?.items ?? []), ...(followed?.artists?.items ?? [])]) map.set(a.id, a.name);
  return { id: me.id, name: me.display_name ?? null, artists: [...map].map(([id, name]) => ({ id, name })) };
}
