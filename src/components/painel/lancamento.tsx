"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/toast";
import { removeSignup, saveLaunch, sendLaunchNow } from "@/lib/actions/launch";
import { useOrigin } from "./use-origin";
import { csvBlob } from "@/lib/csv";
import { Tbl } from "@/components/painel/tbl";

type Signup = { id: string; kind: "abertura" | "presale"; email: string; when: string; notified: boolean; used: boolean; token: string };
export type LaunchProps = {
  eventId: string;
  /** "2026-10-30T10:00" no horário de São Paulo, ou "" */
  salesOpenAt: string;
  presaleAt: string;
  phase: "soon" | "presale" | "open";
  phaseLabel: string;
  presaleSent: string | null;
  openingSent: string | null;
  emailOn: boolean;
  queueMode: "auto" | "on" | "off";
  queueLimit: number;
  queueNow: { active: number; waiting: number };
  signups: Signup[];
};

/** Aba "Lançamento" do evento: abertura das vendas, pré-venda e fila virtual. */
export function PainelLancamento({ p }: { p: LaunchProps }) {
  const router = useRouter();
  const { flash } = useToast();
  const origin = useOrigin();
  const [f, setF] = useState({ salesOpenAt: p.salesOpenAt, presaleAt: p.presaleAt, hasPresale: !!p.presaleAt, queueMode: p.queueMode, queueLimit: String(p.queueLimit) });
  const [dirty, setDirty] = useState(false);
  const [busy, start] = useTransition();
  const [list, setList] = useState<"presale" | "abertura">(p.signups.some((s) => s.kind === "presale") ? "presale" : "abertura");
  const set = (x: Partial<typeof f>) => { setF((o) => ({ ...o, ...x })); setDirty(true); };

  const save = () => start(async () => {
    const r = await saveLaunch({
      eventId: p.eventId, salesOpenAt: f.salesOpenAt, presaleAt: f.hasPresale ? f.presaleAt : "",
      queueMode: f.queueMode, queueLimit: Number(f.queueLimit) || 300,
    });
    if (!r.ok) { flash(r.error); return; }
    setDirty(false); flash("Lançamento salvo."); router.refresh();
  });
  const sendNow = (what: "presale" | "abertura") => start(async () => {
    const r = await sendLaunchNow(p.eventId, what);
    flash(r.ok ? r.message ?? "Enviado." : r.error);
    if (r.ok) router.refresh();
  });
  const remove = (id: string) => start(async () => {
    const r = await removeSignup(id);
    if (!r.ok) flash(r.error); else router.refresh();
  });
  const copy = async (text: string, ok = "Link copiado.") => { try { await navigator.clipboard.writeText(text); flash(ok); } catch { flash("Não foi possível copiar."); } };

  const pres = p.signups.filter((s) => s.kind === "presale"), abert = p.signups.filter((s) => s.kind === "abertura");
  const shown = list === "presale" ? pres : abert;
  const csv = () => {
    const rows = [["E-mail", "Lista", "Cadastro", "Avisado", "Comprou na pré-venda", "Link da pré-venda"], ...p.signups.map((s) => [s.email, s.kind === "presale" ? "Pré-venda" : "Aviso de abertura", s.when, s.notified ? "Sim" : "Não", s.used ? "Sim" : "Não", s.kind === "presale" ? `${origin}/pv/${s.token}` : ""])];
    const blob = csvBlob(rows);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "lista-lancamento.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const kpis: [string, string, string][] = [
    ["Situação", p.phaseLabel, p.phase === "open" ? "Ingressos à venda" : "Página com contagem regressiva"],
    ["Pré-venda", String(pres.length), `${pres.filter((s) => s.used).length} já compraram`],
    ["Aviso de abertura", String(abert.length), `${abert.filter((s) => s.notified).length} avisados`],
    ["Fila virtual", p.queueNow.waiting ? `${p.queueNow.waiting} na fila` : "Livre", `${p.queueNow.active} comprando agora`],
  ];

  return (
    <div className="lnc">
      <div className="kpis">
        {kpis.map(([l, v, s]) => <div className="kpi" key={l}><span className="kp-l">{l}</span><b className="kp-v">{v}</b><div className="kp-f"><span className="kp-n">{s}</span></div></div>)}
      </div>

      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Abertura das vendas</h2><span className="card-s">Até a data, a página do evento vira uma tela cheia de contagem regressiva com um campo para a pessoa deixar o e-mail.</span></div><Link className="b2" href={`/criar-evento?editar=${p.eventId}&etapa=vendas`}>Personalizar a tela</Link></div>
            <div className="frm">
              <label className="fld"><span>Venda geral abre em</span><input autoComplete="off" type="datetime-local" value={f.salesOpenAt} onChange={(e) => set({ salesOpenAt: e.target.value })} /><small>Horário de Brasília. Vazio: o evento vende assim que é publicado.</small></label>
              <label className="tg2"><span><b>Pré-venda para cadastrados</b><small>Quem se cadastrar recebe um link secreto e compra antes da venda geral.</small></span><input className="sr" type="checkbox" checked={f.hasPresale} onChange={(e) => set({ hasPresale: e.target.checked })} /><span className="sw" aria-hidden="true" /></label>
              {f.hasPresale && <label className="fld"><span>Pré-venda começa em</span><input autoComplete="off" type="datetime-local" value={f.presaleAt} onChange={(e) => set({ presaleAt: e.target.value })} /><small>Nessa hora o link de cada pessoa sai por e-mail. Cada link vale para uma compra.</small></label>}
              <div className="ln-acts">
                {p.presaleAt && <button className="b2" type="button" disabled={busy || p.phase !== "presale"} onClick={() => sendNow("presale")}>Reenviar links da pré-venda</button>}
                {p.salesOpenAt && <button className="b2" type="button" disabled={busy || p.phase !== "open"} onClick={() => sendNow("abertura")}>Avisar a lista agora</button>}
              </div>
              <small className="ln-s">
                {!p.emailOn ? "O envio de e-mails ainda não está ligado: os cadastros ficam guardados e dá para copiar os links abaixo." : [p.presaleSent && `Links da pré-venda enviados ${p.presaleSent}.`, p.openingSent && `Aviso de abertura enviado ${p.openingSent}.`].filter(Boolean).join(" ") || "Os e-mails saem sozinhos na hora marcada."}
              </small>
            </div>
          </section>

          <section className="cx">
            <div className="card-h wrap2">
              <div><h2 className="card-t">Lista</h2><span className="card-s">Quem pediu aviso e quem se cadastrou na pré-venda.</span></div>
              <div className="ca">
                <div className="seg2 sm">
                  <button className={list === "presale" ? "sg on" : "sg"} type="button" onClick={() => setList("presale")}>Pré-venda <span className="sg-n">{pres.length}</span></button>
                  <button className={list === "abertura" ? "sg on" : "sg"} type="button" onClick={() => setList("abertura")}>Aviso <span className="sg-n">{abert.length}</span></button>
                </div>
                <button className="b2" type="button" onClick={csv} disabled={!p.signups.length}>Exportar CSV</button>
              </div>
            </div>
            <Tbl label="Lista de pré-venda e aviso">
              {shown.slice(0, 200).map((s) => (
                <div className="ln-row" key={s.id}>
                  <span className="ln-e">{s.email}<small>{s.when}</small></span>
                  <span className={s.used ? "st on" : s.notified ? "st draft" : "st soft"}>{s.used ? "Comprou" : s.notified ? "Avisado" : "Aguardando"}</span>
                  {s.kind === "presale" && <button className="b2" type="button" onClick={() => void copy(`${origin}/pv/${s.token}`, "Link da pré-venda copiado. Ele vale para uma compra.")}>Copiar link</button>}
                  <button className="ln-x" type="button" onClick={() => remove(s.id)} aria-label={`Remover ${s.email}`} disabled={busy}>×</button>
                </div>
              ))}
              {!shown.length && <div className="empty2"><b className="em-t">Ninguém ainda</b><span className="em-s">{list === "presale" ? "Defina a pré-venda e divulgue a página: o cadastro aparece nela." : "Com a abertura marcada, a página mostra o campo \"Me avise\"."}</span></div>}
            </Tbl>
            {shown.length > 200 && <span className="tbl-f">Mostrando 200 de {shown.length}. O CSV leva a lista inteira.</span>}
          </section>
        </div>

        <aside className="side2">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Fila virtual</h2><span className="card-s">Quando muita gente entra ao mesmo tempo, as pessoas aguardam numa fila com a posição e entram em ordem.</span></div></div>
            <div className="frm">
              <div className="seg2">
                {([["auto", "Automática"], ["on", "Sempre"], ["off", "Desligada"]] as const).map(([k, l]) => <button key={k} className={f.queueMode === k ? "sg on" : "sg"} type="button" onClick={() => set({ queueMode: k })}>{l}</button>)}
              </div>
              {f.queueMode !== "off" && <label className="fld"><span>Pessoas comprando ao mesmo tempo</span><input autoComplete="off" type="number" min={10} max={100000} value={f.queueLimit} onChange={(e) => set({ queueLimit: e.target.value })} /><small>{f.queueMode === "auto" ? "Passou disso, a fila liga sozinha e desliga quando o movimento cai." : "A fila fica ligada e libera essa quantidade de cada vez."}</small></label>}
            </div>
          </section>
        </aside>
      </div>

      {dirty && (
        <div className="save-bar">
          <span>Você tem alterações não salvas.</span>
          <button className="b2" type="button" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        </div>
      )}
    </div>
  );
}
