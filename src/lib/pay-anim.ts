/*
 * Pagamento aprovado (animação feita no Claude Design, estilos em styles/pay-anim.css).
 * O botão (estados is-paying / is-approved) é controlado pelo React no checkout; daqui sai a cortina
 * lima que nasce do botão (ou do centro da tela, no Pix), a celebração e a entrada da confirmação.
 */

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const PAY_MIN_MS = 1600;
export const PAY_APPROVED_MS = 450;

type FloodOpts = {
  /** retângulo do botão de pagar; sem ele, a cortina nasce do centro da tela */
  origin?: DOMRect | null;
  /** linha abaixo de "Pagamento aprovado" (ex.: "R$ 48,60 · Cartão 1x · Pedido #48231") */
  summary?: string;
  /** a tela está toda verde: troque para a confirmação aqui */
  onCovered: () => void;
  /** container da confirmação (itens com data-tw-reveal entram em sequência) */
  revealRoot?: () => Element | null;
};

function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

const CHECK = (size: number, color: string, width: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/** Cortina lima → celebração → troca de tela por baixo → cortina sobe e a confirmação entra. */
export async function playPaymentFlood({ origin, summary, onCovered, revealRoot }: FloodOpts) {
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) {
    onCovered();
    await wait(30);
    revealRoot?.()?.classList.add("tw-reveal");
    return;
  }
  const ox = origin ? origin.left + origin.width / 2 : window.innerWidth / 2;
  const oy = origin ? origin.top + origin.height / 2 : window.innerHeight / 2;

  // 3) cortina lima nasce do botão
  const flood = el("div", "tw-flood");
  flood.setAttribute("role", "status");
  flood.setAttribute("aria-live", "polite");
  flood.style.setProperty("--ox", `${ox}px`);
  flood.style.setProperty("--oy", `${oy}px`);
  document.body.appendChild(flood);
  await wait(1000);

  // 4) celebração + troca de tela por baixo
  flood.classList.add("is-full");
  const inner = el("div", "tw-flood-in");
  const big = el("div", "tw-big-check");
  big.appendChild(el("span", "tw-ring"));
  big.appendChild(el("span", "tw-ring r2"));
  for (let a = 0; a < 360; a += 30) {
    const s = el("span", "tw-spark");
    s.style.setProperty("--a", `${a}deg`);
    big.appendChild(s);
  }
  big.insertAdjacentHTML("beforeend", CHECK(64, "#EDFF3C", 2.6));
  inner.appendChild(big);
  inner.appendChild(el("h2", "tw-flood-title", "Pagamento aprovado"));
  if (summary) inner.appendChild(el("p", "tw-flood-sub", summary));
  const pill = el("span", "tw-flood-pill", "Gerando seus ingressos ");
  for (let i = 0; i < 3; i++) pill.appendChild(document.createElement("i"));
  inner.appendChild(pill);
  flood.appendChild(inner);
  onCovered();
  window.scrollTo(0, 0);
  await wait(1750);

  // 5) cortina sobe e revela a confirmação
  flood.classList.add("is-leaving");
  const root = revealRoot?.();
  if (root) {
    root.classList.remove("tw-reveal-hold");
    void (root as HTMLElement).offsetWidth;
    root.classList.add("tw-reveal");
  }
  await wait(1000);
  flood.remove();
}

/** Ícones do botão nos estados "processando" e "aprovado" (markup estático, sem dados do usuário). */
export const MINI_CHECK = CHECK(12, "#EDFF3C", 3.4);
