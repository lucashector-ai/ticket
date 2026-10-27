"use client";

import { useEffect } from "react";

/** Overlay modal do design (.mo): fecha com Esc e clique no fundo. */
export function Modal({ label, className, onClose, children }: { label: string; className?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.documentElement.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="mo" role="dialog" aria-modal="true" aria-label={label}>
      <button className="mo-bg" type="button" onClick={onClose} aria-label="Fechar" />
      <div className={className ? `mo-c ${className}` : "mo-c"}>{children}</div>
    </div>
  );
}
