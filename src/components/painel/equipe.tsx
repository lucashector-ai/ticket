"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { useToast } from "@/components/toast";
import { inviteMember, removeMember, setMemberRole } from "@/lib/actions/painel";
import { CheckinLinks, type CheckinLink } from "./checkin-links";

export type EquipeProps = {
  role: "owner" | "admin" | "portaria";
  owner: { name: string; email: string };
  members: { id: string; email: string; role: "admin" | "portaria"; active: boolean; me: boolean }[];
  events: { id: string; title: string; flyerId: string; when: string; where: string; soon: boolean; links: CheckinLink[] }[];
};

export function PainelEquipe(p: EquipeProps) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, start] = useTransition();
  const [email, setEmail] = useState("");
  const owner = p.role === "owner";
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { flash(r.error); return; }
    flash(ok); router.refresh();
  });

  return (
    <div className="pane">
      <div className="pg-h"><div><h1 className="pg-t">{p.role === "portaria" ? "Check-in" : "Equipe e check-in"}</h1><p className="pg-s">{p.role === "portaria" ? "Escolha o evento e abra o app da portaria para validar os ingressos na entrada" : "Quem ajuda a tocar os seus eventos e o check-in na entrada"}</p></div></div>

      <div className="cols">
        <div className="maincol">
          <section className="cx">
            <div className="card-h"><div><h2 className="card-t">Check-in</h2><span className="card-s">{p.role === "portaria"
              ? "Toque em “Abrir app da portaria” no celular: o seu acesso ao evento é criado na hora e a câmera já abre para ler os QR codes. Dá para instalar na tela de início, como um app."
              : "Convide a portaria por evento: cada pessoa ganha um acesso único ao app da portaria, pelo QR code na tela ou por e-mail, e você acompanha quando ela abriu e quantas entradas validou."}</span></div></div>
            {p.events.length ? p.events.map((e) => (
              <div className="ptr-ev" key={e.id}>
                <div className="ptr">
                  <div className="evr-art"><FlyerArt id={e.flyerId} /></div>
                  <div className="evr-i"><b className="evr-t">{e.title}</b><span className="evr-s">{e.when} · {e.where}</span>{e.soon && <span className="st on">Hoje ou amanhã</span>}</div>
                  <span className="ptr-a">
                    {p.role !== "portaria" && <Link className="b2" href={`/painel/evento/${e.id}?aba=checkin`}>Ver entradas</Link>}
                    <a className="b2 dark" href={`/painel/portaria/${e.id}/app`}>Abrir app da portaria</a>
                  </span>
                </div>
                {p.role !== "portaria" && <div className="ptr-acc"><CheckinLinks eventId={e.id} links={e.links} /></div>}
              </div>
            )) : <span className="card-s">Nenhum evento publicado com data futura.</span>}
          </section>

          {p.role !== "portaria" && (
            <section className="cx">
              <div className="card-h"><div><h2 className="card-t">Equipe</h2><span className="card-s">A pessoa entra na Tickets Win com o e-mail convidado e o painel aparece para ela.</span></div></div>
              <div className="mbr">
                <span className="pp-av" style={{ background: "#D3F55B" }}>★</span>
                <span className="pp-i"><b className="pp-n">{p.owner.name}</b><span className="pp-e">{p.owner.email || "Dono da conta"}</span></span>
                <span className="st on">Dono</span>
                <span />
              </div>
              {p.members.map((m) => (
                <div className="mbr" key={m.id}>
                  <span className="pp-av" style={{ background: m.active ? "#EEFBC4" : "#F0F0EB" }}>{m.email[0]?.toUpperCase()}</span>
                  <span className="pp-i"><b className="pp-n">{m.email}</b><span className="pp-e">{m.active ? "Ativo" : "Convite pendente: ainda não entrou com este e-mail"}</span></span>
                  {owner
                    ? <select value={m.role} disabled={busy} onChange={(e) => run(() => setMemberRole(m.id, e.target.value), "Função atualizada.")} aria-label={`Função de ${m.email}`}><option value="admin">Admin</option><option value="portaria">Portaria</option></select>
                    : <span className="st draft">{m.role === "admin" ? "Admin" : "Portaria"}</span>}
                  {owner ? <button className="x-b" type="button" disabled={busy} onClick={() => { if (window.confirm(`Tirar ${m.email} da equipe?`)) run(() => removeMember(m.id), "Removido da equipe."); }}>Remover</button> : <span />}
                </div>
              ))}
              {p.members.length === 0 && <span className="card-s">Só você por enquanto.</span>}
            </section>
          )}
        </div>

        <aside className="side2">
          {owner && (
            <section className="cx">
              <div className="card-h"><div><h2 className="card-t">Convidar admin</h2><span className="card-s">Admin vê vendas, participantes, financeiro e marketing. A portaria é convidada por evento, em “Convidar para a portaria” (QR code ou e-mail).</span></div></div>
              <div className="frm">
                <label className="fld"><span>E-mail</span><input autoComplete="off" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@exemplo.com" /></label>
                <button className="b2 dark block" type="button" disabled={busy || !email.includes("@")} onClick={() => run(async () => { const r = await inviteMember(email, "admin"); if (r.ok) setEmail(""); return r; }, "Convite enviado.")}>Convidar admin</button>
              </div>
            </section>
          )}
          <section className="cx">
            <div className="card-h"><h2 className="card-t">O que cada função faz</h2></div>
            <div className="roles">
              <div><b>Dono:</b> tudo, inclusive equipe, conta de repasse e configurações.</div>
              <div><b>Admin:</b> vê vendas, participantes, financeiro e marketing; cria cupons.</div>
              <div><b>Portaria:</b> só o check-in de um evento, pelo app da portaria, com um acesso só dela (QR code ou e-mail).</div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
