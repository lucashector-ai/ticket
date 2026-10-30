"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { signOutTo } from "@/lib/actions/auth";
import { acceptTransfer } from "@/lib/actions/tickets";

type Props = {
  token: string;
  /** e-mail da conta logada */
  email: string;
  /** e-mail para onde o ingresso foi enviado (só a primeira letra quando é outra conta) */
  expected: string;
  /** a conta logada não é a do e-mail de destino: só a conta desse e-mail recebe (D-11) */
  other: boolean;
  /** ingresso de outra pessoa enviado na compra */
  gift?: boolean;
};

/** Botão "Aceitar ingresso" da página de transferência. */
export function AcceptTransfer({ token, email, expected, other, gift = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const next = `/transferencia/${token}`;
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await acceptTransfer(token);
    if (r.ok) { router.push(`/ingressos/${r.code}`); return; }
    if (r.login) { router.push(`/entrar?next=${encodeURIComponent(next)}`); return; }
    if (r.verify) { router.push(`/ativar-conta?next=${encodeURIComponent(next)}`); return; }
    setErr(r.error);
    setBusy(false);
  };

  if (other) {
    return (
      <>
        <div className="gp-st off">
          <b>Este ingresso é de outra conta</b>
          <span>Só a conta de <strong>{expected}</strong> recebe este ingresso, e você está em <strong>{email}</strong>. Se esse outro e-mail é seu, troque de conta. Se não, peça a quem enviou para transferir para o seu e-mail.</span>
        </div>
        <div className="gp-foot">
          <SignOutButton className="gp-pay" onConfirm={() => signOutTo(next)} title="Trocar de conta?" text={`Você sai de ${email} e volta para esta página para entrar com ${expected}.`}>
            Trocar de conta
          </SignOutButton>
        </div>
      </>
    );
  }
  return (
    <>
      {err && <p className="gp-err" role="alert">{err}</p>}
      <div className="gp-foot">
        <button className="gp-pay" type="button" onClick={() => void go()} disabled={busy}>{busy ? (gift ? "Recebendo…" : "Aceitando…") : gift ? "Receber meu ingresso" : "Aceitar ingresso"}</button>
      </div>
    </>
  );
}
