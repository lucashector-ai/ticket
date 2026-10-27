"use client";

import { useActionState, useState } from "react";
import { subscribeNewsletter } from "@/lib/actions/social";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Bloco de newsletter da home ("Os melhores eventos, toda quinta no seu e-mail."). */
export function Newsletter() {
  const [state, action, pending] = useActionState(subscribeNewsletter, null);
  const [email, setEmail] = useState("");
  const [localErr, setLocalErr] = useState("");
  const err = localErr || state?.error || "";
  const sent = !!state?.ok;

  return (
    <div className="news rv">
      <div>
        <h2>Os melhores eventos, toda quinta no seu e-mail.</h2>
        <p>Uma seleção curta do que vale sair de casa no fim de semana. Sem spam.</p>
      </div>
      <div>
        {sent ? (
          <div className="nok" role="status">
            <span className="dot" />
            Pronto. Até quinta!
          </div>
        ) : (
          <form
            action={action}
            noValidate
            onSubmit={(ev) => {
              if (!EMAIL_RE.test(email.trim())) {
                ev.preventDefault();
                setLocalErr("Confira o e-mail, parece incompleto.");
              }
            }}
          >
            <div className="nform">
              <label className="sr" htmlFor="nl">Seu e-mail</label>
              <input id="nl" name="email" type="email" placeholder="seu@email.com" value={email} onChange={(ev) => { setEmail(ev.target.value); setLocalErr(""); }} autoComplete="email" />
              <button type="submit" disabled={pending}>{pending ? "Enviando…" : "Inscrever-se"}</button>
            </div>
            {err && <p className="nerr" role="alert">{err}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
