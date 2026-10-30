"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { BannerArt } from "@/components/art/banner";
import { FlyerArt } from "@/components/art/flyer";
import { signupLaunch } from "@/lib/actions/launch";
import type { Teaser } from "@/lib/criar/model";
import { FlipClock, useNowSec } from "./countdown";

export type LaunchScreenData = {
  page: Teaser;
  title: string;
  when: string;
  where: string;
  bannerId: string;
  flyerId: string;
  lineup: string[];
  /** fase agora: antes de tudo (soon) ou com a pré-venda já rolando (presale) */
  phase: "soon" | "presale";
  openAt: string;
  presaleAt: string | null;
};

const DT = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const whenOf = (iso: string) => DT.format(new Date(iso)).replace(/\./g, "").replace(",", "").replace(/^(\w)/, (c) => c.toUpperCase());

/**
 * Tela inteira de contagem antes da abertura das vendas, no estilo escolhido pelo produtor.
 * `preview`: dentro do celular de prévia do criar evento (sem cadastro de verdade).
 */
export function LaunchScreen({ x, slug, email: initialEmail = "", preview = false, phone = preview }: { x: LaunchScreenData; slug?: string; email?: string; preview?: boolean; phone?: boolean }) {
  const router = useRouter();
  const now = useNowSec();
  const presaleSignup = x.phase === "soon" && !!x.presaleAt;
  const target = presaleSignup ? x.presaleAt! : x.openAt;
  const left = Math.max(0, Math.floor(new Date(target).getTime() / 1000) - now);
  const [email, setEmail] = useState(initialEmail);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  // chegou a hora: recarrega (abre a pré-venda ou os ingressos)
  const refreshed = useRef(false);
  useEffect(() => {
    if (!preview && now && left === 0 && !refreshed.current) { refreshed.current = true; router.refresh(); }
  }, [preview, now, left, router]);

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (preview || !slug) return;
    start(async () => {
      const r = await signupLaunch(slug, presaleSignup ? "presale" : "abertura", email);
      if (r.ok) { setDone(true); setMsg({ ok: true, text: r.message ?? "" }); } else setMsg({ ok: false, text: r.error });
    });
  };

  const p = x.page;
  const headline = p.headline.trim() || (x.phase === "presale" ? "A venda geral abre em" : presaleSignup ? "A pré-venda começa em" : "As vendas abrem em");
  const kick = x.phase === "presale" ? "Pré-venda em andamento" : presaleSignup ? "Pré-venda para cadastrados" : "Em breve";
  const showPoster = p.theme === "arte" || p.theme === "escuro";
  return (
    <section className={`ls ls-${p.theme}${preview ? " ls-prev" : ""}${phone ? " ls-pv" : ""}`} aria-label={`${headline} · ${x.title}`}>
      <div className="ls-bg" aria-hidden="true">
        {p.theme === "arte" && <div className="ls-art"><BannerArt id={x.bannerId} fit="fill" poster={x.bannerId === x.flyerId} /></div>}
        {p.theme === "foto" && p.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ls-img" src={p.image} alt="" />
        )}
        <span className="ls-glow" /><span className="ls-grid" /><span className="ls-shade" />
      </div>

      <div className="ls-in">
        <div className="ls-main">
          <span className="ls-k"><i aria-hidden="true" />{kick}</span>
          <h2 className="ls-title">{x.title}</h2>
          <span className="ls-meta">{[x.when, x.where].filter(Boolean).join(" · ")}</span>

          <div className="ls-clock">
            <span className="ls-hl">{headline}</span>
            <FlipClock left={left} ready={!!now} label={headline} />
            <span className="ls-when">{whenOf(target)}</span>
          </div>

          {p.message.trim() && <p className="ls-msg">{p.message.trim()}</p>}

          {done ? (
            <div className="ls-ok" role="status">
              <span aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              <div><b>{presaleSignup ? "Você está na pré-venda" : "Pronto, vamos te avisar"}</b><small>{msg?.text || (presaleSignup ? `O link exclusivo chega em ${email.trim()}.` : `Avisamos em ${email.trim()} assim que abrir.`)}</small></div>
            </div>
          ) : (
            /* sem trava no botão vazio: o envio responde "Digite um e-mail válido." (o botão travado parecia ativo e não dizia nada) */
            <form className="ls-f" onSubmit={submit} noValidate>
              <label className="sr" htmlFor={preview ? undefined : "ls-mail"}>Seu e-mail</label>
              <input id={preview ? undefined : "ls-mail"} type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com" value={email} onChange={(e) => { setEmail(e.target.value); setMsg(null); }} required={!preview} aria-invalid={msg && !msg.ok ? true : undefined} aria-describedby={msg && !msg.ok ? "ls-err" : undefined} readOnly={preview} tabIndex={preview ? -1 : undefined} />
              <button type="submit" disabled={pending} tabIndex={preview ? -1 : undefined}>
                {pending ? "Enviando…" : presaleSignup ? "Quero a pré-venda" : "Me avise"}
              </button>
              {msg && !msg.ok && <p className="ls-err" id="ls-err" role="alert">{msg.text}</p>}
            </form>
          )}
          <span className="ls-fine">{presaleSignup ? "Só quem se cadastrar recebe o link para comprar antes de todo mundo." : "Um e-mail só, na hora em que abrir. Sem spam."}</span>

          {x.presaleAt && (
            <ol className="ls-steps">
              <li className={x.phase === "soon" ? "cur" : "ok"}><i aria-hidden="true" /><b>Pré-venda</b><span>{whenOf(x.presaleAt)}</span></li>
              <li className={x.phase === "presale" ? "cur" : ""}><i aria-hidden="true" /><b>Venda geral</b><span>{whenOf(x.openAt)}</span></li>
            </ol>
          )}
          {p.lineup && x.lineup.length > 0 && (
            <div className="ls-lu"><span>Line-up</span>{x.lineup.slice(0, 8).map((n) => <b key={n}>{n}</b>)}</div>
          )}
        </div>
        {showPoster && <div className="ls-poster" aria-hidden="true"><FlyerArt id={x.flyerId} /></div>}
      </div>

      {!preview && (
        <a className="ls-more" href="#sobre">
          Ver detalhes do evento
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4" /></svg>
        </a>
      )}
    </section>
  );
}
