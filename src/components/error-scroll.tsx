"use client";

import { useEffect } from "react";

/** O que conta como erro de formulário no site (campos marcados e mensagens de erro). */
const ERR = '[aria-invalid="true"], input.bad, select.bad, textarea.bad, .bad, [role="alert"], .err, .ct-err, .ob-err, .lx-err, .ins-err';

/**
 * Sempre que um erro aparece logo depois de a pessoa tocar ou enviar algo, a página rola até ele
 * (no celular o campo com erro costuma ficar fora da tela). Vale para todos os formulários do site.
 */
export function ErrorScroll() {
  useEffect(() => {
    let lastAct = 0;
    let timer = 0;
    let fresh: HTMLElement[] = [];
    const act = () => { lastAct = Date.now(); };
    const check = () => {
      timer = 0;
      const list = fresh.filter((x) => x.isConnected && x.offsetParent !== null && x.matches(ERR) && !x.closest(".toast, .a11y-root"));
      fresh = [];
      if (!list.length) return;
      // o primeiro na ordem da página
      const el = list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))[0];
      const r = el.getBoundingClientRect();
      const margin = 90; // header fixo e barra do navegador
      if (r.top >= margin && r.bottom <= window.innerHeight - 20) return;
      el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      // campo com erro: já deixa pronto para corrigir (sem abrir o teclado em mensagens)
      if (el.matches("input, select, textarea")) setTimeout(() => el.focus({ preventScroll: true }), 350);
    };
    // só o que acabou de virar erro (mensagem nova ou campo marcado agora), logo depois de um toque/envio
    const obs = new MutationObserver((recs) => {
      if (Date.now() - lastAct > 2500) return;
      for (const r of recs) {
        if (r.type === "attributes" && r.target instanceof HTMLElement) fresh.push(r.target);
        r.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return;
          fresh.push(n);
          n.querySelectorAll<HTMLElement>(ERR).forEach((x) => fresh.push(x));
        });
      }
      if (fresh.length && !timer) timer = window.setTimeout(check, 120);
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-invalid"] });
    window.addEventListener("pointerdown", act, true);
    window.addEventListener("keydown", act, true);
    window.addEventListener("submit", act, true);
    return () => {
      obs.disconnect();
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointerdown", act, true);
      window.removeEventListener("keydown", act, true);
      window.removeEventListener("submit", act, true);
    };
  }, []);
  return null;
}
