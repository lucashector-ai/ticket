"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { setActiveOrganizer } from "@/lib/actions/produtoras";

export type OrgItem = { id: string; name: string; initials: string; image: string | null; role: "owner" | "admin" | "portaria" };

export const ROLE_LABEL: Record<OrgItem["role"], string> = { owner: "Dono", admin: "Admin", portaria: "Portaria" };

export function OrgAvatar({ o, size = 36 }: { o: Pick<OrgItem, "initials" | "image">; size?: number }) {
  return o.image
    // eslint-disable-next-line @next/next/no-img-element
    ? <img className="pd-av" src={o.image} alt="" width={size} height={size} style={{ width: size, height: size }} />
    : <span className="pd-av" style={{ width: size, height: size }} aria-hidden="true">{o.initials}</span>;
}

/**
 * Produtora ativa no topo do painel (em nome de quem a pessoa cria eventos, vê o financeiro e configura o
 * recebimento). Abre a lista das produtoras da conta (dona ou da equipe) e "Nova produtora" até o limite.
 * No celular a lista sobe como folha de baixo. Trocar grava a escolha no servidor e recarrega o painel.
 */
export function OrgSwitch({ orgs, activeId, userName, canCreate, max }: { orgs: OrgItem[]; activeId: string; userName: string; canCreate: boolean; max: number }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  const menu = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cur = orgs.find((o) => o.id === activeId) ?? orgs[0];
  const owned = orgs.filter((o) => o.role === "owner").length;

  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    (box.current?.querySelector<HTMLElement>(".os-i[aria-checked=true]") ?? box.current?.querySelector<HTMLElement>(".os-i"))?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open]);

  const pick = (id: string) => {
    if (id === cur.id) { setOpen(false); return; }
    setErr(null);
    start(async () => {
      const r = await setActiveOrganizer(id);
      if (!r.ok) { setErr(r.error); return; }
      setOpen(false);
      // páginas de um evento ou da portaria são da produtora anterior: volta ao início do painel
      if (/^\/painel\/(evento|portaria)\//.test(path)) router.push("/painel");
      else router.refresh();
    });
  };
  // setas na lista
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(box.current?.querySelectorAll<HTMLElement>(".os-i") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <div className="os" ref={box}>
      <button ref={btn} className="pd-me os-b" type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={menu} onClick={() => setOpen((v) => !v)}
        aria-label={`Produtora ativa: ${cur.name} (${ROLE_LABEL[cur.role]}). Trocar de produtora`}>
        <OrgAvatar o={cur} />
        <span className="pd-mi"><b className="pd-mn">{cur.name}</b><span className="pd-ms">{userName} · {ROLE_LABEL[cur.role]}</span></span>
        <svg className="os-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <>
          <div className="os-scrim" aria-hidden="true" onClick={() => setOpen(false)} />
          <div className="os-pop" id={menu} role="menu" aria-label="Suas produtoras" onKeyDown={move} aria-busy={busy}>
            <span className="os-k">Você está trabalhando em</span>
            {orgs.map((o) => (
              <button key={o.id} className={o.id === cur.id ? "os-i on" : "os-i"} type="button" role="menuitemradio" aria-checked={o.id === cur.id} onClick={() => pick(o.id)} disabled={busy}>
                <OrgAvatar o={o} size={32} />
                <span className="os-t"><b>{o.name}</b><small>{o.role === "owner" ? "Sua produtora" : `Você é ${ROLE_LABEL[o.role].toLowerCase()} desta produtora`}</small></span>
                {o.id === cur.id && <svg className="os-ck" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
              </button>
            ))}
            {err && <p className="os-err" role="alert">{err}</p>}
            {canCreate
              ? <Link className="os-i os-new" role="menuitem" href="/produtores/nova" onClick={() => setOpen(false)}><span className="os-plus" aria-hidden="true">+</span><span className="os-t"><b>Nova produtora</b><small>Até {max} por conta, cada uma com seus eventos e recebimento</small></span></Link>
              : owned >= max && <p className="os-lim">Você já tem {max} produtoras, o máximo por conta.</p>}
          </div>
        </>
      )}
    </div>
  );
}
