"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/*
 * Campos de Estado e Cidade usados em todo o site. Cidade abre como o Estado (com a setinha), mas com busca:
 * a lista vem da API /api/cidades (IBGE) e só aceita cidade da lista do estado escolhido.
 */

export const UF_LIST: [string, string][] = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"], ["CE", "Ceará"], ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"], ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"],
  ["PA", "Pará"], ["PB", "Paraíba"], ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"], ["SE", "Sergipe"], ["TO", "Tocantins"],
];
const UF_SET = new Set(UF_LIST.map(([u]) => u));
export const isUf = (u: string) => UF_SET.has(u);

/** sem acento, minúsculo, sem pontuação */
export const cityKey = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const cache = new Map<string, Promise<string[]>>();
/** Cidades de um estado (API /api/cidades?uf=XX), uma busca por estado por visita. */
export function citiesOf(uf: string): Promise<string[]> {
  if (!isUf(uf)) return Promise.resolve([]);
  let p = cache.get(uf);
  if (!p) {
    p = fetch(`/api/cidades?uf=${uf}`).then((r) => (r.ok ? (r.json() as Promise<string[]>) : [])).catch(() => { cache.delete(uf); return []; });
    cache.set(uf, p);
  }
  return p;
}

/** Cidade pelo nome em todo o Brasil (único) ou no estado: grafia oficial. */
export async function findCity(nome: string, uf?: string): Promise<{ nome: string; uf: string } | null> {
  if (!cityKey(nome)) return null;
  const r = await fetch(`/api/cidades?nome=${encodeURIComponent(nome)}${uf ? `&uf=${uf}` : ""}`).catch(() => null);
  return r?.ok ? ((await r.json()) as { nome: string; uf: string } | null) : null;
}

export function useCities(uf: string) {
  const [state, setState] = useState<{ uf: string; list: string[] }>({ uf: "", list: [] });
  useEffect(() => {
    let on = true;
    void citiesOf(uf).then((list) => { if (on) setState({ uf, list }); });
    return () => { on = false; };
  }, [uf]);
  return state.uf === uf ? state.list : [];
}

/** Estado: lista com o nome (ou só a sigla, em colunas estreitas). */
export function UfSelect({ value, onChange, className, short = false, invalid = false, id, autoComplete = "address-level1" }: {
  value: string; onChange: (uf: string) => void; className?: string; short?: boolean; invalid?: boolean; id?: string; autoComplete?: string;
}) {
  return (
    <select id={id} className={[className, "cs-uf", invalid ? "bad" : ""].filter(Boolean).join(" ")} value={isUf(value) ? value : ""} onChange={(e) => onChange(e.target.value)} aria-label="Estado" aria-invalid={invalid || undefined} autoComplete={autoComplete}>
      <option value="">{short ? "UF" : "Escolha"}</option>
      {UF_LIST.map(([u, n]) => <option key={u} value={u}>{short ? u : n}</option>)}
    </select>
  );
}

/**
 * Cidade: campo com setinha que abre a lista das cidades do estado; digitar filtra.
 * Só fica a cidade escolhida na lista (sair do campo sem escolher volta para a anterior).
 * Trocar o estado apaga a cidade se ela não for daquele estado.
 */
export function CitySelect({ uf, value, onChange, className, invalid = false, id }: {
  uf: string; value: string; onChange: (city: string) => void; className?: string; invalid?: boolean; id?: string;
}) {
  const list = useCities(uf);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const lb = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const prevUf = useRef(uf);

  // acerta a grafia ("sao paulo" → "São Paulo") e apaga a cidade que não é do estado escolhido
  const official = useMemo(() => list.find((c) => cityKey(c) === cityKey(value)) ?? null, [list, value]);
  useEffect(() => {
    if (!list.length || !value) return;
    if (official && official !== value) onChange(official);
    else if (!official && prevUf.current !== uf) onChange("");
  }, [list, official, value, uf, onChange]);
  useEffect(() => { if (list.length) prevUf.current = uf; }, [list, uf]);

  const hits = useMemo(() => {
    const k = cityKey(q ?? "");
    if (!k) return list;
    const starts = list.filter((c) => cityKey(c).startsWith(k));
    const has = list.filter((c) => !cityKey(c).startsWith(k) && cityKey(c).includes(k));
    return [...starts, ...has];
  }, [list, q]);

  const close = () => { setOpen(false); setQ(null); };
  const pick = (c: string) => { onChange(c); close(); };
  const move = (d: number) => {
    const n = Math.max(0, Math.min(hits.length - 1, hi + d));
    setHi(n);
    listRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
  };
  const disabled = !isUf(uf);

  return (
    <div className="cs" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <input
        id={id}
        className={[className, "cs-in", invalid ? "bad" : ""].filter(Boolean).join(" ")}
        role="combobox"
        aria-expanded={open}
        aria-controls={lb}
        aria-autocomplete="list"
        aria-label="Cidade"
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={disabled ? "Escolha o estado primeiro" : "Escolha a cidade"}
        value={q ?? value}
        onFocus={(e) => e.currentTarget.select()}
        onMouseDown={() => { if (!disabled) setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else move(1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
          else if (e.key === "Enter" && open) { e.preventDefault(); e.stopPropagation(); if (hits[hi]) pick(hits[hi]); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); close(); }
        }}
      />
      {open && !disabled && (
        <ul className="cs-pop" id={lb} role="listbox" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {!list.length && <li className="cs-empty">Carregando cidades…</li>}
          {list.length > 0 && !hits.length && <li className="cs-empty">Nenhuma cidade com esse nome em {UF_LIST.find(([u]) => u === uf)?.[1]}.</li>}
          {hits.map((c, i) => (
            <li key={c} role="option" aria-selected={c === value} className={[i === hi ? "hi" : "", c === value ? "on" : ""].filter(Boolean).join(" ") || undefined} onMouseEnter={() => setHi(i)} onClick={() => pick(c)}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
