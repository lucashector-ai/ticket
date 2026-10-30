# Auditoria de segurança e integridade (Romano)

Escopo: código do branch `claude/auditoria-noturna`, servidor local (porta 3042) com a cópia do banco (branch Neon de teste). Nada foi testado contra a produção. Login: só a conta de teste existente (nenhuma tentativa repetida de senha).

Status: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**.

## Resumo dos achados

| ID | Grav. | Área | Achado | Status | Commit |
|---|---|---|---|---|---|
| S-01 | P1 | Portaria / revenda / transferência | Código do ingresso não mudava na troca de dono: quem vendeu ou transferiu entrava ditando o código | VALIDADO (`tests/db/tickets.test.ts`, falha sem a correção) | f8306a2 |
| S-02 | P1 | Autorização (painel) | Qualquer conta logada criava produtor e convidava equipe; o convidado virava "produtor" sem aprovação | VALIDADO (`tests/db/painel.test.ts`, falha sem a correção) | ff46243 |
| S-03 | P1 | Integridade de pagamento | Excluir evento apagava pedidos com pagamento em andamento (Pix pago depois ficava sem pedido e sem estorno) | VALIDADO (integração) | 087a0c8 |
| S-04 | P2 | Financeiro | Dois saques simultâneos passavam juntos pela conferência do saldo | VALIDADO (`tests/db/payout.test.ts`, falha sem a correção) | 087a0c8 |
| S-05 | P3 | Central admin | Central não exigia e-mail confirmado (já exigia domínio e app autenticador) | VALIDADO (`tests/unit/admin-guard.test.ts`, rodada 2) | 087a0c8 |
| S-06 | P1 | Equipe / portaria | Membro removido da equipe mantinha o acesso pessoal de portaria (cookie de 30 dias) | VALIDADO (integração) | 371f032 |
| S-07 | P2 | Upload | `/api/midia` confiava no tipo informado pelo navegador e não tinha limite de envios | VALIDADO | c959201 |
| S-08 | P1 | Estoque / reserva | Pedido pendente ("reserva" de 15 min) não segurava estoque: vários pagavam o último ingresso e eram estornados | VALIDADO (integração + checkout e2e) | 163ea2a |
| S-09 | P1 | Limite por pessoa | Compra em grupo permite contornar o limite por pessoa (a mesma conta paga várias partes; vários grupos) | VALIDADO (D-01 aprovada; `tests/db/grupo.test.ts`, falha sem a correção) | 1c12a57, 67f9873 |
| S-10 | P2 | Financeiro | Trocar a conta de recebimento dos saques não pede o app autenticador (sessão roubada redireciona os próximos saques; o dono recebe e-mail) | VALIDADO (D-04 aprovada; `tests/db/payout-destination.test.ts` + Chromium) | 4cc67ad, 4a29bdf |
| S-11 | P2 | Segredos | HMAC do QR, cookie da portaria, banco e 2FA com valor padrão no código se a variável faltasse | VALIDADO | 675aac5 |
| S-12 | P2 | Checkout antigo | `createOrder` (ação chamável, sem uso) sem limite por CPF, fila nem pré-venda; `payOrder` com emissão própria; `cancelOrder` sem cancelar a cobrança | VALIDADO (`tests/db/checkout-legacy.test.ts`) | 7730368 |
| S-13 | P3 | Login | "Não encontramos uma conta com este e-mail" no login revelava contas | VALIDADO (1 tentativa com e-mail inexistente: "E-mail ou senha incorretos.") | ver fix-log |
| S-14 | P2 | Cupom | `checkCoupon` sem login e sem limite permitia descobrir códigos | VALIDADO (só cupom errado conta, 20/10 min por IP) | c23bfe6, dcf63b1 |
| S-15 | P1 | Dependências | jspdf 2.5.2 (2 críticos) e html-to-image sem uso; node-forge 1.3.1 | VALIDADO (audit 47 → 8) | bb0f74f, a59301a |
| S-16 | P1 | Integridade (editar evento) | Apagar tipo de ingresso citado em pedido estourava a chave estrangeira no meio da gravação (evento meio salvo, reenvio duplicava tipos) | VALIDADO (integração) | a5f57da |
| S-17 | P1 | Dependências | SDK do Neon Auth fixa better-auth 1.7.6 (avisos críticos de OAuth, código do servidor de login hospedado) | NÃO SE APLICA ao nosso Worker (evidência em D-06); pergunta ao Neon pendente | — |
| S-18 | P1 | Configuração | Sem `STRIPE_SECRET_KEY` o checkout entra sozinho no modo de teste e emite ingresso sem cobrança | MANTIDO por decisão do dono (D-07: modo de teste até o CNPJ da Stripe) | — |
| S-19 | P2 | Abuso de e-mail | "Me avise" (sem login) e transferências mandavam e-mail para qualquer endereço sem limite | VALIDADO (15 cadastros, 16º recusado) | ver fix-log |
| S-20 | P3 | Exposição de dados | Prévia OG servia a arte de evento em rascunho | VALIDADO (publicado 200, rascunho 404) | 9175056 |
| S-21 | P3 | Injeção em CSV | Exportações de compradores, participantes e lançamento sem neutralizar fórmulas | VALIDADO (teste + download) | ce0d18c |
| S-22 | P3 | Superfície de ataque | Assinador do QR exportado de arquivo "use server" (endpoint público); ação de check-in por link sem uso | VALIDADO (QR, PDF e testes) | c0c7d61 |
| S-23 | P3 | Abuso de e-mail | "Esqueci a senha"/ativação: um e-mail a cada 30 s para a mesma pessoa (~120/h) | VALIDADO (`tests/unit/password-throttle.test.ts`, login simulado; falha sem a correção) | 3271b9e |
| S-24 | P1 | Integridade (emissão) | Emissão em várias etapas sem transação: queda do Worker no meio deixava estoque baixado sem ingresso e a nova tentativa baixava de novo (reproduzido: estoque 3 com 1 ingresso) | VALIDADO (`tests/db/fulfill-atomic.test.ts`, falha sem a correção) | 1c12a57 |
| S-25 | P2 | Limite por pessoa | Mesmo CPF em contas diferentes (ou a mesma conta com dois pedidos) confirmando ao mesmo tempo passava do limite (reproduzido 3/3) | VALIDADO (`tests/db/fulfill-atomic.test.ts`, falha sem a correção) | 1c12a57 |
| S-26 | P3 | Dependências | fflate 0.8.2 (aviso moderado do `unzipSync`; usamos só `zipSync`/`zlibSync`) | VALIDADO (0.8.3) | ver fix-log |
| S-27 | P1 | Portaria (várias datas) | Ingresso de uma data entrava em outra data do mesmo evento e ficava "usado" (achado do Marcos) | VALIDADO (`tests/db/checkin-day.test.ts`, falha sem a correção; tela da portaria) | 5c4e43b |
| S-28 | P1 | Integridade (reembolso e saque) | Reembolso e saque em várias etapas sem transação: queda no meio deixava ingresso cancelado sem baixa nos totais (ou o contrário); dois reembolsos diferentes do mesmo pedido ao mesmo tempo chegavam os dois à Stripe | VALIDADO (`tests/db/refund-atomic.test.ts`, `tests/db/payout.test.ts`, falham sem a correção) | 9088be7 |
| S-29 | P2 | Estoque (abertura de vendas) | Com muitos pedidos ao mesmo tempo a reconferência depois de gravar recusava pedidos demais: sobrava lugar (50 por 30 → 21 reservas). Nunca vendeu acima | VALIDADO (`tests/db/stock-fair.test.ts` + carga) | 334f10d |
| S-30 | P2 | Navegador (XSS) | Sem CSP de scripts: um script injetado rodaria com a sessão da pessoa | CORRIGIDO em Report-Only, VALIDADO bloqueando nos 3 navegadores (ligar o bloqueio: D-10) | ver fix-log |
| S-31 | P2 | Cadastro de produtor | Conta com e-mail não confirmado enviava inscrição de produtor (achado do Marcos, rodada 2) | VALIDADO (`tests/db/activation.test.ts`) | c7f6a39 |

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

### S-24 · Emissão sem transação (P1) · rodada 2
- **Onde:** `src/lib/payments/fulfill.ts` (`fulfillOrder`, `fulfillResale`).
- **Reprodução:** `tests/db/fulfill-atomic.test.ts` força a gravação dos ingressos a falhar no meio (código repetido, como se o Worker caísse ali). Antes: estoque 3 com 1 ingresso; a nova tentativa (webhook depois de 2 min) baixava de novo.
- **Causa:** o driver `neon-http` não tem transação interativa; a emissão fazia baixa do estoque, ingressos, envios, cupom e pedido pago em comandos separados, com o "desfazer" só na memória.
- **Correção (estrutural):** tudo numa transação só (`db.batch`, que o Neon executa como transação): pedido pago (só se ainda não estiver, o que também impede emissão dupla), pré-venda, parte do grupo, baixa do estoque, ingressos (com id gerado antes, para os envios), envios, cupom. Conferências que dependem do que foi gravado (estoque + vagas de grupo, limite por pessoa, pré-venda, parte do grupo) são comandos `ensure` que abortam a transação inteira com um motivo (`TW_ABORT:<motivo>`), traduzido para a mensagem de antes. Falha de rede sem motivo: confere se o pedido ficou pago (a transação vale inteira ou nada) e solta a trava do pedido.
- **Validação:** 3 testes novos + os 9 de estoque, webhook, reembolso, revenda e checkout antigos; e2e do checkout no navegador (pedidos #48933–#48936).

### S-25 · Limite por CPF com confirmações simultâneas (P2) · rodada 2
- **Causa:** a conferência do limite na confirmação lia os pedidos pagos antes de gravar; duas confirmações ao mesmo tempo não viam uma à outra.
- **Correção:** trava por pessoa até o fim da transação (`pg_advisory_xact_lock` com chave da conta e do CPF, em ordem fixa) e conferência do limite dentro da transação, já contando o pedido atual. A mesma trava serializa as partes de grupo da mesma conta (D-01).

### S-27 · Portaria não conferia o dia em evento de várias datas (P1) · rodada 3
- **Reprodução:** evento `qa-marcos-festival-firefox-nao-comprar` (2 datas), pedido #50121 com ingressos de sábado; lidos na portaria antes do sábado → "Entrada liberada" e status `used`. Teste: `tests/db/checkin-day.test.ts` (ingresso de ontem entrava hoje).
- **Causa:** `checkinTicket` (`src/lib/checkin.ts`) conferia assinatura, evento e status; a data do ingresso fica na sessão do tipo (`ticket_types.session_id`) e não era lida.
- **Correção:** `src/lib/checkin-day.ts`: a portaria está sempre na última sessão que já abriu (portões, ou início, menos 2 h; antes da primeira, a primeira). Ingresso de outra sessão é recusado sem ser marcado: "Ingresso para sábado, 7/11: vale só nesse dia." (duas sessões no mesmo dia: "Ingresso para a sessão das 21h de sábado, 7/11: vale só nessa sessão."). Tipo sem sessão (evento de data única) segue igual.
- **Limite conhecido:** entre o fim de uma data e 2 h antes dos portões da seguinte (ex.: domingo de manhã), a portaria ainda está na data anterior. A contagem "X de Y entraram" soma todas as datas.

### S-28 · Reembolso e saque sem transação (P1) · rodada 3
- **Causa:** mesmo padrão da S-24: várias gravações em sequência (linha do reembolso, ingressos, lugares, totais do pedido; saque e saldo) sem transação, e o saldo do saque lido antes da gravação.
- **Correção:** `src/lib/payments/tx.ts` (lote numa transação, como a emissão); reembolso concluído num lote só, novo cálculo depois da trava e índice único parcial (um reembolso pendente por pedido; SQL no topo do `pending-decisions.md`); saque com trava por pessoa, conferência de que nada entrou desde o saldo e gravação na mesma transação.

### S-30 · CSP de scripts (P2) · rodada 3
- **Antes:** sem `Content-Security-Policy` de scripts (só os cabeçalhos de segurança básicos no `next.config.ts`).
- **Agora:** nonce por pedido + `'strict-dynamic'` (`src/lib/csp.ts`, `src/proxy.ts`), hash para o único script escrito na página, `object-src 'none'`, `base-uri`/`form-action`/`frame-ancestors 'self'`, terceiros por diretiva, avisos em `/api/csp-report` (log resumido, sem dado pessoal). Publicado em **Report-Only**; `CSP_MODE=enforce` liga o bloqueio. Evidência e recomendação em `pending-decisions.md` D-10.

### Outros pontos de atenção (não corrigidos, baixo risco)
- Fila virtual por cookie: um robô com muitos cookies aumenta a chance de ser liberado (normal em fila virtual; o limite por pessoa e a reserva continuam valendo).
- Transferência comum (não o envio da compra): quem tem o link do e-mail aceita com qualquer conta; o envio da compra exige a conta do e-mail. Avaliar exigir o mesmo e-mail também na transferência comum (decisão de produto).
- Página do artista é compartilhada: qualquer produtor com evento daquele artista edita a biografia e o Spotify (escolha de produto).
- Clique rastreado do e-mail (`/e/c/…`) redireciona para links escritos pelo produtor (aprovado); possível vetor de phishing a partir do domínio. Recomendação: mostrar aviso de saída para domínios externos.
- Alterar a quantidade de um lote no mesmo instante de uma venda pode deixar `sold > quantity` por um momento (sem venda acima: a baixa do estoque é condicional).
- CSP de scripts em Report-Only até a decisão D-10 (S-30); HTML de terceiros (banner da home, e-mail) roda em iframe com `sandbox`.
- Meia-entrada por dois caminhos (tipo Meia com cota + caixa na Inteira) contorna a cota do tipo Meia: regra comercial, D-09.
- LGPD: exclusão de conta e cópia dos dados são por pedido no formulário de contato (artigo de ajuda), sem fluxo automático; base legal do e-mail marketing em D-03.

## Verificado e sem problema (amostra do que foi lido)
- Emissão (`fulfillOrder`): trava por `paid_at`, baixa atômica com condição de estoque, desfaz em falha, estorno automático quando já cobrado; webhook com assinatura e deduplicação no KV. Testes de concorrência passam (10 pelos últimos 2, confirmação repetida 6×).
- Valor do pedido sempre recalculado no servidor (`priceOrder` em `placeOrder`); cupom, meia, taxa e parcelas conferidos no servidor.
- PDF/Wallet/ICS do ingresso: só o titular (`holderUserId`); página `/ingressos/[code]` idem; checkout `/checkout/[orderId]` só o dono do pedido.
- Check-in: QR assinado (HMAC) com comparação em tempo constante; ingresso de outro evento, usado, transferido, reembolsado e cancelado são recusados; leitura simultânea marca uma vez só (update condicional).
- Reembolsos do painel: escopo do evento conferido no servidor, pedido precisa ser do evento, freio de 40/min.
- Banco Tickets Win: app autenticador obrigatório, código não reaproveitável.
- E-mail "ver no navegador": HTML do produtor servido com CSP `sandbox` e `script-src 'none'`.
