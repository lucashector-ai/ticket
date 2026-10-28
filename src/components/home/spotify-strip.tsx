"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { SpotifyIcon } from "@/components/spotify-search";
import { useToast } from "@/components/toast";
import { disconnectSpotify } from "@/lib/actions/spotify";
import { HomeCard } from "./home-card";
import type { HomeEvent } from "./types";

export type HomeSpotify = { connected: boolean; name: string | null; picks: string[] };

const FLAGS: Record<string, string> = {
  conectado: "Spotify conectado. Mostramos os shows dos artistas que você ouve.",
  "nao-liberado": "O Spotify ainda não liberou sua conta: a integração está em fase de testes e aceita poucas contas por enquanto.",
  cancelado: "Conexão com o Spotify cancelada.",
  erro: "Não foi possível conectar o Spotify. Tente de novo.",
  indisponivel: "A conexão com o Spotify não está disponível agora.",
};

const LOGIN = `/api/spotify/login?next=${encodeURIComponent("/#pra-voce")}`;

/** "Dos artistas que você ouve": shows a partir do Spotify da pessoa (ou o convite para conectar). */
export function SpotifyStrip({ spotify, events }: { spotify: HomeSpotify; events: HomeEvent[] }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const picks = events.filter((e) => spotify.picks.includes(e.slug));

  /* volta do Spotify: ?spotify=conectado|erro|… */
  useEffect(() => {
    const u = new URL(window.location.href);
    const f = u.searchParams.get("spotify");
    if (!f) return;
    if (FLAGS[f]) flash(FLAGS[f]);
    u.searchParams.delete("spotify");
    window.history.replaceState(null, "", `${u.pathname}${u.search}${u.hash}`);
  }, [flash]);

  const off = () => start(async () => { await disconnectSpotify(); flash("Spotify desconectado."); router.refresh(); });

  if (!spotify.connected) {
    return (
      <section className="spf" id="pra-voce" aria-label="Conectar Spotify" style={{ scrollMarginTop: 72 }}>
        <div className="wrap">
          <a className="spf-cta" href={LOGIN}>
            <SpotifyIcon size={40} />
            <span className="spf-t"><b>Veja os shows de quem você ouve</b><span>Conecte seu Spotify e a gente separa os eventos dos seus artistas favoritos.</span></span>
            <span className="spf-b">Conectar Spotify</span>
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="sec" id="pra-voce" aria-labelledby="pv-t" style={{ scrollMarginTop: 72, paddingBottom: picks.length ? undefined : 24 }}>
      <div className="wrap">
        <div className="sh rv" style={{ alignItems: "flex-end" }}>
          <div>
            <h2 className="h2" id="pv-t" style={{ fontSize: 30, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Dos artistas que você ouve</h2>
            <p className="spf-s" style={{ fontSize: 15, marginTop: 6 }}>
              <SpotifyIcon size={14} />
              {picks.length ? `A partir do Spotify${spotify.name ? ` de ${spotify.name}` : ""}.` : "Nenhum show dos artistas que você ouve por enquanto. Quando anunciarem, aparece aqui."}
            </p>
          </div>
          <button className="spf-off" type="button" onClick={off} disabled={busy}>Desconectar</button>
        </div>
        {picks.length > 0 && (
          <div className="grid">
            {picks.slice(0, 8).map((e, i) => <HomeCard key={e.slug} e={e} delay={`${(i * 0.06).toFixed(2)}s`} />)}
          </div>
        )}
      </div>
    </section>
  );
}
