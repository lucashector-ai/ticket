"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type Ctx = { flash: (msg: string) => void };
const ToastCtx = createContext<Ctx>({ flash: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((m: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMsg(m);
    // mensagem longa (avisos com o que fazer) fica mais tempo na tela: ~16 caracteres por segundo, até 12 s
    timer.current = setTimeout(() => setMsg(null), Math.min(12_000, Math.max(2600, m.length * 60)));
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastCtx.Provider value={{ flash }}>
      {children}
      {msg && (
        <div className="toast" role="status">
          <span className="dot" style={{ boxShadow: "none" }} />
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
