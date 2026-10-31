# Arquitetura de segurança — Tickets Win

Autor: Agente 02 (Blue Team), 31/10/2026. Base: código do branch `claude/auditoria-noturna` (referências `arquivo:linha` desta data), cabeçalhos conferidos no local e com um `curl -sI` por página na produção. Achados citados: `findings/blue-team.md` (SEC-2xx), `findings/red-team.md` (SEC-0xx), `findings/bots.md` (SEC-3xx), auditoria anterior `docs/quality-audit/security-audit.md` (S-xx).

Este documento descreve o que existe. Não traz prova de conceito. O repositório é público (SEC-201).

## 1. Visão geral e camadas

```
Navegador (comprador, produtor, equipe, portaria, admin)
   │  HTTPS (HSTS 1 ano)                                    ┌──────────────────────────────┐
   ▼                                                        │ Terceiros (só saída do Worker)│
Cloudflare (DNS, TLS, CDN, WAF do plano)                    │ Neon Auth (login hospedado)   │
   │                                                        │ Stripe (cartão/Pix)           │
   ▼                                                        │ Resend (e-mail)               │
Worker "ticket" (custom-worker.js → OpenNext → Next.js 16)  │ Turnstile, Google Places,     │
   ├─ proxy (src/proxy.ts): www→apex, subdomínio do banco,  │ Spotify, Anthropic, Apple,    │
   │  CSP com nonce, login obrigatório em rotas da conta    │ Google Wallet                 │
   ├─ páginas e ações de servidor ("use server")            └──────────────────────────────┘
   ├─ rotas /api/* (webhooks, uploads, PDF/Wallet, cron)
   └─ cron a cada minuto (scheduled → POST /api/cron com token do isolate)
   │
   ├─ Neon Postgres (driver HTTP, src/db/index.ts) — dados de negócio + schema neon_auth (login)
   ├─ R2 MEDIA "onde-media" (artes, PDFs) · R2 "onde-cache" (cache do Next)
   ├─ KV (limites, códigos de 2FA, deduplicação de webhooks, fila virtual)
   └─ Images (redimensionar) · WORKER_SELF_REFERENCE (o próprio Worker)
```

Camadas de defesa, de fora para dentro:
1. **Borda (Cloudflare):** TLS, HSTS, proteção do plano. Regras de WAF e limite da Cloudflare não foram conferidas (fora do escopo).
2. **Proxy do Next** (`src/proxy.ts`): CSP por pedido, redirecionamento para login em rotas da conta (`src/proxy.ts:9`, `:60-65`). É conveniência, não autorização: cada página e ação reconfere a sessão.
3. **Servidor (ações e rotas):** sessão, segunda etapa, papel e posse do recurso conferidos a cada chamada; valores e estoque recalculados no servidor.
4. **Banco:** transações (`db.batch`), travas por conta/CPF, índices únicos e condições de estoque (S-24, S-25, S-28, S-29).
5. **Registro:** `security_events`, `ticket_events`, `email_log`, log do Worker.

## 2. Fronteiras de confiança

| # | Fronteira | Quem está do outro lado | Controle |
|---|---|---|---|
| F1 | Internet → Worker | qualquer pessoa ou robô | HTTPS; Turnstile no login/cadastro (`src/lib/turnstile.ts:15-31`, falha aberta sem chaves: SEC-312); limites em KV (`src/lib/rate-limit.ts`, não atômicos: SEC-302) |
| F2 | Navegador → ações de servidor | conta logada (talvez roubada) | sessão (`getSessionUser`), segunda etapa, papel e posse no servidor; Next compara `Origin`/`Host` (CSRF) |
| F3 | Worker → Neon Auth | servidor de login hospedado | `/api/auth/*` repassado com lista de bloqueio (`src/app/api/auth/[...path]/route.ts:13-15`); webhook do Neon assinado (Ed25519) |
| F4 | Stripe → Worker | webhook | assinatura `whsec_` (`src/lib/payments/stripe.ts:44-48`), deduplicação no KV, emissão idempotente |
| F5 | Worker → Postgres | banco | uma URL com o papel dono (SEC-202); SQL parametrizado (Drizzle e `sql```) |
| F6 | Aparelho da portaria → Worker | celular sem conta | cookie HMAC só com o id do acesso, reconferido no banco a cada leitura (`src/lib/portaria.ts:62-69`) |
| F7 | Conteúdo de produtor (HTML de banner, e-mail) → navegador | produtor | iframe `sandbox` com CSP própria (`src/lib/art-frame.ts:18`, `src/app/e/ver/[token]/route.ts:20`) |
| F8 | Cron → `/api/cron` | o próprio Worker | token aleatório só no isolate (`custom-worker.js:10-12`, `src/app/api/cron/route.ts:6-7`) |
| F9 | Desenvolvimento/agentes → produção | máquina de desenvolvimento | **fraca**: mesmo segredo mestre e URL da produção na pasta de desenvolvimento (SEC-200, SEC-204) |

## 3. Autenticação

- **Provedor:** Neon Auth (better-auth hospedado pelo Neon). O Worker usa o SDK `@neondatabase/auth` só como repasse e leitor de sessão (`src/lib/auth/server.ts:6-14`). O mesmo Neon Auth atende desenvolvimento e produção.
- **Entrada:** senha e cadastro só pelas ações do site, com Turnstile e segunda etapa (`src/lib/actions/auth.ts`); as rotas diretas `sign-in/email` e `sign-up/email` do SDK são recusadas no proxy (`src/app/api/auth/[...path]/route.ts:13`). Rotas de código/link mágico ainda passam (SEC-006/SEC-303).
- **Google:** OAuth do Neon Auth; a volta (`neon_auth_session_verifier`) é trocada pela sessão no proxy (`src/proxy.ts:12`, `:61-65`).
- **Apple:** implementação própria (`src/lib/auth/apple.ts`): `state` e `nonce` em cookie `HttpOnly` (`:26-47`), `id_token` conferido com as chaves da Apple (RS256, emissor, destinatário, validade, nonce, e-mail confirmado: `:65-84`); conta existente entra com um código de "entrar" do Neon Auth interceptado pelo webhook (`:92-116`). Achado: SEC-002.
- **Segunda etapa (2FA):** própria, por cima do Neon Auth (`src/lib/mfa.ts`). Enquanto falta o código a sessão existe mas o site trata como deslogado (`src/lib/auth/server.ts:31-47`). Liberada por cookie `tw_mfa` = HMAC do id da sessão (`src/lib/mfa.ts:49-58`). Métodos: código por e-mail (hash no KV, 10 min, 5 tentativas, 8 envios/h: `:76-108`) ou app autenticador (TOTP, sem reaproveitar código: `:175-189`; segredo cifrado com AES-GCM: `:193-206`); 10 códigos de recuperação só como hash (`:222-230`). Contagem de tentativas não atômica: SEC-301.
- **Banco Tickets Win:** login próprio (senha PBKDF2 100 mil iterações, `src/lib/bank.ts:194-204`) + código; sessão de 30 min em cookie assinado `SameSite=Strict` (`:208-236`).
- **Central (`/tw-central`):** e-mail na lista `ADMIN_EMAILS` **e** do domínio `@ticketswin.com.br`, confirmado, com app autenticador para qualquer ação (`src/lib/admin.ts:18-36`). Para quem não é admin a página responde 404.

## 4. Autorização

- **Comprador:** ingresso, PDF, Wallet e ICS só para o titular (`holderUserId`, ex.: `src/app/api/ingressos/[code]/pdf/route.ts:15-18`); pedido só para o dono.
- **Produtor e equipe:** papel por produtora (`owner` > `admin` > `portaria`), produtora ativa escolhida por cookie `tw_org` mas sempre entre as da própria conta (`src/lib/data/org-access.ts:26-60`); cada ação do painel confere sessão, papel e, para o dono, se é produtor aprovado (`src/lib/actions/painel.ts:24-34`); evento só na produtora do usuário (`canEditEvent`, `src/lib/data/org-access.ts:62`). Matriz completa conferida pelo Red Team em `findings/red-team.md`.
- **Portaria por link:** acesso por evento, revogável, vence um dia depois do fim (`src/lib/portaria.ts:50-59`).
- **Admin:** cada ação da central reconfere `adminUser()` e `secure` e grava em `security_events` (`src/lib/actions/admin.ts`).
- **Dinheiro:** valor sempre recalculado no servidor; saque pede código do app (Banco) e é pago **manualmente** pelo admin (`updatePayout`, `src/lib/actions/admin.ts:46`), o que dá uma janela para barrar fraude.

## 5. Sessão e cookies

| Cookie | Quem cria | Atributos | Conteúdo |
|---|---|---|---|
| `__Secure-neon-auth.session_token` e `.local.session_data` | SDK Neon Auth | `HttpOnly`, `Secure`, `SameSite=Lax` | token da sessão; cache assinado da sessão (HS256 com `NEON_AUTH_COOKIE_SECRET`) |
| `tw_mfa` | `src/lib/mfa.ts:57` | `HttpOnly`, `Secure` (prod), `Lax` | HMAC do id da sessão |
| `tw_banco`, `tw_banco_p`, `tw_banco_c` | `src/lib/bank.ts:229-242` | `HttpOnly`, `Secure` (prod), **`Strict`** | conta, validade e HMAC |
| `tw_portaria` | `src/lib/portaria.ts:33-36` | `HttpOnly`, `Secure` (prod), `Lax`, 30 dias | id do acesso + HMAC |
| `tw_org` | `src/lib/actions/produtoras.ts:23-25` | `HttpOnly`, `Lax` | id da produtora (só escolhe; não dá acesso) |
| `tw_apple`, `tw_apple_ok` | rotas da Apple | `HttpOnly`, `Secure`; `None` só na ida (POST da Apple), caminho restrito | state/nonce; identidade lacrada (AES-GCM) |
| `spotify_oauth`, fila, pré-venda, indicação | rotas próprias | `HttpOnly`, `Lax` | state ou ids |

Revogação: "sair dos outros aparelhos" (`src/lib/actions/conta.ts:185-199`) usa o Neon Auth. O cache `session_data` vale alguns minutos depois da revogação (comportamento do SDK).

## 6. Segredos

| Segredo | Onde é lido | Finalidade | Observação |
|---|---|---|---|
| `NEON_AUTH_COOKIE_SECRET` | `src/lib/auth/server.ts:10`, `src/lib/signing-secret.ts:5-9` | cache de sessão do SDK **e** QR, portaria, banco, `tw_mfa`, hash de códigos, chave AES do TOTP, cookie da Apple | **chave mestra única** e igual no desenvolvimento (SEC-200) |
| `DATABASE_URL` | `src/db/index.ts:8` | banco | papel dono (SEC-202); senha exposta em sessão anterior (SEC-203) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | `src/lib/payments/stripe.ts` | pagamento | sem a secreta, modo de teste (S-18/D-07, mantido pelo dono) |
| `RESEND_API_KEY` | `src/lib/email.ts`, `src/lib/mail/send.ts` | e-mail | |
| `TURNSTILE_SECRET_KEY`/`SITE_KEY` | `src/lib/turnstile.ts` | robô | sem as duas, aprova tudo |
| `GOOGLE_WALLET_SERVICE_ACCOUNT`, `APPLE_PASS_P12`(+senha), `APPLE_WWDR_PEM` | `src/lib/wallet/*` | Wallet | chaves privadas de assinatura de passe |
| `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SPOTIFY_CLIENT_SECRET` | rotas de IA, `src/lib/places.ts`, `src/lib/spotify.ts` | APIs pagas | custo: SEC-011/SEC-308 |

- Na produção os segredos ficam como *secrets* do Worker (`wrangler secret`, `scripts/cf-secrets.sh`); `wrangler.jsonc` só tem valores públicos em `vars`.
- Nada vai para o navegador: só `NEXT_PUBLIC_SITE_URL` é público; a chave publicável da Stripe vai como prop (`src/app/checkout/page.tsx:145`).
- Nenhum segredo no histórico do git (Gitleaks + busca manual, `findings/blue-team.md`).
- Sem valor padrão no código (S-11): faltou o segredo, a função falha.

## 7. Bindings do Cloudflare (`wrangler.jsonc`)

| Binding | Recurso | Quem usa | Privilégio / observação |
|---|---|---|---|
| `ASSETS` | `.open-next/assets` | arquivos estáticos | só leitura |
| `MEDIA` | R2 `onde-media` | uploads (`src/app/api/midia/route.ts`, `src/app/api/admin/banner/route.ts`), `/midia`, PDFs (`pdf/…`), artes | leitura e escrita de todo o bucket pelo Worker; acesso público do bucket não conferido (SEC-213); uploads órfãos (SEC-313) |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 `onde-cache` | cache incremental do OpenNext | prefixo `incremental-cache` |
| `KV` | namespace único | limites, 2FA, fila, deduplicação de webhooks, aparelhos | um namespace para tudo: limpar limites limpa também códigos de 2FA; consistência eventual (SEC-301/302) |
| `IMAGES` | Cloudflare Images | redimensionar artes | |
| `WORKER_SELF_REFERENCE` | o próprio Worker | OpenNext (revalidação) | |
| `triggers.crons` | `* * * * *` | `custom-worker.js` → `/api/cron` | token por execução |
| flags | `nodejs_compat`, `global_fetch_strictly_public` | | o segundo impede `fetch` para endereços internos (SSRF) |
| `observability` | Workers Logs | `console.*` | retenção curta; sem alerta (SEC-207) |
| `upload_source_maps` | | mapas só para a Cloudflare | o navegador não recebe `.map` |
| `vars` | `NEXT_PUBLIC_SITE_URL`, `BANK_URL`, `ADMIN_EMAILS`, `PRODUCER_APPROVAL_EMAIL` | | públicos (e visíveis no repositório público) |

## 8. Cabeçalhos

Gerais (`next.config.ts:8-14`, todas as respostas): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy: camera=(self), microphone=(), geolocation=(), usb=(), browsing-topics=()`, `Strict-Transport-Security: max-age=31536000`; `poweredByHeader: false`.
Páginas (`src/proxy.ts:18-31`, `src/lib/csp.ts`): CSP com nonce novo por pedido, `'strict-dynamic'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, relatório em `/api/csp-report`. **Modo Report-Only** (S-30); bloquear é `CSP_MODE=enforce`, decisão do dono (D-10).
CORS: nenhum cabeçalho `Access-Control-*` em nenhuma rota.
Conferido em 31/10: produção e local iguais (fora o que é só de desenvolvimento). Pendências em SEC-209 (HSTS `includeSubDomains`, CSP de sandbox em `/midia`, COOP).

## 9. Registro e detecção

| Fonte | O que guarda | Quem lê | Retenção |
|---|---|---|---|
| `security_events` (`src/lib/mfa.ts:290-299`) | login, senha, e-mail, sessões, 2FA, banco, saque, conta de recebimento, ações da central; IP e aparelho | a própria pessoa (Minha conta) | sem prazo (SEC-208) |
| `ticket_events` (`src/lib/tickets/trail.ts`) | emissão, presente, transferência, revenda, reembolso, cancelamento, check-in e recusa | só a central (`src/lib/admin-trail.ts`) | some com o ingresso |
| `email_log` | envios e falhas (códigos mascarados) | central/suporte | 30 dias |
| Log do Worker | erros, avisos de webhook, CSP | dono no painel da Cloudflare | curta (plano) |
| `app_errors` | — | — | desligado por decisão do dono; não reativar |

Não há alerta automático (SEC-207, SEC-320).

## 10. Menor privilégio

| Item | Hoje | Recomendado |
|---|---|---|
| Papel do banco da aplicação | dono (`*_owner`) | papel só de linhas + leitura restrita do `neon_auth` (SEC-202) |
| Segredo de assinatura | um para tudo | um por finalidade, com rotação em duas chaves (SEC-200) |
| Token do CI | `contents: read` | mantido |
| Central | lista de e-mails + domínio fixo + TOTP | mantido; registrar quem é admin em `decisoes.md` |
| Equipe da produtora | admin pode cancelar evento e estornar (SEC-012) | separar funções financeiras do papel admin |
| Recursos pagos (IA, Places) | qualquer conta logada | só produtor aprovado (SEC-011) |
| KV | um namespace para tudo | separar códigos de 2FA de limites/fila |
| Ambientes | dev com segredo e URL da produção | dev com segredos próprios (SEC-204) |

## 11. Lacunas (resumo)

| Lacuna | Achado | Sev. |
|---|---|---|
| Segredo mestre único, igual no desenvolvimento; rotação destrutiva | SEC-200 | P1 |
| Repositório público com relatórios de segurança | SEC-201 | P1 |
| Senha do banco exposta em sessão anterior (rotação pendente do dono) | SEC-203 | P1 |
| Aplicação com papel dono do banco | SEC-202 | P2 |
| Desenvolvimento e produção misturados | SEC-204 | P2 |
| SDK do login com dependências vulneráveis (não alcançáveis aqui) | SEC-205 | P2 |
| Sem alertas; trilha de equipe/portaria/cancelamento ausente | SEC-207 | P2 |
| Recuperação (PITR) não testada | SEC-210 | P2 |
| CSP só avisando | S-30 / D-10 | P2 |
| Limitadores não atômicos; login sem limite próprio | SEC-300/301/302 | P1–P2 |
| Endurecimento de cabeçalhos | SEC-209 | P3 |

## 12. Segurança contínua

- **Em cada pull request e push para `claude/**`** (`.github/workflows/security.yml`): tipos, lint, testes unitários, `pnpm audit --prod` (bloqueia alto/crítico fora das exceções com prazo) e Gitleaks no histórico.
- **Antes de publicar (manual, sessão principal):** `pnpm test` com `TEST_DATABASE_URL` do banco de teste (testes de autorização, financeiros e de concorrência em `tests/db`), build do OpenNext numa cópia e e2e do checkout.
- **Exige revisão de segurança:** mudanças em `src/lib/auth/**`, `src/lib/mfa.ts`, `src/lib/bank.ts`, `src/lib/payments/**`, `src/lib/checkin*.ts`, `src/lib/actions/{painel,banco,admin,checkout*,compra,grupo}.ts`, `src/proxy.ts`, `src/lib/csp.ts`, `next.config.ts`, `wrangler.jsonc`, `.github/**`, `package.json`/lockfile.
- **Dependências:** atualização de patch quando o audit pedir, com testes; versão maior só com decisão registrada; revisar `.github/audit-allowlist.json` até a data de cada exceção.
