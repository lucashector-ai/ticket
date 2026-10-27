"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { syncFavorites, toggleFavorite } from "@/lib/actions/social";

type Ctx = {
  favs: string[];
  isFav: (slug: string) => boolean;
  toggle: (slug: string) => Promise<boolean>;
  hydrate: (serverFavs: string[], loggedIn: boolean) => void;
};
const FavCtx = createContext<Ctx>({ favs: [], isFav: () => false, toggle: async () => false, hydrate: () => {} });
const KEY = "onde:favs";

function readLocal(): string[] {
  try { return JSON.parse(window.localStorage.getItem(KEY) || "[]") || []; } catch { return []; }
}
function writeLocal(f: string[]) {
  try { window.localStorage.setItem(KEY, JSON.stringify(f)); } catch {}
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favs, setFavs] = useState<string[]>([]);
  const [loggedIn, setLoggedIn] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o localStorage só no cliente, após a hidratação
  useEffect(() => { setFavs(readLocal()); }, []);

  const hydrate = useCallback((serverFavs: string[], logged: boolean) => {
    setLoggedIn(logged);
    const local = readLocal();
    const merged = Array.from(new Set([...serverFavs, ...local]));
    setFavs(merged);
    writeLocal(merged);
    // salva no servidor os favoritos feitos antes do login
    if (logged) {
      const pending = local.filter((s) => !serverFavs.includes(s));
      if (pending.length) void syncFavorites(pending);
    }
  }, []);

  const toggle = useCallback(async (slug: string) => {
    const has = favs.includes(slug);
    const next = has ? favs.filter((s) => s !== slug) : [...favs, slug];
    setFavs(next);
    writeLocal(next);
    if (loggedIn) void toggleFavorite(slug);
    return !has;
  }, [favs, loggedIn]);

  const value = useMemo<Ctx>(() => ({ favs, isFav: (s) => favs.includes(s), toggle, hydrate }), [favs, toggle, hydrate]);
  return <FavCtx.Provider value={value}>{children}</FavCtx.Provider>;
}

export function useFavorites() {
  return useContext(FavCtx);
}

/** Coloque uma vez por página (server → client) para mesclar favoritos do usuário logado. */
export function FavoritesHydrator({ serverFavs, loggedIn }: { serverFavs: string[]; loggedIn: boolean }) {
  const { hydrate } = useFavorites();
  const key = serverFavs.join(",") + loggedIn;
  useEffect(() => { hydrate(serverFavs, loggedIn); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
