# Testes de segurança — validação independente (Agente 06)

Validação das correções da fase 2 (commits `2865fda..52191a2`, branch `claude/auditoria-noturna`). Nada foi aceito pela palavra de outro agente: para cada correção o diff foi lido, a causa conferida, os contornos procurados e os testes rodados **com** a correção e **sem** ela (código de produção revertido numa cópia de trabalho separada, nunca no diretório do projeto e nunca commitado).

Status usados: **VALIDADO · FALHOU · NÃO TESTADO · BLOQUEADO**. Números abaixo são os que as ferramentas imprimiram; onde algo não foi medido, está dito.

## 1. Ambiente

| Item | Valor |
|---|---|
| Código | HEAD `52191a2` (antes dos testes do Agente 06) |
| Banco | branch Neon de teste (`TEST_DATABASE_URL` = `$S/.dburl`), só dados fictícios `qa-test-…` |
| Servidor | `next dev -p 3042` (não havia nenhum no ar; subi um só, com o banco de teste) |
| Navegador | Playwright (Chromium 153) com `NODE_PATH=$(npm root -g)` |
| Login real | **BLOQUEADO**: o Neon Auth é o da produção. As contas da missão (`teste+agente1030`, `teste+marcos-*`) não têm senha registrada em nenhum script; a única conta com script (`teste+seguranca@example.com`) já recebeu "E-mail ou senha incorretos" do AppSec. Pela regra (sem repetição contra o login), não tentei. Os fluxos logados foram cobertos por testes de banco com sessão simulada |
| Scripts e prints | `$S/sec/qa/` (`revert-check.sh`, `revert-hist.sh`, `journeys.cjs`, `fx/portaria.fx.ts`, `*.png`, saídas `revert/*.summary`) |

## 2. Suíte completa, tipos e lint

| Verificação | Comando | Resultado |
|---|---|---|
| Suíte no HEAD recebido (`52191a2`) | `TEST_DATABASE_URL=… pnpm test` | **65 arquivos, 252 passando, 1 falha esperada** (`it.fails` do SEC-008, criação de cupom), 0 falhas. 184,5 s. Bate com o que o AppSec registrou |
| Suíte com os testes do Agente 06 | idem | ver seção 2.1 |
| Tipos | `pnpm exec tsc --noEmit` | 0 erros (antes e depois dos meus testes) |
| Lint | `pnpm exec eslint src tests` | 0 erros, 0 avisos (antes e depois) |
| Dependências | `pnpm audit --prod --audit-level=high --json` + `.github/scripts/audit-gate.mjs` | 1 crítico, 2 altos, 1 moderado, 3 baixos, **todos dentro de `@neondatabase/auth`**; os 3 altos/críticos estão na exceção com prazo (31/12/2026); "bloqueantes sem exceção: 0" |
| CI no GitHub | `gh run list --branch claude/auditoria-noturna` | último run (`52191a2`, 41165508498): **success** |

### 2.1 Suíte final (HEAD + testes do Agente 06)

`TEST_DATABASE_URL=… pnpm test`: **68 arquivos, 257 passando, 4 falhas esperadas, 0 falhas** (191 s). As 4 falhas esperadas são `it.fails` que documentam furos ainda abertos: SEC-008 (criação de cupom, do Red Team), SEC-400 ×2 (rajada na portaria e no cupom) e SEC-401 (rotação da portaria). Os 5 testes novos que passam: 4 de equivalência do SEC-200 e o controle em sequência do SEC-400. `tsc --noEmit` e `eslint src tests`: 0 erros.

## 3. Regressão por correção: com e sem a correção

Método A (padrão): `git show <commit> -- src | git apply -R` numa worktree separada (`$S/sec/qa/wt`), só no código de produção; os testes ficam os do HEAD. Método B (quando o commit não reverte sozinho porque outro commit mexeu nas mesmas linhas): código de produção no pai do commit (`C^`) com os testes do próprio commit (`C`), e controle com o código do commit. Depois de cada rodada a worktree volta ao HEAD.

| Achado | Commit | Testes (arquivo › casos) | O que provam | Com a correção | Sem a correção (falham / total) | Método |
|---|---|---|---|---|---|---|
| SEC-100 | `8979507` | `unit/test-payments.test.ts` (5), `db/sec-test-payments.test.ts` (4) | Produção sem chave da Stripe não reserva nem confirma pedido pago; `ALLOW_TEST_PAYMENTS=1` libera; fora da produção segue o modo de teste; grátis sai | 9/9 | **7/9** (5 unitários: a função não existia; 2 de banco: pedido pago reservado e confirmado sem pagar) | A (3way) |
| SEC-101 | `f894ff6` | `db/payment-confirm.test.ts` (10), `db/webhook.test.ts` (3) | Webhook/`checkPayment` só emitem com valor, moeda e modo iguais aos do pedido; repetição e ordem trocada não duplicam | 13/13 | **4/13** (valor menor, outra moeda, modo trocado, emissão direta com valor divergente) | B |
| SEC-102 | `d8dc67a` | `db/money-tamper.test.ts` (11) | Cupom de 1 uso: segundo pedido aberto não leva o desconto; duas confirmações simultâneas usam o cupom uma vez | 11/11 | **2/11** | B |
| SEC-103 | `403d116` | `db/checkin-security.test.ts` (6) | Portaria recusa evento cancelado e pedido não pago; 10 operadores no mesmo QR → 1 entrada | 6/6 | **2/6** | A |
| SEC-104 | `f8ae6e4` | `db/capacity-group.test.ts` (3) | Parte de grupo não passa da lotação quando o lote é reduzido | 3/3 | **1/3** | A |
| SEC-105 | `26b74fc` | `db/sec-lot-reduce.test.ts` (1) | Editor não reduz lote abaixo de vendidos + reservados | 1/1 | **1/1** | A |
| SEC-001 | `9c8f713` | `db/sec-red-team.test.ts` › "SEC-001", "SEC-001 (controles)" | Portaria/admin de outra produtora não conclui o cadastro de produtor nem ganha produtora; aprovado e produtor antigo continuam | 5/5 (no commit) | **2/5** | B |
| SEC-003 | `708a8ce` | `db/sec-red-team.test.ts` › "SEC-003", "SEC-003 (rebaixamento)" | Admin removido/rebaixado: token e código que ele viu deixam de abrir; aparelho conectado continua | 6/6 | **2/6** | A |
| SEC-004 | `458fad2` | `db/sec-red-team.test.ts` › "SEC-004", `db/sec-totp-setup.test.ts` | App autenticador só com o código do e-mail (fator atual) | 7/7 | **2/7** | A |
| SEC-200 | `52af1ba` | `unit/signing-keys.test.ts` (5) | Chaves por finalidade, antigas aceitas, só login/chaveiro leem o segredo | 5/5 | **4/5** (o caso "sem variável nova" passa nos dois, como deve: é o de equivalência) | A |
| SEC-300 | `0a0bcfa` | `unit/sec-login-throttle.test.ts` (4) | 5 logins por e-mail/15 min antes do Neon Auth; cadastro 20/h por IP com IPv6 por /64 | 4/4 | **3/4** | A |
| SEC-301 | `e5445fd` | `unit/sec-limiters.test.ts` › 2 "SEC-301", `db/attempts.test.ts` (3) | 20 códigos de e-mail / 30 do app em paralelo não passam de 5 / 6 conferências; contador atômico no Postgres | 15/15 (no commit) | **2 falham + 3 não rodam** (o módulo `attempts` não existia) | B |
| SEC-302 | `7acb6bb` | `unit/sec-limiters.test.ts` › 2 "SEC-302", `db/attempts.test.ts` › "SEC-302" | `allowHit` atômico (30 → 12) e falha fechada | 17/17 | **3/17** | A |
| SEC-303 | `3ea2589` | `unit/sec-auth-proxy.test.ts` (5) | Lista de permissão do `/api/auth/*`; 25 rotas dão 403 sem chamar o Neon Auth; método/caminho estranho recusado; ativação 5 por e-mail e 20 por IP; webhook 1 e-mail por intervalo | 5/5 | **4/5** (o que sobra é "as permitidas chegam ao handler", que valia antes também) | A |
| SEC-304 / SEC-010 | `b92e206` | `db/sec-campaigns.test.ts` (3) | E-mail marketing só para produtor com e-mail confirmado; teste limitado a 5/h por campanha | 3/3 | **3/3** | A |
| SEC-305 | `7b0736b` | `db/sec-holds.test.ts` (2) | Conta segura até 3 eventos; CPF segura 1 pedido por evento | 2/2 | **2/2** | A |
| SEC-307 / SEC-008 (checkout) | `98bb01c` | `db/sec-coupon.test.ts` (2) | Mesma resposta para cupom de outro evento, vencido e inexistente; 11º erro por conta recusado | 2/2 | **2/2** | A |
| SEC-308 / SEC-011 | `a86a911` | `unit/sec-ai-quota.test.ts` (3) | IA só para produtor confirmado; 35 em paralelo → 30; teto da plataforma | 3/3 | **3/3** | A |
| SEC-309 | `d6ed990` | `unit/sec-email-change.test.ts` (2) | E-mail de outra conta: mesma resposta, nenhum código; 10 tentativas por dia | 2/2 | **2/2** | A |
| SEC-009 / SEC-321 | `87cc3f3` | `db/sec-audience.test.ts` (1) | "Excluir compradores de" só aceita evento próprio | 1/1 | **1/1** | A |

Saídas: `$S/sec/qa/revert-all.txt` (método A) e `$S/sec/qa/revert-hist-all.txt` (método B), com o nome de cada caso que falhou. **Todas as 20 correções têm pelo menos um teste que falha sem elas.**

## 4. Testes novos do Agente 06 (contornos e equivalência)

| Arquivo › caso | O que prova | Resultado | Sem a correção |
|---|---|---|---|
| `tests/unit/qa-sec200-legado.test.ts` › A) sem variável nova | Reimplementa as contas do código antigo (`2865fda`) e confere pelas funções de hoje: QR (byte a byte), segredo do app cifrado antes + código atual do app, código de recuperação antigo, código por e-mail antigo, cookie `tw_mfa`, cookie do banco e cookie da portaria (byte a byte): **todos aceitos, nada recifrado** | passa | falha (API nova ausente; não mede compatibilidade) |
| idem › B) com `TW_SIGNING_SECRET` | Tudo o que é antigo continua aceito; o QR novo é diferente; o segredo do app é recifrado no primeiro uso | passa | falha |
| idem › C) depois da troca do segredo do login | QR, app, recuperação e portaria antigos continuam; banco, `tw_mfa` e código por e-mail antigos deixam de valer (como o plano diz) | passa | falha |
| idem › controle | Artefatos com outro segredo recusados nos três cenários | passa | falha |
| `tests/db/qa-sec400-rajada.test.ts` › controle em sequência | O 9º código errado da portaria (mesmo IP) é recusado | passa | — |
| idem › rajada portaria (`it.fails`) | 40 códigos errados simultâneos do mesmo IP: **40 conferidos** (limite 8) | falha esperada: **furo confirmado (SEC-400)** | — |
| idem › rajada cupom (`it.fails`) | 50 cupons errados simultâneos do mesmo IP em `checkCoupon`: **50 conferidos** (limite 20) | falha esperada: **furo confirmado (SEC-400)** | — |
| `tests/db/qa-sec401-portaria-rotacao.test.ts` (`it.fails`) | Admin cria um acesso da portaria com um e-mail dele; a dona o remove; a rotação do SEC-003 **reenvia o token novo para esse e-mail**, e o token abre a portaria (`{"acessoDesligado":false,"tokenTrocado":true,"reenviadoParaEmailDoExAdmin":1,"tokenReenviadoAbre":true}`) | falha esperada: **furo confirmado (SEC-401)** | — |

Os `it.fails` afirmam o comportamento seguro: quando a correção entrar, eles passam a acusar erro e devem virar `it`.

## 5. Jornadas no navegador (`http://localhost:3042`)

Script `$S/sec/qa/journeys.cjs`; prints `$S/sec/qa/j*.png`. Dados fictícios criados e apagados por `$S/sec/qa/fx/portaria.fx.ts` (produtora, evento publicado, 1 ingresso emitido em modo de teste, 1 acesso de portaria).

| Jornada | Status | Evidência |
|---|---|---|
| Comprador: home | **VALIDADO** | HTTP 200, sem a palavra "Stripe" (`j1-home.png`) |
| Comprador: página do evento | **VALIDADO** | HTTP 200, título do evento fictício (`j2-evento.png`) |
| Comprador: checkout (anônimo) | **VALIDADO** | HTTP 200; no `next dev` o modo de teste segue ligado (não aparece "Pagamento indisponível"); sem "Stripe" (`j3-checkout.png`) |
| Comprador: criar pedido, pagar em modo de teste, ver em Meus ingressos | **BLOQUEADO** no navegador (exige login real). Coberto por `place-order`, `payment-confirm`, `money-tamper`, `tickets` (sessão simulada), todos passando |
| Sessão: `/meus-ingressos`, `/painel`, `/conta/seguranca`, `/criar-evento` sem login | **VALIDADO** | todos vão para `/entrar?next=…` |
| Produtor: painel, criar/editar evento, equipe, e-mail marketing | **BLOQUEADO** no navegador (login). Coberto por `painel`, `team`, `edit-types`, `produtoras`, `sec-campaigns`, `sec-red-team`, `sec-lot-reduce`, todos passando |
| Proxy do login: 20 rotas fora da lista (login/cadastro por senha, envio de código, link mágico, redefinir senha, sessões, trocar senha/e-mail, 2FA, apagar conta, admin, token anônimo, `sign-in%2Femail`, maiúsculas, `..%2F`, `GET sign-out`, `POST get-session`) | **VALIDADO** | todas **403** (sem chegar ao Neon Auth) |
| Proxy do login: `GET /api/auth/get-session` | **VALIDADO** | 200 (um único pedido, sem cookie) |
| Portaria: código de acesso errado | **VALIDADO** | "Código inválido, desligado ou de um evento que já acabou." (`j6a`) |
| Portaria: entrar com o código de acesso | **VALIDADO** | app aberto no evento fictício (`j6b`) |
| Portaria: validar o ingresso (código digitado) | **VALIDADO** | contador "1 de 1 entraram" (`j6c`); no banco: `status=used`, rastro `emitido → checkin` |
| Portaria: reutilizar o mesmo ingresso | **VALIDADO** | tela vermelha "JÁ ENTROU ÀS 05:26" (`j6d`); rastro `checkin_recusado`. (O roteiro procurava o texto "já utilizado" e marcou FALHOU; o print e o banco mostram a recusa: falso negativo do roteiro, conferido à mão) |
| Portaria: leitura do QR pela câmera | **NÃO TESTADO** no navegador (sem câmera; o QR assinado exige o segredo do servidor, que não leio). Coberto por `checkin-security` (QR assinado, troca de assinatura, 10 operadores) |
| Modo de teste desligado num build de produção (SEC-100) | **NÃO TESTADO** no navegador (exigiria build de produção local). Coberto por `test-payments` e `sec-test-payments`; ver SEC-402 |

## 6. Leitura de código feita para os vereditos de alto risco

- **SEC-303**: comparei cada chamada que o navegador faz ao `/api/auth/*` com a lista de permissão (ver `security-final-report.md` §4). Resultado: nenhum fluxo do site depende de rota bloqueada.
- **SEC-200**: conferi linha a linha que, sem `TW_SIGNING_SECRET`, cada conta (QR, `tw_mfa`, hash do código por e-mail, AES do TOTP, hash da recuperação, cookie do banco, cookie da portaria, cookie da Apple) é a mesma de `2865fda` (inclusive o `trim()` do segredo), e provei com o teste da seção 4.

## 7. Não testado / bloqueado

| Item | Motivo |
|---|---|
| Login real, cadastro, Google, Apple, ativação de ponta a ponta | Neon Auth da produção; sem força bruta nem repetição. Coberto por leitura do SDK e por testes com o Neon Auth simulado |
| Chamadas diretas ao Neon Auth hospedado (SEC-403) | Proibido (terceiro/produção). Registrado como hipótese |
| Stripe, Resend, Turnstile, Apple, Google | Terceiros: só leitura do código |
| Build de produção e Worker | Não gerei build de produção (`pnpm deploy` é proibido e não foi preciso): a evidência do SEC-402 vem do build já existente em `.open-next` (29/10) e do código do Next (`define-env.js`) |
| Carga e concorrência em escala | Só as rajadas pequenas dos testes (≤ 50 pedidos, banco de teste) |
