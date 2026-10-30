# Auditoria de segurança e integridade (Romano)

Escopo: código do branch `claude/auditoria-noturna`, servidor local (porta 3042) com a cópia do banco (branch Neon de teste). Nada foi testado contra a produção. Login: só a conta de teste existente (nenhuma tentativa repetida de senha).

Status: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**.

## Resumo dos achados

| ID | Grav. | Área | Achado | Status | Commit |
|---|---|---|---|---|---|
| S-01 | P1 | Portaria / revenda / transferência | Código do ingresso não mudava na troca de dono: quem vendeu ou transferiu entrava ditando o código | VALIDADO (`tests/db/tickets.test.ts`, falha sem a correção) | f8306a2 |
| S-02 | P1 | Autorização (painel) | Qualquer conta logada criava produtor e convidava equipe; o convidado virava "produtor" sem aprovação | CORRIGIDO, NÃO VALIDADO | ff46243 |
| S-03 | P1 | Integridade de pagamento | Excluir evento apagava pedidos com pagamento em andamento (Pix pago depois ficava sem pedido e sem estorno) | CORRIGIDO, NÃO VALIDADO | 087a0c8 |
| S-04 | P2 | Financeiro | Dois saques simultâneos passavam juntos pela conferência do saldo | CORRIGIDO, NÃO VALIDADO | 087a0c8 |
| S-05 | P3 | Central admin | Central não exigia e-mail confirmado (já exigia domínio e app autenticador) | CORRIGIDO, NÃO VALIDADO | 087a0c8 |
| S-06 | P1 | Equipe / portaria | Membro removido da equipe mantinha o acesso pessoal de portaria (cookie de 30 dias) | CORRIGIDO, NÃO VALIDADO | 371f032 |
| S-07 | P2 | Upload | `/api/midia` confiava no tipo informado pelo navegador e não tinha limite de envios | VALIDADO | c959201 |
| S-08 | P1 | Estoque / reserva | Pedido pendente ("reserva" de 15 min) não segurava estoque: vários pagavam o último ingresso e eram estornados | VALIDADO (integração + checkout e2e) | 163ea2a |
| S-09 | P1 | Limite por pessoa | Compra em grupo permite contornar o limite por pessoa (a mesma conta paga várias partes; vários grupos) | ABERTO: decisão comercial (`pending-decisions.md` D-01) | — |
| S-10 | P2 | Financeiro | Trocar a conta de recebimento dos saques não pede o app autenticador (sessão roubada redireciona os próximos saques; o dono recebe e-mail) | ABERTO: decisão (D-04) | — |
| S-11 | P2 | Segredos | HMAC do QR, cookie da portaria, banco e 2FA com valor padrão no código se a variável faltasse | VALIDADO | 675aac5 |
| S-12 | P2 | Checkout antigo | `createOrder` (ação chamável, sem uso) sem limite por CPF, fila nem pré-venda; `payOrder` com emissão própria; `cancelOrder` sem cancelar a cobrança | CORRIGIDO, NÃO VALIDADO no navegador | 7730368 |
| S-13 | P3 | Login | "Não encontramos uma conta com este e-mail" no login revelava contas | CORRIGIDO, NÃO VALIDADO | ver fix-log |
| S-14 | P2 | Cupom | `checkCoupon` sem login e sem limite permitia descobrir códigos | VALIDADO | c23bfe6 |
| S-15 | P1 | Dependências | jspdf 2.5.2 (2 críticos) e html-to-image sem uso; node-forge 1.3.1 | VALIDADO (audit 47 → 8) | bb0f74f, a59301a |
| S-16 | P1 | Integridade (editar evento) | Apagar tipo de ingresso citado em pedido estourava a chave estrangeira no meio da gravação (evento meio salvo, reenvio duplicava tipos) | VALIDADO (integração) | a5f57da |
| S-17 | P1 | Dependências | SDK do Neon Auth fixa better-auth 1.7.6 (avisos críticos de OAuth, código do servidor de login hospedado) | ABERTO: decisão D-06 | — |
| S-18 | P1 | Configuração | Sem `STRIPE_SECRET_KEY` o checkout entra sozinho no modo de teste e emite ingresso sem cobrança | ABERTO: decisão D-07 | — |

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

### S-16 · Apagar tipo de ingresso com pedidos (P1)
- **Onde:** `src/lib/criar/save.ts`. `order_items`, `tickets`, `group_shares` e `resale_listings` apontam para `ticket_types` com `NO ACTION`.
- **Reprodução:** `tests/db/edit-types.test.ts` ("sem a limpeza, o apagar quebrava").
- **Correção:** `dropBlockers()` antes de qualquer escrita; itens de pedidos nunca pagos saem junto.

### Outros pontos de atenção (não corrigidos, baixo risco)
- Fila virtual por cookie: um robô com muitos cookies aumenta a chance de ser liberado (normal em fila virtual; o limite por pessoa e a reserva continuam valendo).
- Página do artista é compartilhada: qualquer produtor com evento daquele artista edita a biografia e o Spotify (escolha de produto).
- Clique rastreado do e-mail (`/e/c/…`) redireciona para links escritos pelo produtor (aprovado); possível vetor de phishing a partir do domínio. Recomendação: mostrar aviso de saída para domínios externos.
- Alterar a quantidade de um lote no mesmo instante de uma venda pode deixar `sold > quantity` por um momento (sem venda acima: a baixa do estoque é condicional).
- Sem CSP de scripts (documentado no `next.config.ts`); HTML de terceiros (banner da home, e-mail) roda em iframe com `sandbox`.
- LGPD: exclusão de conta e cópia dos dados são por pedido no formulário de contato (artigo de ajuda), sem fluxo automático; base legal do e-mail marketing em D-03.

## Verificado e sem problema (amostra do que foi lido)
- Emissão (`fulfillOrder`): trava por `paid_at`, baixa atômica com condição de estoque, desfaz em falha, estorno automático quando já cobrado; webhook com assinatura e deduplicação no KV. Testes de concorrência passam (10 pelos últimos 2, confirmação repetida 6×).
- Valor do pedido sempre recalculado no servidor (`priceOrder` em `placeOrder`); cupom, meia, taxa e parcelas conferidos no servidor.
- PDF/Wallet/ICS do ingresso: só o titular (`holderUserId`); página `/ingressos/[code]` idem; checkout `/checkout/[orderId]` só o dono do pedido.
- Check-in: QR assinado (HMAC) com comparação em tempo constante; ingresso de outro evento, usado, transferido, reembolsado e cancelado são recusados; leitura simultânea marca uma vez só (update condicional).
- Reembolsos do painel: escopo do evento conferido no servidor, pedido precisa ser do evento, freio de 40/min.
- Banco Tickets Win: app autenticador obrigatório, código não reaproveitável.
- E-mail "ver no navegador": HTML do produtor servido com CSP `sandbox` e `script-src 'none'`.
