"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { painelDoorGuests, painelReleaseGuest } from "@/lib/actions/lista";
import type { DoorGuest } from "@/lib/guest-list";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const hhmm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "");

/** Lista free no leitor do painel (equipe com conta): busca pelo nome e libera a entrada uma vez. */
export function ListaPortaria({ eventId }: { eventId: string }) {
  const { flash } = useToast();
  const [list, setList] = useState<DoorGuest[] | null>(null);
  const [q, setQ] = useState("");
  const [arm, setArm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void painelDoorGuests(eventId).then((r) => { if (alive) setList(r.ok ? r.guests : []); }).catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [eventId]);

  const shown = useMemo(() => {
    if (!list) return [];
    const s = norm(q.trim());
    return s ? list.filter((g) => norm(`${g.name} ${g.note}`).includes(s)) : list;
  }, [list, q]);
  const names = list?.length ?? 0, inside = list?.filter((g) => g.inAt).length ?? 0;
  const people = list?.reduce((s, g) => s + 1 + g.guests, 0) ?? 0, peopleIn = list?.reduce((s, g) => s + (g.inAt ? 1 + g.guests : 0), 0) ?? 0;

  const release = async (g: DoorGuest) => {
    if (arm !== g.id) { setArm(g.id); window.setTimeout(() => setArm((a) => (a === g.id ? null : a)), 3500); return; }
    setArm(null); setBusy(true);
    const r = await painelReleaseGuest(eventId, g.id).catch(() => ({ ok: false, error: "Sem conexão. Tente de novo.", inAt: null }));
    setBusy(false);
    if (r.ok || r.inAt) setList((l) => l?.map((x) => (x.id === g.id ? { ...x, inAt: r.inAt ?? new Date().toISOString() } : x)) ?? l);
    flash(r.ok ? `Entrada liberada: ${g.name}${g.guests ? ` +${g.guests}` : ""}.` : r.inAt ? `${g.name} já entrou às ${hhmm(r.inAt)}.` : r.error ?? "Não foi possível liberar.");
  };

  if (list && !names) return null;
  return (
    <section className="cx">
      <div className="card-h"><div><h2 className="card-t">Lista free</h2><span className="card-s">{n(peopleIn)} de {n(people)} {people === 1 ? "pessoa entrou" : "pessoas entraram"} · {n(inside)}/{n(names)} nomes</span></div></div>
      <div className="lf-door">
        <input className="lf-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar pelo nome" aria-label="Buscar na lista free" autoComplete="off" />
        <ul className="lf-dl">
          {list === null && <li className="lf-e">Carregando…</li>}
          {list !== null && !shown.length && <li className="lf-e">Ninguém com esse nome na lista.</li>}
          {shown.slice(0, 60).map((g) => (
            <li key={g.id} className={g.inAt ? "in" : ""}>
              <span className="lf-dn"><b>{g.name}{g.guests > 0 && <span className="lf-plus">+{g.guests}</span>}</b><small>{g.note || "Lista free"}</small></span>
              {g.inAt ? <span className="lf-in">Entrou {hhmm(g.inAt)}</span>
                : <button className={arm === g.id ? "b2 sm2 dark lf-arm" : "b2 sm2 dark"} type="button" disabled={busy} onClick={() => void release(g)}>{arm === g.id ? "Confirmar" : "Liberar"}</button>}
            </li>
          ))}
          {shown.length > 60 && <li className="lf-e">Mostrando 60 de {shown.length}. Busque pelo nome.</li>}
        </ul>
        <span className="lf-hint">A conferência de documento fica a critério do local.</span>
      </div>
    </section>
  );
}
const n = (v: number) => v.toLocaleString("pt-BR");
