# Correções de segurança (Agente 03, AppSec, fase 2)

Correções dos achados da fase 1 (`findings/red-team.md`, `financeiro.md`, `blue-team.md`, `bots.md`), no branch `claude/auditoria-noturna`, uma por commit. Cada uma tem teste de regressão que **falha sem a correção** (conferido revertendo só o código de produção e rodando o teste) e passa com ela. Status de todas: **CORRIGIDO, NÃO VALIDADO**: a validação independente é do Agente 06.

Nada foi configurado nem girado na produção. Nenhuma mudança de schema. Nenhuma taxa ou regra comercial mudou; os pontos que dependem de decisão estão em `findings/decisoes.md` (seção "Agente 03").

**Peça nova usada por várias correções: contador atômico de tentativas** (`src/lib/attempts.ts`). O KV da Cloudflare não serve de contador (eventualmente consistente, 1 escrita por segundo por chave, sem incremento atômico). Cada tentativa vira uma linha em `security_events` (tipo `try:<balde>`, fora do histórico que a pessoa vê) gravada numa transação com trava por balde (`pg_advisory_xact_lock`) e a contagem conferida na mesma transação: com N pedidos simultâneos passam exatamente `max`. Falha fechada (erro do banco recusa). Sem tabela nova. Poda: por balde depois de 1 dia e geral no cron (mais de 2 dias). Teste: `tests/db/attempts.test.ts` (30 simultâneos com máximo 6 → exatamente 6).

---

## SEC-100 · Modo de teste de pagamento sem trava (P1; P0 se a produção vende sem a chave)
- **Causa:** o modo de teste ("Já fiz o pagamento" emite ingresso válido sem cobrança) ligava sozinho pela ausência de `STRIPE_SECRET_KEY`, inclusive na produção.
- **Correção (proposta D-SEC-04-1, aplicada):** `testPaymentsAllowed()` em `src/lib/payments/stripe.ts` = sem `STRIPE_SECRET_KEY` **e** (`ALLOW_TEST_PAYMENTS=1` **ou** o site não é o de produção). "Site de produção" = build de produção (`NODE_ENV=production`) com `NEXT_PUBLIC_SITE_URL` em `ticketswin.com.br`/`www` (ou sem a variável, que cai na produção). O endereço vem da configuração, nunca do cabeçalho `Host` (um `*.workers.dev` não liga o modo de teste). Sem isso:
  - o checkout de evento pago mostra "Pagamento indisponível no momento. Tente de novo mais tarde." e o botão fica desligado (nunca aparece o nome do processador);
  - `placeOrder` não reserva pedido com valor (mesma mensagem);
  - `confirmPayment` e a página antiga `payOrder` recusam;
  - a retomada de pedido não gera Pix de teste.
  - Ingresso grátis (total zero) continua saindo na hora. `next dev`, os testes e qualquer ambiente com outro `NEXT_PUBLIC_SITE_URL` seguem no modo de teste como antes.
- **Comportamento na produção depois do deploy:** se a produção **não** tem `STRIPE_SECRET_KEY` e o dono **não** criar `ALLOW_TEST_PAYMENTS=1`, a venda de evento pago para (só grátis funciona) até a chave entrar. Para manter o comportamento atual (decisão D-07/D-SEC-04-1): variável `ALLOW_TEST_PAYMENTS=1` no Worker; apagar a variável desliga. Nada foi configurado.
- **Arquivos:** `src/lib/payments/stripe.ts`, `src/lib/actions/compra.ts`, `src/lib/actions/checkout.ts`, `src/lib/payments/pending.ts`, `src/app/checkout/page.tsx`, `src/app/checkout/[orderId]/page.tsx`, `src/components/compra/compra-flow.tsx`, `src/styles/pages/compra.css`.
- **Testes:** `tests/unit/test-payments.test.ts` (5: produção sem chave recusa, www/sem URL/URL inválida recusam, `ALLOW_TEST_PAYMENTS=1` libera e outro valor não, fora da produção libera, com chave nunca é teste); `tests/db/sec-test-payments.test.ts` (4; 2 falham sem a correção: pedido pago não reserva; pedido aberto não é confirmado por `confirmPayment` nem `payOrder`; controles: grátis sai, `ALLOW_TEST_PAYMENTS=1` volta ao teste).
- **Navegador:** a mensagem só aparece num build de produção sem a chave; no `next dev` (local) o modo de teste continua, como pedido. NÃO VERIFICADO no navegador (exigiria subir um build de produção local).
- **Commit:** `8979507`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-001 · Equipe vira produtora sem aprovação (P1)
- **Causa:** "é produtor" (`isProducer`, que conta equipe e convite pendente) era usado como "foi aprovado para ter produtora".
- **Correção:** `producerStatus` (`src/lib/producer-apply.ts`) separa `producer` (dona de produtora com cadastro concluído, ou produtor antigo que criou evento sem produtora ou numa produtora própria: `ownProducer`) de `team` (só equipe). A inscrição aprovada vem antes da equipe. `canOnboard` (aprovado ou produtor) libera `/produtores/cadastro` e `finishOnboarding`; `canCreateEvents` (produtor ou equipe) libera evento novo, que vai para a produtora ativa (a portaria segue barrada em `saveEventAs`). `saveEventAs` não cria produtora própria para quem só tem convite não aceito. A central mostra "Só equipe" e permite liberar.
- **Arquivos:** `src/lib/producer-apply.ts`, `src/lib/actions/onboarding.ts`, `src/lib/actions/criar.ts`, `src/lib/actions/inscricao.ts`, `src/lib/criar/save.ts`, `src/app/produtores/cadastro/page.tsx`, `src/app/criar-evento/page.tsx`, `src/lib/admin.ts`, `src/components/admin/actions.tsx`.
- **Testes:** `tests/db/sec-red-team.test.ts` › "SEC-001" (era `it.fails`, virou `it`) e "SEC-001 (controles)" (admin também recusado; convite não aceito não ganha produtora ao salvar evento; admin cria evento na produtora da dona; dona atualiza o cadastro; inscrição aprovada conclui). Ambos falham sem a correção.
- **Risco residual:** contas que já usaram o caminho na produção (produtoras com `onboarding` cuja dona não tem inscrição aprovada) precisam de conferência só de leitura com o dono (consulta na D-SEC-03-4).
- **Commit:** `9c8f713`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-301 · Tentativas de 2FA burláveis em paralelo (P1)
- **Causa:** contador no KV, "ler, comparar, gravar", incrementado depois da comparação.
- **Correção:** `checkCode` (código por e-mail: 5 por código) e `checkSecondFactor` (app: 6 a cada 5 min; vale para login, banco e saque) reservam a tentativa no contador atômico **antes** de comparar; acerto zera; código novo zera o balde do código; erro do contador recusa ("Não conseguimos conferir o código agora").
- **Arquivos:** `src/lib/attempts.ts` (novo), `src/lib/mfa.ts`, `src/lib/data/conta.ts` (histórico sem as linhas `try:`).
- **Testes:** `tests/unit/sec-limiters.test.ts` › os dois "SEC-301" (eram `it.fails`, viraram `it`; falham sem a correção); `tests/db/attempts.test.ts` (atomicidade no Postgres).
- **Risco residual:** o anti-reuso do mesmo código TOTP (`totp:last` no KV) continua não atômico (dois pedidos com o mesmo código certo no mesmo instante); o limite de tentativas já cobre o chute.
- **Commit:** `e5445fd`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-303 e SEC-006 · Proxy do Neon Auth (P1 / P3)
- **Causa:** lista de bloqueio; o resto ia ao Neon Auth sem Turnstile nem freio; o webhook mandava todo código/link.
- **Correção:** `/api/auth/*` com **lista de permissão** por caminho e método: `get-session` (GET), `token` (GET), `sign-out` (POST), `sign-in/social` (POST), `callback/*` (GET/POST), `email-otp/verify-email` (POST). Conferido fluxo a fluxo: login e cadastro por senha, "esqueci a senha", troca de senha e de e-mail, 2FA e Apple são ações de servidor que chamam o Neon Auth direto (não passam pelo proxy); o navegador só usa Google (`sign-in/social`), ativação (`verify-email`), Sair e sessão. O código de ativação tem freio próprio: 5 tentativas por e-mail em 15 min e 20 por IP em 10 min (contador atômico; 429 com mensagem, mostrada na tela de ativação). Webhook: no máximo 1 código/link a cada 10 s e 8 por hora por tipo e destinatário (acima disso responde 200 sem enviar e registra em `email_log` como `webhook-freio`); envio que falha libera o intervalo para a nova tentativa do Neon.
- **Arquivos:** `src/app/api/auth/[...path]/route.ts`, `src/app/api/webhooks/neon-auth/route.ts`, `src/lib/password-link.ts`, `src/components/auth/activate-form.tsx`.
- **Testes:** `tests/unit/sec-auth-proxy.test.ts` (5; 4 falham sem a correção): permitidas chegam ao handler simulado; 25 rotas de código/senha/link/conta/admin dão 403 sem chamá-lo; método trocado e caminho estranho recusados; ativação 5 por e-mail e 20 por IP; webhook manda 1 e-mail para 5 pedidos seguidos.
- **No servidor local:** `GET /api/auth/get-session` 200 e `POST /api/auth/sign-out` 200 (repassados), `email-otp/send-verification-otp`, `sign-in/magic-link`, `forget-password/email-otp` e `list-sessions` 403 sem chegar ao Neon Auth. Login real de ponta a ponta: NÃO TESTADO (a única tentativa com a conta de teste dos scripts antigos voltou "E-mail ou senha incorretos"; não repeti, por regra).
- **Pendente do dono:** conferir no console do Neon quais plugins estão ligados (link mágico) e os domínios confiáveis.
- **Commits:** `3ea2589`, `d2420e7`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-304 e SEC-010 · E-mail marketing e painel para qualquer conta (P1 / P3)
- **Causa:** `getPainelScope` dá papel "dono" a quem não tem produtora; as ações de e-mail não conferiam produtor nem e-mail confirmado; envio de teste sem limite.
- **Correção:** todas as ações de `src/lib/actions/emails.ts` exigem `isProducer` **e** e-mail confirmado; envio de teste: 5 por campanha por hora e 20 por conta por dia (contador atômico). `painelAccess` manda para `/criar-evento` quem não tem produtora nem evento. As telas de e-mail mandam confirmar o e-mail antes.
- **Interação com a D-08:** produtor antigo com e-mail **não** confirmado perde o e-mail marketing até confirmar (o resto do painel segue). Registrado na D-SEC-03-2.
- **Arquivos:** `src/lib/actions/emails.ts`, `src/lib/painel/access.ts`, `src/app/painel/emails/page.tsx`, `src/app/painel/emails/[id]/page.tsx`.
- **Testes:** `tests/db/sec-campaigns.test.ts` (3, todos falham sem a correção).
- **Commit:** `b92e206`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-305 · Reserva de estoque sem pagar (P1, parcial)
- **Correção aplicada (sem mudar regra comercial):** em `placeOrder` (compra normal), uma conta segura pedidos em até 3 eventos ao mesmo tempo, e um CPF segura um pedido em andamento por evento (outra conta com o mesmo CPF espera a reserva vencer ou ser paga). Refazer o pedido no mesmo evento continua igual.
- **Não aplicado (decisão do dono, D-SEC-03-1):** exigir e-mail confirmado para reservar (a D-08 diz que conta não ativada pode comprar), Turnstile no pedido grátis/fila, reserva do grupo de 60 para 20 min.
- **Arquivos:** `src/lib/actions/compra.ts`; testes ajustados para dar um CPF a cada pessoa fictícia (`tests/db/setup.ts` › `qaCpf`, `money-tamper`, `meia-quota`, `order-rate`).
- **Testes:** `tests/db/sec-holds.test.ts` (2, falham sem a correção).
- **Commit:** `7b0736b`. **Status:** CORRIGIDO, NÃO VALIDADO (parcial).

## SEC-300 · Login e cadastro sem limite próprio (P1, o que dá do nosso lado)
- **Correção:** `src/lib/login-guard.ts`. Login (`signInWithEmail`, `signInInline`): 5 tentativas por e-mail a cada 15 min, reservadas antes de chamar o Neon Auth (login certo zera; a mensagem de trava é a mesma com ou sem conta). Cadastro (`signUpWithEmail`, `signUpInline`): 20 por hora por IP, IPv6 contado pela /64 (`ipKey`). Trava acionada vai para o log (`{"k":"abuse",...}`) sem e-mail nem IP em claro. Turnstile continua na frente.
- **Risco residual:** quem conhece o e-mail de alguém trava o login dele por 15 min (resolvendo 5 Turnstiles); "Esqueci a senha" continua. Botnet com muitos IPs ainda cria contas. Pergunta ao Neon sobre o limite deles continua com o dono.
- **Testes:** `tests/unit/sec-login-throttle.test.ts` (4; 2 falham sem a correção).
- **Commit:** `0a0bcfa`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-003 · Ex-admin mantém os acessos da portaria (P2)
- **Correção:** ao remover um admin, ou rebaixá-lo a portaria, todos os acessos de portaria ligados dos eventos da produtora ganham token e código novos (`rotateCheckinLinks` em `src/lib/actions/painel.ts`). Aparelho já conectado continua (cookie com o id do acesso); acesso enviado por e-mail é reenviado com o link novo; os outros pegam o código novo na tela Equipe.
- **Testes:** `tests/db/sec-red-team.test.ts` › "SEC-003" (era `it.fails`, virou `it`; agora também confere que o aparelho conectado segue) e "SEC-003 (rebaixamento)". Falham sem a correção.
- **Risco residual:** aparelho que o próprio ex-admin já conectou continua (só desligar aquele acesso resolve).
- **Commit:** `708a8ce`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-004 · Trocar o 2FA sem o fator atual (P2)
- **Correção:** `startTotp` sempre prova o fator atual: com app, o código do app (como antes); com código por e-mail ou sem 2FA, manda um código ao e-mail da conta e só gera o QR com ele. A tela de segurança ganhou essa etapa ("confirme que é você").
- **Testes:** `tests/db/sec-red-team.test.ts` › "SEC-004" (virou `it`) e `tests/db/sec-totp-setup.test.ts` (com o código certo cadastra; errado não). Falham sem a correção.
- **Navegador:** NÃO VERIFICADO (exige login; ver SEC-303).
- **Risco residual:** sessões abertas não são encerradas ao trocar de fator.
- **Commit:** `458fad2`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-105 · Lote reduzido abaixo de vendidos + reservados (P2)
- **Correção:** `saveEventAs` recusa quantidade menor que vendidos + vagas seguradas agora (`heldByType`: compras nos 15 min da reserva e partes de grupo abertas), com a contagem na mensagem. Reserva vencida não segura nada.
- **Testes:** `tests/db/sec-lot-reduce.test.ts` (falha sem a correção).
- **Commit:** `26b74fc`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-302 · Limitador genérico não atômico e com falha aberta (P2)
- **Correção:** `allowHit`, `addHit` e `limitReached` (`src/lib/rate-limit.ts`) usam o contador atômico (janela deslizante) e falham fechado. O freio do cartão (10/h) e o do código da portaria (8 erros em 15 min) deixaram as cópias no KV. Continuam no KV (registrado como resíduo): contato, upload (`/api/midia`), busca do Google (`googleHits`).
- **Testes:** `tests/unit/sec-limiters.test.ts` › os dois "SEC-302" (viraram `it`) e `tests/db/attempts.test.ts` (30 simultâneos com máximo 12 → 12).
- **Commits:** `7acb6bb`, `7a0ef11` (poda). **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-307 (e parte do SEC-008) · Cupom no pedido (P2 / P3)
- **Correção:** `placeOrder` usa o freio da tela (20 erros por IP em 10 min) e mais um por conta (10 em 10 min); cupom de outro evento, vencido ou inexistente recebem a mesma resposta ("Cupom inválido ou expirado."); "esgotado" só para código que vale no evento.
- **Testes:** `tests/db/sec-coupon.test.ts` (2, falham sem a correção).
- **Ainda aberto do SEC-008:** criar cupom responde "esse código já existe" para código de outra produtora (unicidade global no banco). Exige mudança de schema: SQL na D-SEC-03-3.
- **Commit:** `98bb01c`. **Status:** CORRIGIDO, NÃO VALIDADO (SEC-307); SEC-008 parcial.

## SEC-308 e SEC-011 · IA e Google Places para qualquer conta (P2 / P3)
- **Correção:** `src/lib/ai-quota.ts`: descrição (30/dia por conta, 1000/dia na plataforma), mapa (20 e 300) e detalhes do Google (`pickPlace`, 100 e 3000) só para produtor com e-mail confirmado; cotas reservadas antes da chamada, no contador atômico (24 h corridas). Teto da plataforma registra no log.
- **Testes:** `tests/unit/sec-ai-quota.test.ts` (3, falham sem a correção: não produtor 403; 35 em paralelo → 30 chamadas; teto global).
- **Commit:** `a86a911`. **Status:** CORRIGIDO, NÃO VALIDADO. Os tetos são números iniciais: ajuste ao orçamento (D-SEC-03-5).

## SEC-309 · Troca de e-mail como oráculo (P2)
- **Correção:** `requestNewEmail` conta cada e-mail novo tentado (10 por dia por conta) e responde igual para e-mail livre e e-mail de outra conta (nenhum código sai para este; a confirmação já recusava).
- **Testes:** `tests/unit/sec-email-change.test.ts` (2, falham sem a correção).
- **Resíduo:** dentro dos 30 s entre envios, a resposta "Aguarde Xs" só aparece para e-mail livre (diferença limitada a 10 tentativas por dia).
- **Commit:** `d6ed990`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-009 e SEC-321 · Público do e-mail revela compras em outra produtora (P3)
- **Correção:** `resolveAudience` aceita em "excluir compradores de" só eventos da própria produtora.
- **Testes:** `tests/db/sec-audience.test.ts` (falha sem a correção).
- **Commit:** `87cc3f3`. **Status:** CORRIGIDO, NÃO VALIDADO.

## SEC-200 · Segredo mestre único (P1, parte de código)
- **Correção (opção a da D-SEC-02-1):** `src/lib/signing-secret.ts` vira um chaveiro por finalidade (`qr`, `portaria`, `banco`, `mfa`, `recovery`, `totp`).
  - **Sem variável nova: idêntico ao de hoje** (todas as finalidades usam o `NEON_AUTH_COOKIE_SECRET` como antes). Conferido em teste byte a byte para o QR e a cifra do app.
  - Com `TW_SIGNING_SECRET`: cada finalidade usa uma chave derivada por HKDF-SHA256 (`info = tickets-win:<finalidade>`). A conferência aceita também `TW_SIGNING_SECRET_OLD` e o segredo antigo: `TW_LEGACY_SECRET`, ou o `NEON_AUTH_COOKIE_SECRET` enquanto `TW_LEGACY_SECRET` não existir. Depois da troca do segredo do login, o valor antigo vale só para o que dura meses (QR, portaria, códigos de recuperação, cifra do app), não para banco nem 2FA da sessão.
  - O segredo do app autenticador cifrado com a chave antiga é recifrado com a nova no primeiro login.
  - Só `src/lib/auth/server.ts` (login) e o chaveiro leem `NEON_AUTH_COOKIE_SECRET` (teste).
- **Arquivos:** `src/lib/signing-secret.ts`, `src/lib/tickets/qr.ts` (`qrPayloadMatches`), `src/lib/checkin.ts`, `src/lib/portaria.ts`, `src/lib/bank.ts`, `src/lib/mfa.ts`.
- **Testes:** `tests/unit/signing-keys.test.ts` (5) e as suítes de portaria, ingresso, banco e 2FA rodadas também com `TW_SIGNING_SECRET` definido (12/12).
- **Plano de troca para o dono (nada foi girado):**
  1. Gerar um segredo novo (`openssl rand -base64 32`) e criar `TW_SIGNING_SECRET` no Worker. Publicar. Tudo continua funcionando; o que for assinado daqui em diante usa as chaves novas.
  2. Esperar alguns dias de uso (quem usa app autenticador e entra tem o segredo recifrado).
  3. Criar `TW_LEGACY_SECRET` com o valor **atual** do `NEON_AUTH_COOKIE_SECRET` e, na mesma publicação, trocar o `NEON_AUTH_COOKIE_SECRET` por um valor novo. Efeitos: o cache de sessão do login é refeito (sem perder a sessão), sessões do banco (30 min) e o cookie da segunda etapa pedem o código de novo; QR já enviados, app autenticador, códigos de recuperação e aparelhos da portaria continuam.
  4. Quando não houver mais evento futuro com ingresso emitido antes do passo 1 (e depois de pedir às contas com app autenticador que entrem uma vez, ou de gerar códigos de recuperação novos), apagar `TW_LEGACY_SECRET`. A partir daí o valor antigo não vale para mais nada.
  5. Para trocar o `TW_SIGNING_SECRET` no futuro: o valor atual vai para `TW_SIGNING_SECRET_OLD`, o novo para `TW_SIGNING_SECRET`; apagar o `_OLD` depois do mesmo prazo.
  - No desenvolvimento: segredos próprios (nunca os da produção), como pede a D-SEC-02-4.
- **Resíduos:** os rótulos de aparelho guardados no KV (Minha conta › Aparelhos) somem depois do passo 1 (cosmético). Códigos por e-mail emitidos nos 10 min antes do passo 3 precisam ser pedidos de novo.
- **Commit:** `52af1ba`. **Status:** CORRIGIDO, NÃO VALIDADO (código). A rotação é do dono.

---

## Não corrigidos (e por quê)

| Achado | Motivo |
|---|---|
| SEC-002 (Apple assume conta não confirmada) | Correção exige trocar a senha/encerrar sessões de conta existente via API administrativa do Neon Auth, que é a da produção e não pode ser exercitada; decisão de produto (recusar o vínculo ou neutralizar a credencial). Registrado na D-SEC-03-6 |
| SEC-005 (redefinir senha não encerra sessões) | Depende de `revokeSessions` do Neon Auth da produção; não testável aqui. Na D-SEC-03-6 |
| SEC-007 (convite aceito sozinho) | Precisa de tela de aceite e de mudar `getPainelScope` (fluxo de produto). Com o SEC-001 corrigido, o convite não dá mais produtora própria a ninguém; impacto restante é baixo |
| SEC-008 (criação de cupom revela código de outra produtora) | Exige trocar a unicidade de `coupons.code` por (evento, código): schema. SQL na D-SEC-03-3 |
| SEC-012 | Decisão do dono (instrução) |
| SEC-306 (fila) | Ligar a liberação à conta exige coluna nova; o prazo da liberação muda a regra "quem foi liberado continua passando" (decisão). D-SEC-03-1 |
| SEC-310 (IPv6 /64) | Parcial: o cadastro já conta IPv6 pela /64 (`ipKey`); os outros limites por IP seguem por endereço inteiro (CGNAT exige limites folgados; mudar todos sem medir pode punir compradores) |
| SEC-311 (confirmação dupla do "me avise") | Exige coluna `confirmed_at` em `event_signups` (schema) e mudança no fluxo de pré-venda (decisão) |
| SEC-312 (Turnstile falha aberta) | Recusar login na produção sem as chaves pode derrubar o login se elas não estiverem lá (NÃO TESTADO); o freio do SEC-300 já vale sem o Turnstile. Conferência do `hostname` fica para quando o dono confirmar as chaves (D-SEC-03-6) |
| SEC-313…319 (P3) | Custo/benefício menor; o limitador central (SEC-302) já serve a eles quando forem tratados |
| SEC-320 | Parcial: login, cadastro e teto de IA registram no log com `k: "abuse"`; alertas são do painel da Cloudflare (dono) |
| SEC-106…109, SEC-201…213 (menos SEC-200) | Decisão do dono ou território do Blue Team |
