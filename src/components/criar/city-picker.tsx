"use client";

import { useEffect, useRef, useState } from "react";
import { cityKey, CitySelect, findCity, isUf, UfSelect } from "@/components/city-select";
import { parseCity } from "@/lib/criar/model";

/*
 * Estado + Cidade do Criar evento (mesmo campo do resto do site, components/city-select).
 * O valor continua no formato "Cidade – UF" que o rascunho e o servidor usam.
 */

/** "Florianópolis – SC" → partes; texto solto (ex.: "FLORIANOPOLIS") vira só o nome */
const split = (v: string) => { const p = parseCity(v); return p && isUf(p.uf) ? { name: p.name, uf: p.uf } : { name: v.trim(), uf: "" }; };
const join = (name: string, uf: string) => (uf && name.trim() ? `${name.trim()} – ${uf}` : name.trim() ? name : "");

/**
 * Cidade que já veio salva sem estado (ex.: "FLORIANOPOLIS"): se o nome for único no Brasil,
 * completa com o estado e a grafia oficial.
 */
function useLegacyFix(value: string, onFix: (v: string) => void) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const p = split(value);
    if (p.uf || !p.name) return;
    void findCity(p.name).then((c) => { if (c) onFix(`${c.nome} – ${c.uf}`); });
  }, [value, onFix]);
}

/** Estado escolhido antes da cidade: o valor "Cidade – UF" ainda não tem como guardá-lo. */
function useParts(value: string) {
  const p = split(value);
  const [ufDraft, setUfDraft] = useState("");
  return { name: p.name, uf: p.uf || ufDraft, setUfDraft };
}

/** Etapa Onde (um local só): Estado e Cidade lado a lado. `onChange(v, auto)`: auto = correção automática (mantém o lugar do Google). */
export function CityStatePicker({ value, onChange }: { value: string; onChange: (v: string, auto?: boolean) => void }) {
  const { name, uf, setUfDraft } = useParts(value);
  useLegacyFix(value, (v) => onChange(v, true));
  return (
    <div className="cv-cty">
      <label className="cv-fl uf">
        <span>Estado</span>
        <UfSelect className="cv-in" value={uf} invalid={!uf && !!name} onChange={(u) => { setUfDraft(u); onChange(join(name, u)); }} />
      </label>
      <label className="cv-fl">
        <span>Cidade</span>
        <CitySelect className="cv-in" uf={uf} value={uf ? name : ""} onChange={(c) => onChange(join(c, uf), !!c && cityKey(c) === cityKey(name))} />
      </label>
    </div>
  );
}

/** Turnê: Estado (sigla) + Cidade dentro da linha de cada data. */
export function CityField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const { name, uf, setUfDraft } = useParts(value);
  useLegacyFix(value, onChange);
  return (
    <div className="cv-tcty" role="group" aria-label={label}>
      <UfSelect className="cv-in" short value={uf} invalid={!uf && !!name} onChange={(u) => { setUfDraft(u); onChange(join(name, u)); }} />
      <CitySelect className="cv-in" uf={uf} value={uf ? name : ""} onChange={(c) => onChange(join(c, uf))} />
    </div>
  );
}
