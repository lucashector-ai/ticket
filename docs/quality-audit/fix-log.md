# Registro de correções e validações

Formato: data/hora · quem · commit · o que · como foi validado · status.

## Contas criadas na auditoria (apagar depois)
| Conta | Quem criou | Para quê |
|---|---|---|
| (nenhuma até agora; Romano usa só `teste+agente1030@example.com`, já existente) | | |

## Dados de teste no banco de teste
- Testes de integração criam eventos `qa-test-…` e apagam no fim (conferido: 0 restantes).
- 1 imagem PNG de 1×1 enviada ao R2 local na validação do upload (`/midia/eventos/e665d30ef5fa/mvugl1o4-…png`), só local.

## Romano

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 04:10 | c6b46d2 | Limite por pessoa: `roomFor` (mesma regra do servidor), `owned` por tipo na página do evento, `canInc`/`incBlock` no `use-tickets`; texto "por compra" no servidor; `feeShares` para a taxa por linha; vitest | 13 testes unitários (preço, cupom, meia, parcelas, taxa, limites); página do evento 200 | CORRIGIDO, NÃO VALIDADO no navegador (falta a parte visual do Marcos) |
| 30/10 04:20 | f8306a2 | Código do ingresso muda na transferência aceita e na revenda (S-01) | tsc/eslint | CORRIGIDO, NÃO VALIDADO |
| 30/10 04:20 | ff46243 | Equipe/configurações só para produtor aprovado (S-02) | tsc/eslint | CORRIGIDO, NÃO VALIDADO |
| 30/10 04:20 | 087a0c8 | Excluir evento com pagamento em andamento; saque duplo; central com e-mail confirmado (S-03, S-04, S-05) | tsc/eslint | CORRIGIDO, NÃO VALIDADO |
| 30/10 04:25 | 371f032 | Ex-membro perde o acesso pessoal de portaria (S-06) | tsc/eslint | CORRIGIDO, NÃO VALIDADO |
| 30/10 04:25 | c959201 | Upload confere bytes e limita 60/h (S-07) | Playwright no servidor local: 200 / 415 / 401 | VALIDADO |
| 30/10 04:30 | 163ea2a | Reserva de 15 min segura estoque; reconferência após gravar (S-08) | `tests/db/stock.test.ts` no banco de teste (9 cenários) | VALIDADO no banco; navegador NÃO TESTADO |

## Marcos

| Data/hora | Commit | Correção | Validação | Status |
|---|---|---|---|---|
| 30/10 04:35 | 3063bb8 | Escolha de ingressos: texto do limite por tipo e por compra, "+" bloqueado no limite, "Você já tem N", taxa por linha com `feeShares`, total com taxa no desktop, data sem ano no topo, "Comprar ingressos", reabrir com escolha espalhada (QA 1, 2, 3, 4, 6) | Playwright 320/360/390/1280 em `/eventos/aurora-ao-vivo` e `festa-da-putaria`, prints antes/depois | VALIDADO |
| 30/10 04:35 | 8ae2c2d | Aba de acessibilidade na borda até 1024px; `BrokenImages` esconde imagem que falha (QA 5, 11) | Playwright 390: aba fora do texto dos setores; imagens quebradas ficam invisíveis | VALIDADO |
| 30/10 04:50 | bdba77b | Lista de Estado/Cidade não passa da tela; /conta com Estado e Cidade sem corte (QA 7) | Playwright 320/390/768 + teste forçando a coluna estreita | VALIDADO |
| 30/10 04:50 | 554fb4c | Equipe: campos 42px, QR em coluna no celular, campos ≥200px no desktop, nome sem corte, "Desligar" com confirmação (QA 8, 9, 10) | Playwright 320/390/1280; criado e desligado 1 acesso de portaria de teste ("QA Marcos") | VALIDADO |
| 30/10 04:50 | cffe40f | Foco no primeiro campo com erro (QA 12); toast com largura certa | Playwright /cadastro e /entrar em 320/390/1280 | VALIDADO |
