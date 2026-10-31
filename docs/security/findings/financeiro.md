# Achados — Segurança financeira e lógica de negócio (Agente 04)

Escopo: compra, preço, cupom, taxa, pagamento (Stripe e modo de teste), webhook, emissão, estoque/lotação, grupo, revenda, reembolso, financeiro do produtor e portaria. Código do branch `claude/auditoria-noturna`; testes de banco no branch Neon de teste (`teste-r5`), com dados fictícios `qa-test-…`. **Nada** foi testado contra a produção nem contra a Stripe (chaves falsas só dos testes, sem rede; o estorno automático é substituído por um registro nos testes que o acionam).

Status: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**. "CORRIGIDO, NÃO VALIDADO" aqui quer dizer: corrigido com teste automatizado que falha sem a correção e passa com ela, aguardando a validação independente do Agente 06.

## Resumo

| ID | Sev. | Título | Status |
|---|---|---|---|
| SEC-100 | P1 (P0 se a produção vender sem a chave) | Modo de teste liga sozinho quando falta `STRIPE_SECRET_KEY`, inclusive na produção | ABERTO, risco aceito pelo dono (D-07); decisão renovada em `decisoes.md` |
| SEC-101 | P2 | Emissão não conferia valor, moeda nem modo (teste/produção) do pagamento confirmado | CORRIGIDO, NÃO VALIDADO |
| SEC-102 | P2 | Limite de usos do cupom não valia na reserva nem na confirmação | CORRIGIDO, NÃO VALIDADO |
| SEC-103 | P3 | Portaria liberava ingresso de evento cancelado (reembolso em lotes) e não exigia pedido pago | CORRIGIDO, NÃO VALIDADO |
| SEC-104 | P2 | Parte de grupo vendia acima da lotação | CORRIGIDO, NÃO VALIDADO |
| SEC-105 | P2 | Lote pode ser reduzido abaixo de vendidos + vagas seguradas (causa do SEC-104 no editor) | ABERTO (encaminhado ao Agente 03: `src/lib/criar/save.ts`) |
| SEC-106 | P3 | Repasse ao vendedor da revenda sem registro no sistema | ABERTO (decisão do dono) |
| SEC-107 | P3 | Contestação (chargeback) não tratada: ingresso continua válido | ABERTO (decisão do dono) |
| SEC-108 | P3 | Sem restrições CHECK de valores no banco | ABERTO (SQL proposto em `decisoes.md`) |
| SEC-109 | P3 | `ticket_types.sales_end` não é aplicado na venda | ABERTO (campo sem uso hoje: 0 lotes com valor no banco de teste) |

Nenhum P0 novo. Por severidade: P0 0 · P1 1 (aceito pelo dono) · P2 4 (3 corrigidos, 1 encaminhado) · P3 5 (1 corrigido).

---

## SEC-100 · Modo de teste liga sozinho quando falta a chave da Stripe
- **Severidade:** P1 de configuração. Vira **P0** (emissão de ingresso pago sem pagamento, para qualquer pessoa) se a produção estiver vendendo evento pago sem `STRIPE_SECRET_KEY`.
- **Status:** ABERTO. Mesmo risco de S-18/D-07; o dono decidiu manter (rodada 2) enquanto a Stripe espera o CNPJ. Nada foi alterado. Renovado em `findings/decisoes.md` (D-SEC-04-1) com proposta pronta.
- **Componente:** pagamento / configuração.
- **Localização:** `src/lib/payments/stripe.ts:16` (`stripeEnabled`), `src/lib/actions/compra.ts:284-293` (`confirmPayment`), `src/lib/actions/checkout.ts:31`.
- **Descrição:** o servidor decide que é "teste" só pela ausência da variável `STRIPE_SECRET_KEY` em tempo de execução. Sem ela, "Já fiz o pagamento" (`confirmPayment`) emite ingressos válidos com referência `TEST-…`. Não há nada do navegador que ligue esse modo (não é parâmetro, cabeçalho nem cookie) e, com a chave presente, `confirmPayment` recusa pedido com valor (`compra.ts:291`), `payCard` e `checkPayment` só emitem com a Stripe confirmando, e o webhook responde 503 sem a chave.
- **Impacto:** se a chave sumir (erro de deploy, troca de segredo) ou se a produção hoje roda sem ela, qualquer pessoa leva ingresso pago de graça; o ingresso entra na portaria. O dinheiro "de teste" não entra no saldo sacável (`src/lib/bank.ts:77`), então o produtor não é pago por essas vendas.
- **Causa-raiz:** o modo de teste não é uma decisão explícita; é o efeito colateral de uma variável ausente.
- **Evidência:** leitura de código; no banco de teste (cópia da produção) há pedidos pagos `TEST-…` e `STRIPE-…`, então não dá para afirmar daqui em que modo a produção está (não testado, por regra).
- **Correção proposta (não aplicada, muda regra de pagamento):** no domínio de produção, modo de teste só com `ALLOW_TEST_PAYMENTS=1` explícito; sem chave e sem essa variável, o checkout mostra "pagamento indisponível" e `confirmPayment` recusa. Assim o comportamento atual continua possível, mas por decisão registrada, e uma chave perdida passa a parar a venda em vez de dar ingresso.
- **Teste de regressão:** `tests/db/payment-confirm.test.ts` ("Já fiz o pagamento com a Stripe ligada não emite pedido com valor") protege o lado ligado; o lado de teste é coberto por `tests/db/place-order.test.ts` e `money-tamper.test.ts` (rodam só sem a chave).
- **Risco residual:** o do próprio achado, até a decisão.

## SEC-101 · Emissão não conferia valor, moeda nem modo do pagamento confirmado
- **Severidade:** P2 (exige acesso ao painel da Stripe, outro produto na mesma conta Stripe ou configuração errada do webhook; impacto é emissão sem o valor certo).
- **Status:** CORRIGIDO, NÃO VALIDADO (f894ff6).
- **Componente:** webhook da Stripe, conferência do checkout, emissão.
- **Localização:** `src/app/api/webhooks/stripe/route.ts:55,73`, `src/lib/actions/pagamento.ts:160`, `src/lib/payments/fulfill.ts:160-215`, `src/lib/payments/stripe.ts` (`stripeLiveMode`, `paidOf`).
- **Descrição:** `payment_intent.succeeded` e `checkPayment` emitiam com qualquer PaymentIntent ligado ao pedido (pelo id gravado ou pelo `metadata.orderId`), sem comparar `amount_received`/`currency` com o pedido nem conferir se o evento era do mesmo modo (teste × produção) da chave.
- **Impacto:** um PaymentIntent de valor menor (ou em outra moeda, ou de modo de teste com cartão fictício) que chegasse ao pedido emitiria ingressos pelo valor cheio.
- **Causa-raiz:** confiança implícita de que o PaymentIntent "é nosso", sem conferência na fronteira de confiança.
- **Correção:** `fulfillOrder` recebe `paid` (valor e moeda que a Stripe confirmou) e, se não bater com `orders.total_cents` em BRL, não emite e estorna (mesmo caminho de qualquer pagamento que não vira ingresso). O webhook ignora evento com `livemode` diferente do modo da chave (`sk_live_`/`rk_live_`).
- **Teste de regressão:** `tests/db/payment-confirm.test.ts` — 10 casos; 4 falham sem a correção (valor menor, outra moeda, modo diferente, emissão direta com valor divergente). Os outros 6 já passavam e protegem: confirmação pelo navegador com a Stripe ligada, pedido de outra conta, pedido grátis, PaymentIntent de outro pedido, confirmação depois de reembolso, Pix pago depois da reserva vencer (emite uma vez, repetido não duplica).
- **Validação:** `pnpm exec vitest run tests/db/payment-confirm.test.ts tests/db/webhook.test.ts` (banco de teste): 13/13.
- **Risco residual:** `payCard` (cartão aprovado na hora) ainda emite sem passar o valor, porque o PaymentIntent acabou de ser criado/atualizado pelo servidor com o total do pedido (`intents.ts:18-27`); o webhook do mesmo pagamento chega depois e não muda nada (pedido já pago).
- **Arquivos modificados:** os da localização + `tests/db/webhook.test.ts` (o evento de teste agora traz `livemode` e `currency`, como o real).

## SEC-102 · Limite de usos do cupom não valia na reserva nem na confirmação
- **Severidade:** P2 (qualquer comprador; prejuízo do produtor limitado ao desconto).
- **Status:** CORRIGIDO, NÃO VALIDADO (d8dc67a).
- **Componente:** checkout / cupom / emissão.
- **Localização:** `src/lib/actions/compra.ts` (`placeOrder`, trava e `ensure` do cupom), `src/lib/payments/fulfill.ts:300-305`, novo `src/lib/payments/coupon.ts`.
- **Descrição:** `max_uses` só era conferido ao criar o pedido (`uses < max_uses`); a emissão somava `uses + 1` sem conferir.
- **Reprodução (teste):** cupom de 50% com 1 uso; a pessoa A abre pedido com ele; a pessoa B abre outro antes de A pagar → os dois eram aceitos; dois pedidos com o cupom confirmando juntos → os dois emitiam e `uses` ficava 2.
- **Impacto:** cupom "1 uso" ou "100 primeiros" usado por quantos abrissem pedido antes do último pagar (com links divulgados, dezenas).
- **Causa-raiz:** o cupom não seguia o modelo de reserva que o estoque já usa (pedido pendente segura o recurso; confirmação confere de novo).
- **Correção:** como o estoque: pedido pendente dentro dos 15 min segura um uso (trava `cupom:<id>` + conferência na mesma transação do pedido); a emissão confere `uses <= max_uses` depois de somar, na transação (sem lugar: não emite; com cobrança, estorno automático). Mensagem: "Este cupom esgotou: os últimos usos já estão em outros pedidos…".
- **Teste de regressão:** `tests/db/money-tamper.test.ts`, os dois casos "SEC-102" (falham sem a correção).
- **Risco residual:** cupom com limite não segura uso para parte de grupo/revenda (não aceitam cupom).

## SEC-103 · Portaria liberava ingresso de evento cancelado e não exigia pedido pago
- **Severidade:** P3.
- **Status:** CORRIGIDO, NÃO VALIDADO (403d116).
- **Localização:** `src/lib/checkin.ts:61-66`.
- **Descrição:** ao cancelar o evento, os reembolsos correm em lotes (painel e cron) e um pedido cujo estorno falha 3 vezes fica fora da fila até alguém tentar de novo; nesse intervalo o ingresso continua `valid` e a portaria liberava. A leitura também não olhava o pedido.
- **Correção:** recusa "Evento cancelado: este ingresso não dá entrada." e, por defesa em profundidade, exige `orders.status = 'paid'` ("Pagamento deste ingresso não confirmado: procure a produção."). Conferido antes no banco de teste: todos os ingressos existentes são de pedidos pagos, então nenhuma entrada legítima é barrada.
- **Teste de regressão:** `tests/db/checkin-security.test.ts` (6 casos; 2 falham sem a correção). Os outros 4 protegem o QR de uso único: 10 operadores ao mesmo tempo → 1 entrada e o código digitado depois recusado; assinatura de outro ingresso, código inexistente e lixo → recusados sem marcar; operador de outro evento → 403; reembolsado e cancelado → recusados com o motivo.

## SEC-104 · Parte de grupo vendia acima da lotação
- **Severidade:** P2 (venda acima da capacidade, prioridade 5 do dono; exige grupo aberto e lote reduzido, ou grupo vencendo no meio da confirmação).
- **Status:** CORRIGIDO, NÃO VALIDADO (f8ae6e4).
- **Localização:** `src/lib/payments/fulfill.ts:306-312` (antes: `if (!held)` com `shareStillHeld` lido fora da transação).
- **Reprodução (teste):** lote de 3 com um grupo segurando 3 vagas; o produtor reduz o lote para 1 (o editor só impede ficar abaixo dos vendidos); as 3 partes pagam → `sold = 3` com `quantity = 1`.
- **Causa-raiz:** a parte de grupo "segurada" pulava a conferência de lotação, e a decisão de pular era lida antes da transação.
- **Correção:** a conferência de lotação vale para toda emissão. Com a vaga ainda segurada, ela sai das "seguradas" e entra nas vendidas na mesma transação, então a soma não muda e passa como antes; grupo vencido/cancelado ou lote reduzido disputa a lotação como qualquer compra (sem lugar: não emite; cobrado: estorno). `shareStillHeld` (sem outro uso) saiu de `src/lib/special.ts`.
- **Teste de regressão:** `tests/db/capacity-group.test.ts` (3 casos; "produtor reduz o lote abaixo das vagas do grupo" falha sem a correção; o normal e o de grupo cancelado são controle).
- **Risco residual:** ver SEC-105 (o editor deixa reduzir o lote abaixo das vagas seguradas; quem tinha a vaga e paga depois é estornado em vez de entrar acima da lotação).

## SEC-105 · Lote pode ser reduzido abaixo de vendidos + vagas seguradas
- **Severidade:** P2. **Status:** ABERTO, encaminhado ao Agente 03 (fora do meu território).
- **Localização:** `src/lib/criar/save.ts:261` (só confere `qty < sold`).
- **Correção sugerida:** recusar quantidade menor que `sold + vagas de grupos abertos + pedidos pendentes dentro da reserva` (as mesmas contas de `src/lib/holds.ts`), com a mensagem "Há N ingressos reservados em compras em andamento". Com o SEC-104 corrigido não há venda acima; o efeito hoje é estorno de quem já tinha a vaga.

## SEC-106 · Repasse ao vendedor da revenda sem registro
- **Severidade:** P3 (contábil/reconciliação). **Status:** ABERTO (decisão do dono, `decisoes.md` D-SEC-04-2).
- **Descrição:** a venda na revenda marca o anúncio como vendido e manda ao vendedor "Você recebe R$ X" (`src/lib/notify.ts:328`, `sellerNet` 95%), mas não há saldo, extrato nem pedido de saque do vendedor no sistema (`src/lib/bank.ts:13`: revenda fica fora do saldo do produtor). O pagamento ao vendedor depende de processo manual fora do sistema; num cancelamento de evento, o comprador da revenda é estornado e não há registro de se o vendedor já recebeu.

## SEC-107 · Contestação (chargeback) não tratada
- **Severidade:** P3. **Status:** ABERTO (decisão do dono).
- **Descrição:** o webhook trata `payment_intent.*` e `charge.refunded`; `charge.dispute.created` não é ouvido. Com uma contestação aberta, o ingresso segue válido e pode entrar no evento. Proposta: ouvir `charge.dispute.created` e marcar o pedido para revisão (sem cancelar sozinho, porque contestação pode ser ganha), mostrando ao produtor e à central.

## SEC-108 · Sem restrições CHECK de valores no banco
- **Severidade:** P3 (endurecimento). **Status:** ABERTO; SQL proposto em `decisoes.md` (D-SEC-04-3), não aplicado.
- **Descrição:** as regras de valor estão todas no código (bem cobertas por transação e `ensure`), mas o banco aceitaria `total_cents < 0`, `refunded_cents > total_cents`, `sold < 0`, `uses < 0`. Uma CHECK transforma um erro futuro de código em falha visível em vez de dado financeiro corrompido.

## SEC-109 · `ticket_types.sales_end` não é aplicado na venda
- **Severidade:** P3. **Status:** ABERTO.
- **Descrição:** o campo existe (e é deslocado no adiamento, `src/lib/actions/reembolsos.ts:199`), mas `tierStatus` (`src/lib/tickets/status.ts`) e `placeOrder` não o conferem. Hoje nenhum lote tem valor (0 de 53 no banco de teste) e o criador não grava; se alguma tela passar a gravar, o lote continuaria vendendo depois do fim. Recomendação: considerar `sales_end` em `tierStatus` ou remover o campo.

---

## Verificado e OK (conferido no código e, onde indicado, com teste)

Pagamento e emissão
- Preço, taxa (7,99%), meia, cupom, juros e parcelas recalculados no servidor: `src/lib/actions/compra.ts:197` (`priceOrder` com preço do banco); `method: "free"` com valor recusado (`compra.ts:198`); parcelas só no cartão, limitadas a 6 (`src/lib/pricing.ts:61`); parte de grupo e revenda com preço travado do banco (`src/lib/special.ts`, `lookupSpecial`). Teste: `money-tamper.test.ts` (total, item com preço forjado, tipo repetido, tipo de outro evento, quantidade 0/negativa/fracionada, 7 parcelas, Pix com 6 parcelas, "grátis" com valor, taxa absorvida, cupom de outro evento).
- Ingresso só nasce na emissão, na mesma transação que marca o pedido pago (`src/lib/payments/fulfill.ts:117` `markPaid` condicional + `db.insert(tickets)` no mesmo lote); não há outro caminho que grave em `tickets` (conferido por busca).
- Transições de status só no servidor e condicionais (`status in (...)`): pago só por `markPaid`; expirado/cancelado só a partir de pendente; reembolsado por `markOrderRefunded`/`applyRefund` (lista completa conferida por busca).
- Confirmação pelo navegador com a Stripe ligada não emite (`compra.ts:291`, `checkout.ts:31`); cartão só pela Stripe (`pagamento.ts:73`); pedido sempre da própria conta (`ownOrder`, `confirmPayment` com `userId`).
- Webhook: assinatura conferida com o segredo (`route.ts:47`), 503 sem a chave, dedupe por evento no KV depois de processar (`route.ts:61,110`), emissão idempotente (trava por `paid_at` e `markPaid`), fora de ordem (cancelamento depois de pago não desfaz; reembolso antes da confirmação impede a emissão). Testes: `webhook.test.ts`, `payment-confirm.test.ts`, `stock.test.ts` (confirmação repetida 6×).
- Pix pago depois da reserva vencer: emite se houver lugar, senão estorna (`fulfill.ts:173`). Evento cancelado ou encerrado: não emite e estorna (`eventClosedFor`). Teste: `payment-confirm.test.ts`, `stock.test.ts`, `sales-end.test.ts`.

Estoque e concorrência
- Reserva com trava por tipo e conferência na transação do pedido (`compra.ts:242`, `src/lib/holds.ts:52`); baixa condicional e conferência de lotação na emissão (`fulfill.ts:312`); limite por pessoa (conta e CPF) com trava por pessoa (`fulfill.ts:262`). Testes: `stock.test.ts` (restam 2 e 10 confirmam; dois pelo último; reserva vencida), `stock-fair.test.ts`, `fulfill-atomic.test.ts` (queda no meio, 30 simultâneas sem impasse), `place-order.test.ts`, `money-tamper.test.ts` (lote reduzido com pedidos em andamento), `capacity-group.test.ts`.

Reembolso
- Idempotente: linha `order_refunds` com `idem_key` único e índice de um pendente por pedido antes de chamar a Stripe, chave de idempotência por linha, recálculo depois da trava, conclusão numa transação (`src/lib/payments/refund.ts:188,243`); nunca devolve mais que o pago (`planRefund`: `remaining`). Testes: `refund.test.ts`, `refund-atomic.test.ts`.
- Comprador só cancela ingresso que é dele e do pedido dele (`src/lib/data/meu-reembolso.ts`: `holderUserId` e `order.userId`); quem recebeu de presente/transferência não recebe o dinheiro.

Financeiro entre produtoras
- Saldo e extrato só dos eventos da produtora de que a conta é dona (`src/lib/bank.ts:46`); venda de teste fora do saldo (`bank.ts:77`); reembolso/prévia pelo painel exige o evento no escopo e o pedido do evento (`src/lib/actions/reembolsos.ts:29`, `refundTickets` com `eventId`). Testes: `finance-isolation.test.ts` (novo), `bank-access.test.ts`, `payout.test.ts`, `finance-sums.test.ts`.

Portaria
- QR assinado (HMAC com segredo do servidor, comparação em tempo constante) (`src/lib/checkin.ts:54`); código do ingresso com 40 bits aleatórios (`src/lib/tickets/code.ts`) e trocado na transferência/revenda; marcação condicional `status = 'valid'` (`checkin.ts:80`) — uso único sob concorrência; evento conferido por operador (`checkin.ts:55`; painel, API e app da portaria passam só os eventos permitidos). Testes: `checkin-security.test.ts`, `tickets.test.ts`, `checkin-day.test.ts`.

## Conferência das correções anteriores (S-xx) na minha área
Continuam de pé (testes rodados nesta rodada, todos passando): S-08 reserva, S-12 checkout antigo, S-24/S-25 emissão atômica e limite por CPF, S-28 reembolso atômico, S-29 abertura de vendas, S-01/S-32/S-33 troca de código e transferência, S-27 dia da portaria, S-37 vendas encerradas, S-09 grupo. Comando: `pnpm exec vitest run` nos 21 arquivos listados em `financial-security.md` → 89/89.
