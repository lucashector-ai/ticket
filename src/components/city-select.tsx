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

type Opt = { value: string; label: string; hint?: string };

/**
 * Lista com busca, no visual do site (o mesmo para Estado e Cidade): campo com setinha que abre a lista;
 * digitar filtra (sem acento/maiúscula). Só fica o que for escolhido na lista: sair sem escolher volta ao anterior.
 */
function SearchSelect({ options, value, onPick, className, invalid, id, ariaLabel, placeholder, disabled = false, empty, display }: {
  options: Opt[]; value: string; onPick: (v: string) => void; className?: string; invalid?: boolean; id?: string;
  ariaLabel: string; placeholder: string; disabled?: boolean; empty: string; display?: (o: Opt) => string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const lb = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const cur = options.find((o) => o.value === value);
  const shown = cur ? (display ? display(cur) : cur.label) : value;

  const hits = useMemo(() => {
    const k = cityKey(q ?? "");
    if (!k) return options;
    const key = (o: Opt) => cityKey(`${o.label} ${o.value}`);
    const starts = options.filter((o) => cityKey(o.label).startsWith(k) || cityKey(o.value) === k);
    const has = options.filter((o) => !starts.includes(o) && key(o).includes(k));
    return [...starts, ...has];
  }, [options, q]);

  const close = () => { setOpen(false); setQ(null); };
  const pick = (v: string) => { onPick(v); close(); };
  const move = (d: number) => {
    const n = Math.max(0, Math.min(hits.length - 1, hi + d));
    setHi(n);
    listRef.current?.children[n]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="cs" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) close(); }}>
      <input
        id={id}
        className={[className, "cs-in", invalid ? "bad" : ""].filter(Boolean).join(" ")}
        role="combobox"
        aria-expanded={open}
        aria-controls={lb}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={q ?? shown}
        onFocus={(e) => e.currentTarget.select()}
        onMouseDown={() => { if (!disabled) setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else move(1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
          else if (e.key === "Enter" && open) { e.preventDefault(); e.stopPropagation(); if (hits[hi]) pick(hits[hi].value); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); close(); }
        }}
      />
      {open && !disabled && (
        <ul className="cs-pop" id={lb} role="listbox" ref={listRef} onMouseDown={(e) => e.preventDefault()}>
          {!options.length && <li className="cs-empty">Carregando…</li>}
          {options.length > 0 && !hits.length && <li className="cs-empty">{empty}</li>}
          {hits.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value} className={[i === hi ? "hi" : "", o.value === value ? "on" : ""].filter(Boolean).join(" ") || undefined} onMouseEnter={() => setHi(i)} onClick={() => pick(o.value)}>
              {o.label}{o.hint && <small>{o.hint}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const UF_OPTS: Opt[] = UF_LIST.map(([u, n]) => ({ value: u, label: n, hint: u }));

/** Estado: a mesma lista do site (com busca). `short`: mostra só a sigla no campo (colunas estreitas). */
export function UfSelect({ value, onChange, className, short = false, invalid = false, id }: {
  value: string; onChange: (uf: string) => void; className?: string; short?: boolean; invalid?: boolean; id?: string; autoComplete?: string;
}) {
  return (
    <SearchSelect options={UF_OPTS} value={isUf(value) ? value : ""} onPick={onChange} className={[className, short ? "cs-short" : ""].filter(Boolean).join(" ")} invalid={invalid} id={id}
      ariaLabel="Estado" placeholder={short ? "UF" : "Escolha o estado"} empty="Nenhum estado com esse nome." display={short ? (o) => o.value : undefined} />
  );
}

/**
 * Cidade: lista das cidades do estado (API /api/cidades). Acerta a grafia ("sao paulo" → "São Paulo")
 * e apaga a cidade se o estado mudar para um em que ela não existe.
 */
export function CitySelect({ uf, value, onChange, className, invalid = false, id }: {
  uf: string; value: string; onChange: (city: string) => void; className?: string; invalid?: boolean; id?: string;
}) {
  const list = useCities(uf);
  const prevUf = useRef(uf);
  const official = useMemo(() => list.find((c) => cityKey(c) === cityKey(value)) ?? null, [list, value]);
  useEffect(() => {
    if (!list.length || !value) return;
    if (official && official !== value) onChange(official);
    else if (!official && prevUf.current !== uf) onChange("");
  }, [list, official, value, uf, onChange]);
  useEffect(() => { if (list.length) prevUf.current = uf; }, [list, uf]);
  const options = useMemo(() => list.map((c) => ({ value: c, label: c })), [list]);
  const disabled = !isUf(uf);
  return (
    <SearchSelect options={options} value={official ?? value} onPick={onChange} className={className} invalid={invalid} id={id} disabled={disabled}
      ariaLabel="Cidade" placeholder={disabled ? "Escolha o estado primeiro" : "Escolha a cidade"}
      empty={`Nenhuma cidade com esse nome em ${UF_LIST.find(([u]) => u === uf)?.[1] ?? "neste estado"}.`} />
  );
}
