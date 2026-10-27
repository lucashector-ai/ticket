"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type State = { state: "ok" } | { state: "wait"; position: number; total: number; etaMin: number | null };

/* uma chamada por vez: dois sinais juntos (antes do cookie existir) virariam duas pessoas na fila */
const inflight = new Map<string, Promise<State>>();
function ping(eventId: string): Promise<State> {
  const cur = inflight.get(eventId);
  if (cur) return cur;
  const p = fetch(`/api/fila/${eventId}`, { method: "POST", cache: "no-store" })
    .then(async (r) => (r.ok ? ((await r.json()) as State) : { state: "ok" as const }))
    .catch(() => ({ state: "ok" as const }))
    .finally(() => inflight.delete(eventId));
  inflight.set(eventId, p);
  return p;
}

/**
 * Fila virtual: dá sinal a cada 15 s enquanto a pessoa está na página e, se o evento estiver lotado de
 * gente, cobre a tela com a posição na fila até chegar a vez (aí some sozinho).
 */
export function QueueGate({ eventId, title }: { eventId: string; title: string }) {
  const [s, setS] = useState<State>({ state: "ok" });
  const [first, setFirst] = useState<number | null>(null);

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const next = await ping(eventId);
      if (stop) return;
      setS(next);
      if (next.state === "wait") setFirst((f) => f ?? next.position);
      timer = setTimeout(tick, next.state === "wait" ? 5000 : 15000);
    };
    void tick();
    return () => { stop = true; clearTimeout(timer); };
  }, [eventId]);

  if (s.state !== "wait") return null;
  const done = first && first > 1 ? Math.min(100, Math.max(4, ((first - s.position) / (first - 1)) * 100)) : 4;
  return (
    <div className="qg" role="dialog" aria-modal="true" aria-labelledby="qg-t">
      <div className="qg-in">
        <BrandLogo height={22} className="qg-logo" />
        <span className="qg-k"><i aria-hidden="true" />Fila virtual · {title}</span>
        <h2 className="qg-t" id="qg-t">Você está na fila</h2>
        <p className="qg-s">Muita gente quer este evento agora. Para ninguém travar, as pessoas entram por ordem de chegada.</p>
        <div className="qg-pos"><span>Sua posição</span><b aria-live="polite">{s.position.toLocaleString("pt-BR")}</b><small>de {s.total.toLocaleString("pt-BR")} na fila</small></div>
        <div className="qg-bar" aria-hidden="true"><i style={{ width: `${done}%` }} /></div>
        <p className="qg-eta">{s.etaMin ? `Tempo estimado: ${s.etaMin === 1 ? "cerca de 1 minuto" : `cerca de ${s.etaMin} minutos`}` : "Calculando o tempo de espera…"}</p>
        <p className="qg-fine">Não feche nem atualize esta página: quando chegar a sua vez, ela libera sozinha.</p>
      </div>
    </div>
  );
}
