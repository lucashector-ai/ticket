"use client";

/** "Voltar ao topo" do rodapé (rolagem suave, sem animação para quem pediu menos movimento). */
export function BackToTop() {
  return (
    <button
      type="button"
      className="ft-top"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        // teclado/leitor de tela: o foco sobe junto (senão o próximo Tab volta ao rodapé)
        document.querySelector<HTMLElement>("header a[href], header button")?.focus({ preventScroll: true });
      }}
    >
      Voltar ao topo
      <span aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" /></svg></span>
    </button>
  );
}
