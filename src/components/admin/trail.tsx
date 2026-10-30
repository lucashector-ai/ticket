import Link from "next/link";
import type { AdminTrail, TrailHolder, TrailKind, TrailStep } from "@/lib/admin-trail";
import { brl } from "@/lib/format";

/*
 * Central › Ingressos (D-12): busca por código (atual ou anterior), e-mail ou nº do pedido e a linha do tempo de cada
 * ingresso. Só a central usa (a página já exige admin com app autenticador); produtor e comprador nunca veem.
 */

const when = (d: Date) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(".", "");
const money = (c: number | null | undefined) => (c == null ? null : brl(c));

const STATUS: Record<string, [string, string]> = {
  valid: ["Válido", "ok"], used: ["Usado (entrou)", "in"], transferred: ["Transferência pendente", "wait"], cancelled: ["Cancelado", "off"], refunded: ["Reembolsado", "off"],
};
const VIA: Record<TrailHolder["via"], string> = { compra: "compra", presente: "presente", transferencia: "transferência", revenda: "revenda" };

/** Frase de cada passo: o quê (título) e o detalhe (quem, para quem, valor). */
function line(s: TrailStep): { t: string; d: (string | null | undefined)[]; tone: "" | "ok" | "off" | "in" } {
  const v = money(s.amountCents);
  const k: TrailKind = s.kind;
  switch (k) {
    case "emitido": return { t: "Emitido", d: [s.who && `Comprou: ${s.who}`, s.to, v && `Valor ${v}`], tone: "ok" };
    case "presente": return { t: "Enviado de presente na compra", d: [s.to && `Para ${s.to}`, s.who && `Por ${s.who}`], tone: "" };
    case "presente_aceito": return { t: "Presente recebido", d: [s.to && `Agora com ${s.to}`, s.who && `De ${s.who}`], tone: "ok" };
    case "transferencia_enviada": return { t: "Transferência enviada", d: [s.to && `Para ${s.to}`, s.who && `Por ${s.who}`], tone: "" };
    case "transferencia_reenviada": return { t: "E-mail da transferência reenviado", d: [s.to && `Para ${s.to}`], tone: "" };
    case "transferencia_aceita": return { t: "Transferência aceita", d: [s.to && `Agora com ${s.to}`, s.who && `De ${s.who}`], tone: "ok" };
    case "transferencia_cancelada": return { t: "Transferência desfeita", d: [s.to && `Era para ${s.to}`, s.who && `Por ${s.who}`], tone: "off" };
    case "revenda_anunciada": return { t: "Anunciado na revenda", d: [v && `Por ${v}`, s.who && `Por ${s.who}`], tone: "" };
    case "revenda_retirada": return { t: "Retirado da revenda", d: [s.who && `Por ${s.who}`], tone: "off" };
    case "revenda_vendida": return { t: "Vendido na revenda", d: [v && `Por ${v}`, s.to && `Comprou: ${s.to}`, s.who && `Vendeu: ${s.who}`], tone: "ok" };
    case "reembolso": return { t: "Reembolsado", d: [v, s.who && `Por ${s.who}`], tone: "off" };
    case "cancelado": return { t: "Cancelado", d: [v, s.who && `Por ${s.who}`], tone: "off" };
    case "checkin": return { t: "Entrou no evento (check-in)", d: [s.who && `Portaria: ${s.who}`], tone: "in" };
    case "checkin_recusado": return { t: "Check-in recusado", d: [s.who && `Portaria: ${s.who}`], tone: "off" };
  }
}

function Ticket({ t }: { t: AdminTrail }) {
  const [st, tone] = STATUS[t.status] ?? [t.status, ""];
  const before = t.holders.slice(0, -1);
  return (
    <article className="tl-tk">
      <header className="tl-h">
        <div className="tl-hc">
          <b className="tl-code">{t.code}</b>
          <i className={`tl-st ${tone}`}>{st}</i>
        </div>
        <span className="tl-ev"><Link href={`/eventos/${t.event.slug}`} target="_blank">{t.event.title}</Link> · {when(t.event.startAt)}</span>
        <span className="tl-meta">
          {t.type}{(t.kind === "meia" || t.half) && !/meia/i.test(t.type) ? " · meia" : ""}
          {t.order?.number ? ` · Pedido #${t.order.number}` : ""}
          {t.order?.buyer || t.order?.email ? ` · comprado por ${[t.order.buyer, t.order.email].filter(Boolean).join(" · ")}` : ""}
        </span>
      </header>

      <dl className="tl-who">
        {/* a conta que está com o ingresso e o nome impresso nele (num presente pendente, a conta ainda é a de quem comprou) */}
        <div><dt>Está com</dt><dd>{t.holder.email ?? "—"}{t.holder.name && <small>Nome no ingresso: {t.holder.name}</small>}</dd></div>
        {before.length > 0 && (
          <div><dt>Titulares anteriores</dt><dd>{before.map((h, i) => <span key={i}>{[h.name, h.email].filter(Boolean).join(" · ") || "Conta sem perfil"} <small>({VIA[h.via]}, {when(h.since)})</small></span>)}</dd></div>
        )}
        {t.prevCodes.length > 0 && <div><dt>Códigos anteriores</dt><dd className="tl-codes">{t.prevCodes.join(" · ")}</dd></div>}
      </dl>

      <ol className="tl-steps">
        {t.steps.map((s, i) => {
          const x = line(s);
          const d = x.d.filter(Boolean);
          return (
            <li key={i} className={x.tone ? `tl-s ${x.tone}` : "tl-s"}>
              <time className="tl-at" dateTime={new Date(s.at).toISOString()}>{when(s.at)}</time>
              <span className="tl-dot" aria-hidden="true" />
              <span className="tl-tx">
                <b>{x.t}{s.rebuilt && <em className="tl-rb" title="Montado a partir dos dados antigos (ingresso de antes do rastro)">reconstruído</em>}</b>
                {d.length > 0 && <span>{d.join(" · ")}</span>}
                {(s.note || (s.code && s.code !== t.code)) && <small>{[s.note, s.code && s.code !== t.code ? `Código: ${s.code}` : null].filter(Boolean).join(" · ")}</small>}
              </span>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

/** Aba "Ingressos" da central: busca e resultados. `rows` é null antes de buscar. */
export function AdminTrailTab({ q, path, rows, valid }: { q: string; path: string; rows: AdminTrail[] | null; valid: boolean }) {
  return (
    <section className="ad-card tl">
      <form className="ad-search" action={path}>
        <input type="hidden" name="aba" value="ingressos" />
        <input autoComplete="off" name="q" defaultValue={q} placeholder="Código do ingresso, e-mail ou nº do pedido" aria-label="Buscar ingresso por código, e-mail ou número do pedido" />
        <button type="submit">Buscar</button>
      </form>
      {rows === null ? (
        <p className="ad-empty tl-hint">Digite o código do ingresso (atual ou anterior, com ou sem hífen), o e-mail de quem comprou, enviou ou recebeu, ou o número do pedido (#50121).</p>
      ) : !valid ? (
        <p className="ad-empty tl-hint">Não entendi a busca. Digite um código (TW-XXXX-XXXX), um e-mail ou um número de pedido.</p>
      ) : !rows.length ? (
        <p className="ad-empty tl-hint">Nenhum ingresso para “{q}”.</p>
      ) : (
        <>
          <p className="tl-count">{rows.length === 1 ? "1 ingresso" : `${rows.length} ingressos`}{rows.length >= 20 ? " (mostrando os 20 mais recentes)" : ""}</p>
          {rows.map((t) => <Ticket key={t.id} t={t} />)}
        </>
      )}
    </section>
  );
}
