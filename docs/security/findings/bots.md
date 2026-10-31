# Achados: defesa contra ataques automatizados (Agente 05, SEC-300 a SEC-399)

Fase 1, revisão defensiva do código no branch `claude/auditoria-noturna` (base `2865fda`). As linhas citadas são do commit base. Os arquivos que outros agentes estão alterando agora (`compra.ts`, `pagamento.ts`, `fulfill.ts`) podem ter as linhas deslocadas.

**O que não foi feito, por regra:** nenhuma repetição contra login, cadastro, recuperação de senha ou 2FA, nenhum teste de carga e nenhum pedido ao Neon Auth, ao Resend, à Anthropic, ao Spotify ou ao Turnstile. No servidor local houve um único `GET /entrar` (sem enviar o formulário), para ver se o widget do Turnstile aparecia: não aparece, porque o ambiente local não tem as chaves. Os limitadores foram testados com estado simulado em `tests/unit/sec-limiters.test.ts`.

**Status usados:** situação do achado (Hipótese, Confirmada, Bloqueada) + status do teste (**NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**). "Confirmada (código)" significa que a falha está no código lido, mas não foi executada contra o serviço real.

## Resumo

| ID | Sev. | Achado | Situação |
|---|---|---|---|
| SEC-300 | P1 | Login e cadastro sem limite próprio. O Neon Auth não recebe o IP de quem chama, e o Turnstile é a única barreira | CORRIGIDO, NÃO VALIDADO (freio próprio; Neon/Turnstile com o dono) (`0a0bcfa`) |
| SEC-301 | P1 | Tentativas do código de 2FA (e-mail, app autenticador, banco e saque) contadas com "ler e depois gravar" no KV: pedidos simultâneos passam dos 5 ou 6 palpites | CORRIGIDO, NÃO VALIDADO (`e5445fd`) |
| SEC-302 | P2 | O limitador genérico (`allowHit`) não é atômico e libera tudo quando o KV recusa a escrita | CORRIGIDO, NÃO VALIDADO (contato, upload e Google ainda no KV) (`7acb6bb`) |
| SEC-303 | P1 | O proxy `/api/auth/*` repassa ao Neon Auth rotas de envio e conferência de código que não estão bloqueadas. Isso contorna o Turnstile e o freio da S-23 | CORRIGIDO, NÃO VALIDADO (`3ea2589`) |
| SEC-304 | P1 | E-mail de teste de campanha: qualquer conta logada manda e-mail com conteúdo, remetente e resposta livres, sem limite, para o próprio e-mail, que pode não ter sido confirmado | CORRIGIDO, NÃO VALIDADO (`b92e206`) |
| SEC-305 | P1 | Estoque segurado sem pagar por contas descartáveis (15 min por pedido, 60 min por grupo). Evento grátis pode ser esgotado por robô | PARCIAL: CORRIGIDO, NÃO VALIDADO (por conta e CPF); resto é decisão (D-SEC-03-1) (`7b0736b`) |
| SEC-306 | P2 | Fila virtual: o cookie liberado vale para qualquer conta e para sempre, e `/api/fila` grava uma linha nova a cada pedido sem cookie | Confirmada (código) |
| SEC-307 | P2 | Cupom: o pedido (`placeOrder`) confere o código sem contar os erros, e as mensagens revelam que o cupom existe | CORRIGIDO, NÃO VALIDADO (`98bb01c`) |
| SEC-308 | P2 | IA (mapa e descrição): qualquer conta logada usa, com cota não atômica e sem teto global | CORRIGIDO, NÃO VALIDADO (`a86a911`) |
| SEC-309 | P2 | Troca de e-mail funciona como oráculo, sem limite, de quais e-mails têm conta | CORRIGIDO, NÃO VALIDADO (`d6ed990`) |
| SEC-310 | P2 | Chaves por IP: IPv6 contado por endereço inteiro (troca trivial) e CGNAT compartilhado | PARCIAL: cadastro conta IPv6 pela /64 (0a0bcfa); demais limites por IP sem mudança (`0a0bcfa`) |
| SEC-311 | P2 | "Me avise" e pré-venda aceitam e-mail de terceiros sem confirmação. Esses e-mails entram no público das campanhas e geram links de pré-venda | Confirmada (código) |
| SEC-312 | P2 | Turnstile: falha aberta sem chaves, não confere o domínio e não cobre recuperação de senha, ativação, "me avise", newsletter nem emissão grátis | Confirmada (código) · produção NÃO TESTADO |
| SEC-313 | P3 | Upload: qualquer conta logada envia 60 × 10 MB por hora, o corpo é lido inteiro antes do limite e os arquivos órfãos ficam públicos para sempre | Confirmada (código) |
| SEC-314 | P3 | Transferência e envio da compra servem de disparo de e-mail com nome livre | Confirmada (código) |
| SEC-315 | P3 | Banco: 5 senhas erradas travam o banco do dono e disparam e-mail de alerta, e a mensagem e o tempo revelam quem tem banco | Confirmada (código) |
| SEC-316 | P3 | Oráculo de código de ingresso em "cancelar meu ingresso" e "pedir reembolso" | Confirmada (código) |
| SEC-317 | P3 | Rotas públicas que gravam sem limite: `/r/<código>` (cliques), newsletter e `/api/csp-report` | Confirmada (código) |
| SEC-318 | P3 | Raspagem cara: `/explorar` lê todos os eventos a cada pedido, e prévia e arte geram imagem a cada chamada | Confirmada (código) |
| SEC-319 | P3 | Busca no Spotify sem limite por conta: uma conta esgota a cota do app para todos | Confirmada (código) |
| SEC-320 | P3 | Sem sinais de abuso: falhas de login, limitadores acionados e picos não são registrados nem alertados | PARCIAL: login, cadastro e teto de IA registram k:"abuse" no log; alertas com o dono (`0a0bcfa`) |
| SEC-321 | P3 | Contagem do público da campanha vira oráculo de sobreposição com compradores de outro produtor | CORRIGIDO, NÃO VALIDADO (`87cc3f3`) |

**Total:** 0 P0 · 5 P1 · 8 P2 · 9 P3 (22 achados). Nenhum P0: os dois caminhos mais graves dependem de a senha já ter vazado (SEC-301) ou de um comportamento do Neon Auth hospedado que não pôde ser verificado (SEC-303).

---

### SEC-300 · Login e cadastro sem limite próprio; Neon Auth não vê o IP de quem chama
- **Severidade:** P1
- **Status:** CORRIGIDO, NÃO VALIDADO (freio próprio; Neon/Turnstile com o dono) — AppSec, commit `0a0bcfa`, ver `docs/security/security-fixes.md`. Antes: Confirmada (análise de código) · NÃO TESTADO em execução (proibido: o login é o da produção). Se o Turnstile está ligado na produção: NÃO TESTADO (só o dono vê os secrets).
- **Componente:** autenticação (ações `signInWithEmail`, `signInInline`, `signUpWithEmail`, `signUpInline`)
- **Localização:** `src/lib/actions/auth.ts:46-55`, `:57-74`, `:104-111`, `:114-128`. SDK: `node_modules/@neondatabase/auth/dist/server-i57Km2d6.mjs:960-985` (chamada do servidor) e `:1142-1148` (`PROXY_HEADERS`).
- **Descrição:** a única barreira contra tentativas repetidas é o `verifyHuman` (Turnstile). Não há contador por e-mail, por conta nem por IP. Quem chama o Neon Auth é o nosso Worker, e o SDK só repassa `user-agent`, `authorization`, `referer`, `content-type` e `x-neon-client-info`, sem nenhum cabeçalho de IP (o próprio `mfa.ts:269` já observa que "o Neon Auth só vê o nosso servidor"). Qualquer limite por IP do Neon Auth (o better-auth tem um, por padrão) só pode fazer duas coisas: não proteger ninguém em particular, ou juntar todos os usuários no mesmo balde e travar o login de todo mundo quando um atacante o enche (**hipótese**, sem como confirmar sem falar com o Neon).
- **Impacto:** teste de senhas vazadas (credential stuffing) e criação de contas em massa ficam limitados só pelo custo de resolver o Turnstile, que existe como serviço pago de terceiros. Sem as chaves, o limite é zero (ver SEC-312). As contas criadas em massa alimentam a SEC-305 (estoque), a SEC-304 (e-mail), a SEC-308 (IA) e a SEC-313 (upload).
- **Causa-raiz:** a defesa foi delegada ao Turnstile e ao Neon Auth, sem um limitador nosso por identidade.
- **Evidência:** leitura do código e do SDK citados. Um `GET /entrar` local: o HTML não tem `cf-turnstile`, porque não há chaves no ambiente local (nomes conferidos, valores não lidos).
- **Correção (recomendada, fase 2):**
  1. Contar **só as falhas**, num contador atômico (Durable Object; ver SEC-301 e SEC-302), antes de chamar o Neon Auth:
     - por e-mail normalizado: 5 falhas em 15 min → resposta igual à de senha errada, sem chamar o Neon Auth, por 15 min; 20 falhas em 24 h → bloqueio de 1 h e e-mail de aviso ao dono da conta (no máximo 1 por dia);
     - por IP (IPv6 por /64, SEC-310): 30 falhas em 10 min → Turnstile obrigatório e espera de 10 min.
  2. Cadastro: por IP (/64) 5 por hora e 20 por dia; por domínio descartável conhecido, recusa.
  3. Login certo zera o contador do e-mail.
  4. A mesma função nas quatro ações (`auth.ts`) e no `bankLogin`.
  5. Perguntar ao Neon (junto com a S-17) se o limite deles é por IP e qual IP enxergam.
- **Teste de regressão:** a criar na fase 2: `tests/unit/sec-login-throttle.test.ts`, com o Neon Auth simulado, como em `password-throttle.test.ts`.
- **Validação:** pendente (Agente 06).
- **Risco residual:** o limite por e-mail permite travar a conta de outra pessoa por 15 min. Por isso a resposta é a mesma e o bloqueio é curto. Botnets com muitos IPs continuam passando pelo limite por IP, o que reforça a necessidade do limite por e-mail e das regras do WAF.
- **Arquivos modificados:** nenhum (fase 1).

### SEC-301 · Tentativas do código de 2FA burláveis com pedidos simultâneos
- **Severidade:** P1
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `e5445fd`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código) · VALIDADO em teste com KV simulado (`it.fails`, ver abaixo) · NÃO TESTADO contra o KV real
- **Componente:** verificação em duas etapas, banco e saque
- **Localização:**
  - `src/lib/mfa.ts:92-108` (`checkCode`: lê `n` e regrava `n+1` **depois** de comparar);
  - `src/lib/mfa.ts:236-262` (`checkSecondFactor`: lê `tries`, confere e só então grava `tries+1`);
  - usado por `verificacao.ts:39`, `conta.ts` (`authorizeEmailChange`, `confirmNewEmail`, `confirmEmailMfa`, `confirmMfaOff`), `banco.ts:75`, `:106`, `:120` e `:161` (saque).
- **Descrição:** os limites (5 palpites por código de e-mail; 6 por 5 min no app autenticador) são contadores no KV no padrão "ler, comparar, gravar". Pedidos simultâneos leem o mesmo valor e todos comparam o palpite. Pela documentação da Cloudflare, o KV é eventualmente consistente e aceita no máximo 1 escrita por segundo por chave. No `checkCode` e no `checkSecondFactor`, uma escrita recusada lança erro **depois** da comparação: o palpite já foi conferido e o contador não sobe.
- **Impacto:** quem já tem a senha (vazamento, phishing) chuta o código de 6 dígitos em paralelo:
  - por e-mail: o código vale 10 min e podem ser pedidos 8 por hora;
  - no app autenticador: 3 códigos valem a cada momento;
  - no banco, o mesmo vale para entrar e para **confirmar saque**.

  A segunda etapa existe justamente para o caso de a senha ter vazado.
- **Causa-raiz:** contador não atômico, incrementado depois da comparação, num armazenamento sem consistência forte.
- **Evidência:** `tests/unit/sec-limiters.test.ts`, com KV simulado e latência mínima. Rodando os testes `it.fails` como `it`:
  - "20 códigos errados ao mesmo tempo": `expected 20 to be less than or equal to 5`;
  - "30 tentativas simultâneas no app": `expected 30 to be less than or equal to 6`.

  Em sequência, os limites funcionam (testes verdes no mesmo arquivo).
- **Correção (recomendada, fase 2):**
  1. Contador **atômico e incrementado antes de comparar**: um Durable Object por conta (`MfaGuard`, id = userId) com `reserveAttempt(purpose)`, que devolve permitido ou bloqueado e já soma a tentativa; a comparação só acontece se permitido. O OpenNext já exporta Durable Objects no `custom-worker.js`, então há onde registrar.
  2. Limites: código de e-mail com 5 tentativas por código (como hoje) e 10 por hora por conta; app autenticador com 6 por 5 min (como hoje) e 20 por 24 h.
  3. Passou de 20 em 24 h: trava a segunda etapa por 1 h, registra em `security_events` e avisa por e-mail.
  4. Alternativa sem Durable Object: tabela no Postgres com `update ... set n = n + 1 where ... returning n` (atômico), antes da comparação.
  5. Em erro do armazenamento, **recusar** a tentativa (falha fechada).
- **Teste de regressão:** `tests/unit/sec-limiters.test.ts`, nos testes "SEC-301: 20 códigos errados enviados ao mesmo tempo não passam de 5 conferências" e "SEC-301: 30 tentativas simultâneas no app autenticador não passam de 6 conferências" (hoje `it.fails`; virar `it` com a correção).
- **Validação:** pendente.
- **Risco residual:** depende da senha. O e-mail de alerta (item 3) reduz a janela.
- **Arquivos modificados:** `tests/unit/sec-limiters.test.ts` (novo).

### SEC-302 · Limitador genérico não atômico e com falha aberta
- **Severidade:** P2
- **Status:** CORRIGIDO, NÃO VALIDADO (contato, upload e Google ainda no KV) — AppSec, commit `7acb6bb`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código) · VALIDADO em teste simulado (`it.fails`)
- **Componente:** `src/lib/rate-limit.ts` e as cópias locais do mesmo padrão
- **Localização:**
  - o limitador: `src/lib/rate-limit.ts:15-23` (`allowHit`), `:35-40` (`addHit`), com o `catch { /* sem KV: segue */ }` em `:21` e `:39`;
  - as cópias do padrão: `src/lib/actions/pagamento.ts:60-69` (cartão), `contato.ts:37-45`, `portaria.ts:25-33`, `criar.ts:49-53` (Places), `src/app/api/midia/route.ts:27-30`, `src/app/api/mapa/gerar/route.ts:57-80`, `src/app/api/criar/descricao/route.ts:39-42`.
- **Descrição:** os limitadores leem o contador e regravam `n+1`. Com pedidos simultâneos, todos leem o mesmo `n`. Quando o KV recusa a escrita (limite de 1 por segundo por chave), o `catch` do `allowHit` trata o erro como "sem KV" e **libera**. Além disso, o KV é por local: atacantes espalhados por vários pontos da Cloudflare podem ver contadores diferentes por até cerca de 60 s. O upload usa janela fixa por hora cheia (`toISOString().slice(0,13)`): 60 envios às 10:59 e mais 60 às 11:00.
- **Impacto:** os limites de pedidos por conta (12 em 10 min), transferências (20/h), cartão (10/h, freio de teste de cartão roubado), "me avise" (40/h), contato (5/h), portaria (8 em 15 min) e cotas de IA viram limites "por rajada". O impacto real de cada um vai de baixo a médio, e o de cartão é o mais sensível.
- **Causa-raiz:** KV usado como contador. O KV é feito para leitura frequente e escrita rara, sem incremento atômico.
- **Evidência:** `tests/unit/sec-limiters.test.ts`. Rodando os `it.fails` como `it`:
  - "30 pedidos simultâneos com máximo 12": `expected 30 to be less than or equal to 12`;
  - "KV recusando a escrita": `expected 20 to be less than or equal to 12`.
- **Correção (recomendada, fase 2):**
  1. Trocar a implementação de `allowHit`/`addHit`/`limitReached` (mantendo a assinatura) por um destes:
     - o binding de **Rate Limiting do Workers** (`ratelimits` no `wrangler.jsonc`, períodos de 10 ou 60 s; bom para os limites por IP, sem garantia exata entre locais);
     - um Durable Object `Counter` (exato; para conta e e-mail).
  2. Contador por janela deslizante ou balde de fichas, não por hora cheia.
  3. Em erro do armazenamento: falha **fechada** nas operações de risco (cartão, 2FA, login, cupom) e aberta só nas de conforto (busca, prévia).
  4. Trocar as cópias locais (`pagamento.ts`, `contato.ts`, `portaria.ts`, `midia`, `mapa`, `descricao`, `criar.ts`) pela função central.
- **Teste de regressão:** `tests/unit/sec-limiters.test.ts`, nos testes "SEC-302: 30 pedidos simultâneos com máximo 12 deixam passar no máximo 12" e "SEC-302: com o KV recusando a escrita… o limitador não libera tudo".
- **Validação:** pendente.
- **Risco residual:** o binding de Rate Limiting é por local e aproximado. Para 2FA e login por e-mail, use o Durable Object.
- **Arquivos modificados:** `tests/unit/sec-limiters.test.ts` (novo).

### SEC-303 · Proxy `/api/auth/*` repassa rotas de código e de "entrar sem senha" ao Neon Auth
- **Severidade:** P1
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `3ea2589`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código), quanto às rotas que passam pelo nosso proxy. Hipótese, quanto ao que o Neon Auth hospedado faz com elas: NÃO TESTADO, porque mandar pedido ao login real é proibido.
- **Componente:** proxy do login e webhook do Neon Auth
- **Localização:** `src/app/api/auth/[...path]/route.ts:13` (`BLOCKED`), `:23-34` (`guard`). `src/app/api/webhooks/neon-auth/route.ts:44-50` (manda todo `send.otp` e `send.magic_link`). Freio da S-23 só nas ações: `src/lib/actions/senha.ts:15`, `src/lib/actions/auth.ts:151`.
- **Descrição:**
  - **A lista de bloqueio do proxy é parcial.** Bloqueia só `sign-in/email`, `sign-up/email`, `sign-in/email-otp` e as de troca de e-mail. O navegador usa apenas `get-session`, `sign-out`, `sign-in/social`, `callback/*` e `email-otp/verify-email`; o resto chega ao Neon Auth sem o nosso freio:
    - `email-otp/send-verification-otp` (tipos `forget-password`, `email-verification` e `sign-in`);
    - `forget-password/email-otp`;
    - `email-otp/request-password-reset`;
    - `email-otp/reset-password`;
    - `email-otp/check-verification-otp`;
    - `sign-in/magic-link` (o webhook já trata `send.magic_link`);
    - `request-password-reset` e `reset-password`;
    - `send-verification-email`.
  - **O webhook manda o e-mail sem conferir nada.** Cada código ou link que o Neon Auth gera vira e-mail (`mailAuthCode`/`mailAuthLink`) sem freio por destinatário.
  - **O código pode ser chutado direto.** A rota `email-otp/reset-password` aceita `{email, otp, password}`. No better-auth, que o SDK usa, o padrão é 3 tentativas por código (`better-auth/dist/plugins/email-otp/routes.mjs:247`) e 3 envios por minuto **por IP** (`index.mjs:75-103`). O IP que o Neon Auth enxerga é o do Worker, como mostra a SEC-300.
- **Impacto:**
  1. **E-mail em massa.** Esses envios contornam o freio da S-23 (30 s e 6 por hora por e-mail) e o Turnstile, enchendo a caixa de qualquer pessoa com e-mails da Tickets Win e gastando a reputação do domínio.
  2. **Tomada de conta por chute do código.** É uma **hipótese**: depende do limite real do Neon Auth. Cada ciclo é pedir um código e dar 3 palpites, cerca de 3 em 1.000.000 de chance. Sem um limite deles por conta, 1.000 ciclos dão cerca de 0,3% por conta-alvo, o que é barulhento (1.000 e-mails para a vítima) mas automatizável em muitas contas.
  3. **Login sem Turnstile por link mágico**, se o plugin estiver ligado.
- **Causa-raiz:** o proxy usa lista de bloqueio em vez de lista de permissão, e o freio de envio ficou só nas nossas ações, não no webhook.
- **Evidência:** a lista em `route.ts:13`; os chamadores do navegador em `src/components/auth/activate-form.tsx:45`, `google-button.tsx:18` e `compra/inline-auth.tsx:42`; os padrões do better-auth no `node_modules` citado. Nenhuma chamada foi feita.
- **Correção (recomendada, fase 2):**
  1. **Lista de permissão** no `guard`. Liberadas só:
     - `get-session` e `sign-out`;
     - `sign-in/social` e `callback/*`;
     - `email-otp/verify-email`;
     - `token`, se o SDK usar;
     - as de `NEEDS_MFA` que a interface de fato chama pelo navegador (hoje nenhuma: as ações usam `auth.*` no servidor).

     Todo o resto recebe 403 "Use o formulário do site.".
  2. `email-otp/verify-email`: limite nosso de 5 tentativas por e-mail em 15 min e 20 por IP (/64) em 10 min, contador atômico.
  3. No webhook, segunda barreira antes de `mailAuthCode`/`mailAuthLink`, para os tipos `forget-password`, `email-verification` e `magic_link`: reutilizar `linkThrottled(\`wh:${tipo}:${email}\`)` (30 s e 6 por hora). Passou do limite: responde 200 sem enviar e registra. O `sign-in` do Apple continua passando pelo `catchAppleOtp`.
  4. Perguntar ao Neon quais plugins estão ligados (link mágico, email-otp) e desligar os que não usamos.
- **Teste de regressão:** a criar: `tests/unit/sec-auth-proxy.test.ts`. Chama `GET/POST` do `route.ts` com `params.path` de cada rota da lista acima e espera 403, com o handler do Neon simulado e nunca chamado; as permitidas chamam o handler simulado.
- **Validação:** pendente.
- **Risco residual:** o limite de tentativas do Neon Auth continua desconhecido. A rota `verify-email` segue exposta (necessária), por isso o item 2.
- **Arquivos modificados:** nenhum.

### SEC-304 · E-mail de teste de campanha como disparo de phishing pelo domínio
- **Severidade:** P1
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `b92e206`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código) · NÃO TESTADO em execução (enviaria e-mail real pelo Resend)
- **Componente:** e-mail marketing do produtor
- **Localização:**
  - `src/lib/actions/emails.ts:23-29` (`scope`: aceita qualquer sessão, menos portaria);
  - `src/lib/data/painel.ts:42` (conta sem produtora recebe papel `"owner"`);
  - `emails.ts:40-55` (`createCampaign`; os modelos `agenda`, `parceiro` e `branco` não pedem evento, em `src/lib/mail/templates.ts:12-14`);
  - `emails.ts:93-115` (`fromName` e `replyTo` livres) e `:118-125` (`saveDesign`);
  - `emails.ts:135-144` (`sendTest`, sem limite);
  - `src/lib/mail/send.ts:81-88`.
- **Descrição:** uma conta recém-criada, que não é produtora e não confirmou o e-mail, pode:
  1. criar uma campanha "Em branco";
  2. escrever título, texto e botão com link;
  3. escolher o nome do remetente e o e-mail de resposta;
  4. chamar `sendTest` quantas vezes quiser.

  O e-mail sai pelo Resend com o domínio da Tickets Win para `sc.user.email`. Como o cadastro por senha não exige confirmar o e-mail para ter sessão, esse endereço pode ser **de outra pessoa**.
- **Impacto:** relé de phishing e spam com a marca e a assinatura de domínio da Tickets Win (remetente "Banco X" ou "Suporte", link para fora), uma conta por vítima e envios ilimitados por conta. Isso derruba a reputação do domínio, e os e-mails de ingresso e código passam a cair no spam.
- **Causa-raiz:** as ações de e-mail usam `getPainelScope` (que dá "owner" a qualquer conta) em vez de `isProducer` mais e-mail confirmado. O envio de teste não tem limite.
- **Evidência:** leitura do código citado. O caminho até o envio não confere produtora, e-mail confirmado nem contagem.
- **Correção (recomendada, fase 2):**
  1. Em `scope()` de `emails.ts`, exigir `isProducer(user)` e `emailConfirmed(user)`; sem isso, "Sem permissão.". Vale para todas as ações do arquivo.
  2. `sendTest`: 5 por campanha por hora e 20 por conta por dia (contador atômico); registrar `testSentAt` já existe.
  3. Na campanha com `org` nulo, `fromName` fica fixo como "Tickets Win".
  4. Avaliar o mesmo `scope` em `src/lib/actions/lista.ts` (convites de lista); hoje ele já exige evento próprio.
- **Teste de regressão:** a criar: `tests/unit/sec-campaign-scope.test.ts` (sessão simulada sem produtora → `sendTest` e `createCampaign` recusados; produtora → 6º teste na hora recusado).
- **Validação:** pendente.
- **Risco residual:** um produtor aprovado ainda escreve o conteúdo que quiser para o próprio público. Isso é decisão de produto, com descadastro e aprovação de produtor como controles.
- **Arquivos modificados:** nenhum.

### SEC-305 · Estoque segurado sem pagar por contas descartáveis; evento grátis esgotável
- **Severidade:** P1 (em lançamento disputado)
- **Status:** PARCIAL: CORRIGIDO, NÃO VALIDADO (por conta e CPF); resto é decisão (D-SEC-03-1) — AppSec, commit `7b0736b`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código) · NÃO TESTADO em execução (exigiria muitas contas no Neon Auth)
- **Componente:** checkout, reservas e grupo
- **Localização:**
  - `src/lib/actions/compra.ts:122-124` (só exige sessão), `:200` (12 pedidos em 10 min por conta), `:202` (um pedido aberto por evento por conta, `releaseOthers`), `:225` (reserva de 15 min);
  - `src/lib/actions/grupo.ts:17` (grupo segura por 60 min);
  - `src/lib/cpf.ts` (só o dígito verificador);
  - mudança do Agente 04 em andamento: `src/lib/payments/coupon.ts`, onde o pedido pendente passa a segurar um uso do cupom.
- **Descrição:** cada conta segura até o máximo por compra (por exemplo, 8) de cada evento por 15 min, pode refazer o pedido ao fim da reserva e ainda segura um grupo por 60 min. Montar o pedido não exige e-mail confirmado, e o CPF só precisa passar no dígito verificador (gerável). Contas custam um Turnstile (SEC-300; nada, se o Turnstile estiver desligado). No evento **grátis**, o pedido "free" emite na hora: o limite por pessoa (conta + CPF) é a única barreira. Com o cupom limitado (Agente 04), cada pedido pendente também segura um uso.
- **Impacto:** em abertura de vendas disputada, N contas robô deixam o evento "esgotado" para quem quer comprar, sem pagar nada, e liberam para cambistas quando quiserem. No evento grátis, os ingressos acabam nas mãos do robô. Nunca há venda acima da capacidade.
- **Causa-raiz:** o custo de uma identidade (conta + CPF) é quase zero, e a reserva é longa e renovável.
- **Evidência:** leitura do código. Combinação com a SEC-306 (fila) e a SEC-300 (contas).
- **Correção (recomendada, fase 2):**
  1. Exigir **e-mail confirmado** para criar pedido e grupo (`emailConfirmed` já existe em `src/lib/auth/verified.ts`). A tela já tem o fluxo de ativação.
  2. Turnstile (modo invisível) na criação do pedido quando a fila do evento está ativa ou quando o pedido é grátis.
  3. Por conta, no máximo 2 eventos com pedido pendente ao mesmo tempo; por CPF, no máximo 1 pedido pendente por evento (hoje é por conta).
  4. Pedido expirado sem pagar: depois de 3 expirações na mesma conta e no mesmo evento em 2 h, espera de 30 min para reservar de novo nesse evento.
  5. Grupo: reduzir a reserva de 60 para 20 min, ou segurar as vagas só depois que a primeira parte for paga (decisão de produto, com o Agente 04).
- **Teste de regressão:** a criar (fase 2, banco de teste): `tests/db/sec-holds.test.ts`, com conta sem e-mail confirmado recusada, 4ª expiração esperando e 2º pedido pendente do mesmo CPF recusado.
- **Validação:** pendente.
- **Risco residual:** contas com e-mail confirmado de verdade (domínio próprio com caixa geral) continuam possíveis. Daí os limites por CPF e a fila ligada à conta (SEC-306).
- **Arquivos modificados:** nenhum.

### SEC-306 · Fila virtual: cookie liberado reaproveitável e entrada sem limite
- **Severidade:** P2
- **Status:** Confirmada (código)
- **Componente:** fila virtual
- **Localização:** `src/lib/queue.ts:70-80` (`queueAllows`: basta existir uma linha com `admitted_at`, sem prazo nem conta), `:18` (`SLOT_MS` não é conferido na compra), `src/app/api/fila/[eventId]/route.ts:9-21` (sem cookie, cria um `tw_vid` novo e insere uma linha a cada pedido).
- **Descrição:**
  - **O cookie liberado vale sem dono e sem prazo.** O `tw_vid` liberado não tem dono: copiado para mil sessões, mil contas compram sem passar pela fila. A liberação também vale para sempre (o `SLOT_MS` só tira a pessoa da contagem de ativos).
  - **A entrada não tem limite.** `/api/fila` não exige nada e grava uma linha nova sempre que vem sem cookie. Robôs inflam a fila, fazem o modo "auto" ligar para todo mundo e ficam nos primeiros lugares.
  - **A entrada consulta o banco a cada sinal.** São 4 a 5 consultas por chamada (a cada 15 s por visitante).
- **Impacto:** a fila deixa de ser justa justamente no lançamento disputado, a carga no banco cresce e a contagem fica distorcida para o produtor. A capacidade continua respeitada.
- **Causa-raiz:** a identidade da fila é um cookie anônimo, sem vínculo com a conta e sem limite de criação.
- **Correção (recomendada, fase 2):**
  1. Na compra (`queueAllows`), conferir também `admitted_at > now() - SLOT_MS`.
  2. Gravar `user_id` na linha da fila no primeiro uso para comprar (`placeOrder`/`createGroup`). Se o `tw_vid` já tiver outro `user_id`, recusar ("Este acesso da fila é de outra conta.").
  3. Na `/api/fila`, limitar a 1 cookie novo por IP (/64) a cada 10 s e a 20 por hora (`allowHit` atômico), no máximo 1 sinal a cada 10 s por cookie e, com a fila em modo "on", Turnstile invisível na primeira entrada.
  4. Regra de WAF (ver `bot-defense.md`): 60 por minuto por IP em `/api/fila/*`.
- **Teste de regressão:** a criar: `tests/db/sec-queue.test.ts` (cookie liberado para a conta A recusado para a conta B; liberação expirada recusada).
- **Validação:** pendente.
- **Risco residual:** quem tem muitos IPs ainda entra várias vezes na fila. A fila ligada à conta, mais o limite por pessoa, limitam o ganho.
- **Arquivos modificados:** nenhum.

### SEC-307 · Cupom: o pedido confere o código sem contar erros; mensagens revelam o cupom
- **Severidade:** P2
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `98bb01c`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código)
- **Componente:** cupom
- **Localização:** `src/lib/actions/compra.ts:187-191` (`findCoupon` no `placeOrder`, sem `addHit`), `:200` (o limite de pedidos só conta depois do cupom), `:68-74` (mensagens "Cupom expirado.", "Cupom esgotado." e "Cupom não vale para este evento."), `:85-93` (`checkCoupon`: 20 erros em 10 min **por IP**).
- **Descrição:**
  - **O pedido testa cupons sem gastar cota.** A conferência da tela (`checkCoupon`) conta os erros por IP. O `placeOrder` aceita `coupon` e recusa com "Cupom inválido ou expirado." sem contar nada, e o limite de 12 pedidos só é gasto depois. Uma conta logada testa códigos sem limite.
  - **As mensagens confirmam que o código existe.** As mensagens diferentes confirmam que o código existe (expirado, esgotado ou de outro evento). Códigos escritos pelo produtor ("VIP10", "PROMO50") caem em dicionário.
- **Impacto:** vazamento de cupons de desconto (inclusive de 100%) e de cupons de outros eventos.
- **Causa-raiz:** o freio ficou só na rota da tela, e as mensagens foram feitas para ajudar o comprador.
- **Correção (recomendada, fase 2):**
  1. No `placeOrder`, cupom não encontrado conta no mesmo freio: `addHit(\`cupom:${ip}\`)` e também `cupom:u:${user.id}` (10 erros em 10 min por conta, falha fechada), antes de qualquer outra coisa.
  2. Para quem não tem o código certo, uma mensagem só ("Cupom inválido ou expirado.") nos casos "de outro evento" e "expirado há mais de 7 dias". "Esgotado" pode continuar, porque só aparece para quem já tem o código.
  3. Chave por IP com IPv6 por /64 (SEC-310).
  4. Recomendação ao produto: sugerir código aleatório (6+ caracteres) no painel.
- **Teste de regressão:** a criar: `tests/unit/sec-coupon.test.ts`, com `db` simulado: 11 cupons errados pelo `placeOrder` → o 11º é recusado pelo freio.
- **Validação:** pendente.
- **Risco residual:** nenhum relevante com códigos aleatórios.
- **Arquivos modificados:** nenhum.

### SEC-308 · IA (mapa e descrição): qualquer conta, cota não atômica, sem teto global
- **Severidade:** P2
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `a86a911`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código)
- **Componente:** `/api/mapa/gerar`, `/api/criar/descricao`
- **Localização:** `src/app/api/mapa/gerar/route.ts:46-47` (só sessão), `:56-59` e `:80` (cota lida no início e gravada só depois de baixar e codificar a imagem), `:85-86` (modelo mais caro, `max_tokens: 16000`); `src/app/api/criar/descricao/route.ts:33-34` e `:39-42`.
- **Descrição:**
  - **Qualquer conta usa.** Qualquer conta logada (não precisa ser produtora nem ter o e-mail confirmado) usa as duas rotas.
  - **A cota é burlável.** É de 20 mapas e 30 textos por dia por conta, no KV, com leitura e gravação separadas. No mapa, a gravação vem depois da leitura do arquivo no R2, o que alarga a janela de pedidos simultâneos (SEC-302).
  - **Não há teto diário global.** Contas descartáveis (SEC-300) multiplicam a conta.
  - **Injeção de instruções: risco baixo.** A saída é estruturada (schema do Zod, `normalizePlan`), a IA não tem ferramentas, o resultado volta só para quem pediu e o texto passa pelo produtor antes de publicar.
- **Impacto:** custo direto na conta da Anthropic (o valor por chamada não foi estimado aqui). Se a cota da API estourar, o recurso para de funcionar para os produtores legítimos.
- **Causa-raiz:** o controle é só por conta e não é atômico.
- **Correção (recomendada, fase 2):**
  1. Exigir `isProducer(user)` e e-mail confirmado nas duas rotas.
  2. Contador atômico incrementado **antes** da chamada, devolvendo a unidade em erro da API, se for o caso.
  3. Teto global diário (por exemplo, 300 mapas e 1.000 textos no total; ajustar ao orçamento do dono), com alerta ao chegar a 80%.
  4. Rever `max_tokens` do mapa conforme o tamanho real das respostas, e o modelo da descrição, que é um texto curto.
  5. WAF: 10 por minuto por IP nas duas rotas.
- **Teste de regressão:** a criar: `tests/unit/sec-ai-quota.test.ts`, com a Anthropic simulada (conta sem produtora → 403; 21º mapa → 429; 30 simultâneos → no máximo 20 chamadas).
- **Validação:** pendente.
- **Risco residual:** um produtor aprovado ainda gasta a cota própria (aceitável).
- **Arquivos modificados:** nenhum.

### SEC-309 · Troca de e-mail como oráculo de contas
- **Severidade:** P2
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `d6ed990`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código)
- **Componente:** Minha conta → trocar e-mail
- **Localização:** `src/lib/actions/conta.ts:113-118` (`emailTaken`), `:121-129` (`requestNewEmail`).
- **Descrição:** depois de autorizar a troca (código no e-mail atual, válido por 15 min), `requestNewEmail` responde "Já existe uma conta com este e-mail." **antes** de gastar qualquer cota. Para e-mails sem conta, gasta a cota do `issueCode` (e passa a responder "Aguarde Xs…"), que é outra resposta. Dá para testar quantos e-mails quiser durante 15 min, e renovar a autorização 8 vezes por hora.
- **Impacto:** lista de quais e-mails têm conta, usada para focar o teste de senhas (SEC-300) e phishing. O cadastro também revela ("Já existe uma conta…", `auth.ts:92`), mas exige Turnstile e cria conta.
- **Causa-raiz:** a conferência de duplicidade vem antes do limite e tem mensagem própria.
- **Correção (recomendada, fase 2):**
  1. Contar cada chamada de `requestNewEmail`: no máximo 5 e-mails novos por autorização (`step:email`) e 10 por dia por conta.
  2. Resposta igual nos dois casos ("Se este e-mail puder ser usado, enviamos um código para ele."). Para e-mail já usado, mandar ao endereço um aviso "alguém tentou usar este e-mail" (no máximo 1 por dia) em vez do código. A troca falha na confirmação, como já acontece em `:145`.
- **Teste de regressão:** a criar: `tests/unit/sec-email-change.test.ts`.
- **Validação:** pendente.
- **Risco residual:** a enumeração pelo cadastro continua (padrão de mercado, com Turnstile e SEC-300).
- **Arquivos modificados:** nenhum.

### SEC-310 · Chaves por IP: IPv6 por endereço inteiro e CGNAT
- **Severidade:** P2
- **Status:** PARCIAL: cadastro conta IPv6 pela /64 (0a0bcfa); demais limites por IP sem mudança — AppSec, commit `0a0bcfa`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código)
- **Componente:** `clientIp` e todos os limites por IP
- **Localização:** `src/lib/rate-limit.ts:6-9`; usado em `compra.ts:87` (cupom), `launch.ts:29` ("me avise"), `contato.ts:63-64`, `portaria.ts:26-27`.
- **Descrição:** a chave é o endereço exato. No IPv6, quem tem uma rede /64 (comum em celular e fibra no Brasil) troca de endereço à vontade, e cada endereço novo ganha um balde novo. No IPv4 das operadoras móveis (CGNAT), milhares de pessoas dividem um endereço: o limite pune todas juntas. Exemplo: 20 cupons errados em 10 min numa operadora durante um lançamento com cupom divulgado. O código já reconhece o problema (comentários em `compra.ts:80-81` e `launch.ts:22`).
- **Impacto:** limites por IP fracos para atacante com IPv6 e falsos positivos para compradores legítimos em CGNAT.
- **Causa-raiz:** a chave por IP não foi normalizada, e há dependência de IP onde caberia identidade.
- **Correção (recomendada, fase 2):**
  1. `clientKey()`: IPv4 inteiro; IPv6 reduzido ao prefixo /64 (`2001:db8:1:2::/64`).
  2. Preferir a identidade: conta quando há sessão, e-mail-alvo quando há e-mail. O IP serve como segundo balde, com limites folgados (como já é no "me avise", 40/h).
  3. Contar só falhas onde fizer sentido (como o cupom já faz).
  4. Opcional: usar `request.cf.asn` para limites por operadora só em alarme, nunca como bloqueio.
- **Teste de regressão:** a criar: `tests/unit/sec-client-key.test.ts` (dois IPv6 da mesma /64 → mesma chave).
- **Validação:** pendente.
- **Risco residual:** o CGNAT continua exigindo limites folgados por IP.
- **Arquivos modificados:** nenhum.

### SEC-311 · "Me avise" e pré-venda sem confirmação: lista de terceiros e pré-venda aberta
- **Severidade:** P2
- **Status:** Confirmada (código)
- **Componente:** lançamento (abertura e pré-venda) e campanhas
- **Localização:** `src/lib/actions/launch.ts:25-44` (`signupLaunch`: qualquer e-mail, 40 por hora por IP, sem confirmação); `src/lib/mail/data.ts:133-136` (`signups` entram no público da campanha do produtor); `src/lib/launch.ts:25-41` (cada cadastro de pré-venda vira um link).
- **Descrição:**
  - **E-mails de terceiros viram lista do produtor.** Qualquer pessoa cadastra e-mails de terceiros no "me avise" de um evento. Esses e-mails passam a fazer parte do público "cadastros" das campanhas daquele produtor, sem opt-in confirmado. Um produtor mal-intencionado consegue importar uma lista comprada pelo próprio formulário (trocando IPs).
  - **A pré-venda vira venda aberta para robôs.** Um robô com domínio próprio (caixa geral) cadastra centenas de e-mails e recebe centenas de links de pré-venda.
- **Impacto:** spam com o domínio da Tickets Win (LGPD: base legal do e-mail marketing já é a pendência D-03) e pré-venda dominada por robô.
- **Causa-raiz:** não há confirmação dupla (double opt-in) nem limite por destinatário.
- **Correção (recomendada, fase 2):**
  1. O e-mail que hoje confirma o cadastro passa a ter um botão "Confirmar". Só cadastros confirmados entram no público de campanhas e recebem link de pré-venda. Nova coluna `confirmed_at` em `event_signups`, com SQL em `findings/decisoes.md` pelo AppSec.
  2. Por e-mail-alvo: no máximo 3 cadastros por dia em eventos diferentes.
  3. Pré-venda: no máximo 1 link por conta logada (exigir login para o cadastro da pré-venda) ou conferir o CPF na compra da pré-venda (1 por CPF).
- **Teste de regressão:** a criar: `tests/db/sec-signups.test.ts`.
- **Validação:** pendente.
- **Risco residual:** um robô com caixas próprias confirma. O limite por CPF na compra continua sendo a barreira final.
- **Arquivos modificados:** nenhum.

### SEC-312 · Turnstile: falha aberta, sem conferir o domínio, cobertura parcial
- **Severidade:** P2
- **Status:** Confirmada (código) · se as chaves existem na produção: NÃO TESTADO (só o dono vê os secrets)
- **Componente:** `src/lib/turnstile.ts`
- **Localização:** `src/lib/turnstile.ts:9-12` (liga só com as duas chaves), `:17` (sem chave → aprova), `:24-25` (lê só `success`). Chamadores: `auth.ts:49`, `:60`, `:107`, `:117`, `banco.ts:42`, `:91`, `contato.ts:61`.
- **Descrição:**
  1. **Falha aberta sem aviso.** Sem `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`, `verifyHuman` aprova tudo, sem registro. Se um segredo for apagado ou renomeado por engano, o login fica sem nenhuma barreira (SEC-300) e ninguém percebe.
  2. **Não confere `hostname` nem `action`.** A resposta do siteverify traz esses campos, e eles não são conferidos.
  3. **A cobertura é parcial.** Não há Turnstile em:
     - "esqueci a senha" (`senha.ts:26`);
     - "reenviar ativação" (`auth.ts:148`), que, aliás, não exige login e aceita qualquer e-mail;
     - "me avise" (`launch.ts:25`);
     - newsletter (`social.ts:25`);
     - conferência de cupom e criação de pedido grátis;
     - entrada na fila em modo "on".
  4. O token vem do formulário; sem `idempotency_key`, um erro de rede no siteverify recusa a pessoa (falha fechada ali, o que está certo).
- **Impacto:** a barreira principal da SEC-300 pode estar desligada sem que ninguém saiba, e os fluxos de e-mail sem login ficam só com limites por e-mail e IP.
- **Causa-raiz:** desenho "liga sozinho se houver chave", pensado para o ambiente local.
- **Correção (recomendada, fase 2):**
  1. Com `NODE_ENV === "production"` e sem as chaves: `verifyHuman` registra `console.error("turnstile: sem chaves em produção")` uma vez por isolate e **recusa** nas operações de conta (login, cadastro, banco); continua aprovando no contato (para não derrubar o suporte). Alternativa: um teste de build que falha sem as variáveis.
  2. Conferir `j.hostname`, que deve ser o domínio do site (`NEXT_PUBLIC_SITE_URL` ou `banco.`), e `j.action`, se o widget passar `data-action`.
  3. Turnstile (invisível) em `requestPasswordLink`, `resendActivation`, `signupLaunch`, `subscribeNewsletter` e no pedido grátis.
  4. `resendActivation`: exigir a sessão da própria conta (só reenvia para `user.email`).
  5. O dono confere no painel da Cloudflare que o widget aceita só `ticketswin.com.br` e `banco.ticketswin.com.br`.
- **Teste de regressão:** a criar: `tests/unit/sec-turnstile.test.ts`, com `fetch` simulado (sem chaves em produção → falso; hostname de outro domínio → falso; sem chaves em desenvolvimento → verdadeiro).
- **Validação:** pendente.
- **Risco residual:** o Turnstile pode ser resolvido por serviços pagos. Por isso ele não substitui os limites por identidade.
- **Arquivos modificados:** nenhum.

### SEC-313 · Upload de imagem: qualquer conta, corpo lido antes do limite, órfãos públicos
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** `/api/midia`
- **Localização:** `src/app/api/midia/route.ts:13-15` (só sessão), `:16` (`formData()` lê o corpo inteiro antes de conferir o tamanho), `:27-30` (60 por hora, janela fixa, KV não atômico), `:32-34` (grava no R2 com cache de 1 ano; nada apaga).
- **Descrição:** a S-07 resolveu o tipo do arquivo. Continua possível que uma conta qualquer (sem ser produtora) suba 600 MB por hora de imagens que ficam servidas em `ticketswin.com.br/midia/eventos/...`, mesmo sem nenhum evento usá-las.
- **Impacto:** custo de armazenamento e hospedagem gratuita de imagens com o nosso domínio (imagens de phishing "da Tickets Win").
- **Correção (recomendada, fase 2):**
  1. Exigir e-mail confirmado (ou produtor, para cartaz e banner; o avatar continua para todos, com limite menor de 10 por dia).
  2. Conferir `content-length` (≤ 10 MB) antes do `formData()`.
  3. Contador atômico por conta com janela deslizante.
  4. Cron semanal que apaga de `eventos/` o que não é referenciado por evento, perfil ou rascunho há mais de 7 dias.
- **Teste de regressão:** a criar: `tests/unit/sec-upload.test.ts`.
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

### SEC-314 · Transferência e envio da compra como disparo de e-mail
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** transferência e presentes
- **Localização:** `src/lib/actions/tickets.ts:38` (20 por hora por conta, com `allowHit` não atômico), `:153-178` (reenvio a cada minuto); `compra.ts` `holders[].email` (o envio da compra vai para até `maxPerOrder` e-mails por pedido; no grátis, sai na hora).
- **Descrição:** o e-mail "Fulano te enviou um ingresso" leva o nome da conta, que é livre (pode ser uma frase de spam com link escrito). Com um ingresso grátis (SEC-305), cada conta manda 20 por hora para endereços quaisquer, transferindo e cancelando.
- **Impacto:** spam com o domínio, em volume menor que a SEC-304.
- **Correção (recomendada, fase 2):**
  1. Contador atômico.
  2. 20 por hora e 50 por dia por conta; no máximo 3 transferências do mesmo ingresso por dia.
  3. No e-mail, o nome da conta é exibido sem links (já é texto) e cortado em 60 caracteres.
  4. Exigir e-mail confirmado para transferir.
- **Teste de regressão:** a criar: `tests/db/sec-transfer-rate.test.ts`.
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

### SEC-315 · Banco: bloqueio do dono por terceiros e enumeração de quem tem banco
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** Banco Tickets Win
- **Localização:** `src/lib/actions/banco.ts:41-69` (`bankLogin`), `:45-52` (sem credencial → resposta imediata com `WRONG`; com credencial bloqueada → "Muitas tentativas erradas…"; com credencial → confere o hash, que é lento), `:54-60` (5 erros → bloqueio de 15 min e e-mail ao dono), `:90-100` (`bankSetupStart`: mesma mensagem, mas só envia o e-mail, que é lento, quando é dono).
- **Descrição:**
  - **Qualquer um trava o banco do dono.** Basta saber o e-mail do produtor e resolver 5 Turnstiles para travar o banco dele por 15 min, de novo e de novo. Cada bloqueio manda um e-mail de alerta.
  - **A resposta revela quem tem banco.** A mensagem de bloqueio e o tempo de resposta revelam quais e-mails têm acesso ao banco, ou seja, quais são donos de produtora.
- **Impacto:** negação de acesso ao saque e e-mails repetidos ao produtor; vazamento de quem é produtor (informação de baixo valor, já que as páginas de produtor são públicas).
- **Correção (recomendada, fase 2):**
  1. Bloqueio por (e-mail + IP /64) em vez de só por e-mail. O bloqueio só por e-mail passa a 20 erros por dia, com e-mail de alerta no máximo 1 por dia.
  2. Mesma mensagem ("E-mail ou senha do banco incorretos.") também durante o bloqueio para quem errou.
  3. Conferir um hash fictício quando a conta ou a credencial não existe (tempo igual).
  4. No `bankSetupStart`, enviar o e-mail dentro de `after()`, para o tempo de resposta ficar igual.
- **Teste de regressão:** a criar: `tests/db/sec-bank-lock.test.ts`.
- **Validação:** pendente.
- **Risco residual:** baixo (o banco exige ainda o app autenticador).
- **Arquivos modificados:** nenhum.

### SEC-316 · Oráculo de código de ingresso
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** reembolso pelo comprador
- **Localização:** `src/lib/actions/meu-reembolso.ts:29` ("Ingresso não encontrado.") × `:32` ("Este ingresso não pode ser cancelado agora.", quando o código existe e é de outra pessoa); `:95` (mesmo padrão em `requestRefund`). O limite de `:26-27` conta só reembolsos feitos.
- **Descrição:** uma conta logada distingue código inexistente de código existente de outra pessoa, sem limite. A portaria aceita o código digitado sem a assinatura do QR (`src/lib/checkin.ts:12`, já registrado na S-01). Achar um código válido equivale a ter o ingresso.
- **Impacto:** baixo na prática: o código tem 40 bits (`src/lib/tickets/code.ts`), e seriam necessárias da ordem de milhões de tentativas por acerto com a base atual. O risco cresce com o número de ingressos emitidos.
- **Correção (recomendada, fase 2):**
  1. Mesma mensagem nos dois casos ("Ingresso não encontrado.").
  2. Contar erros de código por conta: 20 por hora (contador atômico).
  3. Opcional: na portaria, digitar o código só depois de procurar pelo nome (fluxo já existente de liberação manual).
- **Teste de regressão:** a criar: `tests/db/sec-ticket-oracle.test.ts`.
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

### SEC-317 · Rotas públicas que gravam no banco sem limite
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** links de parceiro, newsletter e relatório da CSP
- **Localização:** `src/app/r/[code]/route.ts:12` (cada GET soma 1 clique); `src/lib/actions/social.ts:25-30` (`subscribeNewsletter`: qualquer e-mail, sem limite, sem Turnstile, sem confirmação); `src/app/api/csp-report/route.ts:17-29` (log por pedido, 10 linhas por pedido).
- **Descrição e impacto:**
  - **Cliques inflados.** O painel do parceiro mostra cliques falsos. A comissão é sobre venda paga, então não há impacto financeiro.
  - **Newsletter sem filtro.** A tabela de newsletter cresce com e-mails de terceiros (lista sem opt-in, mesmo tema da D-03).
  - **Logs inundados.** Os logs do Worker se enchem e escondem sinais reais.
- **Correção (recomendada, fase 2):**
  1. `/r`: clique contado no máximo 1 vez por (código, IP /64, dia), com chave no KV.
  2. Newsletter: Turnstile, 10 por hora por IP e confirmação dupla antes de qualquer envio.
  3. `/api/csp-report`: amostragem (1 em 10) e regra de WAF de 30 por minuto por IP.
- **Teste de regressão:** a criar junto com a correção.
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

### SEC-318 · Raspagem cara: `/explorar`, prévia e arte
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** vitrine e imagens
- **Localização:** `src/app/explorar/page.tsx:19-33` (`listLiveEvents` + `searchEvents` a cada pedido; `cache` do React vale só dentro do mesmo pedido, `src/lib/data/events.ts:2`); `src/app/api/og/evento/[slug]/route.ts:16-17` e `src/app/api/arte/[slug]/route.ts:17-21` (redimensionam a imagem a cada chamada; o `cache-control` só ajuda se a Cloudflare guardar a resposta, o que não acontece por padrão na resposta do Worker).
- **Descrição:** os dados expostos são públicos (eventos publicados, lotes e disponibilidade), e não foi achado dado pessoal nessas rotas. O problema é custo: um raspador que pede `/explorar?q=…` com termos variados, ou a prévia de cada evento repetidamente, gera consultas e transformações de imagem a cada pedido.
- **Impacto:** carga no banco e no serviço de imagens. A disponibilidade em tempo real permite a cambistas monitorar lotes (normal em ingressos).
- **Correção (recomendada, fase 2):**
  1. Guardar `listLiveEvents()` por 60 s entre pedidos (cache de dados do Next ou KV).
  2. Na prévia e na arte, usar a Cache API do Workers (`caches.default`) com a chave da URL e TTL de 1 dia, invalidando ao trocar a arte.
  3. WAF: 120 por minuto por IP em `/explorar` e 60 por minuto em `/api/og/*` e `/api/arte/*`.
- **Teste de regressão:** não se aplica (desempenho).
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

### SEC-319 · Busca no Spotify sem limite por conta
- **Severidade:** P3
- **Status:** Confirmada (código)
- **Componente:** `/api/spotify/buscar`
- **Localização:** `src/app/api/spotify/buscar/route.ts:6-15`; `src/lib/spotify.ts:64-75` (token único do app, `:27-36`).
- **Descrição:** qualquer conta logada chama sem limite. Todas as buscas usam o mesmo token do app, e a Spotify limita por app: uma conta em laço faz a busca de artistas parar (429) para todos os produtores.
- **Correção (recomendada, fase 2):** 60 buscas por hora por conta e 600 por dia (atômico); exigir produtor; o `cache-control: private` já existe.
- **Teste de regressão:** a criar junto com a correção.
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

### SEC-320 · Sem sinais de abuso automatizado
- **Severidade:** P3
- **Status:** PARCIAL: login, cadastro e teto de IA registram k:"abuse" no log; alertas com o dono — AppSec, commit `0a0bcfa`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código)
- **Componente:** observabilidade
- **Localização:** `src/lib/mfa.ts:290-299` (`logSecurity` registra só os eventos de sucesso chamados pelas ações); `src/lib/rate-limit.ts` (limite acionado não é registrado); `src/lib/actions/auth.ts:51` (falha de login não registrada); `wrangler.jsonc` (`observability.enabled`, sem alertas).
- **Descrição:** não há como ver uma campanha de credential stuffing, de cadastro em massa ou de chute de cupom: nada registra falhas nem limites acionados, e não há alerta.
- **Correção (recomendada, fase 2):**
  1. Em cada limite acionado e em cada falha de login, 2FA ou cupom: `console.warn(JSON.stringify({ k: "abuse", op, key: hash(chave), n }))` (sem e-mail nem IP em claro; IP truncado em /24 ou /64).
  2. Falhas de login e 2FA também em `security_events` (tipo `login_fail`/`mfa_fail`) na conta, quando ela existe.
  3. Painel do Workers Observability, ou Logpush, com consulta por `k = "abuse"`.
  4. Alertas da Cloudflare (Security Events e picos de 4xx/429) para o e-mail do dono.
  5. Lista de "o que olhar" no `incident-response.md` (Agente 02).
- **Teste de regressão:** a criar junto com a correção (espiar `console.warn` no teste do limitador).
- **Validação:** pendente.
- **Risco residual:** —
- **Arquivos modificados:** nenhum.

### SEC-321 · Contagem do público como oráculo de compradores de outro produtor
- **Severidade:** P3
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `87cc3f3`, ver `docs/security/security-fixes.md`. Antes: Confirmada (código)
- **Componente:** campanhas
- **Localização:** `src/lib/mail/data.ts:138-142` (`excludeBuyersOf` aceita qualquer UUID, não só eventos próprios); `src/lib/actions/emails.ts:128-133` (`audienceCount`).
- **Descrição:** um produtor monta um público com a sua lista e exclui "compradores do evento X" (de outro produtor). A diferença na contagem revela quantos e quais dos seus contatos compraram no concorrente: com um público de 1 pessoa, revela se aquela pessoa comprou.
- **Impacto:** vazamento de dado de compra entre produtores (LGPD), em pequena escala.
- **Correção (recomendada, fase 2):** aceitar em `excludeBuyersOf` só eventos próprios (`own.has(id)`). Se a exclusão de "evento parceiro" for desejada, aplicá-la só no envio, sem mostrar a contagem com essa exclusão.
- **Teste de regressão:** a criar: `tests/db/sec-audience.test.ts`.
- **Validação:** pendente.
- **Risco residual:** baixo.
- **Arquivos modificados:** nenhum.

---

## Verificado e OK

| O que | Onde | Como |
|---|---|---|
| "Esqueci a senha" e reenviar ativação: 30 s e 6 por hora por e-mail (hash, sem diferenciar maiúsculas) (S-23) | `src/lib/password-link.ts:36-49` | `tests/unit/password-throttle.test.ts` (existente, verde). O contorno pelo proxy é a SEC-303 |
| "Esqueci a senha" responde igual com ou sem conta | `src/lib/actions/senha.ts:25-31` | leitura; o freio vem antes da chamada ao login nos dois casos |
| Login não revela conta inexistente ("E-mail ou senha incorretos.") (S-13) | `src/lib/actions/auth.ts:97-101` | leitura (validação anterior: 1 tentativa, S-13) |
| Código por e-mail: guardado só como hash, comparação em tempo constante, 10 min, 5 tentativas em sequência, uso único, preso ao tipo | `src/lib/mfa.ts:25`, `:92-108`, `:98` | `tests/unit/sec-limiters.test.ts` (3 testes verdes) |
| Envio de código: 30 s entre envios e 8 por hora por conta | `src/lib/mfa.ts:76-89` | `tests/unit/sec-limiters.test.ts` |
| App autenticador: 6 erros em 5 min bloqueiam e o mesmo código não entra duas vezes | `src/lib/mfa.ts:175-189`, `:240-262` | `tests/unit/sec-limiters.test.ts` (2 testes verdes, em sequência; concorrência é a SEC-301) |
| Cupom pela tela: só erro conta, 20 por IP em 10 min; cupom válido nunca bloqueia (S-14) | `src/lib/actions/compra.ts:82-93` | leitura + `tests/unit/sec-limiters.test.ts` ("limitReached só lê; addHit conta") |
| Pedidos: 12 em 10 min por conta, contado só para pedido de verdade | `src/lib/actions/compra.ts:78`, `:200` | leitura + `tests/db/order-rate.test.ts` (existente) |
| Cartão: 10 tentativas por hora por conta | `src/lib/actions/pagamento.ts:57-69` | leitura (atomicidade: SEC-302) |
| "Me avise": 40 por hora por IP (S-19) | `src/lib/actions/launch.ts:23`, `:29` | leitura (validação anterior). A confirmação é a SEC-311 |
| Contato: campo-isca, Turnstile, 5 por hora por IP, 2 confirmações por hora por endereço, confirmação genérica (sem repetir o texto digitado) | `src/lib/actions/contato.ts:14`, `:34`, `:54`, `:61`, `:64`, `:95` | leitura |
| Portaria: código de acesso com 8 tentativas por IP em 15 min; link e QR com token de 16 a 48 caracteres | `src/lib/actions/portaria.ts:20-33`; `src/app/portaria/entrar/[token]/route.ts:8` | leitura |
| Reenvio de transferência: 1 por minuto (no próprio `update`, atômico no banco) | `src/lib/actions/tickets.ts:161` | leitura |
| Reembolsos do painel: freio de 40 por minuto | `src/lib/actions/reembolsos.ts:40` | leitura (S-anterior) |
| Rascunho não aparece: página, prévia e arte respondem igual a inexistente | `src/app/eventos/[slug]/page.tsx:163`; `src/app/api/og/evento/[slug]/route.ts:16`; `src/app/api/arte/[slug]/route.ts:18` | leitura |
| Ingresso, PDF e pedido de outra pessoa respondem igual a inexistente | `src/app/ingressos/[code]/page.tsx:38`; `src/app/api/ingressos/[code]/pdf/route.ts:18`; `src/app/checkout/[orderId]/page.tsx:28` | leitura |
| `/midia` serve só `eventos/` e `destaques/` (os PDFs guardados em `pdf/` não saem) | `src/app/midia/[...key]/route.ts:7` | leitura |
| Upload confere a assinatura dos bytes (S-07) | `src/app/api/midia/route.ts:24` | leitura |
| Criar acesso ao banco: mesma resposta exista ou não a conta | `src/lib/actions/banco.ts:90-100` | leitura (tempo: SEC-315) |
| Proxy do login: caminho normalizado (sem `%`, `..`, segmentos vazios) e segunda etapa exigida nas rotas de conta | `src/app/api/auth/[...path]/route.ts:23-34` | leitura (a lista em si é a SEC-303) |
| Webhook do Neon Auth: assinatura conferida e deduplicação por evento | `src/app/api/webhooks/neon-auth/route.ts:23-34` | leitura |
| Tokens de link longos: pré-venda e parceiro (24 caracteres de 32 símbolos), transferência (48 hex), lista (22 caracteres) | `src/lib/launch.ts:45-49`; `src/lib/actions/tickets.ts:39`; `src/app/api/lista/qr/[token]/route.ts:15` | leitura |
| IP de quem chama: `cf-connecting-ip` primeiro (a Cloudflare sobrescreve; o cliente não forja) | `src/lib/rate-limit.ts:8` | `tests/unit/sec-limiters.test.ts` ("clientIp usa o cf-connecting-ip") |
| IA, injeção de instruções: saída estruturada e normalizada, sem ferramentas, resultado só para quem pediu, rascunho só do nosso R2 (`/midia/eventos/...`) | `src/app/api/mapa/gerar/route.ts:14`, `:84-91`, `:106-112`; `src/app/api/criar/descricao/route.ts:18-24` | leitura (custo e acesso: SEC-308) |
| `/api/cidades`: dados públicos do IBGE, entrada cortada em 80 caracteres, cache de 1 dia | `src/app/api/cidades/route.ts:3-22` | leitura |
| `/api/cron`: só o próprio Worker chama (token no `globalThis` do isolate) | `custom-worker.js:9-15` | leitura |
