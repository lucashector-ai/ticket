"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { FlyerArt } from "@/components/art/flyer";
import { CopyButton } from "@/components/copy-button";
import { useNowSec } from "@/components/evento/launch-card";
import { useOrigin } from "@/components/painel/use-origin";
import { useToast } from "@/components/toast";
import { cancelGroup } from "@/lib/actions/grupo";
import { money } from "@/lib/pricing";

export type GrupoData = {
  code: string;
  state: "open" | "done" | "expired" | "cancelled";
  leader: string;
  isLeader: boolean;
  expiresAt: string;
  event: { title: string; slug: string; flyerId: string; when: string; where: string };
  shares: { id: string; n: number; ticket: string; priceCents: number; status: "paid" | "paying" | "free"; who: string | null; mine: boolean }[];
  error: string | null;
};

export function GrupoView({ g }: { g: GrupoData }) {
  const router = useRouter();
  const { flash } = useToast();
  const origin = useOrigin();
  const now = useNowSec();
  const [busy, start] = useTransition();
  const left = Math.max(0, Math.floor(new Date(g.expiresAt).getTime() / 1000) - now);
  const open = g.state === "open" && (now === 0 || left > 0);
  const paid = g.shares.filter((s) => s.status === "paid").length;
  const url = `${origin}/grupo/${g.code}`;
  const msg = `Bora? Reservei ingressos para ${g.event.title} (${g.event.when}). Paga a sua parte por aqui antes que a reserva acabe: ${url}`;
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");

  const cancel = () => {
    if (!window.confirm("Cancelar o grupo? As vagas não pagas voltam para a venda.")) return;
    start(async () => {
      const r = await cancelGroup(g.code);
      if (!r.ok) flash(r.error); else { flash("Grupo cancelado."); router.refresh(); }
    });
  };

  return (
    <main className="wrap gp">
      <section className="gp-card">
        <div className="gp-ev">
          <div className="gp-art"><FlyerArt id={g.event.flyerId} /></div>
          <div className="gp-ei">
            <span className="gp-k">Compra em grupo · organizada por {g.leader}</span>
            <h1 className="gp-t">{g.event.title}</h1>
            <span className="gp-d">{g.event.when}{g.event.where ? ` · ${g.event.where}` : ""}</span>
          </div>
        </div>

        {g.error && <p className="gp-err" role="alert">{g.error}</p>}
        {g.state === "done" && <div className="gp-st ok"><b>Grupo completo!</b><span>Todas as partes foram pagas. Cada um já tem o seu ingresso em Meus ingressos.</span></div>}
        {g.state === "cancelled" && <div className="gp-st off"><b>Grupo cancelado</b><span>Quem já pagou continua com o ingresso. As outras vagas voltaram para a venda.</span></div>}
        {g.state === "open" && !open && <div className="gp-st off"><b>O tempo da reserva acabou</b><span>As partes não pagas voltaram para a venda. Quem pagou continua com o ingresso.</span></div>}
        {open && (
          <div className="gp-timer">
            <span>Vagas reservadas por</span>
            <b className={left < 300 ? "low" : ""}>{now ? `${mm}:${ss}` : "--:--"}</b>
            <small>Depois disso, as partes não pagas voltam para a venda.</small>
          </div>
        )}

        <div className="gp-prog">
          <div className="gp-pl"><b>{paid} de {g.shares.length}</b> partes pagas</div>
          <div className="gp-bar"><i style={{ width: `${(paid / g.shares.length) * 100}%` }} /></div>
        </div>

        <ol className="gp-list">
          {g.shares.map((s) => (
            <li key={s.id} className={`gp-s ${s.status}`}>
              <span className="gp-n">{s.n}</span>
              <span className="gp-i"><b>{s.ticket}</b><small>{money(s.priceCents)} com a taxa</small></span>
              {s.status === "paid" ? <span className="gp-tag ok">Paga{s.who ? ` · ${s.who}` : ""}</span>
                : s.status === "paying" && !s.mine ? <span className="gp-tag">{s.who ? `${s.who} está pagando` : "Sendo paga"}</span>
                : open ? <Link className="gp-pay" href={`/checkout?evento=${g.event.slug}&grupo=${g.code}&vaga=${s.id}`}>{s.mine ? "Continuar pagamento" : "Pagar esta parte"}</Link>
                : <span className="gp-tag off">Não paga</span>}
            </li>
          ))}
        </ol>

        {open && (
          <div className="gp-share">
            <b>Chame a galera</b>
            <span>Mande o link: cada pessoa entra, escolhe uma vaga e paga só a dela.</span>
            <div className="gp-link"><code>{url.replace(/^https?:\/\//, "")}</code><CopyButton text={url} label="Copiar link" done="Copiado" /></div>
            <a className="gp-wa" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">Enviar no WhatsApp</a>
          </div>
        )}
        <div className="gp-foot">
          <Link href={`/eventos/${g.event.slug}`}>Ver o evento</Link>
          {g.isLeader && open && <button type="button" onClick={cancel} disabled={busy}>Cancelar grupo</button>}
        </div>
      </section>
    </main>
  );
}
