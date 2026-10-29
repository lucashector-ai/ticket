"use client";

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { signOut } from "@/lib/actions/auth";

type Props = {
  className?: string;
  style?: CSSProperties;
  role?: string;
  children?: ReactNode;
  /** o que sair faz (padrão: sair da conta Tickets Win) */
  onConfirm?: () => unknown;
  title?: string;
  text?: string;
};

/** Botão "Sair" que pergunta antes. O diálogo vai direto no <body>, fora dos menus. */
export function SignOutButton({ className, style, role, children = "Sair", onConfirm, title = "Sair da sua conta?", text = "Você vai precisar entrar de novo para ver seus ingressos." }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const trigger = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLButtonElement>(null);
  const id = useId();

  const close = () => { if (busy) return; setOpen(false); trigger.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    main.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      // Esc fecha só o diálogo (não o menu de onde ele saiu)
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); return; }
      if (e.key !== "Tab" || !box.current) return;
      // foco preso entre os dois botões
      const els = [...box.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const go = () => start(async () => { await (onConfirm ? onConfirm() : signOut()); });

  return (
    <>
      <button ref={trigger} className={className} style={style} role={role} type="button" aria-haspopup="dialog" onClick={() => setOpen(true)}>{children}</button>
      {open && createPortal(
        <div className="so-ov" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={box} className="so-box" role="dialog" aria-modal="true" aria-labelledby={`${id}t`} aria-describedby={`${id}s`}>
            <span className="so-ic" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4" /><path d="M6 12h10" /></svg>
            </span>
            <h2 className="so-t" id={`${id}t`}>{title}</h2>
            <p className="so-s" id={`${id}s`}>{text}</p>
            <div className="so-a">
              <button className="so-b" type="button" onClick={close} disabled={busy}>Cancelar</button>
              <button ref={main} className="so-b so-go" type="button" onClick={go} disabled={busy} aria-busy={busy}>{busy ? "Saindo…" : "Sair"}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
