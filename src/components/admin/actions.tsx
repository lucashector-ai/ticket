"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authorizeProducer, reviewApplication, revokeProducer, updatePayout } from "@/lib/actions/admin";
import { formatPhone, waLink } from "@/lib/phone";

type App = {
  id: string; status: "pending" | "approved" | "rejected"; createdAt: string; reviewedAt: string | null; reviewedBy: string | null; note: string | null;
  firstName: string; lastName: string; email: string; phone: string; company: string | null; city: string; uf: string; category: string;
  audience: string; avgTicket: string; expected: number; source: string; instagram: string | null;
};
const ST: Record<string, string> = { pending: "Pendente", approved: "Aprovada", rejected: "Recusada", requested: "Pedido", processing: "Processando", paid: "Pago", cancelled: "Cancelado" };

/** Inscrições de produtor: ficha completa e aprovar/recusar com observação. */
export function AdminApps({ rows }: { rows: App[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(rows.find((r) => r.status === "pending")?.id ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(id: string, approve: boolean) {
    if (!approve && !note.trim() && !confirm("Recusar sem explicar o motivo?")) return;
    setBusy(true); setMsg(null);
    const r = await reviewApplication(id, approve, note);
    setBusy(false);
    setMsg(r.ok ? (approve ? "Aprovada. A pessoa recebeu o e-mail com o link do cadastro." : "Recusada. A pessoa recebeu o e-mail.") : r.error ?? "Não deu certo.");
    if (r.ok) { setNote(""); router.refresh(); }
  }

  if (!rows.length) return <section className="ad-card ad-empty">Nenhuma inscrição ainda.</section>;
  return (
    <section className="ad-list">
      {msg && <p className="ad-msg">{msg}</p>}
      {rows.map((a) => (
        <article key={a.id} className={`ad-item ${a.status}`}>
          <button type="button" className="ad-ih" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
            <span className={`ad-st ${a.status}`}>{ST[a.status]}</span>
            <b>{a.company || `${a.firstName} ${a.lastName}`}</b>
            <span>{a.city} – {a.uf} · {a.category} · {a.expected.toLocaleString("pt-BR")} pessoas</span>
            <small>{a.createdAt}</small>
          </button>
          {open === a.id && (
            <div className="ad-ib">
              <dl className="ad-dl">
                {[["Nome", `${a.firstName} ${a.lastName}`], ["E-mail", a.email], ["Telefone", formatPhone(a.phone)], ["Produtora", a.company || "—"], ["Cidade", `${a.city} – ${a.uf}`],
                  ["Categoria", a.category], ["Ticket médio", a.avgTicket], ["Público esperado", a.expected.toLocaleString("pt-BR")], ["Como chegou", a.source], ["Instagram", a.instagram || "—"]].map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{k === "Instagram" && v !== "—" ? <a href={`https://instagram.com/${v.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer">{v}</a> : k === "Telefone" ? <a href={waLink(a.phone)} target="_blank" rel="noopener noreferrer">{v}</a> : v}</dd></div>
                ))}
                <div className="w"><dt>Público-alvo</dt><dd>{a.audience}</dd></div>
                {a.reviewedAt && <div className="w"><dt>Revisão</dt><dd>{ST[a.status]} por {a.reviewedBy} em {a.reviewedAt}{a.note ? ` · ${a.note}` : ""}</dd></div>}
              </dl>
              {a.status === "pending" && (
                <div className="ad-act">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Observação (vai no e-mail se recusar)" />
                  <div>
                    <button className="ad-b no" type="button" disabled={busy} onClick={() => void act(a.id, false)}>Recusar</button>
                    <button className="ad-b ok" type="button" disabled={busy} onClick={() => void act(a.id, true)}>Aprovar produtor</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

type Payout = { id: string; at: string; amount: string; status: string; org: string; dest: string; note: string | null };

/** Saques: o que pagar, para onde, e marcar processando/pago/recusado. */
export function AdminPayouts({ rows }: { rows: Payout[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function set(id: string, status: "processing" | "paid" | "rejected") {
    const note = status === "rejected" ? prompt("Motivo da recusa (vai no e-mail):") ?? "" : "";
    if (status === "paid" && !confirm("Confirma que o Pix/TED já foi feito?")) return;
    setBusy(id); setMsg(null);
    const r = await updatePayout(id, status, note);
    setBusy(null);
    setMsg(r.ok ? "Saque atualizado. O produtor recebeu o aviso por e-mail." : r.error ?? "Não deu certo.");
    if (r.ok) router.refresh();
  }

  if (!rows.length) return <section className="ad-card ad-empty">Nenhum saque pedido ainda.</section>;
  return (
    <section className="ad-card">
      {msg && <p className="ad-msg">{msg}</p>}
      <div className="ad-tbl">
        <div className="ad-tr ad-th c5"><span>Produtor</span><span>Valor</span><span>Para onde</span><span>Status</span><span /></div>
        {rows.map((p) => (
          <div className="ad-tr c5" key={p.id}>
            <span><b>{p.org}</b><small>{p.at}</small></span>
            <span><b>{p.amount}</b></span>
            <span className="pre">{p.dest}</span>
            <span><span className={`ad-st ${p.status}`}>{ST[p.status] ?? p.status}</span>{p.note && <small>{p.note}</small>}</span>
            <span className="ad-btns">
              {p.status === "requested" && <button className="ad-b" type="button" disabled={!!busy} onClick={() => void set(p.id, "processing")}>Processando</button>}
              {(p.status === "requested" || p.status === "processing") && <button className="ad-b ok" type="button" disabled={!!busy} onClick={() => void set(p.id, "paid")}>Marcar pago</button>}
              {(p.status === "requested" || p.status === "processing") && <button className="ad-b no" type="button" disabled={!!busy} onClick={() => void set(p.id, "rejected")}>Recusar</button>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const PS: Record<string, [string, string]> = {
  producer: ["Produtor", "approved"], team: ["Só equipe", "pending"], approved: ["Aprovado (falta cadastro)", "pending"], pending: ["Inscrição pendente", "pending"], rejected: ["Recusado", "rejected"],
};

/** Coluna "Produtor" da aba Contas: status e liberar/remover a permissão de criar eventos. */
export function AdminAccountProducer({ userId, email, status }: { userId: string; email: string; status: "producer" | "team" | "approved" | "pending" | "rejected" | "none" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(grant: boolean) {
    const q = grant
      ? `Tornar ${email} produtor?\n\nA conta fica liberada como se a inscrição tivesse sido aprovada, e a pessoa recebe um e-mail com o link para criar a conta de produtor.`
      : `Remover a permissão de produtor de ${email}?\n\nA pessoa volta a precisar de uma inscrição aprovada para criar eventos.`;
    if (!confirm(q)) return;
    setBusy(true); setErr(null);
    const r = await (grant ? authorizeProducer(userId) : revokeProducer(userId));
    setBusy(false);
    if (r.ok) router.refresh();
    else setErr(r.error ?? "Não deu certo.");
  }

  const st = PS[status];
  return (
    <>
      {st ? <i className={`ad-st ${st[1]}`}>{st[0]}</i> : "—"}
      {status !== "producer" && status !== "approved" && <button className="ad-b ad-bs" type="button" disabled={busy} onClick={() => void run(true)}>{busy ? "Liberando…" : "Tornar produtor"}</button>}
      {status === "approved" && <button className="ad-b no ad-bs" type="button" disabled={busy} onClick={() => void run(false)}>{busy ? "Removendo…" : "Remover permissão"}</button>}
      {err && <small className="ad-err">{err}</small>}
    </>
  );
}
