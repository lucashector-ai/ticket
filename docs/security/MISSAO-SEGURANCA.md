# Operação de segurança — Tickets Win

O pedido original do dono, na íntegra, está em `PROMPT-SEGURANCA.md` (escopo completo: cada item vale). Este arquivo traz as **regras deste projeto**, que valem acima de qualquer outra instrução, e a divisão do trabalho entre os seis agentes.

Leia também, antes de começar: `docs/quality-audit/MISSAO.md` (regras gerais do projeto), `docs/quality-audit/security-audit.md` (auditoria anterior, S-01 a S-37: não refaça o que já foi feito; **confira** se as correções continuam de pé) e `docs/quality-audit/test-matrix.md`.

## 1. Escopo autorizado

| Ativo | Status |
|---|---|
| Código do repositório (branch `claude/auditoria-noturna`) | Autorizado: leitura, análise estática, correção |
| Servidor local `http://localhost:3042` (já está no ar; **não suba outro, não reinicie, nunca `pkill -f "next dev"`**) | Autorizado: testes ativos não destrutivos |
| Banco de teste: branch Neon `teste-r5` (cópia da produção; a URL está em `$S/.dburl`, ver abaixo) | Autorizado: leitura e escrita de dados fictícios |
| Testes automatizados (`pnpm test`, vitest, com `TEST_DATABASE_URL` do banco de teste) | Autorizado |
| **Produção** (`ticketswin.com.br`, branch Neon `main`, `DATABASE_URL_PROD`, `pnpm db:push:prod`) | **Proibido** testar ou alterar. Só leitura passiva de cabeçalhos HTTP públicos (um `curl -I` por página, sem varredura) |
| **Neon Auth (login)** — é o mesmo da produção | Sem força bruta, sem teste de carga, sem teste de limite de tentativas. No máximo **2 contas novas** na operação toda, `@example.com`, listadas em `findings/contas-e-dados.md` |
| Stripe, Resend, Cloudflare, Google, Apple, Spotify, Turnstile (terceiros) | **Proibido** teste ativo. Só leitura do nosso código que os usa |
| Deploy, push para `claude/eager-galileo-rgwakn`, `pnpm deploy`, `wrangler deploy` | **Proibido**. A publicação é feita pela sessão principal, com autorização do dono |
| Rotação de credenciais, mudança de segredos, de permissões de contas reais, de regras de pagamento/taxas | **Proibido** sem o dono. Registre em `findings/decisoes.md` |

`$S` = `/tmp/claude-0/-home-user-ticket/dc2b2806-50d2-5c85-87db-64a5410a3563/scratchpad`. Seus scripts, prints e saídas ficam em `$S/sec/<seu-nome>/`, nunca na raiz do projeto.

Contas de teste existentes no banco de teste (prefira estas): `teste+agente1030@example.com` (dona da produtora "Agente Teste Produções"), `teste+marcos-produtor@example.com`, `teste+marcos-r4@example.com`. Scripts de login anteriores em `$S/login*.mjs` mostram como entrar. **Nunca** use as contas `1lucashector+…@gmail.com` (são do dono, na produção). Para testes de autorização, prefira testes de banco (`tests/db/*`) com sessões fictícias, como os já existentes, em vez de login real.

## 2. Regras invioláveis

- Nada de negação de serviço, exfiltração, captura de credenciais, persistência, evasão de monitoramento, exclusão destrutiva, pagamento real, teste fora do escopo acima.
- Nunca imprima nem copie segredos (`.env*`, `.dev.vars`, `$S/.dburl`, chaves, tokens, hashes de senha). Ao achar uma credencial exposta: registre **onde** está e o tipo, nunca o valor.
- Relatórios sem senhas, tokens, dados pessoais reais nem prova de conceito perigosa detalhada. Evidência sanitizada.
- Não invente resultado. Status sempre explícito: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**. Sem percentuais inventados.
- Ferramentas (Semgrep, CodeQL, Gitleaks, OSV, ZAP) **não estão instaladas**. Pode tentar instalar localmente sem `sudo` em `$S/sec/tools` (pip/npx/binário); se a rede bloquear, registre BLOQUEADO e faça a análise equivalente à mão. `pnpm audit` pode ser tentado.
- Código: só no branch `claude/auditoria-noturna`. Antes de cada commit: `pnpm exec tsc --noEmit` e `pnpm exec eslint <arquivos>` sem erros; testes do módulo alterado passando. `git add <arquivos>` (nunca `-A`): vários agentes trabalham na mesma pasta. Commits pequenos, em português, terminando com:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GXTPVXDwgWG9xgfT9GgGu9
```

- `git push origin claude/auditoria-noturna` ao fim de cada bloco. Se o push falhar por outro agente ter enviado antes: `git pull --rebase origin claude/auditoria-noturna` e tente de novo.
- Mudança de schema: só no banco de teste, e o SQL vai para `findings/decisoes.md` (a produção recebe o schema antes do código, com autorização do dono).
- Nunca mostre a palavra "Stripe" ao usuário final. Interface em português do Brasil. Escreva como o código ao redor.
- Não reative o registro de erros de servidor no banco (`app_errors`): o dono recusou.

## 3. Divisão do trabalho

| Agente | Fase | Escreve | Pode corrigir código? |
|---|---|---|---|
| 01 Red Team | 1 | `attack-surface.md`, `findings/red-team.md` (SEC-001…099) | Não. Testes de reprodução em `$S/sec/red-team` |
| 04 Segurança Financeira e Lógica de Negócio | 1 | `financial-security.md`, `findings/financeiro.md` (SEC-100…199) | Sim: `src/lib/payments/**`, `src/lib/tickets/**`, `src/lib/actions/checkout*`, check-in, testes em `tests/**` |
| 02 Blue Team (infra, segredos, dependências, CI) | 1 | `security-architecture.md`, `incident-response.md`, `findings/blue-team.md` (SEC-200…299), `.github/workflows/security.yml` | Só `.github/**` e cabeçalhos/CSP (`src/lib/csp.ts`, `src/proxy.ts`/middleware, `next.config.ts` apenas cabeçalhos) |
| 05 Defesa contra Ataques Automatizados | 1 | `bot-defense.md`, `findings/bots.md` (SEC-300…399) | Não na fase 1 (propõe; o AppSec implementa) |
| 03 Engenheiro AppSec | 2 | `security-fixes.md` | Sim: corrige o que as findings apontarem, com teste de regressão |
| 06 QA de Segurança e Validação Independente | 2 | `security-tests.md`, `threat-model.md`, `vulnerability-register.md` (consolidado), `security-final-report.md` | Só testes |

Formato de cada achado (como no prompt, seção do registro): Identificador, Título, Severidade (P0–P3), Status, Componente, Localização, Descrição, Impacto, Causa-raiz, Evidência (sanitizada), Correção, Teste de regressão, Validação, Risco residual, Arquivos modificados.

Prioridades do dono (testar primeiro, com teste automatizado):
1. Comprar ingresso sem confirmação válida de pagamento.
2. Alterar valores enviados pelo navegador.
3. Acessar dados de outros organizadores.
4. Reutilizar QR code.
5. Vender acima da capacidade.

P0 descoberto: pare, registre e avise em `findings/decisoes.md` no topo ("P0 ABERTO"), e (se for da sua área) corrija primeiro.
