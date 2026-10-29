"use client";

import Link from "next/link";
import { useState } from "react";
import { resetWithLink } from "@/lib/actions/senha";
import { FieldError, FormError, PasswordField } from "@/components/auth/fields";

/** Página do link do e-mail: escolhe a nova senha. */
export function ResetForm({ token, to, loggedIn }: { token: string; to: string; loggedIn: boolean }) {
  const [pw, setPw] = useState("");
  const [conf, setConf] = useState("");
  const [err, setErr] = useState<{ pw?: boolean; conf?: boolean }>({});
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er = { pw: pw.length < 8, conf: pw !== conf };
    setErr(er);
    if (er.pw || er.conf) return;
    setBusy(true); setServerErr(null);
    const r = await resetWithLink(token, pw).catch(() => ({ ok: false, error: "Não foi possível salvar agora. Tente de novo." }));
    setBusy(false);
    if (!r.ok) { setServerErr(r.error ?? "Não foi possível salvar."); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="lx-box">
        <h1 className="lx-t">Senha nova salva</h1>
        <p className="lx-s">Pronto. Por segurança, desconectamos a conta dos aparelhos. Entre com a nova senha.</p>
        <a className="lx-btn" href="/entrar">Entrar</a>
      </div>
    );
  }

  return (
    <form className="lx-box" onSubmit={submit} noValidate>
      <h1 className="lx-t">Criar nova senha</h1>
      <p className="lx-s">Para a conta <b>{to}</b>. Use uma senha longa, que você não usa em outros sites.</p>
      {serverErr && <FormError>{serverErr}</FormError>}
      <PasswordField name="new-password" label="Nova senha" value={pw} onChange={(v) => { setPw(v); setErr((o) => ({ ...o, pw: false })); }} placeholder="Mínimo de 8 caracteres" autoComplete="new-password" error={!!err.pw} />
      {err.pw && <FieldError>Use pelo menos 8 caracteres.</FieldError>}
      <PasswordField name="confirm-password" label="Confirme a nova senha" value={conf} onChange={(v) => { setConf(v); setErr((o) => ({ ...o, conf: false })); }} placeholder="Digite de novo" autoComplete="new-password" error={!!err.conf} />
      {err.conf && <FieldError>As duas senhas não são iguais.</FieldError>}
      <button className="lx-btn" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
      <p className="lx-sw"><Link className="au-lk" href={loggedIn ? "/conta/seguranca" : "/entrar"}>Cancelar</Link></p>
    </form>
  );
}
