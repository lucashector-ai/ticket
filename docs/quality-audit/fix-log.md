# Registro de correções e validações

Formato: data/hora · quem · commit · o que · como foi validado · status.

## Contas criadas na auditoria (apagar depois)
| Conta | Quem criou | Para quê |
|---|---|---|
| (nenhuma até agora; Romano usa só `teste+agente1030@example.com`, já existente) | | |

## Dados de teste no banco de teste
- Testes de integração criam eventos, produtores, perfis e cupons `qa-test-…` e apagam no fim (conferido no fechamento: 0 eventos, 0 produtores, 0 perfis restantes). Cupom `QAROMANO10` e 15 cadastros "me avise" `qa.romano.aviso*@example.com` usados na validação foram apagados.
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

### Dados de teste criados pelo Marcos (banco de teste)
- 2 eventos publicados "QA Marcos · Show de teste (não comprar)" (`/eventos/qa-marcos-show-de-teste-nao-comprar` e `…-2`), conta de teste existente, Casa Tangente, 7/11. Apagar depois.
- Compras de teste (Pix de teste, sem cobrança) na conta de teste: 6 pedidos de Aurora Ao Vivo (#48307, #48317–#48322) e pedidos pendentes/cancelados de Marea Festival (#48350, #48351).
- 1 acesso de portaria "Portão Principal Norte (QA Marcos)" criado e desligado (2×).
- Imagens enviadas ao R2 local (cartaz e banner de teste). Nenhuma conta nova criada.
