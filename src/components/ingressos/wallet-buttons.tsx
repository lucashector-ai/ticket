"use client";

import { useEffect } from "react";
import { useToast } from "@/components/toast";
import { IcoCalendar } from "./icons";

export type WalletFlags = { apple: boolean; google: boolean };

const AppleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9-1.7 0-3.3 1-4.2 2.6-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.1zM13.9 4.9c.7-.9 1.2-2 1.1-3.2-1 0-2.3.7-3 1.6-.7.8-1.3 2-1.1 3.1 1.1.1 2.3-.6 3-1.5z" /></svg>
);
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" /><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z" /><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14z" /><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 5.9 12 5.9z" /></svg>
);

const MSG: Record<string, string> = {
  "apple-indisponivel": "A Apple Wallet ainda não está disponível. Use o QR code desta página.",
  "apple-erro": "Não foi possível gerar o passe da Apple Wallet agora.",
  "google-indisponivel": "O Google Wallet ainda não está disponível. Use o QR code desta página.",
  "google-erro": "Não foi possível abrir o Google Wallet agora.",
};

/**
 * "Adicionar à Apple Wallet" / "Salvar no Google Wallet" (os que estiverem configurados) + agenda.
 * `pills`: só as duas carteiras, em botões curtos lado a lado (página do ingresso; a agenda vai nos atalhos).
 */
export function WalletButtons({ code, flags, pills = false, children }: { code: string; flags: WalletFlags; pills?: boolean; children?: React.ReactNode }) {
  const { flash } = useToast();
  // volta das rotas de carteira com ?wallet=… quando algo falha
  useEffect(() => {
    const u = new URL(window.location.href);
    const f = u.searchParams.get("wallet");
    if (!f) return;
    if (MSG[f]) flash(MSG[f]);
    u.searchParams.delete("wallet");
    window.history.replaceState(null, "", u.toString());
  }, [flash]);
  if (pills) return (
    <>
      {flags.apple && <a className="wl-p wl-pa" href={`/api/ingressos/${code}/apple`}><AppleIcon />Apple Wallet</a>}
      {flags.google && <a className="wl-p wl-pg" href={`/api/ingressos/${code}/google`}><GoogleIcon />Google Wallet</a>}
      {children}
    </>
  );
  return (
    <>
      {flags.apple && <a className="btn-w wl-a" href={`/api/ingressos/${code}/apple`}><AppleIcon />Adicionar à Apple Wallet</a>}
      {flags.google && <a className="btn-w wl-g" href={`/api/ingressos/${code}/google`}><GoogleIcon />Salvar no Google Wallet</a>}
      <a className={flags.apple || flags.google ? "btn-l" : "btn-w"} href={`/api/ingressos/${code}/ics`} download={`ticketswin-${code}.ics`}><IcoCalendar />Adicionar à agenda</a>
    </>
  );
}
