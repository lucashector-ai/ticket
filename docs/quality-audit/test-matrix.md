# Matriz de testes

## Parte técnica (Romano)

Como rodar: `pnpm test` (unitários; os de integração são pulados). Integração no banco de **teste**:
`TEST_DATABASE_URL="<url do branch Neon de teste>" pnpm test`. Nunca aponte para a produção (o setup recusa se for igual a `DATABASE_URL_PROD`).

### Automatizados (vitest)

| Arquivo | Cenário | Esperado | Resultado |
|---|---|---|---|
| tests/unit/pricing.test.ts | Taxa 7,99% sobre o total, arredondada uma vez (2 × R$ 550 → R$ 87,89) | total correto | VALIDADO |
| tests/unit/pricing.test.ts | Produtor absorve a taxa | sem taxa | VALIDADO |
| tests/unit/pricing.test.ts | Meia só em tipo que aceita; taxa depois da meia | valores certos | VALIDADO |
| tests/unit/pricing.test.ts | Cupom % por setor, R$ por ingresso, 100% | desconto limitado ao valor | VALIDADO |
| tests/unit/pricing.test.ts | Parcelas: até 3x sem juros, 4x+ com juros, máx. 6x, Pix sem juros | conforme regra | VALIDADO |
| tests/unit/pricing.test.ts | `feeShares` divide a taxa entre linhas | soma = taxa do pedido | VALIDADO |
| tests/unit/limits.test.ts | Limite por tipo (6 Inteira + Meia), máximo por compra (8), já comprados, estoque, tipo fechado | bloqueia com o motivo certo | VALIDADO |
| tests/unit/limits.test.ts | `overLimit` com compras pagas na conta e no mesmo CPF em outra conta | mensagem explica a origem | VALIDADO |
| tests/unit/image-sniff.test.ts | Upload: JPG/PNG/WebP/GIF pelos bytes; HTML/SVG com nome de imagem | recusa os falsos | VALIDADO |
| tests/unit/clean-html.test.ts | XSS no e-mail marketing: script, on*, img, svg, `javascript:`, atributo com `>` | tudo removido | VALIDADO |
| tests/unit/wallet-sign.test.ts | Assinatura PKCS#7 do passe da Apple Wallet (node-forge 1.4.2) | assinatura confere | VALIDADO |
| tests/db/stock.test.ts | Restam 2 e 10 confirmam juntos | vendem 2, 8 cancelados, sem venda acima da capacidade | VALIDADO (banco de teste) |
| tests/db/stock.test.ts | Dois pelo último | só um | VALIDADO |
| tests/db/stock.test.ts | Mesma confirmação 6× em paralelo + 1 depois | emite uma vez | VALIDADO |
| tests/db/stock.test.ts | Reserva vencida sem cobrança | não emite, status expirado | VALIDADO |
| tests/db/stock.test.ts | Evento cancelado durante o pagamento | não emite | VALIDADO |
| tests/db/stock.test.ts | Limite por pessoa reconferido na confirmação | 2º pedido recusado | VALIDADO |
| tests/db/stock.test.ts | Reserva de 15 min segura o lugar; vencida não; a própria pessoa não se bloqueia | conforme | VALIDADO |
| tests/db/stock.test.ts | Dois pedidos pelo último lugar no mesmo instante | reconferência acusa | VALIDADO |
| tests/db/stock.test.ts | Pagamento confirmado depois da reserva vencer, com lugar | emite (quem pagou tem prioridade) | VALIDADO |
| tests/db/tickets.test.ts | Ingresso enviado na compra: aceite troca código e QR; código antigo não entra | conforme (falha sem a correção f8306a2) | VALIDADO |
| tests/db/tickets.test.ts | Revenda: comprador com código novo; vendedor não entra com o antigo | conforme | VALIDADO |
| tests/db/painel.test.ts | Conta não produtora tenta convidar equipe / salvar configurações | recusado, nenhum produtor criado (falha sem ff46243) | VALIDADO |
| tests/db/painel.test.ts | Produtor aprovado convida | ok | VALIDADO |
| tests/db/painel.test.ts | Membro removido: acesso pessoal revogado, acessos criados para outros mantidos | conforme | VALIDADO |
| tests/db/painel.test.ts | Excluir evento com pagamento em andamento / sem | recusa / exclui | VALIDADO |
| tests/db/edit-types.test.ts | Apagar tipo citado em carrinho abandonado, com pagamento em andamento, com ingresso emitido | libera / bloqueia / bloqueia; sem a limpeza a FK quebra | VALIDADO |
| tests/db/checkout-legacy.test.ts | Página antiga do pedido: paga uma vez, pedido de outra conta, limite por pessoa | conforme | VALIDADO |
| tests/db/payout.test.ts | Dois saques do saldo inteiro ao mesmo tempo | no máximo um fica (falha sem a correção) | VALIDADO |
| tests/db/tickets.test.ts | Portaria: QR adulterado, outro evento, dois operadores no mesmo QR, já usado | recusa / uma entrada só | VALIDADO |

Última execução completa: 30/10 madrugada, **42 testes, 42 aprovados, 0 reprovados** (11 arquivos, com `TEST_DATABASE_URL`); sem a variável, os 23 de integração ficam pulados. Build do OpenNext verde depois de cada bloco.

### No navegador (Playwright, servidor local, conta de teste)

| Fluxo | Resultado |
|---|---|
| Checkout completo no modo de teste (evento QA, 2 ingressos, 1 "Sou eu" + 1 enviado por e-mail, Pix de teste, confirmação) | VALIDADO: pedido pago, total R$ 107,99 (100 + 7,99), 2 vendidos, 1 envio pendente |
| Upload de imagem: PNG real / HTML com nome .png / sem login | VALIDADO: 200 / 415 / 401 |
| Cupom sem login: limite de 30 consultas por IP em 10 min | VALIDADO |
| Cronômetro "Reservados por" antes de existir pedido | FALHOU (texto): repassado ao Marcos (handoff 04:45) |

### Matriz de cenários do produto (técnico)

| Cenário | Onde é protegido | Status |
|---|---|---|
| Valor manipulado no navegador | `placeOrder` recalcula com `priceOrder` e preços do banco | VALIDADO (código + e2e) |
| Clique duplo / requisição repetida no pagamento | trava por `paid_at` no `fulfillOrder` | VALIDADO (integração) |
| Várias abas do mesmo evento | um pedido aberto por pessoa e evento (`releaseOthers`) | NÃO TESTADO no navegador |
| Reserva expira durante o pagamento | `fulfillOrder` (sem cobrança: expira; com cobrança: emite se houver lugar, senão estorna) | VALIDADO (integração) |
| Webhook duplicado / fora de ordem | KV + `fulfillOrder` idempotente; `canceled` só expira pedido pendente | VALIDADO por leitura de código; sem Stripe local: BLOQUEADO para teste real |
| Pagamento recusado no cartão | pedido segue pendente até a reserva vencer | BLOQUEADO (sem chave de teste da Stripe no local) |
| Acesso sem login a páginas privadas | cada página chama `getSessionUser`/`painelAccess`/`contaUser`/`adminUser` | VALIDADO por leitura de código (todas as páginas privadas listadas) |
| Acesso a recurso de outra pessoa (pedido, ingresso, PDF, carteira) | filtros por `userId`/`holderUserId` | VALIDADO por leitura; PDF de código inexistente logado → 404 |
| Produtor mexendo em evento de outro | `getPainelScope` + `events.find(id)` em cada ação | VALIDADO por leitura |
