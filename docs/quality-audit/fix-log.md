# Registro de correções e validações

Formato: data/hora · quem · commit · o que · como foi validado · status.

## Contas criadas na auditoria (apagar depois)
| Conta | Quem criou | Para quê |
|---|---|---|
| (nenhuma até agora; Romano usa só `teste+agente1030@example.com`, já existente) | | |
| `teste+marcos-produtor@example.com` | Marcos (rodada 2) | Testar o cadastro de produtor do zero pela interface (conta, inscrição de produtor, primeiro acesso ao painel) |

## Dados de teste no banco de teste
- Testes de integração criam eventos, produtores, perfis e cupons `qa-test-…` e apagam no fim (conferido no fechamento: 0 eventos, 0 produtores, 0 perfis restantes). Cupom `QAROMANO10` e 15 cadastros "me avise" `qa.romano.aviso*@example.com` usados na validação foram apagados.
- Rodada 2 (Romano): no evento `qa-romano-checkout`, o tipo "Pista QA" passou para 40 lugares e limite 20 por pessoa (para os testes no navegador); pedidos de teste #48933–#48936 (checkout e2e, 1 ingresso cada). Os testes de integração e o e2e da portaria criam e apagam os próprios dados (conferido: 0 eventos `qa-e2e-portaria-outro-*`, 0 pedidos `TEST-e2e-*`). Na validação da D-04 o app autenticador da conta de teste foi ligado e desligado (estado final: sem 2FA, sem conta de recebimento, como antes; ficou 1 registro no log de segurança da conta). Coluna `orders.producer_opt_in` criada no branch de teste. Nenhuma conta nova criada pelo Romano.
- 1 imagem PNG de 1×1 enviada ao R2 local na validação do upload (`/midia/eventos/e665d30ef5fa/mvugl1o4-…png`), só local.
- Evento `qa-romano-checkout` (produtor da conta de teste, 1 tipo "Pista QA"; ao fim da noite com 6 lugares, 4 vendidos em 3 pedidos pagos de teste e 2 cancelados/abertos) criado no banco de teste para os testes no navegador. Pode ser apagado junto com o branch de teste; pedido nº 48308 pago em modo de teste (2 ingressos: TW-M3QC-DXZZ, já usado no teste da câmera, e um enviado para `qa.romano.presente@example.com`, sem conta).

## Romano

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 04:10 | c6b46d2 | Limite por pessoa: `roomFor` (mesma regra do servidor), `owned` por tipo na página do evento, `canInc`/`incBlock` no `use-tickets`; texto "por compra" no servidor; `feeShares` para a taxa por linha; vitest | 13 testes unitários; parte visual validada pelo Marcos no Playwright (3063bb8) | VALIDADO |
| 30/10 04:20 | f8306a2 | Código do ingresso muda na transferência aceita e na revenda (S-01) | `tests/db/tickets.test.ts` (aceite e revenda; falha sem a correção) | VALIDADO |
| 30/10 04:20 | ff46243 | Equipe/configurações só para produtor aprovado (S-02) | `tests/db/painel.test.ts` (falha sem a correção) | VALIDADO |
| 30/10 04:20 | 087a0c8 | Excluir evento com pagamento em andamento; saque duplo; central com e-mail confirmado (S-03, S-04, S-05) | `tests/db/painel.test.ts` e `tests/db/payout.test.ts` (S-03, S-04); S-05 por leitura | VALIDADO (S-05: CORRIGIDO, NÃO VALIDADO) |
| 30/10 04:25 | 371f032 | Ex-membro perde o acesso pessoal de portaria (S-06) | `tests/db/painel.test.ts` | VALIDADO |
| 30/10 04:25 | c959201 | Upload confere bytes e limita 60/h (S-07) | Playwright no servidor local: 200 / 415 / 401 | VALIDADO |
| 30/10 04:30 | 163ea2a | Reserva de 15 min segura estoque; reconferência após gravar (S-08) | `tests/db/stock.test.ts` no banco de teste (9 cenários); checkout e2e no navegador | VALIDADO |
| 30/10 04:40 | 675aac5 | Assinaturas (QR, portaria, banco, 2FA) sem segredo padrão no código | testes de integração geram e conferem QR | VALIDADO |
| 30/10 04:40 | 7730368 | Checkout antigo: `createOrder` sem uso removido; `payOrder` usa a emissão única; `cancelOrder` cancela a cobrança | `tests/db/checkout-legacy.test.ts`; build | VALIDADO |
| 30/10 04:45 | 2550e88 | Login com mensagem genérica para conta inexistente | Playwright: 1 tentativa com e-mail inexistente → "E-mail ou senha incorretos." | VALIDADO |
| 30/10 04:45 | c23bfe6 | Cupom sem login limitado a 30 consultas por IP em 10 min | Playwright: após o limite, "Muitas tentativas" | VALIDADO |
| 30/10 04:50 | bb0f74f · a59301a | Remove jspdf/html-to-image (sem uso, críticos); node-forge 1.4.2 com teste de assinatura | `pnpm audit --prod` 47 → 8; teste da Wallet | VALIDADO |
| 30/10 04:55 | 4fbf9d8 | Cliente do Neon Auth sob demanda (−250 KB em /entrar, /cadastro, /ativar-conta, /checkout) | build: medidas por rota; Playwright: botão do Google em /entrar | VALIDADO |
| 30/10 05:00 | 52b6384 | Página do evento: consulta do evento uma vez por requisição e dados em paralelo | TTFB dev 8–11% menor (A/B) | VALIDADO |
| 30/10 05:10 | 5943600 | jsQR sob demanda (/portaria 234 → 107 KB) | câmera falsa no Chromium leu o QR de um ingresso de teste | VALIDADO |
| 30/10 05:15 | a5f57da | Editar evento: apagar tipo de ingresso não quebra no meio (FK) | `tests/db/edit-types.test.ts` (4 cenários) | VALIDADO |
| 30/10 05:35 | 0d5d79c | Freio de e-mails: "me avise" 15/h por IP; transferências 20/h por conta (S-19) | Playwright: 15 cadastros e o 16º recusado; dados de teste apagados | VALIDADO |
| 30/10 05:45 | d72c91c | `placeOrder`: no máximo 12 pedidos por conta a cada 10 min (reserva não vira trava de estoque) | tsc/eslint; testes | CORRIGIDO, NÃO VALIDADO no navegador |
| 30/10 05:50 | 9175056 | Prévia OG não expõe arte de rascunho (S-20) | curl local: publicado 200, rascunho 404 | VALIDADO |
| 30/10 05:55 | ce0d18c | CSV do painel sem fórmula de planilha (S-21) | `tests/unit/csv.test.ts`; download de compradores no Playwright | VALIDADO |
| 30/10 06:05 | c0c7d61 | `qrPayload` fora de "use server"; `checkin-link.ts` (morto) removido (S-22) | 45 testes; Meus ingressos/ingresso com QR; PDF 200 | VALIDADO |
| 30/10 06:00 | 0e456dd | E2E do checkout versionado (`pnpm test:e2e`) | 4/4 passos ok | VALIDADO |
| 30/10 06:25 | f3f288f · dcf63b1 | Limites revistos para CGNAT: pedidos contam só quando criados; só cupom errado conta (20/10 min por IP); "me avise" 40/h | Playwright: cupom válido 25× sem bloqueio, errados bloqueados; testes do placeOrder | VALIDADO |
| 30/10 06:30 | 3271b9e | "Esqueci a senha"/ativação: teto de 6 por hora por e-mail (S-23) | tsc/eslint; sem teste (login compartilhado com a produção) | CORRIGIDO, NÃO VALIDADO |

### Romano · rodada 2 (30/10, depois da aprovação do dono)

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 10:45 | 89b1c92 | Servidor local de volta na porta 3042 (estava fora do ar no início da rodada) | curl 200 em `/` e no evento de teste | VALIDADO |
| 30/10 11:00 | 1c12a57 | Emissão numa transação só (`db.batch`): queda no meio não deixa nada pela metade nem baixa o estoque duas vezes (S-24); trava por conta e CPF na confirmação (S-25) | `tests/db/fulfill-atomic.test.ts` (3 cenários, falham sem a correção) + suíte inteira + checkout e2e no navegador | VALIDADO |
| 30/10 11:05 | 67f9873 | D-01: uma parte de grupo por conta e um grupo aberto por pessoa em cada evento; Ajuda atualizada | `tests/db/grupo.test.ts` (3 cenários, falham sem a correção) | VALIDADO (integração) |
| 30/10 11:15 | 4cc67ad · 4a29bdf | D-04: trocar a conta de recebimento exige o código do app quando a conta usa o app | `tests/db/payout-destination.test.ts` (falha sem a correção); Chromium: sem código → campo aparece com foco; errado → não salva; certo → salva | VALIDADO |
| 30/10 11:40 | 09de382 | D-03: caixa desmarcada "Quero receber novidades de <produtor>" no checkout; campanhas só para quem marcou (pedidos antigos como antes); coluna `orders.producer_opt_in` (SQL em pending-decisions) | `tests/db/optin.test.ts`; e2e do checkout marcando a caixa (pedido #48936 com opt-in = true) | VALIDADO |
| 30/10 11:55 | (fflate) | fflate 0.8.3 (aviso moderado); D-06 avaliada: código vulnerável do better-auth não roda no nosso Worker | `pnpm audit --prod`; teste da Wallet; zip/unzip de fumaça; leitura do SDK e do build | VALIDADO |
| 30/10 12:05 | 351ca5c | Financeiro e extrato do Banco somados no banco (`orderSums`); tabela por evento paginada (25) | `tests/db/finance-sums.test.ts` (paridade centavo a centavo com o cálculo antigo); Chromium no financeiro (valores = SQL direto) | VALIDADO |
| 30/10 12:10 | ddca928 | Teste do limitador do "esqueci a senha" (S-23) com o login simulado | `tests/unit/password-throttle.test.ts` (falha sem 3271b9e) | VALIDADO |
| 30/10 12:25 | 003a4e1 | E2E da portaria pela câmera (câmera falsa do Chromium, QR real do ingresso): válido, já usado, outro evento, reembolsado, cancelado, adulterado | `pnpm test:e2e:portaria`: 13/13 ok | VALIDADO |
| 30/10 12:35 | 85e8bff | Testes da central admin (S-05) e do limite de 12 pedidos por conta a cada 10 min | `tests/unit/admin-guard.test.ts`, `tests/db/order-rate.test.ts` | VALIDADO |

### Romano · rodada 3 (30/10)

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 12:40 | c7f6a39 | Conta sem e-mail ativado não vira produtor (inscrição e página do produtor pedem a ativação); comprar segue liberado; produtores antigos: D-08 | `tests/db/activation.test.ts` (falha sem a correção); Chromium 390: `/criar-evento` sem ativar leva a `/ativar-conta` com a frase nova | VALIDADO |
| 30/10 12:50 | 10e931b | DM-2 no e-mail, no aviso e no passe: evento só com cartaz usa um banner montado (cartaz sobre ele mesmo desfocado, 16:9 no e-mail e 3:1 na faixa do Google Wallet; `/api/arte/<slug>`, gerado uma vez e guardado no R2) | `tests/unit/event-art.test.ts` (qual arte vai em cada caso); HTML do e-mail de publicação e de campanha abertos no Chromium. A composição (desfoque + cartaz desenhado por cima) foi conferida só por emulação com sharp: o serviço de imagens local recorta, mas ignora `blur` e `draw` (H-R3-3 do Marcos); conferir numa prévia com o serviço de verdade | CORRIGIDO, NÃO VALIDADO (composição) |
| 30/10 13:05 | 9088be7 | Reembolso e saque numa transação (como a emissão): linha concluída, ingressos, lugares e totais do pedido num lote só; um reembolso pendente por pedido (índice único parcial, SQL no topo do `pending-decisions.md`); saque com trava por pessoa e conferência de saldo na mesma transação | `tests/db/refund-atomic.test.ts` e `tests/db/payout.test.ts` (falham sem a correção) | VALIDADO (integração) |
| 30/10 13:15 | aaabf87 | Início do painel, Público e Marketing somados no banco (sem trazer todos os pedidos) | `tests/db/painel-sums.test.ts` (paridade centavo a centavo: indicadores dos 3 períodos, minilinhas, líquido por evento, compradores e cupons); Chromium nas 3 telas | VALIDADO |
| 30/10 13:45 | 334f10d | Abertura de vendas: pedido + itens + conferência do estoque num lote só com trava por tipo. Antes, com muitos pedidos ao mesmo tempo, todos se viam e se recusavam: 50 pessoas por 30 lugares davam 21 reservas; 100 por 60, 36 (sobrava lugar). Agora os primeiros ficam com todos os lugares, sem passar | `tests/db/stock-fair.test.ts` (falha sem a correção); teste de carga `pnpm test:load` (números no `performance-report.md`) | VALIDADO |
| 30/10 13:50 | 58f7dc1 | Portaria: marcar como usado e tirar da revenda num comando só (uma ida ao banco a menos por leitura) | carga da portaria com dois operadores (números no `performance-report.md`): cada ingresso entra uma vez | VALIDADO |
| 30/10 14:15 | 5c4e43b | **P1 (achado do Marcos):** evento de várias datas, a portaria não conferia o dia; ingresso de sábado entrava na sexta/domingo e ficava "usado". Agora recusa com "Ingresso para sábado, 7/11: vale só nesse dia." (duas sessões no mesmo dia: diz o horário) e não marca como usado. A portaria está na última sessão que já abriu (portões − 2 h); a madrugada ainda é do dia anterior | `tests/db/checkin-day.test.ts` (falha sem a correção) e `tests/unit/checkin-day.test.ts`; Chromium 390 e 1280 na portaria do painel com o pedido #50121 (sábado) do evento do Marcos: vermelho com o dia certo, ingresso segue válido no banco | VALIDADO |

### Romano · rodada 4 (30/10, decisões do dono D-08, D-09, D-11, D-12)

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 16:50 | 3f526a8 | **D-11:** transferência comum só para a conta do e-mail de destino, com e-mail confirmado (como o envio da compra). Outra conta: "Este ingresso foi enviado para m•••@gmail.com. Entre com esse e-mail para receber."; a página do link mascara o e-mail para quem não é o destino; Ajuda e e-mail de transferência atualizados | `tests/db/tickets.test.ts` (falha sem a correção: a outra conta levava o ingresso); Chromium 390 e 1280 com a conta de teste abrindo um link enviado para outro e-mail: recusa com "m•••@example.com" e "Trocar de conta" (`scratchpad/romano/r4/shots/transferencia-outra-conta-chromium-*.png`) | VALIDADO |
| 30/10 17:00 | eaca993 | **D-08 (manter):** produtor antigo sem e-mail confirmado segue normal; teste de regressão (cria evento, atualiza a página do produtor) | `tests/db/activation.test.ts` | VALIDADO (integração) |
| 30/10 17:20 | 27c2900 | **D-09:** preço da meia automática editável (campo `meia` da Inteira; vazio = metade) e conferido ao publicar (nunca acima da inteira, `src/lib/criar/meia.ts`); caixa "Meia-entrada" do checkout só onde o setor/data não tem tipo Meia, na tela e no `placeOrder` (`meiaBoxOk`), com metade do preço; Ajuda atualizada. Tela do criador: Marcos (78894f4) | `tests/unit/meia.test.ts`; `tests/db/place-order.test.ts` (falha com a regra antiga: cobrava R$ 27 em vez de R$ 54); Chromium 390 e 1280 no checkout do evento `qa-romano-r4-meia` (Pista com Inteira + Meia, Camarote só Inteira): caixa só no Camarote, "R$ 75,00" | VALIDADO |
| 30/10 18:10 | ea4ab2f | **D-12:** tabela `ticket_events` (SQL no topo do `pending-decisions.md`) gravada na mesma transação da emissão, envio na compra, transferência (enviada/reenviada/cancelada/aceita), revenda vendida, reembolso/cancelamento e check-in (e check-in recusado). Transferir, cancelar, aceitar e reenviar viraram um comando só (antes, dois soltos: dois envios ao mesmo tempo abriam dois links). Leitura `adminTicketTrail` (código atual/anterior, e-mail, nº do pedido) com reconstrução de ingressos antigos | `tests/db/trail.test.ts` (4 cenários: jornada completa achada pelo código original; emissão que falha não deixa rastro; ingresso antigo reconstruído; busca); leitura conferida com ingressos reais antigos da cópia da produção (gift pendente, revenda anunciada/retirada, check-in); suíte inteira 36 arquivos / 127 testes | VALIDADO (integração); tela da central: Marcos |

**Achado de ferramenta (P3):** `eslint` ficou 16 min a 100% de CPU em `src/lib/admin-trail.ts` porque uma função auxiliar se chamava `use` (a regra do React Compiler do `eslint-config-next` trata `use` como hook e entra em laço). Renomeada; vale para código novo: não chamar funções de `use`.

**Dados criados no banco de teste (`teste-r4`):** organizador "Agente Teste Produções" (`agente-teste-producoes-r4`, dono `teste+agente1030@example.com`, e-mail da conta continua não confirmado) e o perfil dessa conta; evento `qa-romano-r4-meia` ("QA Romano · Meia D-09 (não comprar)", Pista Inteira/Meia e Camarote Inteira); pedido de teste `TEST-r4-d11` de uma conta fictícia `qa-romano-r4-remetente` com o ingresso `TW-R4QA-D11X` transferido (pendente) para `marcia.qa.r4@example.com`; tabela `ticket_events`. Nenhuma conta nova.

## Marcos

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 04:35 | 3063bb8 | Escolha de ingressos: texto do limite por tipo e por compra, "+" bloqueado no limite, "Você já tem N", taxa por linha com `feeShares`, total com taxa no desktop, data sem ano no topo, "Comprar ingressos", reabrir com escolha espalhada (QA 1, 2, 3, 4, 6) | Playwright 320/360/390/1280 em `/eventos/aurora-ao-vivo` e `festa-da-putaria`, prints antes/depois | VALIDADO |
| 30/10 04:35 | 8ae2c2d | Aba de acessibilidade na borda até 1024px; `BrokenImages` esconde imagem que falha (QA 5, 11) | Playwright 390: aba fora do texto dos setores; imagens quebradas ficam invisíveis | VALIDADO |
| 30/10 04:50 | bdba77b | Lista de Estado/Cidade não passa da tela; /conta com Estado e Cidade sem corte (QA 7) | Playwright 320/390/768 + teste forçando a coluna estreita | VALIDADO |
| 30/10 04:50 | 554fb4c | Equipe: campos 42px, QR em coluna no celular, campos ≥200px no desktop, nome sem corte, "Desligar" com confirmação (QA 8, 9, 10) | Playwright 320/390/1280; criado e desligado 1 acesso de portaria de teste ("QA Marcos") | VALIDADO |
| 30/10 04:50 | cffe40f | Foco no primeiro campo com erro (QA 12); toast com largura certa | Playwright /cadastro e /entrar em 320/390/1280 | VALIDADO |
| 30/10 05:20 | 1da30aa | Recarregar a confirmação leva a Meus ingressos (U-14) | Playwright: compra Pix de teste + reload, 3× | VALIDADO |
| 30/10 05:30 | bf6b171 | Ingresso da confirmação sem corte; Meus ingressos destaca o evento comprado (U-15, U-16) | Playwright 390 | VALIDADO |
| 30/10 05:40 | c5e0768 | Pedido aberto × escolha nova: "Trocar pela escolha nova"; texto do limite sem redundância (U-17, U-22) | Playwright 390 em /eventos/marea | VALIDADO |
| 30/10 05:50 | (ver git) | Sem rolagem lateral em /eventos e /painel/evento a 320–390 (U-18) | Playwright 320/390 | VALIDADO |
| 30/10 06:10 | 71e2206 | Contraste dos cinzas de texto (U-19) | axe em 30 telas × 390/1280, antes/depois | VALIDADO |
| 30/10 06:10 | 805d704 | Nomes acessíveis, 1 link por card, zoom na portaria, Esgotado/Encerrado (U-20, U-21) | axe + Playwright | VALIDADO |

| 30/10 rodada 2 | bd2bc5e | DM-1: loader do evento só na 1ª visita da sessão, 0,9 s | Playwright 390: 1ª visita, recarregar, outro evento, navegação interna, sessão nova | VALIDADO |
| 30/10 rodada 2 | 70c84ef | DM-2: só o cartaz para publicar; banner montado com o cartaz; prévia de link com o cartaz (mudança mínima em `save.ts` e `share-image.ts`) | evento publicado só com cartaz; 390/768/1280, prévias, OG 200 | VALIDADO |
| 30/10 rodada 2 | 96c2556 · e1a2a6d | DM-3: "Observações (opcional)" sem texto pronto; texto antigo tratado como vazio; textos de Configurações e do código do app (D-04) | criador e Configurações 390/1280, página do evento | VALIDADO |
| 30/10 rodada 2 | 4b24197 | Tabelas do painel roláveis entram no Tab com nome (`Tbl`) | axe 0 em 3 rotas a 390 | VALIDADO |
| 30/10 rodada 2 | 41f69a8 | Gráfico de vendas operável pelo teclado (slider) | Playwright 390/1280: setas, Page, Home/End, clique | VALIDADO |
| 30/10 rodada 2 | 2204011 | Pontos do carrossel 24×24 | axe target-size 320/390/1280; toque | VALIDADO |
| 30/10 rodada 2 | 04c5974 | Página protegida sem login volta para ela (`next` no `proxy.ts`); entrar/cadastro com motivo | curl 4 rotas; Playwright Criar evento → entrar → cadastro | VALIDADO |
| 30/10 rodada 2 | 1a724a5 | Ativação: "Cadastrar com outro e-mail" | Playwright 390 com a conta nova | VALIDADO |
| 30/10 rodada 2 | dc9b3ff | Inscrição de produtor: todos os campos que faltam de uma vez, com foco | Playwright 390: vazio, parcial, inválido, válido | VALIDADO |
| 30/10 rodada 2 | 264b8c2 | Portaria: o mesmo QR só é relido depois de sair da câmera por 2 s (verde não vira "Já entrou") | câmera falsa: QR parado 14 s, sai e volta | VALIDADO |
| 30/10 rodada 2 | bce8d62 · 74f5a2e · 48d4f77 | Portaria: próximo passo no QR inválido; painel no celular com câmera e resultado à vista; "Já entrou às HH:MM" no painel; e2e ajustado | câmera falsa 320/390; e2e do Romano 13/13 | VALIDADO |
| 30/10 rodada 2 | f5f01f1 | Criador: prévia cabe a 320; etapas e prévia com nome acessível | Playwright 320/360/390; axe 390/1280 | VALIDADO |
| 30/10 rodada 2 | f2f1ee1 | Editar evento no ar: "Publicado", "Salvar alterações", "Alterações salvas" | Playwright 1280: salvar evento publicado | VALIDADO |
| 30/10 rodada 2 | 3aa8503 | Ingresso usado/cancelado com textos ≥ 4,5:1 | axe /ingressos e /meus-ingressos 390 | VALIDADO |

| 30/10 rodada 3 | 3bf1ac1 | `BrokenImages` esconde imagem quebrada pela folha de estilo (aviso de hidratação no /explorar) | Firefox /explorar sem aviso | VALIDADO |
| 30/10 rodada 3 | 6bcd126 | Checkout: foco no campo vazio do titular, resumo perto do botão, data escolhida no resumo e na confirmação | Firefox/WebKit/Chromium 390 e 1280 | VALIDADO |
| 30/10 rodada 3 | 4003678 · 07f95b3 | Várias datas: ingresso, Meus ingressos, PDF e .ics com a data da sessão; PDF "Meia" pelo tipo (mudança mínima em arquivos do Romano) | Firefox/WebKit 390: pedido #50121 (2 ingressos de sábado) | VALIDADO |
| 30/10 rodada 3 | 4e504d9 | Página offline do app da portaria na cor nova | print | VALIDADO |
| 30/10 rodada 3 | 346dbf5 | Link do evento no painel com reticências | 3 motores 390/1024/1280 | VALIDADO |
| 30/10 rodada 3 | df47d66 | App da portaria: próximo passo para QR inválido × código não encontrado | WebKit 390 código digitado | VALIDADO |
| 30/10 rodada 3 | 34d544c | Ativar conta vindo de Criar evento: 1 parágrafo, "Enviar um novo" sem esperar 30 s | Chromium/WebKit 390 e 1280; 1 código pedido | VALIDADO |
| 30/10 rodada 3 | 8591446 | Fila virtual: cartão inteiro no celular, foco preso, texto certo sobre recarregar | fila simulada no banco de teste, 3 motores × 320/390/1280 | VALIDADO |
| 30/10 rodada 3 | 58d5854 | Contagem da abertura: "Me avise" vazio responde; erro sem cobrir o texto | Chromium/WebKit 390 | VALIDADO |
| 30/10 rodada 3 | ea522cb | Página do produtor: dica com contraste 5,1:1 | varredura de contraste | VALIDADO |
| 30/10 rodada 3 | 2e4142a | Revenda: motivo do botão travado; "Valor do ingresso" | Chromium 390, duas contas | VALIDADO |
| 30/10 rodada 3 | a2df9f7 · b75d11f | Checkout da revenda/grupo e página da transferência com a data do ingresso | Chromium 390; `curl` da página da transferência | VALIDADO |
| 30/10 rodada 3 | 33a229d | E-mails do produtor sem nome de fornecedor; nome da campanha com reticências | Firefox/WebKit 390 e 1280 | VALIDADO |
| 30/10 rodada 3 | de26b76 | Banco: diz o saque mínimo | tsc/eslint | CORRIGIDO, NÃO VALIDADO |
| 30/10 rodada 3 | 1c1f6b1 | Página do evento: trilha legível sobre cartaz claro (topo mais escuro) | contraste medido no print, 390/1280, 3 cartazes | VALIDADO |

### Dados de teste criados pelo Marcos (banco de teste)
- 2 eventos publicados "QA Marcos · Show de teste (não comprar)" (`/eventos/qa-marcos-show-de-teste-nao-comprar` e `…-2`), conta de teste existente, Casa Tangente, 7/11. Apagar depois.
- Compras de teste (Pix de teste, sem cobrança) na conta de teste: 6 pedidos de Aurora Ao Vivo (#48307, #48317–#48322) e pedidos pendentes/cancelados de Marea Festival (#48350, #48351).
- 1 acesso de portaria "Portão Principal Norte (QA Marcos)" criado e desligado (2×).
- Imagens enviadas ao R2 local (cartaz e banner de teste). Nenhuma conta nova criada.
- **Rodada 2:** evento publicado "QA Marcos · Só cartaz (não comprar)" (`/eventos/qa-marcos-so-cartaz-nao-comprar`, id f9454f65-…) da conta de teste, só com cartaz (imagem no R2 local). Pedidos Pix de teste na conta de teste: #49031 (TW-AFH9-QDXL, usado na portaria), #49034 (TW-QNLX-7J8K, usado na portaria), #49261 e #49262 (regressão 320/1280). Uma rodada do e2e da câmera do Romano (cria e usa ingressos no `qa-romano-checkout`).
- **Conta nova (rodada 2):** `teste+marcos-produtor@example.com` (login do Neon Auth, compartilhado com a produção; e-mail **não ativado**) com 1 inscrição de produtor "em análise" (São Paulo – SP, Show) no banco de teste. Apagar a conta e a inscrição depois.

- **Rodada 3 (banco de teste, conta de teste e `teste+marcos-produtor@example.com`; nenhuma conta nova):** eventos "QA Marcos · Festival firefox/webkit … (não comprar)" (criados pela interface: `qa-marcos-festival-firefox-nao-comprar`, `…-firefox-1280-…`, `…-webkit-390-…` e 5 tentativas `…-webkit-1280-…` a `…-5`). Pedidos Pix de teste: #50121–#50128 (compras nos 3 motores), #50895 (revenda comprada pela segunda conta; o ingresso foi depois transferido para a conta de teste, hoje TW-R3KC-FJJN), #50896/#50897 (grupo `b87mzyatph`, completo), #50898–#50900 (cancelamento e reembolso: #50898 e #49261/#49262 cancelados pelo comprador, #50899 reembolsado pelo produtor, #50900 com 1 ingresso enviado a `teste+qa-convidado1@example.com`, sem conta). Revenda: 1 anúncio vendido, 1 retirado. 4 cadastros "me avise"/pré-venda `teste+marcos-lanc-*@example.com` no `qa-marcos-show-de-teste-nao-comprar` (lançamento voltou ao padrão: sem data, fila automática 300; a fila simulada foi apagada). 1 rascunho de e-mail "Divulgar o evento · QA Marcos · Só cartaz" (não enviado). 1 código de ativação pedido para a conta de teste.

## Marca

Troca da logo (arte nova do dono, `ticketswin-logo.svg` 1394 × 265). Paths usados sem alteração; isotipo em `#EDFF3C` (cor da arte original, que também vira o destaque do site), logotipo em `currentColor` (escuro `#111` no claro, branco no escuro). Isotipo sem contorno no fundo claro, como a marca anterior. Altura de cada uso mantida: a arte nova tem a mesma proporção (5,26 × 5,31) e o mesmo peso de letra, então cabeçalho 24 px, rodapé 26 px e e-mail 26 px ficaram com o mesmo tamanho visual.

| Data/hora | Commit | O que | Validação | Status |
|---|---|---|---|---|
| 30/10 13:00 | (este bloco) | `src/components/brand-logo.tsx`: MARK/WORD novos, `BRAND_LIME`, `BRAND_BOX` (recortes: completa `1 0 1394 265`, isotipo `0.5 0 265 265`, logotipo `320 39 1075 187`). Vale para todos os usos: cabeçalho, rodapé, login/cadastro, painel, portaria, banco, fila virtual, onboarding, criar evento, home, explorar, ingresso, sobre, parceiro, e/sair, landing de produtores | Prints antes/depois Chromium 390/1280 (home, evento, login, cadastro, portaria, banco, sobre, produtores, ajuda, painel, ingresso, comprovante, fila); Firefox e WebKit no cabeçalho e login; 320 px sem rolagem lateral | VALIDADO |
| 30/10 13:00 | (este bloco) | Comprovante (`rc-logo`) e Central (`ad-brand`): o texto "Tickets Win" virou a logo de verdade | Print do comprovante 390/1280 (prévia com os mesmos estilos) | VALIDADO |
| 30/10 13:00 | (este bloco) | PDF do ingresso (`pdf.ts`): logo completa vetorial nas proporções da arte, isotipo `#EDFF3C` | PDF gerado e rasterizado (pdftoppm 300 dpi) | VALIDADO |
| 30/10 13:00 | (este bloco) | E-mails: `public/email/tickets-win.png` (411×78, 3× de 137×26), `tickets-win-branco.png` (411×78), `tickets-win-rodape.png` (1011×192, 3× de 337×64), `marca.png` (60×60), transparentes; `brand.ts` só nas 2 `<img>` (tamanho novo e `?v=2` para o cache do Gmail) | HTML de compra, código e campanha gerados localmente e abertos no Chromium 390/680 (imagens carregadas no tamanho certo) | VALIDADO |
| 30/10 13:00 | (este bloco) | Ícones: `src/app/icon.svg` (favicon), `src/app/apple-icon.png` (180, novo; o site não tinha ícone de tela de início), `src/app/favicon.ico` (16/32/48, novo; `/favicon.ico` dava 404); portaria `apple-touch-icon` 180, `icon-192`, `icon-512`, `icon-maskable-512` (isotipo novo + o mesmo "check" do ícone antigo, mesma posição relativa; maskable dentro da zona segura) | Cada arquivo conferido (tamanho em px, opaco/transparente, nitidez) | VALIDADO |
| 30/10 13:00 | (este bloco) | BIMI: `public/bimi/ticketswin.svg` (mesmo nome; SVG Tiny PS `version="1.2" baseProfile="tiny-ps"`, `<title>`, quadrado 512, sem script, fundo `#111111`, isotipo a 58%, como antes) e `ticketswin.png` 512 | Arquivo lido; renderizado | VALIDADO |
| 30/10 13:00 | (este bloco) | Carteira: Apple (`wallet/images.ts`: `icon` 29/58/87 opaco, `logo` 106×20/212×40/318×60 transparente com logotipo branco) e Google (`public/wallet/google-logo.png` 660×660, `google.ts` com `?v=2`) | Imagens do passe extraídas do `images.ts` e conferidas; teste `wallet-sign` passando | VALIDADO |

Gerador (Playwright/Chromium, sem dependência nova) e as variantes em SVG (completa escura/branca, logotipo escuro/branco, isotipo) ficaram fora do repositório, na pasta de trabalho da marca. Sem logo para trocar: tela "Preparando seus ingressos" (só o texto "Tickets Win · Ingresso"), `schema.ts`/`holds.ts`/`auth.ts` (a palavra "logo" ali é "logo depois"), logo do produtor nos e-mails (é a foto do produtor). O site não tem manifest próprio (só a portaria).

### Cor de destaque `#D3F55B` → `#EDFF3C`

Pedido do dono: o destaque do site inteiro passa a ser o lima da logo, `#EDFF3C` (houve um pedido intermediário de `#3CFF63`, cancelado; nada ficou em `#3CFF63`, conferido com `grep -ri 3cff63`). Tons derivados recalculados em OKLCH: o matiz acompanha o destaque (120,7° → 115,0°) e cada tom mantém a própria luminosidade (fundo claro continua claro, texto escuro continua com o mesmo contraste: `#3D5200` 8,73:1 → `#445000` 8,77:1 no branco); só os tons colados ao destaque (hover e variações) sobem junto com ele. Tons quase neutros (cinzas-gelo como `#F5F7EC`) e as artes prontas de evento (`art/banner.tsx`, `art/flyer.tsx`, `db/seed.ts`, lima `#CBFF3D`) ficaram como estavam: são conteúdo, não o destaque. `theme-color` do site (`#111111`) e da portaria (`#000000`) não usam o lima.

| Antes | Depois |
|---|---|
| `#D3F55B` | `#EDFF3C` |
| `#DCF568` | `#EDFF3C` |
| `#3D5200` | `#445000` |
| `#EEFBC4` | `#F8FFC2` |
| `#F2FBD6` | `#FAFED4` |
| `#2F4500` | `#364300` |
| `#7BC70A` | `#90C200` |
| `#2D6A00` | `#3E6700` |
| `#3E5A00` | `#465800` |
| `#E7F8D2` | `#F1FED2` |
| `#F1FAD2` | `#F9FED0` |
| `#E0FA82` | `#F4FF8F` |
| `#B9E23A` | `#CAE100` |
| `#C6E84A` | `#DAEB05` |
| `#2E3D00` | `#333B00` |
| `#E6FA84` | `#F9FF84` |
| `#F6FFD2` | `#FCFFDD` |
| `#D7F264` | `#F0FC4D` |
| `#F1FBD3` | `#F9FFD1` |
| `#B9DC3A` | `#C7D900` |
| `#F4FBD9` | `#FBFED7` |
| `#E0F2A0` | `#F3FB9C` |
| `#2C3A06` | `#313900` |
| `#4A6100` | `#525F00` |
| `#1D2704` | `#202600` |
| `#F2FBD2` | `#FAFED0` |
| `#EDF9D9` | `#F5FED9` |
| `#2D5A00` | `#395700` |
| `#E9F5C8` | `#F5FCC8` |
| `#4E5E1F` | `#545D0A` |
| `#C3E84A` | `#D6EB01` |
| `#7FB800` | `#90B400` |
| `#E4F3B8` | `#F3FBB7` |
| `#9BCB3C` | `#A8C800` |
| `#D5E8C4` | `#E3F3C9` |
| `#F3FBD6` | `#FAFED4` |
| `#7BC043` | `#86BF03` |
| `#F5FBE0` | `#FBFEDF` |
| `#3A4A10` | `#3F4900` |
| `#E6EFC4` | `#F4F8C7` |
| `#B9D94A` | `#C5D606` |
| `#7CC42B` | `#8DC000` |
| `#EEF8C6` | `#F9FDC4` |
| `#4A5A10` | `#505800` |
| `#4E9A1B` | `#609700` |
| `#E2FF7A` | `#F5FFAD` |
| `rgb(211,245,91)` | `rgb(237,255,60)` |
| `rgb(220,245,104)` | `rgb(237,255,60)` |
| `rgb(123,199,10)` | `rgb(144,194,0)` |
| `rgb(160,200,40)` | `rgb(173,196,0)` |
| `rgb(140,180,20)` | `rgb(153,176,0)` |
| `rgb(70,140,0)` | `rgb(89,136,0)` |
| `rgb(127,184,0)` | `rgb(144,180,0)` |
| `rgb(230,255,150)` | `rgb(246,255,188)` |
| `rgb(140,170,20)` | `rgb(152,166,0)` |

| Data/hora | Commit | O que | Validação | Status |
|---|---|---|---|---|
| 30/10 13:30 | 9508041 | CSS geral (globals `--color-acc`, base, componentes, rodapé, acessibilidade, lançamento, mapa 3D, animação de pagamento) | prints antes/depois | VALIDADO |
| 30/10 13:35 | 7021dc2 | CSS de todas as páginas | prints antes/depois | VALIDADO |
| 30/10 13:40 | c939c9a | Componentes/dados: paletas de setor/avatar/cartaz/artista, gráficos do painel, mapa 3D da landing, check do pagamento, foco do cartão | tsc/eslint; prints | VALIDADO |
| 30/10 13:45 | cb3318a | E-mails (`brand.ts`, estilo padrão e predefinições do editor, ícones de rede recoloridos), PDF (destaque = isotipo), carteira (rótulos do passe) | HTML de compra, código e campanha (com cupom) gerados e abertos no Chromium; PDF rasterizado; 33 testes unitários | VALIDADO |

**Contraste:** varredura no navegador (14 páginas públicas + folha de compra + prévia do painel/ingresso/comprovante, 390 e 1280) procurando texto, ícone ou borda fina no lima sobre fundo claro abaixo de 3:1. Achados só decorativos ou intencionais: os números grandes do "Top 5" da home (lima com contorno preto de 1,5 px, como antes) e o isotipo da logo no branco (mesmo tratamento da marca anterior, sem contorno). Lima sobre preto e texto preto sobre lima seguem iguais. O lima novo é mais claro (1,11:1 no branco contra 1,24:1 do antigo), então **não usar o lima como texto em fundo claro**: para isso há o tom escuro `#445000`.

**Prints:** antes/depois em Chromium, Firefox e WebKit, 390 e 1280: home, evento, folha de compra, login, portaria, banco, sobre, produtores, explorar, ajuda e a prévia (painel, ingresso, comprovante, fila). Checkout, criar evento e painel real exigem login (não tenho as credenciais de teste); conferidos pela prévia dos mesmos componentes e pela troca no CSS.
