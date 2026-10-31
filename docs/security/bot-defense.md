# Defesa contra abuso automatizado (Tickets Win)

Agente 05, fase 1 (revisão defensiva do código; base `2865fda`). Os achados detalhados, com localização, correção e teste, estão em `findings/bots.md` (SEC-300 a SEC-321). Este documento é o mapa: o que protege cada operação hoje, onde estão as lacunas e o que ligar, no código (fase 2, AppSec) e no painel da Cloudflare (dono).

**Escopo e limites do que foi feito.** Leitura do código e do SDK do login. Testes unitários com estado simulado (`tests/unit/sec-limiters.test.ts`). Nenhuma tentativa repetida contra login, cadastro, recuperação de senha ou 2FA, nenhum teste de carga e nenhum pedido a serviço de terceiros. Se o Turnstile está ligado na produção não foi verificado (**NÃO TESTADO**): só o dono vê os secrets do Worker.

## 1. Como os limites funcionam hoje

- **Onde:** quase todos os limites são contadores no **Workers KV** (`env.KV`), no padrão "lê o número, compara, grava o número + 1". A função central é `allowHit`/`addHit`/`limitReached`, em `src/lib/rate-limit.ts`. Há cópias locais do mesmo padrão em `pagamento.ts`, `contato.ts`, `portaria.ts`, `criar.ts`, `/api/midia`, `/api/mapa/gerar`, `/api/criar/descricao` e `mfa.ts`.
- **Por que esse padrão vaza:**
  - o KV não tem incremento atômico;
  - é eventualmente consistente entre locais;
  - aceita 1 escrita por segundo por chave.

  Pedidos simultâneos leem o mesmo número, e uma escrita recusada é tratada como "sem KV" e **libera** (SEC-302). Na 2FA, a escrita vem depois da comparação do código (SEC-301).
- **Chave:**
  - **conta** (pedidos, transferências, cartão, upload, IA);
  - **e-mail** (recuperação de senha e ativação, por hash);
  - **IP** (cupom, "me avise", contato, portaria).

  Nenhuma chave por dispositivo. O IP vem do `cf-connecting-ip` (confiável atrás da Cloudflare), mas o IPv6 é contado por endereço inteiro (SEC-310).
- **Login:** é do Neon Auth, chamado pelo nosso servidor. O SDK **não repassa o IP** de quem chama, então o limite por IP do Neon Auth, se existir, enxerga só o Worker (SEC-300). O proxy `/api/auth/*` usa lista de bloqueio, e várias rotas de envio e conferência de código passam direto (SEC-303).
- **Turnstile:** liga sozinho quando as duas chaves existem; sem elas, aprova tudo, sem aviso (SEC-312).

### CGNAT

No Brasil, as operadoras móveis põem milhares de clientes atrás do mesmo IPv4 (CGNAT). Consequências:
- todo limite por IP precisa ser **folgado** e, quando possível, contar **só falhas** (o cupom já faz isso; o "me avise" foi afrouxado para 40 por hora pelo mesmo motivo);
- o contato (5 por hora por IP) e a portaria (8 em 15 min por IP) podem barrar pessoas legítimas da mesma operadora, com risco baixo por serem fluxos pouco usados;
- o cupom (20 erros em 10 min por IP) pode barrar uma operadora inteira durante um lançamento com cupom divulgado e digitado errado por muita gente.

**Regra para a fase 2:** a identidade (conta, e-mail-alvo, CPF) é o limite principal, e o IP (IPv4 inteiro, IPv6 por /64) é o segundo balde, folgado.

## 2. Mapa por operação

Legenda: ✅ protegido · ⚠️ protegido em parte · ❌ sem proteção própria.

| Operação | Limite hoje | Chave | Turnstile | Situação | Achado |
|---|---|---|---|---|---|
| Login (senha) | nenhum nosso | — | sim, se houver chaves | ❌ | SEC-300, SEC-312 |
| Login pelo proxy `/api/auth` (`sign-in/email`) | bloqueado (403) | — | — | ✅ | — |
| Link mágico / OTP pelo proxy | repassado ao Neon Auth | (IP do Worker) | não | ❌ | SEC-303 |
| Cadastro | nenhum nosso | — | sim, se houver chaves | ❌ | SEC-300 |
| Ativação: digitar o código | 3 tentativas por código (padrão do better-auth; Neon não confirmado) | e-mail | não | ⚠️ | SEC-303 |
| Ativação: reenviar | 30 s e 6 por hora | e-mail (hash) | não; não exige login | ⚠️ | SEC-312 |
| Esqueci a senha (nossa ação) | 30 s e 6 por hora | e-mail (hash) | não | ⚠️ | — |
| Esqueci a senha pelo proxy (`email-otp/*`, `forget-password/*`) | nenhum nosso; webhook manda sempre | — | não | ❌ | SEC-303 |
| Link de nova senha | uso único, 15 min, token de 192 bits | — | — | ✅ | — |
| Troca de e-mail | 8 códigos por hora por conta; checagem de duplicidade sem limite | conta | — | ⚠️ | SEC-309 |
| 2FA, código por e-mail | 5 tentativas por código, 10 min, 8 envios por hora | conta | — | ⚠️ (não atômico) | SEC-301 |
| 2FA, app autenticador | 6 em 5 min, anti-reuso | conta | — | ⚠️ (não atômico) | SEC-301 |
| Banco: entrar | 5 erros → 15 min (no banco de dados) | e-mail | sim | ⚠️ (trava por terceiros) | SEC-315 |
| Banco: código e saque | 6 em 5 min (app) | conta | — | ⚠️ (não atômico) | SEC-301 |
| Criar pedido (reserva de 15 min) | 12 em 10 min; 1 aberto por evento | conta | não | ⚠️ | SEC-305 |
| Grupo (reserva de 60 min) | 1 aberto por evento | conta | não | ⚠️ | SEC-305 |
| Pedido grátis (emite na hora) | limite por pessoa (conta + CPF) | conta, CPF | não | ⚠️ | SEC-305 |
| Cartão | 10 por hora | conta | não | ⚠️ (não atômico) | SEC-302 |
| Fila virtual: entrar | nenhum | cookie anônimo | não | ❌ | SEC-306 |
| Fila virtual: comprar | cookie liberado, sem dono nem prazo | cookie | — | ❌ | SEC-306 |
| Pré-venda (link secreto) | token de 120 bits, uso único na emissão | token | — | ✅ link · ⚠️ cadastro | SEC-311 |
| Cupom pela tela | 20 erros em 10 min | IP | não | ⚠️ | SEC-307, SEC-310 |
| Cupom no pedido | nenhum | — | não | ❌ | SEC-307 |
| Link de parceiro `/r/<código>` | nenhum (cada GET soma clique) | — | — | ⚠️ | SEC-317 |
| Transferência | 20 por hora; reenvio 1 por minuto | conta | não | ⚠️ | SEC-314 |
| Revenda (reservar anúncio) | como o pedido (15 min) | conta | não | ⚠️ | SEC-305 |
| "Me avise" / cadastro da pré-venda | 40 por hora | IP | não | ⚠️ (sem confirmação) | SEC-311 |
| Newsletter | nenhum | — | não | ❌ | SEC-317 |
| Upload `/api/midia` | 60 por hora (janela fixa) | conta | — | ⚠️ | SEC-313 |
| E-mail marketing: envio real | só para opt-in, seguidores e cadastros | produtora | — | ⚠️ | SEC-311 |
| E-mail marketing: envio de teste | nenhum; qualquer conta | — | — | ❌ | SEC-304 |
| Convite da lista de nomes | 200 por colagem; reenvio a cada 10 min | evento próprio | — | ⚠️ | — |
| Contato (ajuda) | 5 por hora; 2 confirmações por endereço; campo-isca | IP, e-mail | sim | ✅ | — |
| Portaria: código de acesso | 8 em 15 min | IP | — | ✅ | — |
| Cancelar ou reembolsar meu ingresso | 10 reembolsos por hora; consulta de código sem limite | conta | — | ⚠️ | SEC-316 |
| Busca e `/explorar` | nenhum; sem cache entre pedidos | — | — | ⚠️ | SEC-318 |
| `/api/cidades` | cache de 1 dia; dados públicos | — | — | ✅ | — |
| `/api/og/evento`, `/api/arte` | nenhum; rascunho = 404 | — | — | ⚠️ (custo) | SEC-318 |
| `/api/spotify/buscar` | nenhum; exige login | — | — | ⚠️ | SEC-319 |
| Places (onde vai ser) | 300 por dia | conta | — | ⚠️ (não atômico) | SEC-302 |
| IA: mapa | 20 por dia | conta | — | ⚠️ | SEC-308 |
| IA: descrição | 30 por dia | conta | — | ⚠️ | SEC-308 |
| `/api/csp-report` | 16 KB por pedido; 10 linhas | — | — | ⚠️ | SEC-317 |
| Webhooks (Stripe, Neon) | assinatura + deduplicação | — | — | ✅ | — |

### Enumeração (o que mensagens e tempo revelam)

| Pergunta | Hoje | Achado |
|---|---|---|
| Este e-mail tem conta? | login não revela ✅; recuperação de senha não revela ✅; **cadastro revela** (padrão, com Turnstile); **troca de e-mail revela sem limite** | SEC-309 |
| Este e-mail é dono de produtora com banco? | mensagem de bloqueio e tempo revelam | SEC-315 |
| Este código de ingresso existe? | página, PDF, Wallet e checkout ✅ (404 igual); **cancelar e reembolsar revelam** | SEC-316 |
| Este pedido existe? | `/checkout/<id>` responde 404 igual ✅ | — |
| Este cupom existe? | mensagens "expirado", "esgotado" e "de outro evento" revelam; no pedido, sem limite | SEC-307 |
| Este slug de rascunho existe? | página, prévia e arte respondem 404 igual ✅ | — |
| Quem do meu público comprou no concorrente? | contagem com exclusão revela | SEC-321 |

### Recursos de IA

As duas rotas (`/api/mapa/gerar` e `/api/criar/descricao`) chamam a API da Anthropic com a chave do servidor.
- **Injeção de instruções: risco baixo.** A saída é estruturada e normalizada, não há ferramentas, o resultado volta só para quem pediu e o rascunho do mapa só pode vir do nosso R2.
- **O risco real é custo.** Qualquer conta logada usa, com cota por conta não atômica e sem teto global (SEC-308).

## 3. Lacunas por prioridade

**P1: corrigir antes do próximo lançamento disputado**
1. **SEC-303.** Trocar a lista de bloqueio do proxy `/api/auth/*` por lista de permissão e pôr um freio no webhook do Neon Auth. É a mudança mais barata e fecha o contorno da S-23 e do Turnstile.
2. **SEC-304.** E-mail de teste de campanha só para produtora com e-mail confirmado, com 5 por hora por campanha e 20 por dia por conta.
3. **SEC-301.** Contador atômico (Durable Object ou `update ... returning` no Postgres), **incrementado antes** de comparar, para 2FA, banco e saque.
4. **SEC-300.** Limite próprio de falhas de login por e-mail (5 em 15 min) e por IP /64 (30 em 10 min); cadastro com 5 por hora por IP /64.
5. **SEC-305.** E-mail confirmado para criar pedido e grupo; Turnstile no pedido grátis e com a fila ligada; no máximo 1 pedido pendente por CPF por evento; espera depois de 3 reservas expiradas.

**P2: ciclo seguinte**

| Achado | O que fazer |
|---|---|
| SEC-302 | Limitador central atômico, com falha fechada nas operações de risco |
| SEC-306 | Fila ligada à conta, com prazo, e entrada limitada |
| SEC-307 | Cupom errado conta também no pedido, com mensagens neutras |
| SEC-308 | IA só para produtor, contador antes da chamada, teto global |
| SEC-309 | Troca de e-mail com resposta igual e limite |
| SEC-310 | IPv6 por /64 e identidade antes do IP |
| SEC-311 | Confirmação dupla no "me avise", na pré-venda e na newsletter |
| SEC-312 | Turnstile com falha fechada em produção, conferência do `hostname` e cobertura dos fluxos de e-mail sem login |

**P3: melhoria contínua**

| Achado | Tema |
|---|---|
| SEC-313 | Upload |
| SEC-314 | Transferência |
| SEC-315 | Banco |
| SEC-316 | Oráculo de código de ingresso |
| SEC-317 | Rotas públicas que gravam |
| SEC-318 | Cache contra raspagem |
| SEC-319 | Spotify |
| SEC-320 | Sinais de abuso |
| SEC-321 | Oráculo de público |

## 4. Recomendações de código (resumo para o AppSec)

1. **Um limitador só.** `src/lib/rate-limit.ts` com duas implementações atrás da mesma interface:
   - `limit(key, max, windowSec, { strict })`, onde `strict` usa um Durable Object `Counter` (exato; para conta, e-mail, 2FA e cupom);
   - a versão comum usa o binding de Rate Limiting do Workers (`ratelimits` no `wrangler.jsonc`; para limites por IP, aproximado por local).

   Em erro: `strict` recusa e a versão comum libera. Apagar as cópias locais.
2. **Ordem:** limite → (Turnstile, quando houver) → operação. Nas tentativas de código, a tentativa é somada **antes** da comparação.
3. **Chaves:**
   - `clientKey()` com IPv4 inteiro e IPv6 /64;
   - conta (`u:<id>`), e-mail (hash) e CPF (hash);
   - nunca o valor em claro na chave nem no log.
4. **Limites sugeridos** (janela deslizante):

| Operação | Identidade | IP (/64) |
|---|---|---|
| Falha de login | 5 em 15 min e 20 em 24 h por e-mail | 30 em 10 min |
| Cadastro | — | 5 por hora, 20 por dia |
| Esqueci a senha / reenviar ativação | 30 s e 6 por hora por e-mail (como hoje) | 20 por hora |
| Código de 2FA (e-mail) | 5 por código e 10 por hora por conta | — |
| App autenticador | 6 em 5 min e 20 em 24 h por conta | — |
| Troca de e-mail (e-mails novos) | 5 por autorização, 10 por dia | — |
| Cupom errado | 10 em 10 min por conta | 20 em 10 min |
| Pedido | 12 em 10 min (como hoje); 1 pendente por CPF por evento; 2 eventos com pendente por conta | — |
| Fila: cookie novo | — | 1 a cada 10 s, 20 por hora |
| Fila: sinal | 1 a cada 10 s por cookie | — |
| IA mapa / descrição | 20 / 30 por dia por produtor + teto global diário | 10 por minuto |
| Envio de teste de campanha | 5 por hora por campanha, 20 por dia por conta | — |
| Transferência | 20 por hora e 50 por dia por conta | — |
| Upload | 60 por hora (deslizante), 10 por dia para não produtor | — |
| Busca no Spotify | 60 por hora por conta | — |
| "Me avise" | 3 por dia por e-mail-alvo | 40 por hora (como hoje) |
| Newsletter | — | 10 por hora |

5. **Identidade antes de tudo que custa:** e-mail confirmado para reservar, enviar e-mail, subir imagem e usar IA; produtor aprovado para campanha e IA.
6. **Sinais (SEC-320):**
   - log estruturado `{"k":"abuse","op":…,"key":hash,…}` a cada limite acionado e a cada falha de login, 2FA ou cupom;
   - `security_events` com `login_fail` e `mfa_fail`;
   - consulta salva no Workers Observability.

## 5. Para o dono ligar no painel da Cloudflare (sem mudar código)

As regras abaixo são **sugestões para o dono aplicar e ajustar**: este agente não mexeu no painel. A disponibilidade, o número de regras e as características de contagem variam conforme o plano. No Free e no Pro, a contagem é por IP e as janelas são curtas. Confira na documentação atual antes de ligar. As Server Actions do Next são `POST` para o caminho da própria página, com o cabeçalho `Next-Action`. É isso que as regras usam para separar "enviar formulário" de "abrir a página".

**Antes de tudo: exceções obrigatórias.** Nenhuma regra de desafio ou bloqueio pode pegar `/api/webhooks/*` (Stripe e Neon chamam como robôs). O cron não passa pela rede (o Worker chama a si mesmo), então não precisa de exceção.

### 5.1 Regras de rate limiting (WAF → Rate limiting rules)

| # | Nome | Expressão (resumo) | Limite sugerido | Ação |
|---|---|---|---|---|
| 1 | Formulários de conta | `http.request.method eq "POST"` e caminho em `{/entrar /cadastro /esqueci-senha /ativar-conta /verificacao /redefinir-senha}` e existe o cabeçalho `next-action` | 10 por minuto por IP | Managed Challenge (10 min) |
| 2 | Login no checkout | `POST` com `next-action` e caminho começando com `/checkout` ou `/eventos/` | 30 por minuto por IP | Managed Challenge |
| 3 | Proxy do login | caminho começa com `/api/auth/` | 30 por minuto por IP | Bloquear 10 min |
| 4 | Fila virtual | caminho começa com `/api/fila/` | 60 por minuto por IP | Bloquear 1 min |
| 5 | IA e upload | caminho em `{/api/mapa/gerar /api/criar/descricao /api/midia}` | 10 por minuto por IP | Bloquear 10 min |
| 6 | Links públicos | caminho começa com `/r/`, `/pv/`, `/portaria/entrar/`, `/api/lista/qr/` | 60 por minuto por IP | Managed Challenge |
| 7 | Imagens e vitrine | caminho começa com `/api/og/` ou `/api/arte/`, ou é `/explorar` | 120 por minuto por IP | Managed Challenge |
| 8 | Relatório da CSP | caminho `/api/csp-report` | 30 por minuto por IP | Bloquear 1 min |
| 9 | Banco | host `banco.ticketswin.com.br` e `POST` com `next-action` | 10 por minuto por IP | Managed Challenge |

Se o plano só permitir uma ou duas regras: priorize a **1** (formulários de conta) e a **3** (proxy do login).

### 5.2 Regras personalizadas (WAF → Custom rules)

- **Lista de permissão do proxy do login (paliativo até a SEC-303):** bloquear quando o caminho começa com `/api/auth/` **e não** é um destes:
  - `/api/auth/get-session` e `/api/auth/sign-out`;
  - `/api/auth/sign-in/social`;
  - começa com `/api/auth/callback/`;
  - `/api/auth/email-otp/verify-email`;
  - `/api/auth/token`, se aparecer no log como usado.

  Antes de ativar como "Bloquear", rodar alguns dias em "Log" e conferir no Security Events que nenhum caminho legítimo é barrado (por exemplo, o login com Google e com Apple).
- **Métodos:** bloquear métodos diferentes de `GET`, `HEAD`, `POST` e `OPTIONS` em todo o site.
- **Tamanho:** bloquear `POST` com corpo acima de 11 MB fora de `/api/midia` (o upload aceita até 10 MB), se o plano permitir a condição de tamanho.

### 5.3 Outros recursos

- **Turnstile:** conferir que `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY` existem como **secrets do Worker de produção** (sem elas, o desafio fica desligado sem aviso, SEC-312), e que o widget aceita só `ticketswin.com.br` e `banco.ticketswin.com.br`.
- **Bot Fight Mode:** a versão gratuita não aceita exceção por caminho e pode barrar os webhooks. Só ligar com o **Super Bot Fight Mode** (planos pagos), com exceção para `/api/webhooks/*`, e primeiro em modo de observação.
- **Detecção de credenciais vazadas** (Leaked credentials detection), se disponível no plano: criar regra de Managed Challenge para login em que a senha enviada consta como vazada.
- **Waiting Room** (planos superiores ou complemento): para aberturas de vendas muito disputadas, uma sala de espera na borda alivia o Worker e o banco antes da nossa fila virtual.
- **Modo "Under Attack" e nível de segurança:** interruptor de emergência durante ataque, com regra de configuração que o desliga para `/api/webhooks/*`.
- **Notificações:** ligar alertas de "HTTP DDoS", "Security Events" e "Workers: erros", e um alerta de pico de respostas 429 e 403, para o e-mail do dono.
- **Observability:** já está ligada no `wrangler.jsonc`. Salvar uma consulta para `k = "abuse"` quando a SEC-320 for feita.

## 6. Dia de lançamento disputado (resiliência)

1. **Na semana anterior:**
   - fila do evento em modo "on", com limite de acordo com a capacidade;
   - SEC-305 e SEC-306 corrigidas (e-mail confirmado para reservar, fila ligada à conta);
   - regras 1, 2 e 4 do item 5.1 ativas.
2. **Na hora:**
   - acompanhar no Security Events os desafios das regras 1 e 4;
   - acompanhar no Observability os logs `abuse` (quando existirem);
   - no painel do evento, olhar a relação "pedidos pendentes × pagos": muitos pendentes expirando da mesma faixa de contas novas indica robô segurando estoque.
3. **Se houver ataque:**
   - subir a regra 1 para "Bloquear";
   - ligar o "Under Attack" com a exceção dos webhooks;
   - se for preciso, pausar a venda do lote (o produtor) enquanto se limpa.
4. **Depois:** registrar em `incident-response.md` (Agente 02) o que foi visto e quais limites foram ajustados.

## 7. Testes deste agente

| Teste | O que cobre | Resultado |
|---|---|---|
| `tests/unit/sec-limiters.test.ts` | `allowHit`/`addHit`/`limitReached`/`clientIp`; `issueCode` (30 s, 8 por hora); `checkCode` (5 tentativas, uso único, preso ao tipo, expira em 10 min); TOTP (6 em 5 min, anti-reuso) | 8 testes **VALIDADO** (verdes) |
| idem, `it.fails` | SEC-301 (20 palpites simultâneos de código por e-mail; 30 no app) e SEC-302 (30 pedidos simultâneos com máximo 12; KV recusando escrita) | 4 testes "falham como previsto": hoje passam do limite (20/5, 30/6, 30/12, 20/12). Virar `it` com a correção |

Os testes rodam sem banco, sem rede e sem o login real (KV, banco, e-mail e segredo simulados). Comando: `pnpm exec vitest run tests/unit/sec-limiters.test.ts`.
