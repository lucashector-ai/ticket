# Auditoria de segurança e integridade (Romano)

Escopo: código do branch `claude/auditoria-noturna`, servidor local (porta 3042) com a cópia do banco (branch Neon de teste). Nada foi testado contra a produção. Login: só a conta de teste existente (nenhuma tentativa repetida de senha).

Status: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**.

## Resumo dos achados

| ID | Grav. | Área | Achado | Status | Commit |
|---|---|---|---|---|---|
| S-01 | P1 | Portaria / revenda / transferência | Código do ingresso não mudava na troca de dono: quem vendeu ou transferiu entrava ditando o código | CORRIGIDO, NÃO VALIDADO (falta e2e com 2 contas) | f8306a2 |
| S-02 | P1 | Autorização (painel) | Qualquer conta logada criava produtor e convidava equipe; o convidado virava "produtor" sem aprovação | CORRIGIDO, NÃO VALIDADO | ff46243 |
| S-03 | P1 | Integridade de pagamento | Excluir evento apagava pedidos com pagamento em andamento (Pix pago depois ficava sem pedido e sem estorno) | CORRIGIDO, NÃO VALIDADO | 087a0c8 |
| S-04 | P2 | Financeiro | Dois saques simultâneos passavam juntos pela conferência do saldo | CORRIGIDO, NÃO VALIDADO | 087a0c8 |
| S-05 | P3 | Central admin | Central não exigia e-mail confirmado (já exigia domínio e app autenticador) | CORRIGIDO, NÃO VALIDADO | 087a0c8 |
| S-06 | P1 | Equipe / portaria | Membro removido da equipe mantinha o acesso pessoal de portaria (cookie de 30 dias) | CORRIGIDO, NÃO VALIDADO | 371f032 |
| S-07 | P2 | Upload | `/api/midia` confiava no tipo informado pelo navegador e não tinha limite de envios | VALIDADO | c959201 |
| S-08 | P1 | Estoque / reserva | Pedido pendente ("reserva" de 15 min) não segurava estoque: vários pagavam o último ingresso e eram estornados | CORRIGIDO, VALIDADO no banco (testes de integração) | 163ea2a |
| S-09 | P1 | Limite por pessoa | Compra em grupo permite contornar o limite por pessoa (a mesma conta paga várias partes; vários grupos) | ABERTO: decisão comercial (`pending-decisions.md` D-01) | — |
| S-10 | P2 | Financeiro | Trocar a conta de recebimento dos saques não pede o app autenticador (sessão roubada redireciona os próximos saques; o dono recebe e-mail) | ABERTO: decisão (D-04) | — |

## Detalhes

### S-01 · Código do ingresso sobrevivia à troca de dono (P1)
- **Onde:** `src/lib/actions/tickets.ts` (`acceptTransfer`), `src/lib/payments/fulfill.ts` (`fulfillResale`), check-in em `src/lib/checkin.ts`.
- **Reprodução (análise de código):** a portaria aceita o código digitado (`CODE_RE`, sem assinatura). Na transferência aceita e na revenda só o `secret` (assinatura do QR) era trocado; o `code` continuava. O vendedor tem o código no PDF, no e-mail e em Meus ingressos.
- **Impacto:** quem revendeu recebe o dinheiro e entra ditando o código ("o QR não lê"); o comprador é barrado com "Ingresso já utilizado".
- **Correção:** código novo (`ticketCode()` em `src/lib/tickets/code.ts`) na transferência aceita e na revenda. Links e passes antigos (PDF, Wallet) deixam de valer, que é o desejado.
- **Validação pendente:** e2e com duas contas (transferir, aceitar, tentar o código antigo na portaria → "Ingresso não encontrado").

### S-02 · Desvio da aprovação de produtor (P1)
- **Onde:** `src/lib/actions/painel.ts` (`scope("owner")`, `inviteMember`, `saveSettings`).
- **Causa:** `getPainelScope` devolve papel "owner" para qualquer conta sem equipe. `inviteMember` chamava `organizerFor` (cria o produtor) e gravava o convite; a segunda conta convidada, com e-mail confirmado, vira membro, e `isProducer` considera membro de equipe como produtor → `saveEvent` libera evento novo.
- **Correção:** ações de dono exigem `isProducer(user)`.

### S-03 · Excluir evento com pagamento em andamento (P1)
- **Onde:** `src/lib/actions/eventos.ts` (`deleteEvent`).
- **Causa:** só bloqueava com pedido pago/reembolsado; apagava pendentes (com Pix gerado ou cartão em 3D Secure). O webhook `payment_intent.succeeded` depois não acha o pedido (só registra no log): dinheiro recebido sem ingresso e sem estorno automático.
- **Correção:** recusa enquanto houver pedido pendente dentro da reserva (+5 min de margem) ou já travado para emissão.

### S-04 · Saque duplo simultâneo (P2)
- **Onde:** `src/lib/actions/banco.ts` (`requestPayout`). O driver `neon-http` não tem transação interativa.
- **Correção:** depois de gravar, recalcula o saldo com o saque contado; se ficou negativo, cancela o pedido de saque.

### S-06 · Ex-membro da equipe com portaria ativa (P1)
- **Onde:** `src/lib/actions/painel.ts` (`removeMember`), `src/app/painel/portaria/[id]/app/route.ts`.
- **Correção:** ao remover, revoga os acessos pessoais dele (criados por ele, rótulo = nome/e-mail, sem envio por e-mail).

### S-07 · Upload sem conferência de conteúdo (P2)
- **Correção:** `src/lib/image-sniff.ts` confere a assinatura dos bytes (JPG/PNG/WebP; GIF na central); 60 envios por conta por hora (KV).
- **Validação (servidor local, conta de teste):** PNG real → 200; HTML com nome `.png` e tipo `image/png` → 415; sem login → 401.

### S-08 · Reserva que não reservava (P1)
- **Onde:** `src/lib/holds.ts`, `src/lib/actions/compra.ts`, `src/lib/actions/grupo.ts`, `src/app/checkout/page.tsx`, `src/app/eventos/[slug]/page.tsx`.
- **Correção:** pedidos pendentes dentro da reserva contam como segurados (menos os da própria pessoa); reconferência `overbooked()` logo após gravar o pedido/grupo; quem já pagou tem prioridade na confirmação.
- **Validação:** `tests/db/stock.test.ts` (banco de teste).

## Verificado e sem problema (amostra do que foi lido)
- Emissão (`fulfillOrder`): trava por `paid_at`, baixa atômica com condição de estoque, desfaz em falha, estorno automático quando já cobrado; webhook com assinatura e deduplicação no KV. Testes de concorrência passam (10 pelos últimos 2, confirmação repetida 6×).
- Valor do pedido sempre recalculado no servidor (`priceOrder` em `placeOrder`); cupom, meia, taxa e parcelas conferidos no servidor.
- PDF/Wallet/ICS do ingresso: só o titular (`holderUserId`); página `/ingressos/[code]` idem; checkout `/checkout/[orderId]` só o dono do pedido.
- Check-in: QR assinado (HMAC) com comparação em tempo constante; ingresso de outro evento, usado, transferido, reembolsado e cancelado são recusados; leitura simultânea marca uma vez só (update condicional).
- Reembolsos do painel: escopo do evento conferido no servidor, pedido precisa ser do evento, freio de 40/min.
- Banco Tickets Win: app autenticador obrigatório, código não reaproveitável.
- E-mail "ver no navegador": HTML do produtor servido com CSP `sandbox` e `script-src 'none'`.
