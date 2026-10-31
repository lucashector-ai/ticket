# Segurança financeira e lógica de negócio (Agente 04)

Onde cada regra de dinheiro, pedido, ingresso e portaria é imposta no servidor, quais testes a protegem e o status. Achados detalhados: `findings/financeiro.md` (SEC-100 a SEC-109). Nada foi testado na produção nem contra a Stripe; os testes usam o banco de teste (`TEST_DATABASE_URL`, branch Neon `teste-r5`) e chaves falsas sem rede.

## 1. Estados do pedido (implementados)

| Estado | Quem leva até ele | Condição (servidor) |
|---|---|---|
| `pending` | `placeOrder` (`src/lib/actions/compra.ts`) | pedido + itens + reserva (estoque, meia, cupom) numa transação; vale 15 min (`expires_at`) |
| `paid` | só `fulfillOrder` (`src/lib/payments/fulfill.ts`, `markPaid`) | atualização condicional `status in (permitidos)`; sem cobrança: só de `pending` dentro da reserva; com cobrança confirmada: também de `expired`/`cancelled` |
| `expired` | `fulfillOrder` (reserva vencida sem cobrança), `releaseOthers`, webhook `payment_intent.canceled` | só a partir de `pending` |
| `cancelled` | quem desiste (`releasePending`), Pix que não gerou, emissão recusada sem cobrança, cancelamento do evento | só a partir de `pending` (e sem `paid_at` em andamento) |
| `refunded` | `applyRefund` (último reembolso), `markOrderRefunded` (estorno total, externo ou automático) | pedido e ingressos mudam no mesmo comando |

Ingresso: `valid` → `used` (portaria, condicional), `transferred` (envio/transferência), `refunded`/`cancelled` (reembolso). Só nasce na transação que marca o pedido pago.

Pagamento "de teste": decidido **só** pela ausência de `STRIPE_SECRET_KEY` em tempo de execução (`src/lib/payments/stripe.ts:16`). Nenhuma entrada do navegador liga esse modo. Sem a chave, "Já fiz o pagamento" emite com `TEST-…` (fora do saldo do produtor, mas o ingresso entra na portaria). Isso vale também na produção: **SEC-100**, risco aceito pelo dono (D-07), proposta de trava explícita em `findings/decisoes.md`.

## 2. Regras e onde são impostas

| # | Regra | Onde (arquivo:linha) | Testes | Status |
|---|---|---|---|---|
| 1 | Ingresso só com pagamento confirmado pelo servidor | `fulfill.ts:117` (`markPaid`), `fulfill.ts:173` (estados permitidos), `compra.ts:291` (`confirmPayment` recusa com a Stripe ligada), `pagamento.ts:73` (cartão só pela Stripe), `checkout.ts:31` | `payment-confirm.test.ts`, `webhook.test.ts`, `checkout-legacy.test.ts` | VALIDADO (lado com a chave); **FALHOU** como garantia de código no lado sem a chave (SEC-100, aceito) |
| 2 | Valor confirmado = valor do pedido (BRL), modo do webhook = modo da chave | `fulfill.ts:211` (`paidMatchesOrder`), `route.ts:55` (`livemode`), `route.ts:73` e `pagamento.ts:160` (`paidOf`) | `payment-confirm.test.ts` (4 casos novos falham sem a correção) | CORRIGIDO, NÃO VALIDADO (SEC-101) |
| 3 | Webhook autêntico, idempotente e tolerante a ordem | `route.ts:47` (assinatura), `route.ts:61,110` (dedupe KV), `fulfill.ts:183` (trava `paid_at`), `orderFor` (PaymentIntent já ligado a outro pedido não serve) | `webhook.test.ts`, `payment-confirm.test.ts`, `stock.test.ts` | VALIDADO |
| 4 | Preço, taxa 7,99%, meia, cupom, juros e parcelas recalculados no servidor | `compra.ts:197` (`priceOrder` com preço do banco), `compra.ts:198` (grátis com valor recusado), `src/lib/pricing.ts:61` (parcelas 1–6, só cartão), `src/lib/special.ts` (grupo/revenda com preço do banco) | `money-tamper.test.ts`, `place-order.test.ts`, `tests/unit/pricing.test.ts`, `meia-quota.test.ts` | VALIDADO |
| 5 | Limite de usos do cupom | `compra.ts:244` (`couponHeldOkSql` + trava), `fulfill.ts:304` (`couponPaidOkSql`), `src/lib/payments/coupon.ts` | `money-tamper.test.ts` (2 casos falham sem a correção) | CORRIGIDO, NÃO VALIDADO (SEC-102) |
| 6 | Nunca vender acima da lotação | `compra.ts:242` (`capacityOkSql` com trava por tipo), `fulfill.ts:312` (lotação na emissão, agora também para parte de grupo) | `stock.test.ts`, `stock-fair.test.ts`, `fulfill-atomic.test.ts`, `place-order.test.ts`, `money-tamper.test.ts` (lote reduzido), `capacity-group.test.ts` | VALIDADO; parte de grupo CORRIGIDO, NÃO VALIDADO (SEC-104); editor permite reduzir abaixo das reservas (SEC-105, aberto) |
| 7 | Limite por pessoa (conta e CPF) e uma parte por grupo | `fulfill.ts:262` (trava por pessoa) + `ensure` "limit"/"share_one" | `fulfill-atomic.test.ts`, `stock.test.ts`, `grupo.test.ts` | VALIDADO |
| 8 | Emissão atômica (sem meio caminho) | `fulfill.ts` (lote único `runBatch`), `src/lib/payments/tx.ts` | `fulfill-atomic.test.ts` | VALIDADO |
| 9 | Reembolso idempotente, nunca acima do pago | `refund.ts:188` (`idem_key`), índice de um pendente por pedido, `refund.ts:243` (idempotência na Stripe), `planRefund` (`remaining`) | `refund.test.ts`, `refund-atomic.test.ts` | VALIDADO |
| 10 | Financeiro isolado entre produtoras | `src/lib/bank.ts:46` (escopo do dono), `bank.ts:77` (teste fora do saldo), `src/lib/actions/reembolsos.ts:29` (evento no escopo) + `refundTickets({ eventId })` | `finance-isolation.test.ts` (novo), `bank-access.test.ts`, `payout.test.ts`, `finance-sums.test.ts` | VALIDADO |
| 11 | QR de uso único, validação concorrente | `src/lib/checkin.ts:54` (HMAC, tempo constante), `checkin.ts:80` (marcação condicional `status = 'valid'`) | `checkin-security.test.ts` (10 operadores → 1 entrada), `tickets.test.ts` | VALIDADO |
| 12 | Portaria: evento, situação do ingresso e do pagamento | `checkin.ts:55` (evento do operador), `checkin.ts:57-66` (usado, transferido, reembolsado, cancelado, evento cancelado, pedido não pago), `checkin-day.ts` (data) | `checkin-security.test.ts` (2 casos falham sem a correção), `checkin-day.test.ts` | CORRIGIDO, NÃO VALIDADO (SEC-103) |
| 13 | Código antigo não entra depois de transferência/revenda | `src/lib/actions/tickets.ts`, `fulfill.ts` (`fulfillResale` troca código e segredo) | `tickets.test.ts` | VALIDADO |
| 14 | Evento encerrado/cancelado não vende nem emite | `compra.ts:136`, `fulfill.ts` (`eventClosedFor`), `pagamento.ts:94` | `sales-end.test.ts`, `stock.test.ts` | VALIDADO |

## 3. Cenários de concorrência pedidos (seção 9) — resultado

| Cenário | Resultado | Teste |
|---|---|---|
| Restam 2 e 10 compram | vendem 2 | `stock.test.ts` |
| Dois pelo último | um leva | `stock.test.ts`, `place-order.test.ts` |
| Várias abas / mesma requisição repetida | um pedido aberto por evento; confirmação emite uma vez | `place-order.test.ts`, `stock.test.ts` (6×), `payment-confirm.test.ts` |
| Pagamento lento / reserva expira | Pix pago depois emite se houver lugar, senão estorna | `payment-confirm.test.ts`, `stock.test.ts` |
| Lote esgota no meio / produtor reduz o lote | nunca acima da quantidade | `money-tamper.test.ts`, `capacity-group.test.ts` |
| Evento cancelado com pedido pendente | não emite; portaria recusa | `stock.test.ts`, `checkin-security.test.ts` |
| Dois reembolsos ao mesmo tempo | devolve uma vez, nunca acima do pago | `refund.test.ts`, `refund-atomic.test.ts` |
| Dois operadores (10) no mesmo QR | uma entrada | `checkin-security.test.ts` |
| Cupom de 1 uso em dois pedidos | um desconto | `money-tamper.test.ts` |

Não testado (por regra): Stripe real, Pix real, carga contra o login, produção. Falha de conexão no meio da leitura do QR: a marcação é um comando só e condicional; se a resposta se perde, a nova leitura responde "Ingresso já utilizado" (o operador vê o horário da entrada).

## 4. Testes desta rodada

Novos (todos em `tests/db/`, banco de teste): `payment-confirm.test.ts` (10), `money-tamper.test.ts` (11), `checkin-security.test.ts` (6), `capacity-group.test.ts` (3), `finance-isolation.test.ts` (2) = **32 testes, 32 passando**. Sem as correções, falham 4 + 2 + 2 + 1 = 9 (os demais são proteção do que já estava certo). Ajustado: `webhook.test.ts` (evento com `livemode`/`currency`, como o real).

Rodada conjunta da área financeira (21 arquivos: os 5 novos + `webhook`, `stock`, `stock-fair`, `fulfill-atomic`, `refund`, `refund-atomic`, `tickets`, `grupo`, `place-order`, `payout`, `bank-access`, `checkout-legacy`, `meia-quota`, `sales-end`, `checkin-day`, `trail`): **89/89**.

```
S=/tmp/claude-0/-home-user-ticket/dc2b2806-50d2-5c85-87db-64a5410a3563/scratchpad
TEST_DATABASE_URL="$(cat $S/.dburl)" pnpm exec vitest run tests/db/payment-confirm.test.ts tests/db/money-tamper.test.ts tests/db/checkin-security.test.ts tests/db/capacity-group.test.ts tests/db/finance-isolation.test.ts
```

## 5. Pendências

- SEC-100 (modo de teste sem trava explícita): decisão do dono, `findings/decisoes.md` D-SEC-04-1.
- SEC-105 (editor reduz lote abaixo das reservas): Agente 03, `src/lib/criar/save.ts`.
- SEC-106 (repasse da revenda sem registro), SEC-107 (chargeback), SEC-108 (CHECK no banco): `findings/decisoes.md`.
- Validação independente dos SEC-101 a SEC-104: Agente 06.
