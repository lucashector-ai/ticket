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
| tests/unit/csv.test.ts | CSV sem fórmula de planilha (=, +, -, @), aspas, números | conforme | VALIDADO |
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
| tests/db/refund.test.ts | Três "reembolsar tudo" ao mesmo tempo | um reembolso, valor = total, estoque volta uma vez | VALIDADO |
| tests/db/webhook.test.ts | Webhook: assinatura errada, confirmação, repetida, cancelamento fora de ordem, cancelamento de pendente | 400 / emite 1× / sem duplicar / não desfaz / expira | VALIDADO (sem rede) |
| tests/db/place-order.test.ts | Total no servidor; último lugar reservado por outra pessoa; mesma pessoa refaz; dois simultâneos pelo último; limite por pessoa | R$ 107,99 / recusa / aceita / ≤ 1 aberto (falha sem a correção) / recusa | VALIDADO |
| tests/db/tickets.test.ts | Portaria: QR adulterado, outro evento, dois operadores no mesmo QR, já usado | recusa / uma entrada só | VALIDADO |
| tests/db/fulfill-atomic.test.ts | Queda no meio da emissão (gravação dos ingressos falha) e nova tentativa | nada pela metade; nova tentativa baixa o estoque uma vez (falhava: estoque 3 com 1 ingresso) | VALIDADO (rodada 2) |
| tests/db/fulfill-atomic.test.ts | Mesmo CPF em duas contas confirmando juntas (3 rodadas); mesma conta com dois pedidos juntos | só um passa (falhava: os dois passavam) | VALIDADO (rodada 2) |
| tests/db/grupo.test.ts | D-01: mesma conta paga duas partes ao mesmo tempo; segura outra parte depois de pagar uma; dois grupos ao mesmo tempo / depois de cancelar | uma parte só; recusado; um grupo aberto, outro depois de cancelar (falham sem a correção) | VALIDADO (rodada 2) |
| tests/db/payout-destination.test.ts | D-04: trocar a conta de recebimento com app: sem código, errado, de recuperação, certo; sem app | recusa ×3 / troca / troca (falha sem a correção) | VALIDADO (rodada 2) |
| tests/db/optin.test.ts | D-03: pedido guarda a caixa; campanha vai para quem marcou e para os pedidos antigos, não para quem não marcou | conforme | VALIDADO (rodada 2) |
| tests/db/finance-sums.test.ts | Financeiro/extrato somados no banco × cálculo antigo pedido a pedido (taxa absorvida perto de meio centavo, meia, cupom, teste, revenda, reembolso) | idêntico, centavo a centavo | VALIDADO (rodada 2) |
| tests/db/order-rate.test.ts | 13 pedidos seguidos da mesma conta; erro de preenchimento; outra conta | 12 passam, 13º recusado; erro não conta; outra conta livre | VALIDADO (rodada 2) |
| tests/unit/password-throttle.test.ts | S-23: "esqueci a senha" (login simulado): 30 s, 6 por hora, maiúsculas, outro e-mail, depois de 1 h | conforme (falha sem 3271b9e) | VALIDADO (rodada 2) |
| tests/unit/admin-guard.test.ts | S-05: central com e-mail confirmado, domínio, ADMIN_EMAILS fora do domínio, `secure` só com app | conforme | VALIDADO (rodada 2) |

Última execução completa: 30/10 rodada 2, **70 testes, 70 aprovados, 0 reprovados** (23 arquivos: 27 unitários + 43 de integração, com `TEST_DATABASE_URL`); sem a variável, os de integração ficam pulados (`pnpm test`: 27 aprovados). Build do OpenNext verde no fim da rodada (commit 85e8bff).

### No navegador (Playwright, servidor local, conta de teste)

E2E versionado: `tests/e2e/checkout.e2e.mjs` (`pnpm test:e2e`, com `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_EVENT`, `E2E_TYPE` e `NODE_PATH=$(npm root -g)`; recusa rodar fora do localhost). Rodada 2: também confere a caixa de novidades do produtor (desmarcada → marcada); última execução: 6/6 ok.
E2E da portaria pela câmera: `tests/e2e/portaria-camera.e2e.mjs` (`pnpm test:e2e:portaria`, com `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_EVENT`, `TEST_DATABASE_URL`); vídeo `.y4m` gerado por `tests/e2e/qr-y4m.mjs` a partir do QR de verdade da página do ingresso. Última execução: 13/13 ok.


| Fluxo | Resultado |
|---|---|
| Checkout completo no modo de teste (evento QA, 2 ingressos, 1 "Sou eu" + 1 enviado por e-mail, Pix de teste, confirmação) | VALIDADO: pedido pago, total R$ 107,99 (100 + 7,99), 2 vendidos, 1 envio pendente |
| Upload de imagem: PNG real / HTML com nome .png / sem login | VALIDADO: 200 / 415 / 401 |
| Cupom sem login: só cupom errado conta (20 por IP em 10 min); cupom válido nunca bloqueia | VALIDADO |
| Cronômetro "Reservados por" antes de existir pedido | FALHOU (texto): repassado ao Marcos (handoff 04:45) |
| Duas abas com o mesmo evento | VALIDADO: a segunda aba retoma o mesmo pedido; nada vendido acima |
| Portaria pelo painel com câmera (câmera falsa mostrando o QR de um ingresso de teste) | VALIDADO: lido e marcado como usado |
| Login com e-mail inexistente (1 tentativa) | VALIDADO: "E-mail ou senha incorretos." |
| "Me avise" sem login: limite por IP por hora (validado com 15; depois ajustado para 40 por causa de CGNAT) | VALIDADO |
| Prévia OG de rascunho | VALIDADO: 404 (publicado 200) |
| Exportar compradores (CSV) | VALIDADO: arquivo com colunas corretas |
| App da portaria sem internet, código digitado | VALIDADO: "NÃO LIBERADO · Sem conexão." e o ingresso continua válido no banco (falha fechada) |
| Ingresso reembolsado na portaria (QR e código) | VALIDADO (`tests/db/refund.test.ts`) |
| Portaria pela câmera (câmera falsa, QR real): válido, já usado, outro evento, reembolsado, cancelado, adulterado | VALIDADO (rodada 2, 13/13; mensagens com o Marcos) |
| Configurações: trocar conta de recebimento com app autenticador (D-04) | VALIDADO (rodada 2) |
| Financeiro do painel com somas no banco e paginação (`?p=`, valor inválido/fora do intervalo) | VALIDADO (rodada 2; mais de 25 eventos: só por leitura, a conta de teste tem 5) |
| Firefox e WebKit/Safari | BLOQUEADO (rede não baixa os navegadores) |
| Login com Google/Apple | BLOQUEADO no local (rodada 2: nada mudou no login) |

### Matriz de cenários do produto (técnico)

| Cenário | Onde é protegido | Status |
|---|---|---|
| Valor manipulado no navegador | `placeOrder` recalcula com `priceOrder` e preços do banco | VALIDADO (código + e2e) |
| Clique duplo / requisição repetida no pagamento | trava por `paid_at` no `fulfillOrder` | VALIDADO (integração) |
| Várias abas do mesmo evento | um pedido aberto por pessoa e evento (`releaseOthers`) | VALIDADO no navegador (duas abas retomam o mesmo pedido) |
| Mesmo CPF em contas diferentes confirmando juntas | trava por conta/CPF + conferência dentro da transação | VALIDADO (integração, rodada 2) |
| Worker cai no meio da emissão | transação única (`db.batch`) | VALIDADO (integração, rodada 2) |
| Reserva expira durante o pagamento | `fulfillOrder` (sem cobrança: expira; com cobrança: emite se houver lugar, senão estorna) | VALIDADO (integração) |
| Webhook duplicado / fora de ordem | KV + `fulfillOrder` idempotente; `canceled` só expira pedido pendente | VALIDADO (`tests/db/webhook.test.ts`, eventos assinados localmente); com a Stripe de verdade: BLOQUEADO |
| Pagamento recusado no cartão | pedido segue pendente até a reserva vencer | BLOQUEADO (sem chave de teste da Stripe no local) |
| Acesso sem login a páginas privadas | cada página chama `getSessionUser`/`painelAccess`/`contaUser`/`adminUser` | VALIDADO por leitura de código (todas as páginas privadas listadas) |
| Acesso a recurso de outra pessoa (pedido, ingresso, PDF, carteira) | filtros por `userId`/`holderUserId` | VALIDADO por leitura; PDF de código inexistente logado → 404 |
| Produtor mexendo em evento de outro | `getPainelScope` + `events.find(id)` em cada ação | VALIDADO por leitura |

## Parte de experiência (Marcos)

Playwright + Chromium no servidor local com a cópia do banco. Scripts e prints em `scratchpad/marcos/` (não versionados). Firefox/WebKit: BLOQUEADO.

### Varredura de telas
| Escopo | Larguras | Medido | Resultado |
|---|---|---|---|
| 38 rotas (20 públicas, 18 logadas) | 320×568, 375×667, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1920×1080 (304 telas) | status, rolagem horizontal, elementos fora da tela, alvos < 24px, erros de JS | 2 rotas com rolagem lateral (evento e painel do evento a 320–390): corrigidas e revalidadas |
| axe-core WCAG 2.2 AA | 390 e 1280 nas 38 rotas | violações | contraste (> 500 nós), nomes acessíveis, `nested-interactive`, `aria-*`, zoom bloqueado na portaria: corrigidos; restam 3 itens P3 (ver ux-audit) |

### Jornadas e cenários
| Jornada / cenário | Largura | Execuções | Resultado |
|---|---|---|---|
| Compra Pix de teste: evento → setor → ingresso → dados → Pix → confirmação → Meus ingressos | 390 | 5 | VALIDADO (valores conferidos em cada tela) |
| Recarregar a confirmação | 390 | 3 | FALHOU → corrigido → VALIDADO (U-14) |
| Pedido aberto + escolha diferente | 390 | 2 | FALHOU → corrigido → VALIDADO (U-17) |
| Limite por tipo e por compra; "+" bloqueado | 390, 1280 | 4 | FALHOU → corrigido → VALIDADO (U-01) |
| Taxa por linha × total | 390 | 3 | FALHOU → corrigido → VALIDADO (U-02) |
| Sessão expirada no checkout | 390 | 2 | FALHOU → corrigido → VALIDADO (U-28) |
| Offline entre Dados e Pagamento; cliques repetidos | 390 | 1 | VALIDADO |
| Rede 3G simulada (home, evento) | 390 | 1 | VALIDADO (conteúdo em 2,0–2,7 s) |
| Teclado: página do evento, tela cheia (foco preso e devolvido), painel de acessibilidade | 390 | 2 | FALHOU → corrigido → VALIDADO (U-27) |
| Cadastro/entrar com erro: foco no campo | 320, 390, 1280 | 2 | FALHOU → corrigido → VALIDADO (U-12) |
| Busca: nome, maiúsculas, acento, erro de digitação, gênero, sem resultado | 390 | 2 | FALHOU → corrigido → VALIDADO (U-26) |
| Criar evento (show, ingresso pago, 2 artes) até publicar | 390 | 2 completas + 5 parciais | VALIDADO (erros de cada etapa conferidos) |
| Artes: proporção errada, mesma proporção maior, 4:5 | 390 | 1 | VALIDADO (mensagem reescrita) |
| Portaria: abrir pelo painel, sem câmera, código inexistente, ingresso de outro evento | 390 | 1 | VALIDADO; câmera real BLOQUEADO; válido/já usado NÃO TESTADO |
| Equipe: criar e desligar acesso da portaria (com confirmação) | 390, 1280 | 2 | VALIDADO |
| Conta › Endereço: Estado/Cidade | 320, 390, 768 | 2 | FALHOU → corrigido → VALIDADO (U-07) |
| Pós-compra: transferir (modal), revender, PDF, página do ingresso | 390 | 1 | VALIDADO |
| Celular deitado (844×390) | — | 1 | VALIDADO |
| Leitor de tela real | — | 0 | BLOQUEADO |
