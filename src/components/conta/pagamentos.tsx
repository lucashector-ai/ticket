"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeCard, setDefaultCard } from "@/lib/actions/cartoes";
import type { SavedCard } from "@/lib/payments/cards";
import { CardBrand, expLabel } from "@/components/compra/card-brand";
import { useToast } from "@/components/toast";

type Props = { cards: SavedCard[]; failed: boolean; enabled: boolean };

/** Minha conta › Pagamentos: cartões salvos (bandeira, final e validade), principal e remover. */
export function ContaPagamentos({ cards, failed, enabled }: Props) {
  const router = useRouter();
  const { flash } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  /** cartão esperando a confirmação para remover */
  const [ask, setAsk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(id: string, kind: "remove" | "default") {
    setBusy(`${kind}:${id}`);
    setErr(null);
    const r = await (kind === "remove" ? removeCard(id) : setDefaultCard(id)).catch(() => ({ ok: false, error: "Não foi possível concluir agora." }));
    setBusy(null);
    if (!r.ok) { setErr(r.error ?? "Não foi possível concluir agora."); return; }
    setAsk(null);
    flash(kind === "remove" ? "Cartão removido" : "Cartão principal atualizado");
    router.refresh();
  }

  return (
    <>
      <header className="ct-head">
        <h1 className="ct-t">Pagamentos</h1>
        <p className="ct-s">Cartões salvos para pagar mais rápido. Eles ficam guardados com segurança pelo nosso processador de pagamentos: a Tickets Win só vê a bandeira, o final e a validade.</p>
      </header>
      <section className="ct-card" aria-labelledby="cards-t">
        <h2 className="ct-h" id="cards-t">Cartões salvos</h2>
        <p className="ct-v">O cartão principal já vem escolhido no checkout. Pagar com um cartão salvo também pode pedir a confirmação do seu banco.</p>
        {failed ? (
          <p className="ct-err" role="alert">Não conseguimos carregar seus cartões agora. Recarregue a página em instantes.</p>
        ) : (
          <ul className="ct-list ct-cards">
            {cards.map((c) => {
              const confirming = ask === c.id;
              return (
                <li key={c.id} className={confirming ? "ask" : undefined}>
                  <CardBrand brand={c.brand} />
                  <span className="ct-li-t">
                    <b>
                      {c.brand} <span className="ct-cd">•••• {c.last4}</span>
                      {c.isDefault && !c.expired && <span className="ct-pill ok">Principal</span>}
                      {c.expired && <span className="ct-pill warn">Vencido</span>}
                    </b>
                    <small>{[`Validade ${expLabel(c.expMonth, c.expYear)}`, c.holder].filter(Boolean).join(" · ")}</small>
                  </span>
                  {confirming ? (
                    <span className="ct-acts ct-ask" role="group" aria-label={`Remover ${c.brand} final ${c.last4}?`}>
                      <span className="ct-ask-q">Remover este cartão?</span>
                      <button className="ct-b sm ghost" type="button" onClick={() => setAsk(null)} disabled={!!busy}>Cancelar</button>
                      <button className="ct-b sm danger" type="button" onClick={() => void run(c.id, "remove")} disabled={!!busy}>{busy === `remove:${c.id}` ? "Removendo…" : "Remover"}</button>
                    </span>
                  ) : (
                    <span className="ct-acts">
                      {!c.isDefault && !c.expired && <button className="ct-b sm ghost" type="button" onClick={() => void run(c.id, "default")} disabled={!!busy}>{busy === `default:${c.id}` ? "…" : "Tornar principal"}</button>}
                      <button className="ct-b sm ghost" type="button" onClick={() => { setAsk(c.id); setErr(null); }} disabled={!!busy} aria-label={`Remover ${c.brand} final ${c.last4}`}>Remover</button>
                    </span>
                  )}
                </li>
              );
            })}
            {!cards.length && (
              <li className="ct-empty">
                {enabled
                  ? <>Nenhum cartão salvo. Na próxima compra com cartão, marque <b>Salvar este cartão para as próximas compras</b> e ele aparece aqui.</>
                  : <>Nenhum cartão salvo.</>}
              </li>
            )}
          </ul>
        )}
        {err && <p className="ct-err" role="alert">{err}</p>}
      </section>
      <section className="ct-card" aria-labelledby="sec-t">
        <h2 className="ct-h" id="sec-t">Segurança dos pagamentos</h2>
        <p className="ct-v">O número completo e o código de segurança do cartão nunca passam pela Tickets Win. Removeu um cartão aqui? Ele deixa de aparecer no checkout na hora. Viu uma cobrança que não reconhece? <Link href="/ajuda">Fale com a gente</Link>.</p>
      </section>
    </>
  );
}
