"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { addGuest, addGuestsBulk, inviteAllPending, inviteGuest, removeGuest, undoGuestCheckin } from "@/lib/actions/lista";

export type ListaGuest = {
  id: string; name: string; email: string; token: string; guests: number; note: string;
  inAt: string | null; by: string | null; invited: boolean; added: string;
};
export type ListaProps = { eventId: string; title: string; emailOn: boolean; max: number; pasteMax: number; guests: ListaGuest[] };

const n = (v: number) => v.toLocaleString("pt-BR");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const EMPTY = { name: "", email: "", guests: "0", note: "" };

/** Aba "Lista free": convidados não pagantes. Entram de graça pela lista (nome ou QR do ingresso de lista); não vira venda nem pedido. */
export function PainelLista({ p }: { p: ListaProps }) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"one" | "many">("one");
  const [f, setF] = useState(EMPTY);
  const [text, setText] = useState("");
  const [invite, setInvite] = useState(true);
  const [skipped, setSkipped] = useState<{ line: string; reason: string }[]>([]);
  const [q, setQ] = useState("");
  const [fil, setFil] = useState<"all" | "out" | "in">("all");
  const [arm, setArm] = useState<string | null>(null);

  const people = p.guests.reduce((s, g) => s + 1 + g.guests, 0);
  const inside = p.guests.filter((g) => g.inAt);
  const peopleIn = inside.reduce((s, g) => s + 1 + g.guests, 0);
  const pending = p.guests.filter((g) => g.email && !g.invited && !g.inAt).length;
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;

  const done = (r: Awaited<ReturnType<typeof addGuest>>, reset: () => void) => {
    if (!r.ok) { flash(r.error); return; }
    setSkipped(r.skipped);
    const parts = [`${r.added} ${r.added === 1 ? "nome adicionado" : "nomes adicionados"}`];
    if (r.invited) parts.push(`${r.invited} ${r.invited === 1 ? "ingresso enviado" : "ingressos enviados"}`);
    if (r.skipped.length) parts.push(`${r.skipped.length} ${r.skipped.length === 1 ? "linha ficou de fora" : "linhas ficaram de fora"}`);
    flash(parts.join(" · ") + ".");
    if (r.added) { reset(); router.refresh(); }
  };
  const addOne = () => start(async () => {
    const r = await addGuest(p.eventId, { name: f.name, email: f.email.trim(), guests: Number(f.guests) || 0, note: f.note }, invite && !!f.email.trim());
    done(r, () => setF(EMPTY));
  });
  const addMany = () => start(async () => done(await addGuestsBulk(p.eventId, text, invite), () => setText("")));
  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, msg: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { flash(r.error); return; }
    flash(msg); router.refresh();
  });
  const confirmFirst = (key: string, go: () => void) => {
    if (arm !== key) { setArm(key); window.setTimeout(() => setArm((a) => (a === key ? null : a)), 3500); return; }
    setArm(null); go();
  };
  const inviteAll = () => start(async () => {
    const r = await inviteAllPending(p.eventId);
    if (!r.ok) { flash(r.error); return; }
    flash(r.invited ? `${r.invited} ${r.invited === 1 ? "ingresso enviado" : "ingressos enviados"}.` : "Ninguém para convidar.");
    router.refresh();
  });

  const list = useMemo(() => {
    const s = norm(q.trim());
    return p.guests.filter((g) => (fil === "all" || (fil === "in" ? !!g.inAt : !g.inAt)) && (!s || norm(`${g.name} ${g.email} ${g.note}`).includes(s)));
  }, [p.guests, q, fil]);
  const shown = list.slice(0, 400);
  const FIL: [typeof fil, string, number][] = [["all", "Todos", p.guests.length], ["out", "Não entraram", p.guests.length - inside.length], ["in", "Entraram", inside.length]];

  return (
    <div className="pane2">
      <div className="kpis">
        <div className="kpi"><span className="kp-l">Nomes na lista</span><b className="kp-v">{n(p.guests.length)}</b><div className="kp-f"><span className="kp-n">limite de {n(p.max)} por evento</span></div></div>
        <div className="kpi"><span className="kp-l">Pessoas</span><b className="kp-v">{n(people)}</b><div className="kp-f"><span className="kp-n">com os acompanhantes</span></div></div>
        <div className="kpi"><span className="kp-l">Já entraram</span><b className="kp-v">{n(peopleIn)}</b><div className="kp-f"><span className="kp-n">{n(inside.length)} {inside.length === 1 ? "nome" : "nomes"} da lista</span></div></div>
        <div className="kpi"><span className="kp-l">Faltam entrar</span><b className="kp-v">{n(people - peopleIn)}</b><div className="kp-f"><span className="kp-n">entrada gratuita, fora das vendas</span></div></div>
      </div>

      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h wrap2">
              <label className="pd-search in-card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></svg>
                <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar na lista free" />
              </label>
              <div className="chips3">{FIL.map(([k, l, c]) => <button key={k} className={fil === k ? "chp on" : "chp"} type="button" onClick={() => setFil(k)}>{l} <span className="sg-n">{n(c)}</span></button>)}</div>
              <div className="ca"><button className="b2" type="button" onClick={() => exportCsv(p.title, list)} disabled={!list.length}>Exportar CSV</button></div>
            </div>
            <div className="tbl">
              <div className="lf-row thd"><span>Convidado</span><span>Ingresso de lista</span><span>Entrada</span><span /></div>
              {shown.map((g) => (
                <div className="lf-row" key={g.id}>
                  <span className="lf-n">
                    <b>{g.name}{g.guests > 0 && <span className="lf-plus">+{g.guests}</span>}</b>
                    <small>{[g.email, g.note].filter(Boolean).join(" · ") || `Adicionado em ${g.added}`}</small>
                  </span>
                  <span className="lf-doc"><a href={`/lista/${g.token}`} target="_blank" rel="noopener">Ver ingresso</a></span>
                  <span className="lf-st">
                    {g.inAt ? <span className="st on">Entrou {g.inAt}</span> : <span className="st draft">Na lista</span>}
                    {g.inAt && g.by ? <small>por {g.by}</small> : g.invited ? <small>Ingresso enviado por e-mail</small> : null}
                  </span>
                  <span className="lf-a">
                    {g.inAt ? (
                      <button className={arm === `u${g.id}` ? "b2 sm2 lf-arm" : "b2 sm2"} type="button" disabled={busy} onClick={() => confirmFirst(`u${g.id}`, () => act(() => undoGuestCheckin(g.id), `Entrada de ${g.name} desfeita.`))}>{arm === `u${g.id}` ? "Confirmar" : "Desfazer entrada"}</button>
                    ) : (
                      <>
                        {p.emailOn && g.email && <button className="b2 sm2" type="button" disabled={busy} onClick={() => act(() => inviteGuest(g.id), `Ingresso de lista enviado para ${g.email}.`)}>{g.invited ? "Reenviar ingresso" : "Enviar ingresso"}</button>}
                        <button className={arm === `r${g.id}` ? "x-b lf-arm" : "x-b"} type="button" disabled={busy} onClick={() => confirmFirst(`r${g.id}`, () => act(() => removeGuest(g.id), `${g.name} saiu da lista.`))}>{arm === `r${g.id}` ? "Confirmar" : "Remover"}</button>
                      </>
                    )}
                  </span>
                </div>
              ))}
              {list.length === 0 && (
                <div className="empty2">
                  <b className="em-t">{p.guests.length ? "Ninguém encontrado" : "A lista está vazia"}</b>
                  <span className="em-s">{p.guests.length ? "Tente outro nome ou e-mail." : "Adicione quem entra de graça: os nomes aparecem aqui e na portaria."}</span>
                </div>
              )}
            </div>
            <span className="tbl-f">Mostrando {n(shown.length)} de {n(list.length)} {list.length === 1 ? "nome" : "nomes"}{list.length > shown.length ? ". Busque para achar os outros." : ""}</span>
          </section>
        </div>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Adicionar à lista</h2><span className="card-s">Quem está na lista entra de graça. Não vira venda nem ingresso.</span></div></div>
            <div className="seg2 sm lf-seg">
              <button className={mode === "one" ? "sg on" : "sg"} type="button" onClick={() => setMode("one")}>Um nome</button>
              <button className={mode === "many" ? "sg on" : "sg"} type="button" onClick={() => setMode("many")}>Colar vários</button>
            </div>
            {mode === "one" ? (
              <form className="frm" onSubmit={(e) => { e.preventDefault(); if (f.name.trim().length >= 2) addOne(); }}>
                <label className="fld"><span>Nome completo</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} placeholder="Nome e sobrenome" autoComplete="off" required /></label>
                <label className="fld"><span>E-mail <small>(opcional)</small></span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={254} placeholder="para mandar o ingresso de lista" autoComplete="off" /></label>
                <label className="fld"><span>Acompanhantes</span><select value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })}>{Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i ? `+${i}` : "Nenhum"}</option>)}</select></label>
                <label className="fld"><span>Observação <small>(opcional)</small></span><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={200} placeholder="Ex.: convidado do artista, imprensa" autoComplete="off" /></label>
                {p.emailOn && <label className="lf-ck"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} /><span>Enviar o ingresso de lista (QR code) por e-mail</span></label>}
                <button className="b2 dark block" type="submit" disabled={busy || f.name.trim().length < 2}>{busy ? "Salvando…" : "Adicionar à lista"}</button>
              </form>
            ) : (
              <form className="frm" onSubmit={(e) => { e.preventDefault(); if (lines) addMany(); }}>
                <label className="fld">
                  <span>Um nome por linha</span>
                  <textarea className="lf-ta" value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder={"Maria Souza; maria@email.com\nJoão Lima; joao@email.com; +2\nAna Costa"} spellCheck={false} />
                  <small>Nome; e-mail; +2. E-mail e acompanhantes são opcionais. Dá para colar direto de uma planilha. Até {n(p.pasteMax)} nomes por vez.</small>
                </label>
                {p.emailOn && <label className="lf-ck"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} /><span>Enviar o ingresso de lista por e-mail para quem tem e-mail</span></label>}
                <button className="b2 dark block" type="submit" disabled={busy || !lines || lines > p.pasteMax}>{busy ? "Salvando…" : lines > p.pasteMax ? `Máximo de ${n(p.pasteMax)} linhas` : `Adicionar ${lines ? n(lines) : ""} ${lines === 1 ? "nome" : "nomes"}`}</button>
              </form>
            )}
            {skipped.length > 0 && (
              <div className="lf-skip" role="status">
                <div className="lf-skip-h"><b>Ficaram de fora</b><button className="x-b" type="button" onClick={() => setSkipped([])}>Fechar</button></div>
                {skipped.map((s, i) => <div key={i} className="lf-skip-r"><span>{s.line}</span><small>{s.reason}</small></div>)}
              </div>
            )}
          </section>
          <section className="cx">
            <div className="card-h"><h2 className="card-t">Na portaria</h2></div>
            <ul className="lf-how">
              <li>A equipe abre <b>Lista</b> no app da portaria (ou no leitor do painel), busca pelo nome e toca em <b>Liberar</b>.</li>
              <li>Quem recebeu o ingresso de lista por e-mail (ou tem conta com esse e-mail, em Meus ingressos) pode mostrar o QR: o leitor reconhece como lista free.</li>
              <li>A conferência de documento fica a critério do local.</li>
              <li>Cada nome entra uma vez só, com os acompanhantes. Entrada liberada por engano? Use Desfazer entrada aqui.</li>
            </ul>
            {p.emailOn && pending > 0 && <button className="b2 block lf-inv-all" type="button" disabled={busy} onClick={inviteAll}>Enviar ingresso de lista para {n(pending)} {pending === 1 ? "nome" : "nomes"} com e-mail</button>}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Lista em CSV (abre no Excel/Planilhas). */
function exportCsv(title: string, rows: ListaGuest[]) {
  // aspas dobradas e sem fórmula de planilha (=, +, -, @ no começo)
  const esc = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const lines = [["Nome", "E-mail", "Acompanhantes", "Observação", "Adicionado em", "Entrou", "Liberado por"], ...rows.map((r) => [r.name, r.email, String(r.guests), r.note, r.added, r.inAt ?? "", r.by ?? ""])];
  const blob = new Blob(["﻿" + lines.map((l) => l.map(esc).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lista-free-${title.toLowerCase().normalize("NFD").replace(/[^\w]+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
