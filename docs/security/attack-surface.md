# Superfície de ataque — Tickets Win

Agente 01 (Red Team), fase 1 da operação de segurança. Levantamento feito **lendo o código** do branch `claude/auditoria-noturna` (commit-base `2865fda`) e com testes de banco contra o branch Neon de teste. Nada foi testado contra a produção, o Neon Auth, a Stripe, a Apple, o Google ou o Spotify.

Papéis usados abaixo: **anônimo** · **comprador** (conta logada, sem produtora) · **produtor/dono** (dono de produtora) · **admin** e **portaria** (equipe de uma produtora, `organizer_members.role`) · **aparelho da portaria** (cookie `tw_portaria`, sem conta) · **banco** (sessão própria do Banco Tickets Win) · **central** (admin da Tickets Win) · **sistema** (cron, webhooks).

Achados ligados a cada superfície: `docs/security/findings/red-team.md` (SEC-001…).

---

## 1. Arquitetura real

| Camada | O que é | Onde |
|---|---|---|
| Front e back | Next.js 16 (App Router, Server Components, Server Actions), React 19 | `src/app/**`, `src/components/**`, `src/lib/actions/**` |
| Hospedagem | Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`); cron do Worker chama `/api/cron` com token do isolate | `custom-worker.js`, `src/app/api/cron/route.ts:5-8` |
| Banco | Neon Postgres, driver `neon-http` + Drizzle; transações só em lote (`db.batch`) com `ensure`/`pg_advisory_xact_lock` | `src/db/**`, `src/lib/payments/tx.ts` |
| Login | Neon Auth (better-auth hospedado), compartilhado com a produção; cookies do Neon Auth com `sameSite: "lax"` | `src/lib/auth/server.ts:6-14` |
| Segunda etapa (2FA) | própria: TOTP ou código por e-mail, cookie `tw_mfa` = HMAC do id da sessão | `src/lib/mfa.ts`, `src/lib/auth/server.ts:31-47` |
| Apple | OIDC próprio (id_token RS256 conferido com as chaves da Apple) + ponte de código OTP do Neon Auth pelo webhook | `src/lib/auth/apple.ts`, `src/app/api/apple/**`, `src/lib/actions/apple.ts` |
| Pagamento | Stripe (PaymentIntents, Pix, cartão salvo), webhook assinado; sem chave = modo de teste (D-07) | `src/lib/payments/**`, `src/app/api/webhooks/stripe/route.ts` |
| E-mail | Resend (transacional e campanhas), webhook do Neon Auth (`send.otp`) gera os e-mails de login | `src/lib/email.ts`, `src/lib/mail/**`, `src/app/api/webhooks/neon-auth/route.ts` |
| Arquivos | R2 `MEDIA` (imagens em `eventos/`, `destaques/`; PDFs de ingresso em `pdf/`, não servidos) | `src/app/api/midia/route.ts`, `src/app/midia/[...key]/route.ts` |
| Estado rápido | KV (limites, códigos 2FA, links de senha, fila, deduplicação de webhook) | vários |
| Terceiros chamados pelo servidor | Stripe, Resend, Turnstile, Google Places, Spotify, Wikipédia, Anthropic (IA de descrição e mapa), JWKS da Apple e do Neon Auth | `src/lib/**` (todas as URLs são fixas no código; nenhuma vem do usuário) |
| Cabeçalhos | `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, HSTS, `Permissions-Policy` em tudo (`next.config.ts:8-14`); CSP com nonce no proxy, em **Report-Only** até a D-10 (`src/lib/csp.ts`, `src/proxy.ts:18-31`) | |

### Proxy (`src/proxy.ts`)
- `www.` → domínio principal (308) (`:37-42`).
- `banco.<domínio>`: reescreve tudo para `/banco/*` (`:44-54`); com `BANK_URL`, `/banco` no domínio principal redireciona para o subdomínio (`:56-58`).
- Exige login (middleware do Neon Auth) só em `/meus-ingressos`, `/conta`, `/ingressos`, `/criar-evento`, `/meus-eventos`, `/checkout/*` (`:9`, `:59-65`). **O resto confere a sessão dentro da página/ação.**
- `matcher` deixa `/api/*` de fora (`:84-86`): as rotas de API não recebem CSP nem passam pelo middleware.
- `withNext` só acrescenta `next` em redirecionamento para `/entrar` da mesma origem (`:72-81`).

### Proteções transversais
- **CSRF das Server Actions:** conferência de `Origin` × `Host` do próprio Next (não há `serverActions.allowedOrigins` em `next.config.ts`), cookies de sessão `SameSite=Lax`. Rotas POST com JSON (`/api/checkin`, `/api/criar/descricao`, `/api/mapa/gerar`) dependem do `SameSite=Lax` (POST de outro site não leva o cookie).
- **SQL:** só `sql\`…\`` parametrizado do Drizzle; nenhum `sql.raw` no projeto (busca em `src/**`).
- **`next`/redirecionamentos:** `safeNextParam` (`src/lib/auth/next-param.ts:9-13`) e `safeNext` do Spotify (`src/lib/spotify.ts:132-134`).
- **IP para limites:** `cf-connecting-ip` primeiro (no Worker não é forjável), `x-forwarded-for` só fora da Cloudflare (`src/lib/rate-limit.ts:6-9`).

---

## 2. Rotas de página (`src/app/**/page.tsx`)

| Rota | Quem acessa | Controle aplicado | Dados sensíveis |
|---|---|---|---|
| `/`, `/explorar`, `/eventos/[slug]`, `/artistas/[slug]`, `/produtor/[slug]`, `/produtores`, `/sobre`, `/ajuda/**`, `/legal/**`, `/contato` | anônimo | rascunho só para quem edita (`src/app/eventos/[slug]/page.tsx:163`); dados do evento passam por `toData` (sem `draft`, sem cupons) | nenhum |
| `/entrar`, `/cadastro`, `/esqueci-senha`, `/redefinir-senha`, `/ativar-conta`, `/verificacao`, `/entrar/apple` | anônimo / sessão pendente | `safeNextParam` no `next`; `/verificacao` só com sessão pendente (`src/app/verificacao/page.tsx:17-23`) | e-mail mascarado |
| `/checkout` | anônimo (conta pedida dentro) | ações conferem sessão | CPF/telefone do próprio perfil |
| `/checkout/[orderId]` | comprador dono do pedido | proxy exige login + `getOrderForUser(orderId, userId)` (`src/lib/data/user.ts:30-36`) | pedido |
| `/meus-ingressos`, `/ingressos/[code]` | titular | `holderUserId === user.id` | QR do ingresso |
| `/conta`, `/conta/seguranca`, `/conta/pagamentos`, `/conta/compras/[id]`(+`/comprovante`) | comprador | `contaUser` + `orderDetail(id, user.id)` | CPF, endereço, cartões (Stripe), aparelhos |
| `/transferencia/[token]` | quem tem o link (48 hex) | aceite exige a conta do e-mail de destino, confirmada (`src/lib/actions/tickets.ts:112-116`) | e-mail de destino mascarado |
| `/grupo/[code]` | quem tem o código | só primeiro nome dos participantes | — |
| `/lista/[token]` | convidado (token 22 chars) | evento não pode ser rascunho | QR da lista |
| `/parceiro/[token]` | promoter (token aleatório) | sem dados de comprador (`src/app/parceiro/[token]/page.tsx:25-30`) | vendas e comissão do link |
| `/criar-evento` | produtor aprovado (dono/admin) | proxy + `producerStatus` + `saveEventAs` (`src/lib/criar/save.ts:239-283`) | rascunho com cupons |
| `/meus-eventos` | produtor | sessão | — |
| `/produtores/nova` | produtor aprovado | `createOrganizer` exige produtora com cadastro concluído (`src/lib/actions/produtoras.ts:51-54`) | — |
| `/produtores/cadastro` | inscrição aprovada **ou status "producer"** | `producerStatus` (`src/app/produtores/cadastro/page.tsx:19-21`) → **abre para equipe (SEC-001)** | — |
| `/painel` (+`/publico`, `/financeiro`, `/marketing`, `/promoters`, `/emails`, `/emails/[id]`, `/evento/[id]`) | dono e admin | `painelAccess("admin")` (`src/lib/painel/access.ts:9-15`); **não exige ser produtor** (SEC-010) | compradores (nome, e-mail), vendas, participantes |
| `/painel/configuracoes` | dono | `painelAccess("owner")`; gravação exige `isProducer` (`src/lib/actions/painel.ts:24-33`) | dados bancários de repasse |
| `/painel/equipe`, `/painel/portaria/[id]` | dono, admin, portaria | `painelAccess("portaria")`; links (token+código) só para dono/admin (`src/app/painel/equipe/page.tsx:19-21`) | **tokens e códigos de portaria (SEC-003)**, e-mails da equipe |
| `/portaria` | aparelho da portaria | cookie HMAC + acesso ligado (`src/lib/portaria.ts:62-69`) | nomes dos titulares do evento |
| `/checkin/[token]` | — | só redireciona para `/portaria/entrar/[token]` | — |
| `/banco`, `/banco/entrar`, `/banco/criar` (subdomínio `banco.`) | dono de produtora com evento + TOTP | sessão própria `tw_banco` (HMAC, 30 min, `SameSite=Strict`) (`src/lib/bank.ts:208-236`) | saldo, extrato, destino do saque |
| `/tw-central` | admin da Tickets Win | `adminUser()`: e-mail em `ADMIN_EMAILS` **e** `@ticketswin.com.br`, confirmado, 404 para os outros; TOTP para agir (`src/lib/admin.ts:19-35`) | contas, inscrições, saques, rastro de ingressos |
| `/e/sair/[token]` | destinatário de campanha | token de 32 hex | e-mail do envio |

## 3. Rotas de API e rotas de servidor

| Rota | Método | Quem | Entrada | Controle (arquivo:linha) | Observação |
|---|---|---|---|---|---|
| `/api/auth/[...path]` | GET/POST | qualquer um | repassa ao Neon Auth | bloqueia login/cadastro por senha, OTP de login e troca de e-mail; exige 2FA concluída em ações de conta; caminho normalizado (`route.ts:13-34`) | **repassa endpoints que o site não usa** (SEC-006) |
| `/api/apple/start` | GET | anônimo | `next` | `safeNextParam`, cookie `tw_apple` (state+nonce) `SameSite=None; Secure; HttpOnly; path=/api/apple` (`start/route.ts:7-18`) | — |
| `/api/apple/callback` | POST (form_post) | Apple | `state`, `id_token`, `user` | state em tempo constante, id_token RS256 com JWKS da Apple, `iss`, `aud`, `exp`, `nonce`, `email_verified` (`src/lib/auth/apple.ts:42-84`) | conta existente é assumida pelo e-mail (SEC-002) |
| `/api/webhooks/neon-auth` | POST | Neon Auth | evento assinado | Ed25519 + JWKS + idade 5 min + deduplicação KV (`src/lib/auth/webhook.ts:23-38`, `route.ts:15-34`) | intercepta OTP de login da Apple |
| `/api/webhooks/stripe` | POST | Stripe | evento | `verifyStripeEvent` com `stripe-signature` (`route.ts:47`) | área do Agente 04 |
| `/api/cron` | POST | Worker | `x-cron-token` | token só no isolate (`route.ts:5-8`) | — |
| `/api/checkin` | POST | equipe logada | `{payload}` | `getPainelScope` → eventos da produtora ativa (`route.ts:6-20`) | — |
| `/api/midia` | POST | qualquer conta logada | arquivo | tipo declarado + assinatura dos bytes, 10 MB, 60/h por conta (`route.ts:13-34`) | não exige ser produtor |
| `/midia/[...key]` | GET | anônimo | chave R2 | só `eventos/` e `destaques/`, sem `..` (`route.ts:7`) | `pdf/` fica fora |
| `/api/admin/banner` | POST | central + TOTP | imagem | sniff, 15 MB (`route.ts:11-26`) | — |
| `/api/arte-html` | GET | anônimo | — | página fixa com CSP própria + sandbox (S-36) | — |
| `/api/arte/[slug]`, `/api/og/evento/[slug]` | GET | anônimo | slug | rascunho dá 404 | — |
| `/api/ingressos/[code]/{pdf,ics,apple,google}` | GET | titular | código | `t.holderUserId !== user.id` → 404 (`pdf/route.ts:15-18` e iguais) | — |
| `/api/lista/qr/[token]` | GET | quem tem o token | token 22 chars | só enquanto o nome está na lista | — |
| `/api/fila/[eventId]` | POST | anônimo | cookie de visitante | — | área do Agente 05 |
| `/api/cidades` | GET | anônimo | termo | lista fixa (`municipios.json`) | — |
| `/api/criar/descricao`, `/api/mapa/gerar` | POST | **qualquer conta logada** | JSON | cota diária por conta no KV (30 / 20) | IA paga (SEC-011) |
| `/api/spotify/login`, `/callback`, `/buscar` | GET | conta logada | `next`, `code`, `state` | state + uid no cookie, `safeNext` (`callback/route.ts:18-22`) | — |
| `/api/csp-report` | POST | navegador | relatório | 16 KB, 10 itens, log resumido | — |
| `/painel/portaria/[id]/app` | GET | equipe | id do evento | `painelAccess("portaria")` + evento da produtora (`route.ts:12-27`) | — |
| `/portaria/entrar/[token]` | GET | quem tem o token | token | `activeAccess({token})` (`route.ts:5-16`) | — |
| `/pv/[token]` | GET | inscrito na pré-venda | token | cookie da pré-venda | — |
| `/r/[code]` | GET | anônimo | código | conta clique, cookie do parceiro | cliques infláveis (baixo) |
| `/e/c/[token]/[i]`, `/e/o/[token]`, `/e/ver/[token]`, `/e/sair/[token]/1click` | GET/POST | destinatário | token 32 hex | `/e/ver` serve o HTML com CSP `sandbox` e `script-src 'none'` (`route.ts:36-40`) | `/e/c` redireciona para link do produtor (aceito antes) |

## 4. Server Actions (`"use server"`)

Toda função exportada de um arquivo `"use server"` é um endpoint público (POST com o id da ação). Lista completa por arquivo, com o controle de quem chama:

| Arquivo | Ações | Controle |
|---|---|---|
| `auth.ts` | `signInWithEmail`, `signUpWithEmail`, `signInInline`, `signUpInline`, `signOut`, `signOutTo`, `resendActivation` | Turnstile no login/cadastro, aviso genérico de senha (S-13), `safeNextParam`, freio 30 s / 6 por hora no reenvio |
| `verificacao.ts` | `ensureLoginCode`, `resendLoginCode`, `verifyLoginCode` | só sessão pendente; 5 tentativas por código (e-mail), 6 / 5 min (TOTP) |
| `senha.ts` | `requestPasswordLink`, `sendMyPasswordLink`, `checkResetLink`, `resetWithLink` | resposta igual com ou sem conta; link de uso único no KV (hash), 15 min; **não encerra outras sessões no código (SEC-005)** |
| `conta.ts` | perfil, avatar, marketing, troca de e-mail (3 passos), aparelhos, métodos, 2FA | `me()` exige sessão sem pendência (`:20-24`); troca de e-mail pede código no atual e no novo; **ligar app autenticador com 2FA por e-mail não pede o código atual (SEC-004)** |
| `apple.ts` | `finishAppleSignIn` | cookie lacrado (AES-GCM) de 2 min |
| `admin.ts` | inscrições, saques, destaques, banners, liberar produtor | `guard()` = `adminUser` + TOTP (`:17-22`) |
| `banco.ts` | login do banco (senha + TOTP), criar/recuperar acesso (e-mail + TOTP + senha), saque, cancelar saque | Turnstile, 5 erros → 15 min, saque com TOTP e trava por pessoa (`:146-177`) |
| `painel.ts` | check-in, links de portaria, cupons, equipe, configurações | `scope(need)` por papel; dono exige `isProducer` (`:24-33`); evento conferido em `s.events` |
| `eventos.ts` | `deleteEvent` | dono/admin, título digitado, sem venda nem pagamento em curso |
| `criar.ts` | `saveEvent`, `searchVenues`, `pickPlace` | evento novo só com `producerStatus === "producer"` (`:62`); edição por `canEditEvent`; `pickPlace` sem cota (SEC-011) |
| `emails.ts` | campanhas e modelos | dono/admin; campanha conferida por produtora (`campaignOf`, `:32-36`); **conta sem produtora também entra (SEC-010)**; exclusão de compradores aceita evento alheio (SEC-009) |
| `lista.ts` | lista free | `scope(need, eventId)` (`:28-35`) |
| `promoters.ts` | parceiros | produtora ativa, dono/admin (`:15-20`, `:54`) |
| `launch.ts` | "me avise"/pré-venda (anônimo, 40/h por IP), lançamento (dono/admin) | — |
| `reembolsos.ts` | busca/estorno de pedido, cancelar/adiar evento, política | `eventScope` dono/admin (`:29-36`); admin cancela o evento inteiro (SEC-012) |
| `meu-reembolso.ts` | cancelamento pelo comprador, pedido de reembolso | titular do ingresso / dono do pedido |
| `revenda.ts` | anunciar, cancelar, configurar, tirar anúncio | titular / dono/admin do evento |
| `tickets.ts` | transferir, cancelar, aceitar, reenviar | titular; aceite só com a conta do e-mail confirmada (S-32) |
| `compra.ts`, `checkout.ts`, `checkout-ui.ts`, `pagamento.ts`, `grupo.ts`, `cartoes.ts` | compra, pagamento, grupo, cartões | área do Agente 04; cartões conferidos com o cliente Stripe da conta (`cartoes.ts:36,56`) |
| `portaria.ts` | entrar com código, ler QR, liberar, listas | cookie HMAC do aparelho; 8 códigos errados / 15 min por IP (`:20-34`) |
| `produtor.ts` | perfil, imagens, posts, avaliações | `ownOrganizer` (dono) (`:16-21`); avaliação só de quem teve ingresso de evento passado |
| `produtoras.ts` | trocar produtora ativa, nova produtora | só entre as da conta (`:32-41`); limite 3 com trava |
| `onboarding.ts` | `checkOrganizerName`, `finishOnboarding`, `myProducerStatus` | **aceita status "producer", que inclui ser da equipe (SEC-001)** |
| `inscricao.ts` | inscrição de produtor | e-mail confirmado (S-31) |
| `artista.ts`, `spotify.ts` | bio e Spotify do artista | `canEditArtist` (quem tem evento com o artista) |
| `social.ts` | seguir, newsletter | sessão / anônimo |
| `contato.ts` | formulário de contato | Turnstile, limite por IP e por destinatário |
| `src/app/e/sair/[token]/page.tsx` | descadastro (ação inline) | token |

## 5. Subdomínios e sessões separadas

| Superfície | Sessão | Observação |
|---|---|---|
| Site principal | cookies do Neon Auth (`SameSite=Lax`, HttpOnly) + `tw_mfa` (HMAC do id da sessão) + `tw_org` (só escolhe entre as produtoras da conta) | sessão pendente de 2FA = deslogado para o site (`getSessionUser`) |
| `banco.<domínio>` | `tw_banco` (30 min) / `tw_banco_p` (10 min) / `tw_banco_c` (15 min), HMAC, `SameSite=Strict`, host-only | sem estado no servidor: sair só apaga o cookie deste navegador (risco baixo, ver red-team.md) |
| Portaria (`/portaria`) | `tw_portaria` = id do acesso + HMAC, 30 dias | cada ação reconfere no banco se o acesso está ligado e o evento não acabou |
| Central (`/tw-central`) | sessão do site + regra de e-mail + TOTP | 404 para quem não é admin |

## 6. Integrações externas (só leitura do código)
- **Stripe:** chaves no servidor; webhook assinado; valores sempre recalculados no servidor (`priceOrder`). Detalhe com o Agente 04.
- **Neon Auth:** login/cadastro por senha só pelas nossas ações (com Turnstile e 2FA); Google pelo cliente do Neon (`signIn.social`); ativação por `emailOtp.verifyEmail`. O cliente do navegador só usa essas duas chamadas e `get-session`.
- **Apple:** fluxo próprio; o e-mail confirmado pela Apple entra na conta existente com o mesmo e-mail.
- **Resend:** e-mails transacionais e de campanha; webhook do Neon Auth vira e-mail com o nosso modelo; link de senha guardado no KV atrás de um token aleatório.
- **Google Places, Spotify, Wikipédia, Anthropic:** URLs fixas; nenhuma entrada do usuário vira endereço (sem SSRF).
- **Turnstile:** login, cadastro, contato, banco.

## 7. Ativos críticos e onde cada regra vive

| Ativo | Regra no servidor |
|---|---|
| Aprovação de produtor (quem vende) | inscrição → central (`reviewApplication`) → `finishOnboarding`; `producerStatus`/`isProducer` (`src/lib/producer-apply.ts:26-30`, `src/lib/data/producer.ts:13-23`) — **furo SEC-001** |
| Dinheiro do produtor | saldo calculado no servidor (`walletFor`), saque com TOTP e trava, destino só do dono |
| Dados de compradores | `getPainelScope` → eventos da produtora ativa; CPF nunca vai ao painel |
| Ingresso/QR | HMAC por ingresso, código novo na troca de dono (S-01), check-in condicional |
| Conta | 2FA própria, troca de e-mail com dois códigos, link de senha de uso único |
| Central | lista fixa de e-mails do domínio + confirmado + TOTP |
