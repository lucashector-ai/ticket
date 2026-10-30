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
| tests/db/fulfill-atomic.test.ts | 30 confirmações ao mesmo tempo, dois tipos em ordens diferentes (estoque 7 e 5) | 5 emitidos, sem impasse de trava, vendidos = ingressos | VALIDADO (rodada 2, 3 execuções) |
| tests/db/grupo.test.ts | D-01: mesma conta paga duas partes ao mesmo tempo; segura outra parte depois de pagar uma; dois grupos ao mesmo tempo / depois de cancelar | uma parte só; recusado; um grupo aberto, outro depois de cancelar (falham sem a correção) | VALIDADO (rodada 2) |
| tests/db/payout-destination.test.ts | D-04: trocar a conta de recebimento com app: sem código, errado, de recuperação, certo; sem app | recusa ×3 / troca / troca (falha sem a correção) | VALIDADO (rodada 2) |
| tests/db/optin.test.ts | D-03: pedido guarda a caixa; campanha vai para quem marcou e para os pedidos antigos, não para quem não marcou | conforme | VALIDADO (rodada 2) |
| tests/db/finance-sums.test.ts | Financeiro/extrato somados no banco × cálculo antigo pedido a pedido (taxa absorvida perto de meio centavo, meia, cupom, teste, revenda, reembolso) | idêntico, centavo a centavo | VALIDADO (rodada 2) |
| tests/db/order-rate.test.ts | 13 pedidos seguidos da mesma conta; erro de preenchimento; outra conta | 12 passam, 13º recusado; erro não conta; outra conta livre | VALIDADO (rodada 2) |
| tests/unit/password-throttle.test.ts | S-23: "esqueci a senha" (login simulado): 30 s, 6 por hora, maiúsculas, outro e-mail, depois de 1 h | conforme (falha sem 3271b9e) | VALIDADO (rodada 2) |
| tests/unit/admin-guard.test.ts | S-05: central com e-mail confirmado, domínio, ADMIN_EMAILS fora do domínio, `secure` só com app | conforme | VALIDADO (rodada 2) |
| tests/db/activation.test.ts | Conta sem e-mail ativado: inscrição de produtor, ativada, aprovado sem ativar, produtor antigo, sessão desatualizada | recusa e pede ativação / segue / recusa / segue / confere no banco do login (falha sem a correção) | VALIDADO (rodada 3) |
| tests/unit/event-art.test.ts | DM-2: arte do e-mail/aviso/passe com banner, só cartaz, evento de demonstração, versão muda com a arte | endereço certo em cada caso | VALIDADO (rodada 3; composição da imagem: só com o serviço real) |
| tests/db/refund-atomic.test.ts | Queda no meio do reembolso; dois reembolsos diferentes do mesmo pedido ao mesmo tempo; estorno automático com queda | nada pela metade; nunca devolve mais que o pago; pedido, ingressos e lugares juntos (falham sem a correção) | VALIDADO (rodada 3) |
| tests/db/payout.test.ts | Queda logo depois de gravar com dois saques juntos; reembolso entrando enquanto a pessoa digita o código | nunca saque acima do saldo; nada gravado (falham sem a correção) | VALIDADO (rodada 3) |
| tests/db/painel-sums.test.ts | Início do painel, Público e Marketing somados no banco × cálculo antigo | idêntico, centavo a centavo | VALIDADO (rodada 3) |
| tests/db/stock-fair.test.ts | 25 pessoas ao mesmo tempo por 15 lugares | 15 reservas exatas (antes: menos, sobrava lugar) | VALIDADO (rodada 3) |
| tests/db/checkin-day.test.ts | Evento de 3 datas: ingresso de ontem e de daqui a 3 dias lidos hoje; o de hoje; tipo sem data | recusados com o dia e seguem válidos / entra / entra (falha sem a correção) | VALIDADO (rodada 3) |
| tests/unit/checkin-day.test.ts | Em que data a portaria está: madrugada, 2 h antes dos portões, antes da 1ª e depois da última, duas sessões no mesmo dia | conforme; mensagem com dia (ou horário) | VALIDADO (rodada 3) |
| tests/unit/csp.test.ts | CSP: nonce + strict-dynamic, hash do script da página, sem eval na produção, terceiros liberados, modo só avisar × bloquear | conforme | VALIDADO (rodada 3) |
| tests/unit/format.test.ts | Data por extenso no meio da frase (H-R3-4) | "até quinta, 5 de novembro de 2026" | VALIDADO (rodada 3) |
| tests/load/*.load.ts (`pnpm test:load`) | Carga 10 → 50 → 100: abertura de vendas e portaria com dois operadores | sem venda acima, ingressos = pagos, cada QR entra uma vez (números no `performance-report.md`) | VALIDADO (rodada 3, antes e depois) |

| tests/unit/meia.test.ts | D-09: caixa só em Inteira sem tipo Meia no mesmo setor/data; meia automática com preço do produtor (vazio = metade); meia acima da inteira recusada | conforme | VALIDADO (rodada 4) |
| tests/unit/ticket-card.test.ts | PDF sem setores: setor "Geral" para Inteira/Meia/Social | conforme | VALIDADO (rodada 4) |
| tests/db/place-order.test.ts | D-09: com tipo Meia no setor, `meia=true` na Inteira é ignorado no servidor (cobra a inteira); sem tipo Meia, cobra metade | R$ 54,00 × R$ 27,00 (com taxa) | VALIDADO (rodada 4; falha com a regra antiga) |
| tests/db/tickets.test.ts | D-11: link de transferência aberto em outra conta recusado (e-mail mascarado); mesmo e-mail sem ativar pede ativação; conta certa recebe | conforme | VALIDADO (rodada 4; falha sem a correção) |
| tests/db/activation.test.ts | D-08: produtor antigo sem e-mail confirmado cria evento e atualiza a página | permitido | VALIDADO (rodada 4) |
| tests/db/meia-quota.test.ts | Cota de meia 40% por setor e data: caixa na Inteira (10 lugares → 4), 8 pedidos simultâneos pelo tipo Meia (estoque 5, cota 4 → 4), setores e datas independentes, emissão recusada quando a cota já foi vendida | conforme | VALIDADO (rodada 4; falha sem a correção) |
| tests/db/team.test.ts | Equipe: admin convidado cria e edita evento na produtora da dona, vê os eventos, não convida/remove, não salva recebimento, não vê saldo; portaria não cria nem edita e não ganha produtora | conforme | VALIDADO (rodada 4; falha sem a correção) |
| tests/db/produtoras.test.ts | Até 3 produtoras (3 pedidos simultâneos: 1 passa), isolamento de eventos/recebimento/saques, cookie forjado com a produtora de outra pessoa, admin alternando para a produtora da equipe | conforme | VALIDADO (rodada 4) |
| tests/unit/art-frame.test.ts | Palco dos banners em HTML: CSP própria (sandbox sem mesma origem, sem rede), rota fixa, aceita só a página que emoldura | conforme | VALIDADO (rodada 4) |
| tests/db/trail.test.ts | D-12: jornada inteira registrada (emissão, presente, transferência enviada/cancelada/aceita, revenda, check-in recusado e aceito, reembolso) e achada pelo código original, e-mail e nº do pedido; emissão que falha não deixa rastro; ingresso antigo reconstruído; busca | conforme | VALIDADO (rodada 4) |
Última execução completa: 30/10 rodada 4, commit 6044d2c, **143 testes, 143 aprovados, 0 reprovados** (41 arquivos, com `TEST_DATABASE_URL` do branch `teste-r4`).
Anterior: 30/10 rodada 3, **103 testes, 103 aprovados, 0 reprovados** (32 arquivos, com `TEST_DATABASE_URL`; perfis `qa-test-…` apagados no fim pela limpeza global). Rodada 2: 71 testes, 71 aprovados (23 arquivos: 27 unitários + 44 de integração, com `TEST_DATABASE_URL`); sem a variável, os de integração ficam pulados (`pnpm test`: 27 aprovados). Build do OpenNext verde no fim da rodada (commit 99aed9b); e2e da câmera repetido depois das mudanças de portaria do Marcos (13/13).

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
| Firefox e WebKit/Safari (rodadas 1 e 2) | BLOQUEADO (rede não baixava os navegadores; resolvido na rodada 3) |
| Login com Google/Apple | BLOQUEADO no local (rodada 2: nada mudou no login) |
| Firefox e WebKit/Safari (rodada 3) | Instalados: e2e com `E2E_BROWSER=firefox|webkit` |
| CSP bloqueando (`E2E_CSP=enforce`), páginas principais, visitante e logado, 1280 e 390 (folha de compra) | VALIDADO: Chromium, Firefox e WebKit sem violação nem erro de JS, todas hidratadas (WebKit pela política Report-Only do servidor, com controle positivo; ver D-10) |
| Bancada da CSP com os terceiros reais (Turnstile com a chave pública de teste, cartão, Spotify; `<script>` e `onerror` injetados) | VALIDADO nos 3: token do Turnstile, cartão pronto, Spotify abre; injeções barradas. VLibras: BLOQUEADO (domínio fora do alcance do sandbox) |
| Checkout e2e com a CSP bloqueando | VALIDADO: Chromium, Firefox, WebKit (7/7 cada) |
| Portaria pela câmera com a CSP bloqueando | VALIDADO: Chromium e Firefox (13/13 cada); WebKit: BLOQUEADO (câmera de canvas não chega ao vídeo no WebKit sem tela, também sem a CSP) |
| Portaria por dia (evento de 2 datas do Marcos, pedido #50121 de sábado, código digitado antes da 1ª data) | VALIDADO (Chromium 390 e 1280): vermelho "Ingresso para sábado, 7/11: vale só nesse dia.", ingresso segue válido |

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
| Restam poucos e muitos compram ao mesmo tempo (10/50/100) | trava por tipo + conferência no mesmo lote (`placeOrder`) | VALIDADO (carga, rodada 3: vende exatamente o estoque) |
| Ingresso de outra data do mesmo evento na portaria | `sessionRefusal` no `checkinTicket` | VALIDADO (integração e tela, rodada 3) |
| Queda no meio do reembolso ou do saque | transação única (`tx.ts`) | VALIDADO (integração, rodada 3) |
| Meia pela caixa da Inteira com tipo Meia esgotado | não protegido: regra comercial em D-09 | aberto (decisão do dono) |

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
| Portaria: abrir pelo painel, sem câmera, código inexistente, ingresso de outro evento | 390 | 1 | VALIDADO; câmera real BLOQUEADO; válido/já usado: ver rodada 2 |
| Equipe: criar e desligar acesso da portaria (com confirmação) | 390, 1280 | 2 | VALIDADO |
| Conta › Endereço: Estado/Cidade | 320, 390, 768 | 2 | FALHOU → corrigido → VALIDADO (U-07) |
| Pós-compra: transferir (modal), revender, PDF, página do ingresso | 390 | 1 | VALIDADO |
| Celular deitado (844×390) | — | 1 | VALIDADO |
| Leitor de tela real | — | 0 | BLOQUEADO |

### Rodada 2 (30/10, depois das decisões do dono)
Câmera da portaria: vídeo `.y4m` com o QR de verdade (tirado de `/ingressos/<código>`) como câmera falsa do Chromium (`--use-file-for-fake-video-capture`). Firefox/WebKit e leitor de tela real continuam BLOQUEADOS.

| Jornada / cenário | Largura | Execuções | Resultado |
|---|---|---|---|
| DM-1: loader "Preparando seus ingressos" (1ª visita, recarregar, outro evento, navegação interna, sessão nova, reduzir movimento) | 390 | 1 | VALIDADO (só na 1ª visita, ~0,6 s; sem piscar na carga direta) |
| DM-2: criar e publicar evento só com o cartaz; prévias, página, busca, prévia de link | 390, 768, 1280 | 2 (1 publicada, 1 até a revisão) | VALIDADO |
| DM-3: "Observações (opcional)" vazio no evento novo, no evento antigo e em Configurações; página do evento sem o texto pronto | 390, 1280 | 1 | VALIDADO |
| D-03: caixa "Quero receber novidades" (desmarcada, toque e teclado) | 390, 1280 | 1 | VALIDADO |
| D-04: campo do código do app em Configurações (texto e aparência) | 1280 | 1 (print do Romano + revisão) | VALIDADO (texto ajustado); código real validado pelo Romano |
| Tabelas do painel com rolagem: Tab e nome (axe `scrollable-region-focusable`) | 390 | 3 rotas | VALIDADO |
| Gráfico de vendas pelo teclado (setas, Page Up/Down, Home/End, valor anunciado) | 390, 1280 | 1 | VALIDADO |
| Pontos do carrossel da home ≥ 24×24 (axe `target-size`) | 320, 390, 1280 | 1 | VALIDADO |
| Cadastro de produtor do zero: home → Criar evento → entrar → criar conta → ativar | 390 | 1 | VALIDADO até "Ative sua conta"; ativação BLOQUEADO (código vai por e-mail do Neon Auth; @example.com não recebe) |
| Página protegida sem login volta para ela depois de entrar (`next`) | — | 4 rotas (curl) + 1 navegador | FALHOU → corrigido → VALIDADO |
| E-mail errado na ativação: "Cadastrar com outro e-mail" | 390 | 1 | VALIDADO |
| Inscrição de produtor: envio vazio, parcial, público < 10, envio válido, recarregar | 390 | 1 | FALHOU (1 erro por envio, sem foco) → corrigido → VALIDADO; aprovação BLOQUEADO (central só @ticketswin.com.br) |
| Portaria (app) pela câmera: válido, já usado, outro evento, QR inválido | 320, 390 | 6 | FALHOU (válido virava "Já entrou" com o celular parado) → corrigido → VALIDADO |
| Portaria (app): QR parado 14 s / sai e volta (reentrada) | 390 | 2 | VALIDADO (1 verde; reentrada vermelha) |
| Portaria (painel) no celular: câmera e resultado à vista, código digitado, "Já entrou às" | 390 | 2 + e2e do Romano 13/13 | FALHOU → corrigido → VALIDADO |
| "Escrever com IA" e "Gerar mapa 3D" | 390 | 1 | Geração: BLOQUEADO (sem ANTHROPIC_API_KEY); mensagem de falha e alternativa ("planta-modelo"): VALIDADO |
| Zoom 200% (1280×800 → 640×400) em 8 rotas | 640 | 1 | VALIDADO (sem rolagem lateral) |
| Girar a tela no meio da escolha de ingressos | 390 ↔ 844 | 1 | VALIDADO (escolha e barra de total mantidas) |
| Editar evento já publicado: status e botão | 1280 | 1 | FALHOU ("Rascunho"/"Publicar evento") → corrigido → VALIDADO |
| Regressão: compra completa Pix de teste | 320, 1280 | 2 | VALIDADO (R$ 80 + 7,99% = R$ 86,39 em todas as telas; recarregar → Meus ingressos) |
| Regressão: criar evento até a revisão | 768 | 1 | VALIDADO |
| Regressão: varredura 25 rotas (públicas, compra, conta, painel, criador, portaria) | 320, 390, 768, 1280 (100 telas) + axe em 390/1280 | 1 | 1 elemento fora da tela (prévia do criador a 320), 2 avisos de nome/rolagem no criador e contraste do ingresso usado: corrigidos e revalidados; restam falsos positivos de contraste (título sobre fundo desfocado, arte decorativa, lote esgotado desabilitado) |


### Rodada 3 (30/10, Marcos): Firefox e WebKit, telas logadas com a marca nova, jornadas que faltavam
Firefox e WebKit liberados. No WebKit a sessão é injetada pela rota do Playwright (cookie `__Secure-` não é guardado em http://localhost). Segunda conta: `teste+marcos-produtor@example.com` (rodada 2). Detalhes e prints em `ux-audit.md`, Parte 4.

| Jornada / cenário | Motores | Larguras | Execuções | Resultado |
|---|---|---|---|---|
| Compra em tela cheia + checkout Pix de teste + confirmação | Chromium, Firefox, WebKit | 390, 1280 | 6 | VALIDADO (U-48 corrigido no caminho) |
| Ingresso: QR, Baixar PDF | Chromium, Firefox, WebKit | 390 | 3 | VALIDADO; carteira BLOQUEADO (sem certificados no local) |
| Evento de várias datas: data do ingresso em Meus ingressos, ingresso, PDF, .ics | Firefox, WebKit | 390 | 2 | FALHOU → U-49 → VALIDADO |
| Criar evento até publicar (2 datas × 2 setores, só cartaz) | Firefox, WebKit | 390, 1280 | 4 | VALIDADO |
| Telas logadas com logo e cor novas (10 rotas) | Chromium, Firefox, WebKit | 390, 1280 | 60 telas | VALIDADO (U-51 corrigido) |
| Portaria com câmera falsa (app e painel) e código digitado | Firefox, WebKit | 390 | 8 | VALIDADO (U-52 ajustado) |
| Ativar conta vindo de Criar evento | Chromium, WebKit | 390, 1280 | 8 | FALHOU → U-54 → VALIDADO |
| Pré-venda e contagem: visitante, "Me avise" vazio e válido | Chromium, Firefox, WebKit | 390, 1280 | 7 | FALHOU → U-56 → VALIDADO |
| Link da pré-venda → escolher ingressos | Chromium, Firefox, WebKit | 390 | 3 | VALIDADO |
| Painel → Lançamento: salvar abertura, pré-venda, fila; situação atualiza | Chromium | 1280 | 6 | VALIDADO (3–4 s no servidor de desenvolvimento) |
| Fila virtual com 10 comprando + 2 na fila | Chromium, Firefox, WebKit | 320, 390, 1280 | 9 | FALHOU → U-55 → VALIDADO |
| Revenda ponta a ponta (anunciar, faixa de preço, comprar com outra conta, QR novo, tirar) | Chromium | 390 | 1 + 1 | VALIDADO (U-58, U-59); vendedor sem registro (H-R3-1) |
| Transferência ponta a ponta (próprio e-mail recusado, enviar, aceitar, QR novo) | Chromium | 390 | 1 | VALIDADO; pendências H-R3-1, H-R3-2 |
| Compra em grupo pelo convite (2 contas, 2 Pix de teste, "Grupo completo!") | Chromium | 390 | 1 | VALIDADO |
| Cancelamento pelo comprador (inteiro; com envio não aceito) | Chromium, Firefox, WebKit | 390 | 4 | VALIDADO |
| Reembolso pelo produtor | WebKit | 390 | 1 | VALIDADO |
| E-mail marketing: montar campanha sem enviar | Chromium, Firefox, WebKit | 390, 1280 | 5 | FALHOU (fornecedor no texto) → U-60 → VALIDADO |
| Página do produtor e do artista | Chromium, Firefox, WebKit | 390, 1280 | 18 telas | VALIDADO (U-57) |
| E-mail transacional e passe com evento só de cartaz | — | — | 1 (`/api/arte`) | BLOQUEADO no local (serviço de imagens sem desfoque/sobreposição; H-R3-3) |
| Saque abaixo do mínimo (Banco) | — | — | 0 | CORRIGIDO, NÃO VALIDADO (U-61) |
| Regressão final: 12 rotas (home, explorar, 2 eventos, Meus ingressos, ingresso, checkout, grupo, painel, reembolsos, criar evento, ativar conta) + produtor, artista, conta, e-mails, ajuda, portaria no Chromium | Chromium (320, 390, 768, 1280), Firefox (320, 768), WebKit (320, 768); 390/1280 de Firefox/WebKit nas linhas acima | 4 larguras | 126 telas | VALIDADO: nenhuma rolagem lateral, nenhum elemento fora da tela, nenhum erro de JavaScript da página (só 404 de imagem de teste e bloqueio de rede externa). Alertas de contraste: falsos positivos (texto sobre arte, atalho escondido) e a seta "›" decorativa das linhas de Reembolsos (2,1:1, a linha inteira é o botão com texto) |
