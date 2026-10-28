"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { saveDesign, saveTemplate } from "@/lib/actions/emails";
import { BLOCK_INFO, cleanHtml, makeBlock, newId, type Audience, type Block, type BlockType, type Design } from "@/lib/mail/design";
import { fontStack, MOBILE_RULES, renderBlock, renderEmail, renderFooter, renderHeader, type EvInfo } from "@/lib/mail/render";
import type { CouponOpt, EditorData, EvOpt } from "./campaign";
import { useRenderCtx } from "./campaign";
import { BlockProps, StylePanel } from "./editor-panels";
import { BlockIcon } from "./icons";
import { PainelPortal } from "./portal";

type Props = {
  campaignId: string; name: string; design: Design; data: EditorData; events: EvOpt[]; coupons: CouponOpt[];
  preheader: string; audience: Audience;
  onChange: (d: Design) => void; onClose: () => void; onTest: () => void; testing: boolean;
};
type Edit = { id: string; field: "text" | "html" | "label"; x: number; y: number };

const ORDER: BlockType[] = ["evento", "eventos", "ingressos", "lineup", "cupom", "contagem", "local", "titulo", "texto", "imagem", "botao", "redes", "divisor", "espaco"];

/** Editor do e-mail em tela cheia: paleta de blocos, o e-mail de verdade no meio e as propriedades. */
export function EmailEditor(p: Props) {
  const { flash } = useToast();
  const [d, setD] = useState<Design>(p.design);
  const [past, setPast] = useState<Design[]>([]);
  const [future, setFuture] = useState<Design[]>([]);
  const lastKey = useRef<{ k: string; t: number } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<"add" | "edit" | "style">("add");
  const [view, setView] = useState<"desk" | "mob">("desk");
  const [extra, setExtra] = useState<Record<string, EvInfo>>({});
  const [save, setSave] = useState<"ok" | "saving" | "err">("ok");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [frozen, setFrozen] = useState<Record<string, string>>({});
  const [drag, setDrag] = useState<{ kind: "new"; t: BlockType } | { kind: "move"; id: string } | null>(null);
  const [drop, setDrop] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const [tplName, setTplName] = useState<string | null>(null);
  /** "+" entre blocos: o próximo bloco escolhido na paleta entra aqui */
  const [insertAt, setInsertAt] = useState<number | null>(null);

  const data = useMemo(() => ({ ...p.data, events: { ...p.data.events, ...extra } }), [p.data, extra]);
  const base = useRenderCtx(data, p.preheader, p.audience);
  const ctx = useMemo(() => ({ ...base, editor: true }), [base]);
  const s = d.style;

  /* histórico: digitação seguida no mesmo campo vira um passo só */
  const dRef = useRef(d);
  useEffect(() => { dRef.current = d; }, [d]);
  const commitWith = useCallback((fn: (cur: Design) => Design, key?: string) => {
    const now = Date.now();
    const merge = !!key && lastKey.current?.k === key && now - lastKey.current.t < 1200;
    lastKey.current = key ? { k: key, t: now } : null;
    if (!merge) { const cur = dRef.current; setPast((h) => [...h.slice(-59), cur]); }
    setFuture([]);
    setD(fn);
  }, []);
  const commit = useCallback((next: Design, key?: string) => commitWith(() => next, key), [commitWith]);
  const undo = () => {
    if (!past.length) return;
    setFuture([d, ...future]); setD(past[past.length - 1]); setPast(past.slice(0, -1));
    lastKey.current = null;
  };
  const redo = () => {
    if (!future.length) return;
    setPast([...past, d]); setD(future[0]); setFuture(future.slice(1));
    lastKey.current = null;
  };

  const update = useCallback((id: string, patch: Partial<Block>, key?: string) => {
    commitWith((cur) => ({ ...cur, blocks: cur.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)) }), key);
  }, [commitWith]);
  const setStyle = (patch: Partial<Design["style"]>, key?: string) => commit({ ...d, style: { ...s, ...patch } }, key);
  const insert = (t: BlockType, at?: number) => {
    const firstEv = p.events.find((e) => !e.past)?.id ?? p.events[0]?.id ?? "";
    const b = makeBlock(t, firstEv);
    const idx = at ?? insertAt ?? (sel ? d.blocks.findIndex((x) => x.id === sel) + 1 : d.blocks.length);
    setInsertAt(null);
    const blocks = [...d.blocks];
    blocks.splice(Math.max(0, idx), 0, b);
    commit({ ...d, blocks });
    setSel(b.id); setTab("edit");
  };
  const move = (id: string, to: number) => {
    const from = d.blocks.findIndex((b) => b.id === id);
    if (from < 0) return;
    const blocks = [...d.blocks];
    const [b] = blocks.splice(from, 1);
    blocks.splice(to > from ? to - 1 : to, 0, b);
    commit({ ...d, blocks });
  };
  const remove = (id: string) => { commit({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }); setSel(null); setTab("add"); };
  const duplicate = (id: string) => {
    const i = d.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const copy = { ...d.blocks[i], id: newId() } as Block;
    const blocks = [...d.blocks];
    blocks.splice(i + 1, 0, copy);
    commit({ ...d, blocks });
    setSel(copy.id);
  };

  /* salva sozinho e avisa a página da campanha */
  const first = useRef(true);
  const onChange = p.onChange;
  useEffect(() => {
    onChange(d);
    if (first.current) { first.current = false; return; }
    setSave("saving");
    const t = setTimeout(async () => { const r = await saveDesign(p.campaignId, d); setSave(r.ok ? "ok" : "err"); }, 900);
    return () => clearTimeout(t);
  }, [d, p.campaignId, onChange]);
  const flush = async () => { const r = await saveDesign(p.campaignId, d); setSave(r.ok ? "ok" : "err"); return r.ok; };

  /* atalhos de teclado */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = edit || (e.target instanceof HTMLElement && (e.target.closest("input,textarea,select,[contenteditable=true]")));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y" && !typing) { e.preventDefault(); redo(); return; }
      if (typing) return;
      if (!sel) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(sel); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(sel); }
      else if (e.key === "Escape") setSel(null);
      else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const i = d.blocks.findIndex((b) => b.id === sel);
        move(sel, e.key === "ArrowUp" ? Math.max(0, i - 1) : Math.min(d.blocks.length, i + 2));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // a página de trás não rola enquanto o editor está aberto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* edição direto no e-mail */
  const startEdit = (b: Block, target: HTMLElement, x: number, y: number) => {
    const el = target.closest<HTMLElement>("[data-edit]");
    if (!el) return;
    const field = el.dataset.edit as Edit["field"];
    setFrozen((f) => ({ ...f, [b.id]: renderBlock(b, s, ctx) }));
    setEdit({ id: b.id, field, x, y });
  };
  const endEdit = () => {
    if (!edit) return;
    const id = edit.id;
    setEdit(null);
    setFrozen((f) => { const n = { ...f }; delete n[id]; return n; });
  };
  const onInput = (b: Block, el: HTMLElement) => {
    if (!edit) return;
    const node = el.querySelector<HTMLElement>("[data-edit]");
    if (!node) return;
    if (edit.field === "html") update(b.id, { html: cleanHtml(node.innerHTML) } as Partial<Block>, `${b.id}:html`);
    else if (edit.field === "text") update(b.id, { text: node.innerText.replace(/\n+/g, " ").trim() } as Partial<Block>, `${b.id}:text`);
    else update(b.id, { label: node.innerText.replace(/\n+/g, " ").trim() } as Partial<Block>, `${b.id}:label`);
  };

  /* soltar um bloco (novo ou movido) */
  const onDropAt = (i: number) => {
    if (!drag) return;
    if (drag.kind === "new") insert(drag.t, i); else move(drag.id, i);
    setDrag(null); setDrop(null);
  };

  const selected = d.blocks.find((b) => b.id === sel) ?? null;
  const fullHtml = useMemo(() => (preview ? renderEmail(d, base).html : ""), [preview, d, base]);
  const mobileCss = useMemo(() => MOBILE_RULES.map((r) => `.ed-mail.m ${r}`).join("\n"), []);

  const saveLabel = save === "saving" ? "Salvando…" : save === "err" ? "Não foi possível salvar" : "Alterações salvas";
  const close = async () => { await flush(); p.onClose(); };

  return (
    <PainelPortal>
    <div className="ed" role="dialog" aria-modal="true" aria-label="Editor do e-mail">
      <style>{mobileCss}</style>
      <header className="ed-top">
        <div className="ed-tl">
          <button className="ed-ib" type="button" onClick={close} aria-label="Voltar para a campanha" title="Voltar para a campanha"><Svg d="M15 18l-6-6 6-6" /></button>
          <div className="ed-ti"><b>{p.name}</b><span className={`ed-sv ${save}`}><i />{saveLabel}</span></div>
        </div>
        <div className="ed-tc">
          <div className="seg2 sm" role="group" aria-label="Tamanho da tela">
            <button className={view === "desk" ? "sg on" : "sg"} type="button" onClick={() => setView("desk")} aria-pressed={view === "desk"}><Svg d="M3 5h18v11H3zM8 20h8M12 16v4" />Computador</button>
            <button className={view === "mob" ? "sg on" : "sg"} type="button" onClick={() => setView("mob")} aria-pressed={view === "mob"}><Svg d="M7 2h10v20H7zM11 18h2" />Celular</button>
          </div>
          <span className="ed-vr" />
          <button className="ed-ib" type="button" onClick={undo} disabled={!past.length} aria-label="Desfazer" title="Desfazer (Ctrl+Z)"><Svg d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></button>
          <button className="ed-ib" type="button" onClick={redo} disabled={!future.length} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)"><Svg d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></button>
        </div>
        <div className="ed-ta">
          {tplName !== null ? (
            <form className="ed-tpl" onSubmit={async (e) => { e.preventDefault(); const r = await saveTemplate(tplName, d); flash(r.ok ? "Modelo salvo. Ele aparece em Nova campanha." : r.error); if (r.ok) setTplName(null); }}>
              <input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nome do modelo" aria-label="Nome do modelo" />
              <button className="b2 dark" type="submit" disabled={!tplName.trim()}>Salvar</button>
              <button className="b2" type="button" onClick={() => setTplName(null)}>Cancelar</button>
            </form>
          ) : <button className="b2" type="button" onClick={() => setTplName(p.name)} title="Guardar este design para usar em outras campanhas">Salvar como modelo</button>}
          <button className="b2" type="button" onClick={() => setPreview(true)}><Svg d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />Visualizar</button>
          <button className="b2" type="button" disabled={p.testing} onClick={async () => { if (await flush()) p.onTest(); }}><Svg d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />Enviar teste</button>
          <button className="b2 dark" type="button" onClick={close}>Concluir</button>
        </div>
      </header>

      <div className="ed-body">
        <aside className="ed-side">
          <div className="ed-tabs"><div className="seg2" role="tablist" aria-label="Painel do editor">
            {([["add", "Blocos"], ["edit", "Editar"], ["style", "Estilo"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "sg on" : "sg"} type="button" onClick={() => setTab(k)}>{l}</button>
            ))}
          </div></div>
          <div className="ed-pane">
            {tab === "add" && (
              <>
                {insertAt !== null && <div className="ed-ins"><span>Escolha o bloco para inserir na posição marcada</span><button type="button" onClick={() => setInsertAt(null)}>Cancelar</button></div>}
                {(["evento", "basico"] as const).map((g) => (
                  <section key={g} className="ed-grp">
                    <h3 className="ed-gl">{g === "evento" ? "Do evento" : "Conteúdo"}</h3>
                    <p className="ed-gs">{g === "evento" ? "Os dados vêm do cadastro do evento e se atualizam sozinhos." : "Arraste para o e-mail ou clique para adicionar."}</p>
                    <div className="ed-pal">
                      {ORDER.filter((t) => BLOCK_INFO[t].group === g).map((t) => (
                        <button key={t} type="button" className="ed-pi" draggable
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", t); e.dataTransfer.effectAllowed = "copy"; setDrag({ kind: "new", t }); }}
                          onDragEnd={() => { setDrag(null); setDrop(null); }}
                          onClick={() => insert(t)}>
                          <span className="ed-pic"><BlockIcon t={t} /></span>
                          <span className="ed-pt"><b>{BLOCK_INFO[t].label}</b><small>{BLOCK_INFO[t].desc}</small></span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                <div className="ed-tip"><b>Atalhos</b><span>Clique no texto do e-mail para escrever. <kbd>Del</kbd> apaga o bloco, <kbd>Ctrl</kbd> <kbd>D</kbd> duplica, <kbd>Alt</kbd> <kbd>↑</kbd> <kbd>↓</kbd> move.</span></div>
              </>
            )}
            {tab === "edit" && (selected
              ? <BlockProps key={selected.id} b={selected} update={(patch, key) => update(selected.id, patch, key)} events={p.events} data={data} coupons={p.coupons}
                  onEvents={(ev) => setExtra((x) => ({ ...x, ...ev }))} onRemove={() => remove(selected.id)} onDuplicate={() => duplicate(selected.id)} />
              : <div className="ed-none"><span className="ed-nic"><Svg d="M4 4l7 17 2.5-7.5L21 11z" /></span><b>Selecione um bloco</b><span>Clique em qualquer parte do e-mail para editar o conteúdo e as opções daquele bloco.</span></div>)}
            {tab === "style" && <StylePanel s={s} set={setStyle} accent={p.events.length ? data.events[p.events.find((e) => !e.past)?.id ?? p.events[0].id]?.accent : undefined} org={data.org} />}
          </div>
        </aside>

        <main className="ed-stage" onClick={() => { endEdit(); setSel(null); }}>
          <div className={view === "mob" ? "ed-mail m" : "ed-mail"} style={{ background: s.bg }}>
            <div className="ed-card" style={{ background: s.card, fontFamily: fontStack(s.font), borderRadius: Math.min(s.radius + 4, 24) }}>
              <div className="ed-fixed" title="Topo do e-mail: mude em Estilo" onClick={(e) => { e.stopPropagation(); setSel(null); setTab("style"); }} dangerouslySetInnerHTML={{ __html: renderHeader(s, ctx) }} />
              <div style={{ height: 20 }} />
              {d.blocks.map((b, i) => (
                <BlockView key={b.id} b={b} html={frozen[b.id] ?? renderBlock(b, s, ctx)} selected={sel === b.id} edit={edit?.id === b.id ? edit : null}
                  dropBefore={drop === i} dropAfter={drop === i + 1 && i === d.blocks.length - 1} marked={insertAt === i + 1}
                  onSelect={(target, x, y) => { if (edit && edit.id !== b.id) endEdit(); setSel(b.id); setTab("edit"); setInsertAt(null); if (!edit || edit.id !== b.id) startEdit(b, target, x, y); }}
                  onInput={(el) => onInput(b, el)} onEndEdit={endEdit}
                  onUp={i > 0 ? () => move(b.id, i - 1) : undefined} onDown={i < d.blocks.length - 1 ? () => move(b.id, i + 2) : undefined}
                  onDup={() => duplicate(b.id)} onDel={() => remove(b.id)} onAdd={() => { endEdit(); setSel(null); setInsertAt(i + 1); setTab("add"); }}
                  onDragStart={() => setDrag({ kind: "move", id: b.id })} onDragEnd={() => { setDrag(null); setDrop(null); }}
                  onDragOver={(after) => drag && setDrop(after ? i + 1 : i)} onDrop={() => onDropAt(drop ?? i)} />
              ))}
              <div className={`ed-end${drag ? " on" : ""}${drop === d.blocks.length && d.blocks.length ? " hot" : ""}${d.blocks.length ? "" : " empty"}`}
                onDragOver={(e) => { if (!drag) return; e.preventDefault(); setDrop(d.blocks.length); }} onDrop={(e) => { e.preventDefault(); onDropAt(d.blocks.length); }}>
                {d.blocks.length ? (drag ? "Solte aqui" : "") : <><span className="ed-nic"><Svg d="M12 5v14M5 12h14" /></span><b>Comece pelo bloco Evento</b><span>Arraste um bloco da esquerda para cá, ou clique nele.</span></>}
              </div>
              <div style={{ height: 32 }} />
            </div>
            <div className="ed-foot" title="Rodapé automático: motivo do envio e descadastro" dangerouslySetInnerHTML={{ __html: renderFooter(s, ctx) }} />
          </div>
        </main>
      </div>

      {preview && <PreviewModal html={fullHtml} onClose={() => setPreview(false)} />}
    </div>
    </PainelPortal>
  );
}

function Svg({ d }: { d: string }) {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

type BVProps = {
  b: Block; html: string; selected: boolean; edit: Edit | null; dropBefore: boolean; dropAfter: boolean; marked: boolean; onAdd: () => void;
  onSelect: (target: HTMLElement, x: number, y: number) => void; onInput: (el: HTMLElement) => void; onEndEdit: () => void;
  onUp?: () => void; onDown?: () => void; onDup: () => void; onDel: () => void;
  onDragStart: () => void; onDragEnd: () => void; onDragOver: (after: boolean) => void; onDrop: () => void;
};

/** Um bloco no e-mail: o HTML real, com seleção, barra de ações, arrastar e o texto editável no lugar. */
function BlockView(p: BVProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<string | null>(null);
  const range = useRef<Range | null>(null);
  // liga a edição no elemento [data-edit] e põe o cursor onde a pessoa clicou
  useLayoutEffect(() => {
    const node = ref.current?.querySelector<HTMLElement>("[data-edit]");
    if (!p.edit || !node) return;
    node.contentEditable = "true";
    node.spellcheck = true;
    node.focus();
    const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
    const sel = window.getSelection();
    let r: Range | null = null;
    if (doc.caretPositionFromPoint) { const pos = doc.caretPositionFromPoint(p.edit.x, p.edit.y); if (pos && node.contains(pos.offsetNode)) { r = document.createRange(); r.setStart(pos.offsetNode, pos.offset); } }
    else if (document.caretRangeFromPoint) { const cr = document.caretRangeFromPoint(p.edit.x, p.edit.y); if (cr && node.contains(cr.startContainer)) r = cr; }
    if (r && sel) { r.collapse(true); sel.removeAllRanges(); sel.addRange(r); }
    return () => { node.contentEditable = "false"; };
  }, [p.edit]);

  const fmt = (cmd: string) => { document.execCommand(cmd); if (ref.current) p.onInput(ref.current); };
  const addVar = () => { document.execCommand("insertText", false, "{{primeiro_nome}}"); if (ref.current) p.onInput(ref.current); };
  const openLink = () => { const s = window.getSelection(); range.current = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; setLink("https://"); };
  const applyLink = () => {
    const s = window.getSelection();
    if (range.current && s) { s.removeAllRanges(); s.addRange(range.current); }
    if (link && /^(https?:\/\/|mailto:)/.test(link) && link !== "https://") document.execCommand("createLink", false, link);
    setLink(null);
    if (ref.current) p.onInput(ref.current);
  };

  const cls = ["ed-b", p.selected && "sel", p.edit && "editing", p.dropBefore && "drop-b", (p.dropAfter || p.marked) && "drop-a"].filter(Boolean).join(" ");
  return (
    <div className={cls} ref={ref}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); p.onSelect(e.target as HTMLElement, e.clientX, e.clientY); }}
      onInput={() => ref.current && p.onInput(ref.current)}
      onBlur={(e) => { if (!ref.current?.contains(e.relatedTarget as Node)) { if (link === null) p.onEndEdit(); } }}
      onKeyDown={(e) => { if (p.edit && p.edit.field !== "html" && e.key === "Enter") { e.preventDefault(); (e.target as HTMLElement).blur(); } if (e.key === "Escape") (e.target as HTMLElement).blur(); }}
      onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); p.onDragOver(e.clientY > r.top + r.height / 2); }}
      onDrop={(e) => { e.preventDefault(); p.onDrop(); }}>
      <div className="ed-bh" dangerouslySetInnerHTML={{ __html: p.html }} />
      <span className="ed-tag" aria-hidden="true">{BLOCK_INFO[p.b.t].label}</span>
      {!p.edit && <button className="ed-add" type="button" aria-label="Inserir bloco abaixo" title="Inserir bloco abaixo" onClick={(e) => { e.stopPropagation(); p.onAdd(); }}><Svg d="M12 5v14M5 12h14" /></button>}
      {p.selected && !p.edit && (
        <div className="ed-bt" onClick={(e) => e.stopPropagation()}>
          <span className="ed-drag" draggable title="Arraste para mover" aria-label="Arrastar"
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", "move"); e.dataTransfer.effectAllowed = "move"; if (ref.current) e.dataTransfer.setDragImage(ref.current, 20, 20); p.onDragStart(); }} onDragEnd={p.onDragEnd}>
            <Svg d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />
          </span>
          <button type="button" onClick={p.onUp} disabled={!p.onUp} aria-label="Subir" title="Subir"><Svg d="M12 19V5M5 12l7-7 7 7" /></button>
          <button type="button" onClick={p.onDown} disabled={!p.onDown} aria-label="Descer" title="Descer"><Svg d="M12 5v14M19 12l-7 7-7-7" /></button>
          <button type="button" onClick={p.onDup} aria-label="Duplicar" title="Duplicar"><Svg d="M8 8h12v12H8zM4 16V4h12" /></button>
          <button type="button" className="dg" onClick={p.onDel} aria-label="Excluir" title="Excluir"><Svg d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></button>
        </div>
      )}
      {p.edit?.field === "html" && (
        <div className="ed-fmt" onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }} onClick={(e) => e.stopPropagation()}>
          {link === null ? (
            <>
              <button type="button" onClick={() => fmt("bold")} aria-label="Negrito"><b>B</b></button>
              <button type="button" onClick={() => fmt("italic")} aria-label="Itálico"><i>I</i></button>
              <button type="button" onClick={() => fmt("underline")} aria-label="Sublinhado"><u>U</u></button>
              <button type="button" onClick={openLink} aria-label="Link"><Svg d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></button>
              <span className="ed-fs" />
              <button type="button" className="ed-fv" onClick={addVar}>+ Nome</button>
            </>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); applyLink(); }} className="ed-fl">
              <input autoFocus value={link} onChange={(e) => setLink(e.target.value)} aria-label="Endereço do link" />
              <button type="submit">OK</button>
              <button type="button" onClick={() => setLink(null)}>×</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewModal({ html, onClose }: { html: string; onClose: () => void }) {
  const [w, setW] = useState<"desk" | "mob">("desk");
  return (
    <div className="ed-pv" onClick={onClose}>
      <div className="ed-pvc" onClick={(e) => e.stopPropagation()}>
        <div className="ed-pvh">
          <b>Como o e-mail chega</b><span>com o nome de exemplo no lugar de {"{{primeiro_nome}}"}</span>
          <div className="seg2 sm"><button className={w === "desk" ? "sg on" : "sg"} type="button" onClick={() => setW("desk")}>Computador</button><button className={w === "mob" ? "sg on" : "sg"} type="button" onClick={() => setW("mob")}>Celular</button></div>
          <button className="ln-x" type="button" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <div className="ed-pvb"><iframe title="Prévia do e-mail" srcDoc={html} style={{ width: w === "desk" ? 680 : 380 }} /></div>
      </div>
    </div>
  );
}
