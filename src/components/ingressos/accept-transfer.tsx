"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { acceptTransfer } from "@/lib/actions/tickets";

/** Botão "Aceitar ingresso" da página de transferência. */
export function AcceptTransfer({ token, email, expected }: { token: string; email: string; expected: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const other = !!email && email.toLowerCase() !== expected.toLowerCase();
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await acceptTransfer(token);
    if (r.ok) { router.push(`/ingressos/${r.code}`); return; }
    if (r.login) { router.push(`/entrar?next=${encodeURIComponent(`/transferencia/${token}`)}`); return; }
    setErr(r.error);
    setBusy(false);
  };
  return (
    <>
      {other && <p className="gp-st"><span>Você está logado como <b>{email}</b>. O ingresso vai para esta conta.</span></p>}
      {err && <p className="gp-err" role="alert">{err}</p>}
      <div className="gp-foot">
        <button className="gp-pay" type="button" onClick={() => void go()} disabled={busy}>{busy ? "Aceitando…" : "Aceitar ingresso"}</button>
      </div>
    </>
  );
}
