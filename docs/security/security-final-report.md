# Relatório final de segurança — Tickets Win

Agente 06 (QA de segurança e validação independente), 31/10/2026. Base: branch `claude/auditoria-noturna`, HEAD `52191a2` (fim da fase 2) mais os testes do Agente 06. Detalhes: `vulnerability-register.md` (todos os achados, formato completo), `security-tests.md` (cada teste e resultado), `threat-model.md` (STRIDE dos 10 componentes).

## 1. Resumo executivo

- **Nenhum P0 confirmado.** Os 62 achados (58 da fase 1 e 4 novos desta validação) estão no registro com status final.
- **As 20 correções da fase 2 foram reexecutadas com e sem o código de produção** (numa cópia separada, sem commit). Todas têm pelo menos um teste que falha sem a correção e passa com ela. Suíte final: **68 arquivos, 257 testes passando, 4 falhas esperadas (`it.fails` de furos abertos), 0 falhas**. `tsc` e `eslint`: 0 erros. CI no GitHub do HEAD: success.
- **21 achados VALIDADOS e 3 validados em parte.** **3 correções FALHARAM** na validação: SEC-003 (a rotação dos acessos da portaria entrega o acesso novo ao ex-admin, SEC-401) e SEC-302/SEC-307 (os freios "só o erro conta" da portaria e do cupom são contornáveis por rajada simultânea, SEC-400). Nenhuma delas piora o que existia antes.
- **4 achados novos:** SEC-400 (P2, rajada), SEC-401 (P2, contorno do SEC-003), **SEC-402 (P1: a trava do modo de teste do SEC-100 depende de `NEXT_PUBLIC_SITE_URL`, que o Next grava no build; um build feito nesta pasta liga o modo de teste na produção)** e SEC-403 (P2, hipótese: o Neon Auth hospedado é acessível direto, fora da lista de permissão do proxy e dos freios do site).
- **SEC-303: VALIDADO.** A lista de permissão cobre todas as chamadas que o navegador faz; nenhum fluxo de login do site quebra (§4).
- **SEC-200: VALIDADO.** Sem nenhuma variável nova, QR, app autenticador, códigos de recuperação, código por e-mail e cookies (2ª etapa, banco, portaria) são idênticos aos de antes: provado com as contas do código antigo reimplementadas no teste (§4).
- **Login real: BLOQUEADO** (Neon Auth da produção, sem senha conhecida das contas de teste e sem repetição permitida). Os fluxos logados foram cobertos por testes de banco com sessão simulada; no navegador foram validados home, evento, checkout anônimo, rotas protegidas, o proxy do login e a portaria (validar e reutilizar QR).
- **Recomendação:** o código pode ir para a produção (é melhor do que o que está lá e não quebra jornadas), **com as condições do §8**. A plataforma **não** atende ainda aos critérios de "liberação de segurança": há P1 abertos (SEC-201, SEC-203, SEC-402 e o resto do SEC-305) e uma correção P2 que falhou (SEC-003).

## 2. Painel

### Achados

| Severidade | Encontrados | Corrigidos (com código) | Validados | Validados em parte | Correção falhou | Abertos sem correção | Bloqueado / não testado |
|---|---|---|---|---|---|---|---|
| P0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| P1 | 11 | 8 | 7 | 1 | 0 | 2 (SEC-201, SEC-402) | 1 bloqueado (SEC-203) |
| P2 | 25 | 12 | 8 | 1 | 3 | 12 | 1 não testado (SEC-210) |
| P3 | 26 | 7 | 6 | 1 | 0 | 18 | 1 não testado (SEC-213) |
| **Total** | **62** | **27** | **21** | **3** | **3** | **32** | **3** |

"Corrigidos" = achados com código de correção no branch (inclui os validados em parte e os que falharam). Abertos sem correção, por motivo: decisão ou ação do dono (SEC-012, 106, 107, 108, 201, 202, 203, 204, 205, 208, 209, 210, 213, 306, 311, 312), terceiro/Neon (SEC-002, 005, 403), não priorizados pelo AppSec (SEC-007, 109, 206, 207, 211, 313–320) e novos desta validação (SEC-400, 401, 402).

### Testes

| Bloco | Executados | Aprovados | Falharam | Bloqueados / não testados |
|---|---|---|---|---|
| Suíte automatizada final (`pnpm test`) | 261 | 257 | 0 (+4 falhas esperadas que documentam SEC-008, SEC-400 ×2, SEC-401) | — |
| Rodadas "sem a correção" | 20 correções | 20 (todas com teste que falha sem a correção) | 0 | — |
| Jornadas no navegador | 14 | 10 | 0 | 2 bloqueadas (fluxos logados), 2 não testadas (câmera; build de produção) |
| Tipos / lint / audit / CI | 4 | 4 | 0 | — |

### Outras métricas do painel (seção 27 do prompt)

| Métrica | Valor |
|---|---|
| Endpoints inventariados / testados | Inventário em `attack-surface.md` (Red Team); contagem total **não medida** por mim. Testados no navegador: 21 rotas do `/api/auth/*`, portaria (entrar, ler, reler), 4 rotas protegidas, home, evento, checkout |
| Regras de autorização testadas | não contadas como número; cobertas por `sec-red-team`, `team`, `painel`, `finance-isolation`, `bank-access`, `sec-campaigns`, `sec-audience`, `checkin-security` (todos passando) |
| Dependências vulneráveis | 7 avisos de produção (1 crítico, 2 altos, 1 moderado, 3 baixos), todos dentro de `@neondatabase/auth`; exceção com prazo até 31/12/2026 |
| Segredos expostos | Histórico do git: 0 (Gitleaks do Blue Team e do CI). Fora do git: segredo do login e URL da produção nos arquivos de ambiente desta pasta (SEC-200, SEC-204); senha do banco em sessão anterior (SEC-203) |
| Problemas financeiros | SEC-100…109 e SEC-402 (11); corrigidos e validados: SEC-100…105 |
| Problemas de concorrência | SEC-102, 104, 301, 302, 400 (5); abertos: SEC-400 |
| Controles de abuso implementados | login 5/e-mail/15 min; cadastro 20/h por IP (/64); 2FA atômico; ativação 5/e-mail e 20/IP; webhook de e-mail 1/10 s e 8/h; pedidos 12/10 min; reservas 3 eventos/conta e 1 pedido/CPF/evento; cupom 20/IP e 10/conta (só em sequência, SEC-400); IA e Google com cota e teto; e-mail de teste 5/h e 20/dia; troca de e-mail 10/dia; transferência 20/h; cartão 10/h |
| Alertas configurados | 0 (SEC-207, SEC-320: só registro `{"k":"abuse"}` no log) |

## 3. As 5 prioridades do dono

| # | Prioridade | Veredito | Base |
|---|---|---|---|
| 1 | Comprar ingresso sem confirmação válida de pagamento | **VALIDADO, com ressalva SEC-402** | Único caminho de emissão sem cobrança é `confirmPayment`, que exige `testPaymentsAllowed()`; webhook e `checkPayment` exigem a Stripe e conferem valor, moeda e modo (SEC-101). Testes `sec-test-payments`, `payment-confirm`, `webhook` (falham sem as correções). Ressalva: se a produção for publicada de um build feito com `.env.local` e estiver sem a chave da Stripe, o modo de teste volta a ligar sozinho (SEC-402) |
| 2 | Alterar valores enviados pelo navegador | **VALIDADO** | Preço, taxa, meia, cupom, parcelas e quantidade recalculados no servidor; `money-tamper.test.ts` (11 casos) passando, inclusive cupom de 1 uso em pedidos simultâneos (SEC-102) |
| 3 | Acessar dados de outros organizadores | **VALIDADO** (com SEC-401 e SEC-008 abertos) | `finance-isolation`, `bank-access`, `team`, `painel`, `sec-audience`, `sec-campaigns`, `sec-red-team` passando; equipe não vira produtora (SEC-001). Abertos: ex-admin pode manter a portaria do evento (SEC-401) e a criação de cupom revela código de outra produtora (SEC-008, P3) |
| 4 | Reutilizar QR code | **VALIDADO** | `checkin-security` (10 operadores no mesmo QR → 1 entrada; código digitado depois recusado) e jornada no navegador: 1ª leitura entra, 2ª mostra "Já entrou às…", rastro `checkin` + `checkin_recusado` |
| 5 | Vender acima da capacidade | **VALIDADO** | `stock`, `stock-fair`, `fulfill-atomic`, `capacity-group` (SEC-104) e `sec-lot-reduce` (SEC-105) passando; os dois últimos falham sem as correções |

## 4. Vereditos das duas correções de risco alto

### SEC-303 — proxy do login como lista de permissão: **VALIDADO**

Lista no código: `get-session` (GET), `token` (GET), `sign-out` (POST), `sign-in/social` (POST), `callback/*` (GET/POST), `email-otp/verify-email` (POST, com freio). Conferi no SDK (`@neondatabase/auth/dist/next/server`) que o proxy repassa exatamente `params.path` (o mesmo caminho conferido) e que as chamadas do servidor (`auth.*` nas ações) vão direto ao Neon Auth, sem passar pelo `/api/auth`.

| Fluxo do site | O que o navegador chama | Passa pelo `/api/auth`? | Na lista? |
|---|---|---|---|
| Entrar (senha, página e checkout) | ação `signInWithEmail` / `signInInline` → `auth.signIn.email` no servidor | não | — |
| Cadastro | ação `signUpWithEmail` / `signUpInline` → servidor; o código de ativação sai pelo webhook | não | — |
| Ativação | `authClient.emailOtp.verifyEmail` (`activate-form.tsx`) | `POST email-otp/verify-email` | sim (5/e-mail, 20/IP) |
| Reenviar ativação | ação `resendActivation` → servidor | não | — |
| Google | `authClient.signIn.social` (`google-button.tsx`, `inline-auth.tsx`) | `POST sign-in/social` | sim |
| Volta do Google | Google → `<Neon Auth>/callback/google` (ou `/api/auth/callback/*` se vier pelo nosso domínio); depois `/verificacao?neon_auth_session_verifier=…`, trocado pelo middleware (`src/proxy.ts`) direto no Neon; o cliente pode pedir a sessão com o verificador | `callback/*`, `GET get-session` | sim |
| Apple | rotas próprias `/api/apple/start` e `/api/apple/callback` + ação `finishAppleSignIn` (servidor); o código de "entrar" é capturado no webhook antes do freio | não | — |
| Sair | ação `signOut`/`signOutTo` (servidor); "usar outro e-mail" na ativação usa `authClient.signOut` | `POST sign-out` (só esse caso) | sim |
| Sessão | `getSession`/`useSession` do cliente; `getJWTToken` → `token` (não usado pelo nosso código) | `GET get-session`, `GET token` | sim |
| Esqueci a senha / troca de senha | ações `requestPasswordLink`, `sendMyPasswordLink`, `resetWithLink` (servidor) | não | — |
| Troca de e-mail | ações `authorizeEmailChange`, `requestNewEmail`, `confirmNewEmail` (servidor) | não | — |
| 2FA (código por e-mail, app, recuperação) | ações próprias (`verificacao.ts`, `conta.ts`, `src/lib/mfa.ts`) | não | — |
| Páginas protegidas | middleware do Neon Auth no servidor (`get-session` direto no Neon) | não | — |

Busca no código: as únicas chamadas de cliente do Neon Auth são `emailOtp.verifyEmail`, `signOut` e `signIn.social` (`grep loadAuthClient`), mais as de sessão do próprio SDK. Nenhum `fetch("/api/auth/…")` manual. **Nenhum fluxo usa rota fora da lista.** Navegador: 20 rotas fora da lista → 403 sem chegar ao Neon Auth; `GET get-session` → 200. Testes: 4 de 5 falham sem a correção.

Ressalvas: o controle vale para o **nosso** domínio; o Neon Auth hospedado continua acessível direto e o endereço dele aparece no `redirect_uri` do Google (SEC-403, hipótese não testada por regra). O freio do webhook continua valendo para todo e-mail que o Neon pedir para mandar.

### SEC-200 — chaves derivadas aceitam QR e TOTP antigos sem variável nova: **VALIDADO**

- **Sem `TW_SIGNING_SECRET`** (estado atual da produção), `currentKey` e `acceptedKeys` devolvem só o `NEON_AUTH_COOKIE_SECRET` em modo "raw", e cada conta usa exatamente a fórmula antiga (inclusive o `trim()`): QR `HMAC(segredo, código:segredo_do_ingresso)[0..16]`, `tw_mfa`, hash do código por e-mail `sha256(segredo:…)`, AES-GCM do app `sha256(segredo:totp)`, hash da recuperação, cookie do banco, cookie da portaria e o cookie lacrado da Apple (que usa a mesma cifra do app).
- **Prova:** `tests/unit/qa-sec200-legado.test.ts` reimplementa as funções de `2865fda` e confere pelas funções públicas de hoje: QR e cookie da portaria iguais byte a byte; segredo do app cifrado pelo código antigo + código atual do app → aceito e **não** recifrado; recuperação, código por e-mail, `tw_mfa` e cookie do banco antigos → aceitos. Com `TW_SIGNING_SECRET`: todos os antigos continuam aceitos e o app é recifrado no primeiro uso. Depois da troca do segredo do login (`TW_LEGACY_SECRET`): QR, app, recuperação e portaria antigos continuam; banco, 2ª etapa e código por e-mail deixam de valer, como o plano diz. Assinaturas com outro segredo são recusadas em todos os cenários.
- Ressalvas (não impedem o deploy): até o dono girar, o segredo atual (nesta pasta) continua abrindo tudo; depois do passo 4, conta com app que não entrou nenhuma vez recebe erro genérico (a cifra antiga sai da lista) — os códigos de recuperação continuam funcionando.

## 5. Riscos residuais

1. **SEC-402 (P1):** modo de teste ligado na produção se o build vier desta pasta e a chave da Stripe faltar.
2. **SEC-200/203/204 (P1/P2):** segredo do login e senha do banco precisam ser girados pelo dono; o desenvolvimento usa os valores da produção.
3. **SEC-201 (P1):** repositório público: este relatório e os furos abertos são publicados a cada push.
4. **SEC-401 (P2):** ex-admin pode manter a portaria do evento.
5. **SEC-400 (P2):** freios de cupom e de código da portaria contornáveis por rajada.
6. **SEC-403 (P2, hipótese):** rotas do Neon Auth hospedado fora dos nossos controles; e SEC-312 (Turnstile falha aberto sem chaves).
7. **SEC-305/306 (P1/P2):** estoque segurado por contas/CPFs gerados em série e fila reaproveitável (decisão comercial).
8. **SEC-002/005 (P2):** pré-sequestro pela Apple e sessões que sobrevivem à troca de senha (dependem do Neon/decisão).
9. **SEC-207/320:** sem alertas: um ataque em andamento não avisa ninguém.
10. Fluxos logados não foram exercitados no navegador (login BLOQUEADO); a cobertura é por testes com sessão simulada.

## 6. Decisões pendentes do dono (resumo de `findings/decisoes.md`)

| Decisão | Assunto | Recomendação registrada |
|---|---|---|
| D-SEC-03-0 / D-SEC-04-1 | Modo de teste na produção (SEC-100) | Antes do deploy: se ainda sem chave da Stripe e quiser vender em modo de teste, criar `ALLOW_TEST_PAYMENTS=1`; sem isso, evento pago para de vender. **Somar SEC-402:** publicar só build feito fora desta pasta |
| D-SEC-02-1 / D-SEC-03-7 | Rotação do segredo (SEC-200) | Plano em 5 passos (`security-fixes.md`); segredo próprio no desenvolvimento |
| D-SEC-02-2 | Repositório público (SEC-201) | Tornar privado antes do próximo push com achado aberto |
| D-SEC-02-3 | Senha e papel do banco (SEC-203, SEC-202) | Girar a senha já; papel `app_rw` depois de testar |
| D-SEC-02-4 | Separar desenvolvimento e produção (SEC-204) | Tirar `DATABASE_URL_PROD` e `.env.cloudflare` da pasta |
| D-SEC-02-5 / D-SEC-02-6 | CSP em modo de bloqueio; HSTS com subdomínios | Uma semana de log limpo → `CSP_MODE=enforce`; HSTS depois de conferir HTTPS em todos os subdomínios |
| D-SEC-02-7 | Guarda de `security_events` | 1 ano, poda no cron |
| D-SEC-02-8 / D-SEC-02-9 | PITR, R2 sem acesso público, Logpush/alertas; exceções do audit | Conferir no painel; perguntar ao Neon (D-06) |
| D-SEC-03-1 | Reserva e fila (SEC-305, SEC-306) | E-mail confirmado para reservar (pelo menos com fila), grupo de 60→20 min, fila presa à conta |
| D-SEC-03-2 | E-mail marketing exige e-mail confirmado | Aplicado; produtor antigo sem confirmação perde só o e-mail marketing |
| D-SEC-03-3 | Cupom único por evento (SEC-008) | SQL pronto, aplicar antes do código |
| D-SEC-03-4 | Contas que viraram produtoras pelo SEC-001 | Consulta só de leitura na produção |
| D-SEC-03-5 | Tetos de IA e Google | Ajustar ao orçamento |
| D-SEC-03-6 | Apple (SEC-002), revogar sessões (SEC-005), plugins e domínios do Neon (SEC-303/**SEC-403**), chaves do Turnstile (SEC-312) | Recusar vínculo Apple de conta não confirmada; conferir o console do Neon |
| D-SEC-04-2 / 04-3 / 04-4 | Repasse da revenda, CHECK no banco, chargeback | Decidir o repasse; SQL de CHECK pronto; ouvir `charge.dispute.created` |
| D-SEC-06-1 / 06-2 (novas, Agente 06) | Como a produção é construída (SEC-402); o que o Neon permite restringir no host do login (SEC-403) | Build só pela integração da Cloudflare ou cópia limpa, e corrigir SEC-402 no código; perguntar ao Neon |

## 7. Critérios de aprovação (seção 29)

| Critério | Atendido? | Observação |
|---|---|---|
| Nenhum P0 confirmado aberto | **Sim** | 0 P0 |
| P1 corrigidos ou com risco aceito explicitamente | **Não** | Abertos: SEC-201, SEC-203 (dono), SEC-402 (novo), resto do SEC-305 (decisão). SEC-200 corrigido no código, rotação pendente |
| Controles críticos de autorização testados | Sim | Testes de banco com sessão simulada; uma falha (SEC-003/SEC-401) |
| Autenticação revisada | Sim, com bloqueio | Revisão de código e testes com Neon simulado; login real BLOQUEADO |
| Segredos avaliados | Sim | Rotação pendente (SEC-200/203) |
| APIs sensíveis auditadas | Sim | Inventário do Red Team + proxy do login conferido |
| Permissões administrativas testadas | Em parte | Central por leitura de código e testes existentes; sem login real |
| Dependências críticas avaliadas | Sim | Audit de hoje: só o SDK do Neon Auth, exceção com prazo |
| Valores validados pelo servidor | **Sim** | Prioridade 2 |
| Confirmações de pagamento seguras | Sim, com ressalva | SEC-402 |
| Webhooks protegidos | Sim | Assinatura, dedupe, valor/moeda/modo |
| Emissão indevida impedida | Sim, com ressalva | SEC-402 |
| Concorrência tratada | Em parte | Estoque, cupom, 2FA, emissão: sim. Freios "só o erro conta": não (SEC-400) |
| Operações financeiras com autorização | Sim | Banco com senha + TOTP; isolamento por produtora |
| Estados de pedido consistentes | Sim | Transições condicionais (Agente 04), testes passando |
| Controles proporcionais nos endpoints sensíveis | Em parte | Ver SEC-400, SEC-403, SEC-312 |
| Observabilidade / abuso identificável | **Não** | Sem alertas (SEC-207, SEC-320) |
| Limites em operações críticas | Sim | Ver §2 |
| Sem bloqueio indevido grave de legítimos | Sim | Jornadas e suíte passam; efeitos conhecidos: SEC-304 (produtor sem e-mail confirmado), SEC-100 (sem chave e sem `ALLOW_TEST_PAYMENTS`), trava de 15 min no login |
| Alterações importantes com testes | Sim | 20/20 com teste que falha sem a correção |
| Testes de regressão passam | Sim | 257 passando, 0 falhas |
| O sistema compila | Sim | `tsc` 0 erros; build de produção não gerado por mim (o AppSec registrou build OK em cópia limpa) |
| Sem novos erros relevantes introduzidos | Sim | Nenhuma regressão de jornada; SEC-400/401/402 são lacunas das correções, não pioras |
| Correções com evidência | Sim | `security-tests.md` |
| Riscos residuais documentados | Sim | §5 e registro |

## 8. Recomendação de liberação

**Pode ir para a produção** (o código de segurança deste branch, que é estritamente melhor do que o que está publicado e não quebra jornadas legítimas):
- SEC-001, 004, 009/321, 010, 011/308, 101–105, 200 (sem variável nova é idêntico), 300, 301, 303/006, 304, 305 (parte), 307 (mensagens), 309, 310 (parte), 302 (`allowHit`) e o CI (SEC-212);
- SEC-003 também pode ir: mesmo contornável (SEC-401), fecha o caso principal e não piora nada.

**Condições antes ou junto do deploy:**
1. **D-SEC-03-0:** decidir o modo de teste. Sem `STRIPE_SECRET_KEY` e sem `ALLOW_TEST_PAYMENTS=1`, a produção para de vender evento pago (grátis continua).
2. **SEC-402:** publicar só um build feito fora desta pasta (integração da Cloudflare ou cópia limpa, como o AppSec fez). Um build daqui grava o `NEXT_PUBLIC_SITE_URL` de desenvolvimento e liga o modo de teste sem a variável. Melhor ainda: corrigir o SEC-402 no código antes. O build do branch `hotfix/sec-100` registrado em `$S/sec/hotfix-build.log` (31/10 08:11) não carregou arquivo `.env` (pasta sem `.env.local`): esse não tem o problema.
3. Nenhuma mudança de schema é necessária para estas correções (confirmado pelo AppSec; nada no diff toca `src/db/schema.ts`).
4. Avisar quem usa e-mail marketing sem e-mail confirmado (D-SEC-03-2).

**Não pode ser considerado liberado do ponto de vista de segurança** (critérios do §7 não atendidos):
- **SEC-402** (P1) aberto; **SEC-201** e **SEC-203** (P1, ações do dono); rotação do **SEC-200** não feita; resto do **SEC-305** sem decisão;
- correção do **SEC-003** contornável (**SEC-401**) e freios do **SEC-302/307** contornáveis (**SEC-400**): devolvidos ao Agente 03, com os testes `it.fails` prontos para virar regressão;
- sem alertas (SEC-207/320) e com login real não exercitado no navegador.

Próximo passo sugerido: Agente 03 corrige SEC-402, SEC-401 e SEC-400 (todos pequenos, sem schema) e o Agente 06 revalida com os testes já escritos; o dono executa D-SEC-02-2, D-SEC-02-3 e a rotação do SEC-200.
