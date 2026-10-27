"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** Endereço do site (https://…) só no navegador; no servidor fica vazio, sem quebrar a hidratação. */
export const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "");
