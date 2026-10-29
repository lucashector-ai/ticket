"use client";

import { useState } from "react";
import { COUNTRIES, joinPhone, maskBr, phoneValid, splitPhone } from "@/lib/phone";

/**
 * Celular com a caixinha do código do país (🇧🇷 +55 já vem marcado).
 * `value`/`onChange` usam o formato guardado (lib/phone). `className` vale para a caixinha e para o número,
 * para seguir o visual de cada formulário. `name`: manda o valor junto num <form> comum.
 */
export function PhoneField({ value, onChange, className, name, invalid, placeholder, id }: { value: string; onChange: (v: string) => void; className?: string; name?: string; invalid?: boolean; placeholder?: string; id?: string }) {
  const [iso, setIso] = useState(() => splitPhone(value).iso);
  const br = iso === "BR";
  const ddi = COUNTRIES.find((c) => c.iso === iso)!.ddi;
  const digits = value.replace(/\D/g, "");
  const national = br || !digits.startsWith(ddi) ? digits : digits.slice(ddi.length);
  return (
    <span className="tel">
      <select className={`${className ?? ""} tel-cc`} value={iso} onChange={(e) => { const next = e.target.value as typeof iso; setIso(next); onChange(joinPhone(next, national)); }} aria-label="Código do país" autoComplete="tel-country-code">
        {COUNTRIES.map((c) => <option key={c.iso} value={c.iso} title={c.name}>{c.flag} +{c.ddi}</option>)}
      </select>
      <input
        id={id}
        className={className}
        type="tel"
        inputMode="tel"
        value={br ? maskBr(national) : national}
        onChange={(e) => onChange(joinPhone(iso, br ? e.target.value.slice(0, 15) : e.target.value.replace(/\D/g, "").slice(0, 14)))}
        autoComplete="tel-national"
        placeholder={placeholder ?? (br ? "(11) 98765-4321" : "Número com código de área")}
        aria-invalid={invalid || undefined}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </span>
  );
}

export { phoneValid };
