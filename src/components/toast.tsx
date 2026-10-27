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
    timer.current = setTimeout(() => setMsg(null), 2600);
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
