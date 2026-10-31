# Achados do Blue Team (Agente 02) — SEC-200 a SEC-299

Escopo: infraestrutura, segredos, dependências, cabeçalhos, logs, resposta a incidentes e CI. Código do branch `claude/auditoria-noturna`; servidor local `http://localhost:3042`; produção só com um `curl -sI` por página (leitura passiva de cabeçalhos públicos). Nenhum teste ativo em Cloudflare, Neon, Stripe ou Resend. Nenhum valor de segredo foi impresso, copiado ou registrado: as comparações entre arquivos de ambiente foram feitas por igualdade, num processo que só escreveu "IGUAL"/"DIFERENTE".

Status: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO** (e, no registro, Hipótese / Confirmada / Corrigida / Bloqueada).

Arquitetura completa: `docs/security/security-architecture.md`. Procedimentos: `docs/security/incident-response.md`.

## Resumo

| ID | Sev. | Título | Status | Quem trata |
|---|---|---|---|---|
| SEC-200 | **P1** | Um segredo só (`NEON_AUTH_COOKIE_SECRET`) assina sessão, 2FA, banco, portaria e QR, e o mesmo valor está nos arquivos de desenvolvimento deste ambiente; trocar hoje é destrutivo | Confirmada | AppSec (separar chaves) + dono (rotação) |
| SEC-201 | **P1** | Repositório público no GitHub: código, histórico e relatórios de segurança (inclusive achados abertos desta operação) visíveis para qualquer pessoa | Confirmada | Dono |
| SEC-202 | P2 | Produção usa o papel dono do banco (`*_owner`): DDL e acesso ao schema do login, sem menor privilégio | Confirmada | Dono + AppSec |
| SEC-203 | P1 | Senha do papel do banco apareceu em comandos de uma sessão anterior (risco operacional) | Bloqueada (rotação depende do dono) | Dono |
| SEC-204 | P2 | Sem separação de ambientes: a pasta de desenvolvimento guarda a URL do banco de produção e o arquivo de segredos da produção | Confirmada | Dono |
| SEC-205 | P2 | SDK do Neon Auth fixa better-auth 1.7.6 (1 crítico, 2 altos) e zod 4.5.4: não alcançáveis no nosso Worker; exceção com prazo no CI | Confirmada · risco aceito até 31/12/2026 | Neon / dono |
| SEC-206 | P3 | Dependência direta sem uso (`better-auth`) e avisos só de desenvolvimento | Confirmada | AppSec |
| SEC-207 | P2 | Sem alertas de segurança; trilha incompleta para investigar incidente (equipe, portaria, cancelamento, webhooks) | Confirmada | AppSec |
| SEC-208 | P3 | `security_events` (IP e aparelho) sem prazo de guarda | Confirmada | Dono (LGPD, junto com D-03) |
| SEC-209 | P3 | Cabeçalhos: HSTS sem `includeSubDomains`; `/midia` sem CSP de sandbox; sem COOP | Confirmada · correção proposta | AppSec / dono |
| SEC-210 | P2 | Recuperação não testada: PITR do Neon, R2 e KV sem plano nem teste de restauração | NÃO TESTADO | Dono |
| SEC-211 | P3 | `scripts/cf-secrets.sh` grava os segredos de produção em `/tmp` com permissão padrão e pode deixar o arquivo se falhar | Confirmada | AppSec |
| SEC-212 | P2 | Não havia CI: nada conferia tipos, lint, testes, dependências ou segredos antes do merge | **Corrigida** (`.github/workflows/security.yml`, verde no GitHub) | Blue Team |
| SEC-213 | P3 | Bucket R2 `onde-media` guarda PDFs de ingresso com QR válido; acesso público do bucket não conferido | Hipótese (NÃO TESTADO) | Dono |

Contagem: P0 0 · P1 3 (SEC-200, SEC-201, SEC-203) · P2 6 · P3 5.

---

## SEC-200 · Segredo mestre único, igual em desenvolvimento e produção

- **Severidade:** P1 (vira P0 se houver indício de que os arquivos de ambiente deste ambiente saíram dele, como aconteceu com a senha do banco em SEC-203).
- **Status:** Confirmada.
- **Componente:** login, 2FA, Banco Tickets Win, portaria, QR do ingresso, login com Apple.
- **Localização:** `src/lib/auth/server.ts:10` (segredo do SDK do Neon Auth), `src/lib/signing-secret.ts:5-9` (o mesmo segredo para as assinaturas próprias), usado em `src/lib/mfa.ts:30-32` (cookie da segunda etapa, códigos), `src/lib/mfa.ts:193-196` (chave AES do segredo TOTP guardado no banco), `src/lib/bank.ts:211` (cookies do banco), `src/lib/portaria.ts:30` (cookie do aparelho), `src/lib/tickets/qr.ts:11` (assinatura do QR), `src/lib/auth/apple.ts:122-135` (cookie lacrado da volta da Apple).
- **Descrição:** o SDK do Neon Auth usa `cookies.secret` para assinar um cache da sessão que ele aceita sem perguntar ao servidor de login. O código da Tickets Win reaproveita o mesmo valor para tudo o que assina ou cifra. Quem tiver esse valor consegue se passar por qualquer conta (inclusive a central, porque a segunda etapa também é um HMAC do mesmo segredo), abrir o banco de qualquer produtor e forjar o acesso da portaria. Nesta pasta, `.env.local`, `.dev.vars` e `.env.cloudflare` têm o **mesmo** valor, e `.env.cloudflare` tem a mesma URL de banco que `DATABASE_URL_PROD`, ou seja, é o arquivo da produção. O servidor local (banco de teste) assina com o segredo da produção.
- **Impacto:** o segredo vale como chave mestra da plataforma. Ele está em texto puro num ambiente de desenvolvimento usado por vários agentes, o mesmo em que a senha do banco já vazou em comandos (SEC-203).
- **Causa-raiz:** (1) um segredo para cinco finalidades, separadas só por prefixo na mensagem; (2) o desenvolvimento copiou o segredo da produção; (3) não há caminho de rotação: trocar o valor hoje invalida de uma vez todos os QR já emitidos (PDF, e-mail, Wallet; o código digitado continua valendo), todos os segredos TOTP cifrados (quem usa app autenticador, inclusive a central e o banco, fica sem conseguir entrar), os códigos de recuperação, os cookies da portaria e as sessões do banco.
- **Evidência (sanitizada):** comparação por igualdade (só "IGUAL"/"DIFERENTE" na saída): segredo `.env.local` = `.dev.vars` = `.env.cloudflare`; banco de `.env.cloudflare` = `DATABASE_URL_PROD` de `.env.local`; banco de `.dev.vars` = banco de teste. Leitura do SDK: `node_modules/@neondatabase/auth/dist/server-*.mjs` (`getSession` aceita o cache assinado). Nenhuma forja foi tentada (seria teste contra o login da produção).
- **Correção (não aplicada; fora do território do Blue Team e depende do dono):**
  1. Código (AppSec): segredos separados por finalidade, lidos com verificação em duas chaves (atual e anterior) para poder girar sem derrubar nada: `NEON_AUTH_COOKIE_SECRET` só para o SDK; `TW_SIGNING_SECRET` (+ `TW_SIGNING_SECRET_OLD`) para QR, portaria, banco e segunda etapa; `TW_TOTP_KEY` para cifrar TOTP, com recifragem dos segredos existentes numa tarefa única. Derivar subchaves com HKDF por finalidade.
  2. Ambiente (dono): segredo próprio para desenvolvimento/teste (`openssl rand -base64 32`), nunca o da produção.
  3. Rotação na produção (dono, depois do item 1): trocar `NEON_AUTH_COOKIE_SECRET` (desloga todo mundo do cache, sem outro efeito) e o novo segredo de assinatura, mantendo o antigo como `_OLD` por 60 dias (validade dos QR já enviados).
- **Teste de regressão:** proposto para o AppSec: teste unitário de que QR/cookie assinado com a chave antiga continua válido com `_OLD` e deixa de valer sem ela; teste de que nenhum módulo além de `src/lib/auth/server.ts` lê `NEON_AUTH_COOKIE_SECRET`.
- **Validação:** pendente (Agente 06).
- **Risco residual:** até a rotação, qualquer cópia de `.env.local`, `.dev.vars`, `.env.cloudflare` ou de transcrições de sessão com esses valores dá acesso total.
- **Arquivos modificados:** nenhum.

## SEC-201 · Repositório público

- **Severidade:** P1 (operacional).
- **Status:** Confirmada.
- **Componente:** GitHub `lucashector-ai/ticket`.
- **Localização:** API pública do GitHub (`"visibility": "public"`).
- **Descrição:** todo o código, o histórico, `wrangler.jsonc` (e-mail do admin, ids de KV/R2), o caminho da central e os relatórios de auditoria (`docs/quality-audit/**`, `docs/security/**`, que descrevem falhas, inclusive as **ainda abertas** desta operação, como os P1 do Red Team e de bots) estão abertos para qualquer pessoa. Cada `git push` desta operação publica os achados antes da correção.
- **Impacto:** um atacante recebe o mapa das falhas e das defesas. Não foi encontrado segredo no histórico (Gitleaks, 366 commits, e busca manual por padrões; ver "Verificado e OK"), então não há credencial exposta por aqui.
- **Causa-raiz:** visibilidade do repositório.
- **Evidência:** `GET https://api.github.com/repos/lucashector-ai/ticket` → `private: false`.
- **Correção (dono):** tornar o repositório privado (a integração da Cloudflare com o GitHub funciona com repositório privado pelo app do GitHub; conferir no painel da Cloudflare depois da troca) ou tirar os relatórios do repositório. Enquanto for público, os relatórios devem continuar sem prova de conceito, como manda a missão.
- **Teste de regressão:** não se aplica.
- **Validação:** pendente.
- **Risco residual:** o que já foi publicado pode ter sido copiado; tratar as falhas abertas como conhecidas.
- **Arquivos modificados:** nenhum.

## SEC-202 · Produção com o papel dono do banco

- **Severidade:** P2. **Status:** Confirmada.
- **Componente:** banco (Neon, branch `main`). **Localização:** `src/db/index.ts:8-11` (uma URL só), `drizzle.config.ts:4`, `scripts/db-push-prod.sh:7`, `scripts/cf-secrets.sh:10-11`.
- **Descrição:** o nome do papel nas URLs da produção e do teste termina em `_owner` (conferido sem imprimir a URL). A aplicação roda com o dono do banco: pode criar, alterar e apagar tabelas, e lê e grava no schema `neon_auth` (contas e sessões do login). O mesmo papel aplica o schema.
- **Impacto:** uma injeção de SQL ou um vazamento da URL dá controle total do banco (inclusive apagar), em vez de só leitura e escrita de linhas.
- **Causa-raiz:** papel padrão do Neon usado na aplicação.
- **Correção (dono + AppSec, só depois de testar no banco de teste):** criar um papel `app_rw` com `SELECT/INSERT/UPDATE/DELETE` nas tabelas do `public`, `USAGE` nas sequências e, no `neon_auth`, só `SELECT` em `"user"` e `account` e `UPDATE (email, "emailVerified", name, "updatedAt")` em `"user"` (o que o código usa: `src/lib/auth/verified.ts:27`, `src/lib/auth/apple.ts:146,170-171`, `src/lib/actions/conta.ts:142`, `src/lib/admin.ts:74-79`, `src/lib/bank.ts:279`). O `_owner` fica só para `db:push`. SQL proposto em `findings/decisoes.md`.
- **Teste de regressão:** suíte `tests/db` rodando com a URL do papel novo no banco de teste.
- **Risco residual:** até a troca, SEC-203 tem o efeito máximo.
- **Arquivos modificados:** nenhum.

## SEC-203 · Senha do papel do banco exposta em sessão anterior

- **Severidade:** P1. **Status:** Bloqueada (a rotação depende do dono, que já foi orientado).
- **Componente:** credencial do banco. **Localização:** registros de uma sessão anterior (fora do repositório; não está no histórico do git: conferido).
- **Descrição/impacto:** risco operacional registrado sem detalhes, a pedido. Junto com SEC-202, quem tiver esse registro tem o banco inteiro.
- **Correção:** rotação da senha do papel pelo dono, no Console do Neon, seguida da troca da `DATABASE_URL` no Worker (`wrangler secret put DATABASE_URL`) e nos arquivos locais. Passo a passo em `incident-response.md` (Playbook 1).
- **Risco residual:** até a rotação, total.

## SEC-204 · Desenvolvimento e produção misturados

- **Severidade:** P2. **Status:** Confirmada.
- **Localização:** `.env.local` (tem `DATABASE_URL` e `DATABASE_URL_PROD`), `.env.cloudflare` (segredos da produção na pasta do projeto), `scripts/db-push-prod.sh:7` (lê a URL da produção do `.env.local`). Os três estão no `.gitignore` (`.gitignore:34`, `:49`) e nunca foram commitados.
- **Descrição:** a URL do banco de produção e o arquivo de segredos da produção ficam na mesma pasta em que agentes e o servidor de desenvolvimento trabalham. O Neon Auth também é o mesmo nos dois ambientes (já registrado nas regras da missão).
- **Impacto:** um script, um agente ou um comando errado atinge a produção; qualquer vazamento da pasta leva as credenciais da produção.
- **Correção (dono):** tirar `DATABASE_URL_PROD` e `.env.cloudflare` desta pasta (guardar num cofre de senhas; aplicar o schema da produção de uma máquina do dono ou com a variável só no momento); Neon Auth separado para desenvolvimento quando possível.
- **Arquivos modificados:** nenhum.

## SEC-205 · Avisos críticos/altos dentro do SDK do Neon Auth

- **Severidade:** P2 (alcançabilidade no nosso código: nenhuma; risco residual no servidor hospedado do Neon). **Status:** Confirmada · risco aceito até 31/12/2026.
- **Localização:** `package.json` (`@neondatabase/auth 0.7.0-beta`, a última publicada, conferido no npm em 31/10), `pnpm-lock.yaml`.
- **Evidência:** `pnpm audit --prod`: 7 avisos (1 crítico, 2 altos, 1 moderado, 3 baixos), **todos** dentro de `@neondatabase/auth`. OSV-Scanner 2.2.3 (base offline baixada) confirma os mesmos e acrescenta só pacotes de desenvolvimento.

| Aviso | Pacote | Alcançável no nosso Worker? |
|---|---|---|
| GHSA-965c-763c-88jm (crítico) | better-auth 1.7.6 | Não: callback OAuth roda no Neon Auth hospedado; o Worker só repassa `/api/auth/*` e lê cookies (D-06, reconferido) |
| GHSA-r4xp-prcw-77qf (alto) | better-auth 1.7.6 | Não: plugin oauth-proxy do servidor de login |
| GHSA-mrhx-c7xc-m3w5 (alto) | zod 4.5.4 | Não no servidor: cópia usada pelo cliente do SDK; nosso zod é 4.6.7 |
| GHSA-67mh-4wv8-2f99 (moderado) | esbuild 0.18.20 | Não: ferramenta de desenvolvimento dentro do SDK |
| GHSA-44jh-23m7-hpcf (baixo ×2) | better-auth / drizzle-adapter | Não: limite de tentativas do servidor de login |
| GHSA-gcqx-w48m-w2h4 (baixo) | deepmerge | Não: e-mails da UI do SDK, que não usamos |

- **Correção:** nenhuma atualização (não existe versão do SDK com as correções; `pnpm.overrides` trocaria só a cópia do cliente, ver D-06). O CI aceita estes três avisos por tempo limitado em `.github/audit-allowlist.json`; qualquer aviso alto/crítico novo, ou esta exceção depois de 31/12/2026, falha o CI.
- **Pendência (dono):** perguntar ao suporte do Neon se o servidor hospedado já roda better-auth ≥ 1.7.7 e se o plugin oauth-proxy está ligado (perguntas em D-06).

## SEC-206 · Dependência sem uso e avisos de desenvolvimento

- **Severidade:** P3. **Status:** Confirmada.
- `better-auth@^1.7.14` está em `dependencies` desde o scaffold (commit dbf46e7) e nenhum arquivo de `src/` ou `scripts/` importa `better-auth`. Superfície de cadeia de suprimentos sem uso. Recomendação ao AppSec: remover e rodar build + testes.
- `pnpm audit` completo: 13 avisos; os 6 que não são de produção vêm de `glob`/`minimatch` (eslint, opennext) e `esbuild` (ferramentas de build), sem uso em tempo de execução.
- Scripts de instalação: só `esbuild`, `workerd` e `sharp` podem rodar (`package.json` `pnpm.onlyBuiltDependencies`; `pnpm-workspace.yaml` ignora o resto). Correto.

## SEC-207 · Sem alertas e trilha incompleta para investigar incidente

- **Severidade:** P2. **Status:** Confirmada (código).
- **Localização:** `src/lib/mfa.ts:290-299` (`logSecurity`, único registro de segurança), chamadas em `src/lib/actions/{auth,verificacao,senha,conta,banco,admin}.ts` e `src/lib/actions/painel.ts:244` (conta de recebimento).
- **O que existe:** `security_events` (login, senha, e-mail, sessões, 2FA, banco, saque, ações da central, troca da conta de recebimento), `ticket_events` (rastro de cada ingresso, inclusive check-in recusado), `email_log` (30 dias), avisos `csp` e erros no log do Worker (`observability.enabled`, retenção curta do plano da Cloudflare).
- **O que falta:** (1) equipe: `inviteMember`, `setMemberRole`, `removeMember` (`src/lib/actions/painel.ts:153-177`) e criação/revogação de acesso da portaria (`:60-98`) não registram nada: numa conta de produtor comprometida não dá para saber quem entrou na equipe; (2) cancelamento de evento e reembolsos do painel ficam só nas tabelas de negócio, sem IP/aparelho; (3) webhook da Stripe com assinatura inválida e "pedido não encontrado" só vão para o console (`src/app/api/webhooks/stripe/route.ts`), que some em poucos dias; (4) nenhum alerta: pico de check-in recusado, vários saques, troca de conta de recebimento seguida de saque, falhas de assinatura de webhook, `TW_ABORT` de emissão. Sinais de abuso automatizado já estão em SEC-320 (bots).
- **Correção proposta (AppSec):** `logSecurity` nas ações de equipe e portaria, no cancelamento de evento e no reembolso do painel; um job do cron que conte por hora eventos anormais e mande e-mail para `FINANCE_EMAIL`/admin (sem reativar `app_errors`, que o dono recusou); Logpush ou Tail Worker para guardar o log do Worker por mais tempo (decisão de custo do dono).

## SEC-208 · `security_events` sem prazo de guarda

- **Severidade:** P3. **Status:** Confirmada.
- IP e user-agent são dados pessoais (LGPD); `email_log` é podado em 30 dias (`src/lib/notify.ts:603-607`), `security_events` nunca. Proposta: guardar 1 ano (prazo de investigação de fraude e chargeback) e podar no cron; decidir junto com D-03.

## SEC-209 · Cabeçalhos: endurecimento pendente

- **Severidade:** P3. **Status:** Confirmada · correção proposta, não aplicada.
- **Evidência (produção, um `curl -sI` por página, 31/10):** `/` e `/entrar`: HSTS `max-age=31536000`, `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restritiva, CSP com nonce em **Report-Only**, `cache-control: private, no-store`. `/api/cidades`: os mesmos sem CSP (JSON). Local igual (mais `'unsafe-eval'`/`ws:` só em desenvolvimento). `banco.ticketswin.com.br` e `http://`: BLOQUEADO (o proxy desta sessão recusa).
- **Lacunas:** (1) HSTS sem `includeSubDomains` (o banco em subdomínio recebe HSTS próprio porque é o mesmo Worker, mas outros subdomínios não); `preload` exige `includeSubDomains`; (2) `/midia/*` (imagens enviadas por produtores, mesma origem do site) não passa pelo proxy e sai sem CSP: hoje só imagens conferidas pelos bytes entram (S-07), mas arquivos enviados antes da S-07 não foram conferidos (o R2 da produção está fora do escopo); (3) sem `Cross-Origin-Opener-Policy`.
- **Correção proposta:** em `next.config.ts` (`headers()`): `{ source: "/midia/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" }] }` e `Cross-Origin-Opener-Policy: same-origin-allow-popups` no conjunto geral. `includeSubDomains` fica para o dono (D-SEC-02-6 em `decisoes.md`), porque depende de todos os subdomínios terem HTTPS.
- **Por que não apliquei:** mudar `next.config.ts` faz o `next dev` se reiniciar sozinho ("Found a change in next.config.ts. Restarting the server"), e a missão proíbe reiniciar o servidor compartilhado com os outros agentes testando. Aplicar quando o servidor puder reiniciar (fase 2) ou direto no `route.ts` de `/midia` (território do AppSec, recarrega sem reiniciar).
- **CSP em Report-Only:** é a S-30/D-10, já registrada; não liguei o bloqueio. Recomendação em `decisoes.md`.

## SEC-210 · Recuperação não testada

- **Severidade:** P2. **Status:** NÃO TESTADO (produção fora do escopo).
- Não há registro de quanto tempo de PITR (restauração para um momento) o projeto Neon guarda, nem de teste de restauração. R2 (artes, PDFs, que dá para gerar de novo) e KV (dados temporários) não têm cópia, o que é aceitável. Proposta: o dono confere a janela de restauração no plano do Neon, e uma vez por mês alguém cria um branch a partir de um momento passado e roda `tests/db` contra ele (passo no Playbook 5).

## SEC-211 · `cf-secrets.sh` deixa segredos em `/tmp`

- **Severidade:** P3. **Status:** Confirmada.
- `scripts/cf-secrets.sh:15-25` grava os segredos da produção em `/tmp/onde-secrets.json.tmp` e `/tmp/onde-secrets.json` com a permissão padrão (legível por outros usuários da máquina) e, com `set -e`, uma falha no `wrangler` deixa o arquivo lá. Proposta: `umask 077`, `mktemp` e `trap 'rm -f "$tmp"' EXIT`.

## SEC-212 · Não havia verificação contínua

- **Severidade:** P2. **Status:** **Corrigida** · rodou verde no GitHub (run 41160029074, commit da6a00b, 31/10 02:26 UTC: os três jobs `success`); revisão independente do Agente 06 pendente.
- **Correção:** `.github/workflows/security.yml` (pull_request e push para `claude/**`), com `permissions: contents: read`, sem segredos e sem deploy. Actions fixadas por commit (checkout v7.0.1, pnpm/action-setup v6.0.10, setup-node v6.5.0, todas de mais de 2 meses). Três jobs:
  1. `codigo`: `pnpm install --frozen-lockfile`, `tsc --noEmit`, `eslint .`, `vitest run tests/unit` (sem banco: `TEST_DATABASE_URL` vazia; os testes de `tests/db` se pulam sozinhos).
  2. `dependencias`: `pnpm audit --prod --audit-level=high --json` + `.github/scripts/audit-gate.mjs`. **Bloqueia** aviso alto/crítico de produção que não esteja em `.github/audit-allowlist.json` (com motivo, referência e data de revisão); só avisa quando o próprio registro do npm falha. Motivo: só avisar vira ruído que ninguém lê; bloquear tudo travaria o CI hoje por três avisos já avaliados e sem correção disponível (SEC-205), e o time aprenderia a ignorar o CI.
  3. `segredos`: Gitleaks 8.28.0 (binário oficial com SHA-256 conferido; a action oficial pede licença paga em contas de organização), histórico inteiro, `--redact`.
- **Não interfere no deploy:** o deploy é a integração da Cloudflare no push do branch de produção; o workflow só lê. Se um dia o dono marcar estes checks como obrigatórios no GitHub, eles passam a segurar o merge, não o deploy.
- **Teste de regressão (local, 31/10):** clone limpo em `$S/sec/blue-team/ci-sim`: install congelado OK; `tsc` 0 erros; `eslint .` 0 erros; `vitest run tests/unit` 17 arquivos, 68 testes passando; `pnpm test` sem banco: 68 passam, 92 pulados. `audit-gate.mjs`: resultado real → passa (3 aceitos); aviso alto inventado → falha (código 1); resposta de erro do registro → só aviso. Gitleaks: histórico → 0; controle positivo com chave falsa num repositório temporário → detecta (código 1). YAML conferido com PyYAML.
- **Arquivos modificados:** `.github/workflows/security.yml`, `.github/scripts/audit-gate.mjs`, `.github/audit-allowlist.json` (commit a66f9bc).

## SEC-213 · PDFs de ingresso no bucket de mídia

- **Severidade:** P3. **Status:** Hipótese (NÃO TESTADO: configuração da Cloudflare fora do escopo).
- `src/app/api/ingressos/[code]/pdf/route.ts:24-31` guarda o PDF pronto (com o QR válido) em `onde-media` com a chave `pdf/<código>-<hash>.pdf`. A rota `/midia` só serve `eventos/` e `destaques/` (`src/app/midia/[...key]/route.ts:7`), então pelo site não sai. Se o bucket tiver acesso público (r2.dev ou domínio próprio), quem souber a chave baixa o ingresso; a chave tem 80 bits de hash, então não dá para adivinhar, mas uma listagem pública exporia tudo. Pedido ao dono: confirmar no painel do R2 que `onde-media` não tem acesso público nem listagem.

---

## Verificado e OK

Segredos e configuração
- Histórico do git sem segredo: Gitleaks 8.28.0 em 366 commits (todas as refs) e varredura das pastas `src`, `tests`, `docs`, `scripts`, `public`, `.claude`: 0 achados. Busca manual em `git log -p --all` por URL de Postgres com senha, chaves `sk_`/`rk_`/`pk_live_`/`whsec_`, Resend, Neon (`npg_`), AWS, GitHub, Google, JWT e chave privada PEM: 0.
- `.env*` e `.dev.vars*` no `.gitignore` (`.gitignore:34`, `:49`; exceção só `.env.example`, `:44`); nenhum arquivo de ambiente adicionado em nenhum commit (só `.env.example`, com valores de exemplo).
- Nada de segredo no navegador: o único `NEXT_PUBLIC_*` lido pelo código é `NEXT_PUBLIC_SITE_URL`; nenhum dos 134 componentes `"use client"` lê `process.env` nem importa módulo de servidor (só `import type`). Bundle de cliente (`.open-next/assets`, build de 29/10): nenhum nome de variável secreta nem padrão de chave.
- Sem valor padrão para segredo: `src/lib/signing-secret.ts:5-9` falha sem o segredo; `src/db/index.ts:8-9` falha sem `DATABASE_URL`; o SDK do Neon Auth recusa segredo ausente ou com menos de 32 caracteres. Chave da Stripe só no servidor (`src/app/checkout/page.tsx:145`, publicável passada como prop).
- Módulos que leem segredos têm `import "server-only"` ou são rotas (`src/lib/{email,turnstile,places,payments/stripe,wallet/*,mail/send}.ts`). Sem a marca, mas sem uso em cliente: `src/lib/auth/server.ts`, `src/lib/spotify.ts`, `src/lib/signing-secret.ts`, `src/db/index.ts` (endurecimento opcional: adicionar `server-only`).
- `wrangler.jsonc`: `global_fetch_strictly_public` ligado (fetch do Worker não alcança endereço interno); `vars` só com valores públicos; segredos via `wrangler secret`; `keep_vars` preserva variáveis do painel.

Sessão, autenticação e autorização (conferência das correções anteriores ainda de pé)
- Cookies do login: prefixo `__Secure-`, `HttpOnly`, `Secure`, `SameSite=Lax` (SDK; `src/lib/auth/server.ts:9-12`). Cookies próprios: todos `HttpOnly` e `SameSite` `lax`/`strict`, `Secure` em produção: `tw_mfa` (`src/lib/mfa.ts:34`), banco `strict` (`src/lib/bank.ts:212`), portaria (`src/lib/portaria.ts:33-36`), `tw_org` (`src/lib/actions/produtoras.ts:23-25`), Apple (`src/app/api/apple/start/route.ts:16`, `callback/route.ts:44`), Spotify, fila, pré-venda e indicação.
- Comparações de assinatura em tempo constante: `src/lib/mfa.ts:33`, `src/lib/bank.ts:218`, `src/lib/portaria.ts:67`, `src/lib/checkin.ts:16`, `src/lib/auth/apple.ts:45`.
- TOTP sem reaproveitamento do mesmo código (`src/lib/mfa.ts:181-186`); códigos de e-mail guardados só como hash, 5 tentativas (`src/lib/mfa.ts:92-108`); códigos de recuperação só como hash.
- Central: domínio fixo `@ticketswin.com.br`, e-mail confirmado e app autenticador (`src/lib/admin.ts:18`, `:30-36`); upload da central exige `secure` (`src/app/api/admin/banner/route.ts:12-14`) — S-05 de pé.
- Proxy do login bloqueia login/cadastro diretos e exige a segunda etapa para mexer na conta (`src/app/api/auth/[...path]/route.ts:13-15`, `:23-34`), com caminho normalizado.
- `?next=` sem redirecionamento aberto (`src/lib/auth/next-param.ts:9-13`); `withNext` só reescreve para a mesma origem (`src/proxy.ts`).
- Painel: cada ação reconfere sessão, papel e produtor no servidor (`src/lib/actions/painel.ts:24-34`); produtora ativa por cookie só entre as da conta (`src/lib/data/org-access.ts:40-60`) — S-02/S-34/S-35 de pé.
- Ações de servidor: o Next compara `Origin` com `Host` (proteção de CSRF, `node_modules/next/dist/docs/01-app/02-guides/data-security.md`); não há `serverActions.allowedOrigins` ampliando isso.
- CORS: nenhuma rota manda `Access-Control-*` nem trata `OPTIONS`: só a mesma origem lê respostas.

Webhooks, cron e uploads
- Stripe: assinatura conferida com `constructEventAsync` (`src/lib/payments/stripe.ts:44-48`) e evento repetido ignorado pelo KV (`src/app/api/webhooks/stripe/route.ts`).
- Neon Auth: assinatura Ed25519 com JWKS e janela de 5 min (`src/lib/auth/webhook.ts:23-37`), deduplicação por `event_id`.
- Cron: token aleatório por execução, só no isolate (`custom-worker.js:10-12`, `src/app/api/cron/route.ts:6-7`).
- Upload: tipo conferido pelos bytes e limite por conta (`src/app/api/midia/route.ts:20-30`, S-07 de pé); `/midia` só serve `eventos/` e `destaques/`, sem `..` (`src/app/midia/[...key]/route.ts:7`).
- HTML de terceiros: e-mail "ver no navegador" com CSP `sandbox` e `script-src 'none'` (`src/app/e/ver/[token]/route.ts:20`); banner HTML em `/api/arte-html` com CSP própria `sandbox allow-scripts` (`src/lib/art-frame.ts:18`) — S-36 de pé.
- Arquivos privados com `cache-control: private, no-store` (PDF, Wallet, ICS); páginas com `private, no-store` na produção.

Logs
- Nenhum `console.*` grava senha, token, CPF ou código; o código de 2FA só aparece no console fora da produção e sem envio de e-mail (`src/lib/notify.ts:140`); `email_log` mascara códigos de 6 dígitos (`src/lib/email.ts:56-59`) e é podado em 30 dias; o relatório de CSP grava só diretiva, origem e primeiro trecho do caminho (`src/app/api/csp-report/route.ts:24-27`); `rememberDevice` usa o hash do token, nunca o token (`src/lib/mfa.ts:272-276`).
- `ticket_events` só é lido pela central (`src/lib/admin-trail.ts:1`, `server-only`).

Cadeia de suprimentos
- Lockfile com integridade; CI instala congelado; scripts de instalação restritos; versões exatas nos pacotes sensíveis (`next`, `stripe`, `node-forge`, `pdf-lib`, `jsqr`, `fflate`, `@neondatabase/auth`). Correções S-15 (jspdf removido, node-forge 1.4.2) e S-26 (fflate 0.8.3) de pé.

## NÃO TESTADO / BLOQUEADO

| Item | Motivo |
|---|---|
| OSV-Scanner online | BLOQUEADO: `api.osv.dev` recusado pelo proxy; rodado com a base offline (funcionou) |
| Cabeçalhos de `banco.ticketswin.com.br` e redirecionamento `http://` | BLOQUEADO: o proxy desta sessão recusa esses destinos |
| Forja de sessão com o segredo (SEC-200) | NÃO TESTADO de propósito: seria contra o login da produção |
| Acesso público do R2, janela de PITR do Neon, regras de WAF/limite da Cloudflare | NÃO TESTADO: configuração de terceiros fora do escopo |
| Execução do workflow no GitHub | Feito: run 41160029074 verde (tipos, lint, 68 testes, audit com 3 exceções aceitas, Gitleaks 0). Pushes seguidos de vários agentes cancelam execuções em andamento (`concurrency`), o que é esperado |
