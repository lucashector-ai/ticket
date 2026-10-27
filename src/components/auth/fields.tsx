"use client";

import { useState } from "react";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());

export function fieldCls(bad: boolean) {
  return bad ? "fld-i err" : "fld-i";
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return <span className="fld-e" role="alert">{children}</span>;
}

/** Erro vindo do servidor (action), no estilo da página. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p className="lx-err" role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
      </svg>
      {children}
    </p>
  );
}

export function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

type PwProps = {
  name?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: "current-password" | "new-password";
  error?: boolean;
  label?: string;
};

export function PasswordField({ name = "password", value, onChange, placeholder, autoComplete, error = false, label = "Senha" }: PwProps) {
  const [show, setShow] = useState(false);
  return (
    <label className="lf">
      <span className="lf-l">{label}</span>
      <span className="pw">
        <input
          className={fieldCls(error)}
          name={name}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error || undefined}
        />
        <button className="pw-t" type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </span>
    </label>
  );
}
