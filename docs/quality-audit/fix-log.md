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

### Dados de teste criados pelo Marcos (banco de teste)
- 2 eventos publicados "QA Marcos · Show de teste (não comprar)" (`/eventos/qa-marcos-show-de-teste-nao-comprar` e `…-2`), conta de teste existente, Casa Tangente, 7/11. Apagar depois.
- Compras de teste (Pix de teste, sem cobrança) na conta de teste: 6 pedidos de Aurora Ao Vivo (#48307, #48317–#48322) e pedidos pendentes/cancelados de Marea Festival (#48350, #48351).
- 1 acesso de portaria "Portão Principal Norte (QA Marcos)" criado e desligado (2×).
- Imagens enviadas ao R2 local (cartaz e banner de teste). Nenhuma conta nova criada.
- **Rodada 2:** evento publicado "QA Marcos · Só cartaz (não comprar)" (`/eventos/qa-marcos-so-cartaz-nao-comprar`, id f9454f65-…) da conta de teste, só com cartaz (imagem no R2 local). Pedidos Pix de teste na conta de teste: #49031 (TW-AFH9-QDXL, usado na portaria), #49034 (TW-QNLX-7J8K, usado na portaria), #49261 e #49262 (regressão 320/1280). Uma rodada do e2e da câmera do Romano (cria e usa ingressos no `qa-romano-checkout`).
- **Conta nova (rodada 2):** `teste+marcos-produtor@example.com` (login do Neon Auth, compartilhado com a produção; e-mail **não ativado**) com 1 inscrição de produtor "em análise" (São Paulo – SP, Show) no banco de teste. Apagar a conta e a inscrição depois.

## Marca

Troca da logo (arte nova do dono, `ticketswin-logo.svg` 1394 × 265). Paths usados sem alteração; isotipo no verde `#3CFF63` (pedido do dono: o mesmo verde do novo destaque do site; a arte original veio em `#EDFF3C`), logotipo em `currentColor` (escuro `#111` no claro, branco no escuro). Isotipo sem contorno no fundo claro, como a marca anterior. Altura de cada uso mantida: a arte nova tem a mesma proporção (5,26 × 5,31) e o mesmo peso de letra, então cabeçalho 24 px, rodapé 26 px e e-mail 26 px ficaram com o mesmo tamanho visual.

| Data/hora | Commit | O que | Validação | Status |
|---|---|---|---|---|
| 30/10 13:00 | (este bloco) | `src/components/brand-logo.tsx`: MARK/WORD novos, `BRAND_GREEN`, `BRAND_BOX` (recortes: completa `1 0 1394 265`, isotipo `0.5 0 265 265`, logotipo `320 39 1075 187`). Vale para todos os usos: cabeçalho, rodapé, login/cadastro, painel, portaria, banco, fila virtual, onboarding, criar evento, home, explorar, ingresso, sobre, parceiro, e/sair, landing de produtores | Prints antes/depois Chromium 390/1280 (home, evento, login, cadastro, portaria, banco, sobre, produtores, ajuda, painel, ingresso, comprovante, fila); Firefox e WebKit no cabeçalho e login; 320 px sem rolagem lateral | VALIDADO |
| 30/10 13:00 | (este bloco) | Comprovante (`rc-logo`) e Central (`ad-brand`): o texto "Tickets Win" virou a logo de verdade | Print do comprovante 390/1280 (prévia com os mesmos estilos) | VALIDADO |
| 30/10 13:00 | (este bloco) | PDF do ingresso (`pdf.ts`): logo completa vetorial nas proporções da arte, isotipo `#3CFF63` | PDF gerado e rasterizado (pdftoppm 300 dpi) | VALIDADO |
| 30/10 13:00 | (este bloco) | E-mails: `public/email/tickets-win.png` (411×78, 3× de 137×26), `tickets-win-branco.png` (411×78), `tickets-win-rodape.png` (1011×192, 3× de 337×64), `marca.png` (60×60), transparentes; `brand.ts` só nas 2 `<img>` (tamanho novo e `?v=2` para o cache do Gmail) | HTML de compra, código e campanha gerados localmente e abertos no Chromium 390/680 (imagens carregadas no tamanho certo) | VALIDADO |
| 30/10 13:00 | (este bloco) | Ícones: `src/app/icon.svg` (favicon), `src/app/apple-icon.png` (180, novo; o site não tinha ícone de tela de início), `src/app/favicon.ico` (16/32/48, novo; `/favicon.ico` dava 404); portaria `apple-touch-icon` 180, `icon-192`, `icon-512`, `icon-maskable-512` (isotipo novo + o mesmo "check" do ícone antigo, mesma posição relativa; maskable dentro da zona segura) | Cada arquivo conferido (tamanho em px, opaco/transparente, nitidez) | VALIDADO |
| 30/10 13:00 | (este bloco) | BIMI: `public/bimi/ticketswin.svg` (mesmo nome; SVG Tiny PS `version="1.2" baseProfile="tiny-ps"`, `<title>`, quadrado 512, sem script, fundo `#111111`, isotipo a 58%, como antes) e `ticketswin.png` 512 | Arquivo lido; renderizado | VALIDADO |
| 30/10 13:00 | (este bloco) | Carteira: Apple (`wallet/images.ts`: `icon` 29/58/87 opaco, `logo` 106×20/212×40/318×60 transparente com logotipo branco) e Google (`public/wallet/google-logo.png` 660×660, `google.ts` com `?v=2`) | Imagens do passe extraídas do `images.ts` e conferidas; teste `wallet-sign` passando | VALIDADO |

Gerador (Playwright/Chromium, sem dependência nova) e as variantes em SVG (completa escura/branca, logotipo escuro/branco, isotipo) ficaram fora do repositório, na pasta de trabalho da marca. Sem logo para trocar: tela "Preparando seus ingressos" (só o texto "Tickets Win · Ingresso"), `schema.ts`/`holds.ts`/`auth.ts` (a palavra "logo" ali é "logo depois"), logo do produtor nos e-mails (é a foto do produtor). O site não tem manifest próprio (só a portaria).
