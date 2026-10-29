"use client";

import { useEffect, useMemo, useState } from "react";
import { parseCity } from "@/lib/criar/model";

/*
 * Estado + cidade com a lista oficial de municípios do IBGE (public/data/municipios.json, carregada só
 * quando o campo aparece). O valor continua no formato "Cidade – UF" que o resto do Criar evento usa.
 */

export const UFS: [string, string][] = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
];

type City = { n: string; uf: string; k: string; cap: boolean };

/** sem acento, minúsculo, sem pontuação: "FLORIANOPOLIS" e "Florianópolis" viram a mesma chave */
export const cityKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

let load: Promise<City[]> | null = null;
function cities(): Promise<City[]> {
  load ??= fetch("/data/municipios.json")
    .then((r): Promise<Record<string, string[]>> | Record<string, string[]> => (r.ok ? r.json() : {}))
    .then((by) => Object.entries(by).flatMap(([uf, list]) => list.map((n, i) => ({ n, uf, k: cityKey(n), cap: i === 0 }))))
    .catch(() => { load = null; return []; });
  return load;
}

function useCities() {
  const [list, setList] = useState<City[]>([]);
  useEffect(() => { let on = true; void cities().then((l) => { if (on) setList(l); }); return () => { on = false; }; }, []);
  return list;
}

/** Começa com o que foi digitado primeiro, depois contém; capital antes; no máximo 8. */
function suggest(list: City[], q: string, uf: string) {
  const k = cityKey(q);
  const pool = uf ? list.filter((c) => c.uf === uf) : list;
  if (!k) return uf ? pool.slice(0, 8) : [];
  const starts = pool.filter((c) => c.k.startsWith(k));
  const has = k.length >= 3 ? pool.filter((c) => !c.k.startsWith(k) && c.k.includes(k)) : [];
  const ord = (a: City, b: City) => Number(b.cap) - Number(a.cap) || a.k.localeCompare(b.k);
  return [...starts.sort(ord), ...has.sort(ord)].slice(0, 8);
}

/** Acha o município pelo nome (sem acento/maiúscula); sem estado, só se o nome for único no Brasil. */
export function resolveCity(list: City[], name: string, uf: string): City | null {
  const k = cityKey(name);
  if (!k) return null;
  const hit = list.filter((c) => c.k === k && (!uf || c.uf === uf));
  return hit.length === 1 ? hit[0] : null;
}

const fmt = (c: { n: string; uf: string }) => `${c.n} – ${c.uf}`;
/** "Florianópolis – SC" → partes; texto solto (ex.: "FLORIANOPOLIS") vira só o nome */
const UF_SET = new Set(UFS.map(([u]) => u));
const split = (v: string) => { const p = parseCity(v); return p && UF_SET.has(p.uf) ? { name: p.name, uf: p.uf } : { name: v, uf: "" }; };

function Hits({ hits, onPick, showUf }: { hits: City[]; onPick: (c: City) => void; showUf: boolean }) {
  return (
    <div className="cv-acl cv-cty-l" onMouseDown={(e) => e.preventDefault()} role="listbox">
      <div className="cv-vl">
        {hits.map((c, i) => (
          <button key={c.uf + c.n} className="vr" type="button" role="option" aria-selected={false} onClick={() => onPick(c)} style={{ animationDelay: `${i * 25}ms` }}>
            <span className="tx"><b>{c.n}</b>{showUf && <span className="s">{UFS.find(([u]) => u === c.uf)?.[1]} · {c.uf}</span>}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Etapa Onde (um local só): Estado (lista) + Cidade (com sugestões do estado escolhido).
 * Os dois campos saem do próprio valor; só o estado escolhido antes da cidade fica guardado aqui.
 * `onChange(v, auto)`: auto = só corrigimos a grafia/estado de uma cidade que já estava lá.
 */
export function CityStatePicker({ value, onChange, autoFocus }: { value: string; onChange: (v: string, auto?: boolean) => void; autoFocus?: boolean }) {
  const list = useCities();
  const [ufDraft, setUfDraft] = useState("");
  const [open, setOpen] = useState(false);
  const p = split(value);
  const name = p.name;
  const uf = p.uf || ufDraft;

  const emit = (n: string, u: string, auto = false) => {
    if (!auto) setTouched(true);
    onChange(n.trim() && u ? `${n.trim()} – ${u}` : n, auto);
  };

  // cidade que já veio salva sem estado ou sem acento ("FLORIANOPOLIS"): corrige sozinho quando der para
  // saber qual é. Depois que a pessoa mexe nos campos, só corrige ao sair da cidade (ver onBlur).
  const [touched, setTouched] = useState(false);
  const fix = list.length ? resolveCity(list, name, uf) : null;
  const fixTo = fix && (fix.n !== name || fix.uf !== uf) ? fmt(fix) : null;
  useEffect(() => {
    if (fixTo && !touched) onChange(fixTo, true);
  }, [fixTo, touched, onChange]);

  const hits = useMemo(() => (open ? suggest(list, name, uf) : []), [list, name, uf, open]);
  const known = !!fix;
  const pick = (c: City) => { setUfDraft(c.uf); emit(c.n, c.uf); setOpen(false); };

  return (
    <div className="cv-cty">
      <label className="cv-fl uf">
        <span>Estado</span>
        <select className={!uf && name.trim() ? "cv-in bad" : "cv-in"} value={uf} onChange={(e) => { setUfDraft(e.target.value); emit(name, e.target.value); }} aria-label="Estado">
          <option value="">Escolha</option>
          {UFS.map(([u, n]) => <option key={u} value={u}>{n}</option>)}
        </select>
      </label>
      <div className="cv-fl cv-ac" onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setOpen(false);
        // saiu da cidade: acerta acento/maiúsculas e, se o nome for único no Brasil, completa o estado
        if (fixTo) onChange(fixTo, true);
      }}>
        <span>Cidade</span>
        <input
          className={!open && name.trim() && uf && list.length && !known ? "cv-in warn" : "cv-in"}
          value={name}
          onFocus={() => setOpen(true)}
          onChange={(e) => { emit(e.target.value, uf); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && open && hits[0]) { e.preventDefault(); e.stopPropagation(); pick(hits[0]); }
          }}
          placeholder={uf ? "Digite a cidade" : "Ex.: Florianópolis"}
          aria-label="Cidade"
          autoComplete="off"
          autoFocus={autoFocus}
        />
        {open && hits.length > 0 && !(hits.length === 1 && hits[0].n === name && hits[0].uf === uf) && <Hits hits={hits} onPick={pick} showUf={!uf} />}
      </div>
    </div>
  );
}

/** Turnê: um campo só, "Cidade – UF", com sugestões de todo o Brasil. */
export function CityField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const list = useCities();
  const [open, setOpen] = useState(false);
  const q = split(value).name;
  const hits = useMemo(() => (open && !parseCity(value) ? suggest(list, q, "") : []), [list, q, value, open]);
  const ok = !!parseCity(value);
  return (
    <div className="cv-ac" onBlur={(e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      setOpen(false);
      // digitou só o nome e ele é único no Brasil: completa com o estado
      const c = !ok ? resolveCity(list, value, "") : null;
      if (c) onChange(fmt(c));
    }}>
      <input className={value && !ok ? "cv-in bad" : "cv-in"} value={value} onFocus={() => setOpen(true)} onChange={(e) => { onChange(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }} placeholder="Cidade – UF" aria-label={label} autoComplete="off" />
      {open && hits.length > 0 && <Hits hits={hits} onPick={(c) => { onChange(fmt(c)); setOpen(false); }} showUf />}
    </div>
  );
}
