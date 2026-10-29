"use client";

import { useId, useState } from "react";

const FAQ: [string, string][] = [
  ["Quanto custa usar o Tickets Win?", "Criar e publicar é grátis. Cobramos 7,99% por ingresso pago vendido, e você escolhe se essa taxa fica com você ou é repassada ao comprador. Eventos gratuitos não pagam nada."],
  ["Quando eu recebo o dinheiro das vendas?", "Em D+2: cada venda aprovada entra no repasse seguinte, toda terça e sexta, direto na conta cadastrada. Se precisar antes, você pode antecipar recebíveis pelo painel."],
  ["Posso vender meia-entrada e meia social?", "Sim. Cada setor pode ter inteira, meia e meia social. Para a meia social, sugerimos um valor entre a meia e a inteira, mas o preço final é sempre seu."],
  ["Como funciona o mapa 3D com IA?", "Você envia uma foto ou rascunho do espaço. A IA identifica palco, pista, camarotes e bar e gera um mapa 3D. Você ajusta o que quiser antes de publicar, e o público escolhe o setor vendo o palco."],
  ["Como é o check-in no dia?", "A equipe usa o app de portaria com o código do evento. O QR é lido mesmo sem internet e sincroniza quando a conexão volta. O painel mostra a entrada em tempo real."],
  ["Consigo migrar meu evento de outra plataforma?", "Sim. Importamos a lista de participantes e configuramos os lotes com você. Fale com o nosso time e a migração fica pronta em até 1 dia útil."],
];

/** Acordeão: um item aberto por vez, altura animada via grid-template-rows. */
export function Faq() {
  const [open, setOpen] = useState(0);
  const id = useId();
  return (
    <div>
      {FAQ.map(([q, a], i) => {
        const o = open === i;
        return (
          <div key={q} className={o ? "pdl-fq o pdl-rv" : "pdl-fq pdl-rv"} style={{ "--i": i } as React.CSSProperties}>
            <h3>
              <button className="pdl-fqb" type="button" aria-expanded={o} aria-controls={`${id}-${i}`} onClick={() => setOpen(o ? -1 : i)}>
                {q}
                <span className="pdl-fqi" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round"><path d="M6 1.5v9M1.5 6h9" /></svg>
                </span>
              </button>
            </h3>
            <div className="pdl-fqw" id={`${id}-${i}`} role="region" aria-hidden={!o}>
              <div><p className="pdl-fqa">{a}</p></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
