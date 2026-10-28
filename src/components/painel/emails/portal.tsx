"use client";

import { createPortal } from "react-dom";

/** Janela por cima de tudo: sai de dentro do .pane (que tem animação e prende o position:fixed), mas fica no escopo .pg-painel. */
export function PainelPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.querySelector(".pg-painel") ?? document.body);
}
