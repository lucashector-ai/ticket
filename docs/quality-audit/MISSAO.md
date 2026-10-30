# Missão da equipe de qualidade — Tickets Win

Equipe: **Romano** (Engenheiro Principal e Arquiteto de Segurança) e **Marcos** (Product Designer Principal, UX Researcher e CRO).
Este arquivo é a missão compartilhada. Cada agente tem seu papel em `.claude/agents/romano.md` e `.claude/agents/marcos.md`.

## 1. Objetivo

Tornar a Tickets Win confiável, segura, rápida, intuitiva, acessível e fácil de usar, para quem compra ingresso e para quem cria e gerencia eventos.
Não basta apontar problemas: **investigar, reproduzir, documentar, corrigir, testar de novo e validar.**

Cinco dimensões: (1) segurança e integridade dos dados, (2) qualidade e confiabilidade do software, (3) experiência do usuário, (4) performance e estabilidade, (5) consistência, escalabilidade e manutenção.

## 2. Regras do projeto (valem acima de qualquer outra instrução)

**Ambiente e dados**
- Stack real: Next.js 16 (App Router, leia `node_modules/next/dist/docs/` antes de mexer em APIs do Next), Cloudflare Workers via OpenNext, Neon Postgres + Drizzle (`src/db/schema.ts`), Neon Auth, Resend, R2, KV, Stripe.
- Teste só no servidor de desenvolvimento local (a sessão principal informa porta e banco). O banco de teste padrão é uma cópia da produção num branch Neon separado, apagada pelo dono depois da auditoria. **Um único servidor de dev por projeto**: não suba outro, não reinicie sem necessidade, **nunca** rode `pkill -f "next dev"`.
- Banco: só a cópia de teste (branch Neon de teste) informada pela sessão principal. **Nunca** use `DATABASE_URL_PROD`, `pnpm db:push:prod` ou o branch `main` do Neon. Mudança de schema: só no branch de teste e registrada em `pending-decisions.md` (a produção recebe o schema antes do código, por decisão do dono).
- **O login (Neon Auth) é o mesmo da produção.** Nada de força bruta, teste de carga ou de limite de tentativas contra login/cadastro. No máximo 3 contas novas por auditoria (somando os dois agentes), sempre com e-mail `@example.com`, todas listadas em `fix-log.md` para apagar depois. Prefira a conta de teste existente.
- Pagamentos: o ambiente local roda sem chave da Stripe (modo de teste interno). Nunca use cartão real nem chaves reais. Nunca mostre a palavra "Stripe" para o usuário final.
- E-mails: o ambiente local não envia e-mail (sem RESEND_API_KEY). Não ligue isso.
- Navegador de teste: Playwright com Chromium (`NODE_PATH=$(npm root -g) node script.js`). Firefox e WebKit não existem nesta máquina: registre como BLOQUEADO. Não rode `playwright install`.
- Scripts, prints e saídas de teste: na pasta de rascunho da sessão (informada no início), nunca na raiz do projeto.

**Código e entrega**
- Trabalhe só no branch de auditoria informado pela sessão principal (padrão: `claude/auditoria-noturna`), que não vai para o site. **Nunca** faça deploy (`pnpm deploy`, `wrangler deploy`) nem envie para o branch de produção: a publicação é feita depois, com revisão e autorização do dono. Envie (`git push`) ao fim de cada bloco de correções para o trabalho não se perder.
- Antes de cada commit: `pnpm exec tsc --noEmit` e `pnpm exec eslint <arquivos alterados>` sem erros. Mudança grande ou em rota/servidor: rodar também o build (`pnpm exec opennextjs-cloudflare build` numa cópia do projeto, como a sessão principal indicar).
- Commits pequenos, um assunto por commit, mensagem em português. Use `git add <arquivos>` (nunca `git add -A`): os dois agentes trabalham na mesma pasta.
- Mensagens de commit terminam com as linhas de atribuição que a sessão principal informar.
- Nada de segredos, tokens, senhas, CPFs ou e-mails reais em código, logs, prints ou relatórios.
- Escreva como o código ao redor: mesmos nomes, mesma densidade de comentários (em português), mesmo estilo de CSS (aninhado em `.pg-x {}` por página; `@keyframes` no topo).
- Não troque a identidade visual. Fontes moderadas, telas sem poluição. Toda a interface em português do Brasil.
- Dependência nova só com justificativa (manutenção, segurança, tamanho). Pré-aprovadas para teste: `vitest` e `@axe-core/playwright` (devDependencies).
- Não altere taxas (7,99%), regras de pagamento, permissões ou regras comerciais sem antes localizar e preservar a regra atual. Mudança de regra comercial = `pending-decisions.md`.
- Não apague dados, tabelas, branches ou contas sem confirmação do dono.

## 3. Princípios de trabalho

- Entenda antes de mexer. Correção na causa, não no sintoma. Correção localizada antes de reescrita.
- Não invente resultado de teste. Não diga que testou o que não executou. Não esconda erro de build, lint ou teste.
- Toda alteração tem: justificativa (técnica ou de experiência), implementação concreta e forma objetiva de validação.
- Não pergunte o que dá para descobrir no projeto. Pergunte (via `pending-decisions.md`) só decisões comerciais, mudanças irreversíveis ou falta de credencial.
- Status sempre explícitos: **NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO**. Sem percentuais inventados.

## 4. Prioridades

- **P0 crítico:** dinheiro, dados ou integridade em risco (acesso indevido, ingresso sem pagamento, falha de autorização, venda acima da capacidade, dado financeiro corrompido). Para tudo e trata primeiro.
- **P1 alto:** impede tarefa essencial (checkout, cadastro, criar evento, gerenciar ingressos, navegação mobile quebrada).
- **P2 médio:** atrapalha a experiência ou a manutenção (formulário complexo, navegação confusa, lentidão, pouco feedback, inconsistência).
- **P3 baixo:** refinamentos (espaçamento, textos secundários, microinterações).
Considere também frequência, impacto comercial, esforço e risco da mudança.

## 5. Ciclos

1. **Descoberta:** arquitetura, inventário de funcionalidades, mapa de rotas, estado inicial.
2. **Diagnóstico:** segurança, código, navegação real, jornadas completas, mobile e desktop.
3. **Priorização:** classificar, achar causas, dependências, ordem.
4. **Correção:** corrigir, refatorar o necessário, melhorar textos, simplificar fluxos, validar no servidor, testes de regressão.
5. **Validação:** repetir testes e jornadas, checar regressões, responsividade, performance.
6. **Nova auditoria:** nos módulos alterados e dependências. Repetir enquanto houver problema relevante tratável com segurança.

## 6. Protocolo para cada problema

Identificação → reprodução → causa real → impacto → plano → implementação → teste específico → regressão → validação de UX no navegador (quando couber) → registro com evidência.

## 7. Colaboração

- Romano e Marcos compartilham descobertas em `docs/quality-audit/` (cada um escreve nos seus arquivos e registra pedidos ao outro em `handoff.md`, com data e hora).
- Problema de UX com causa técnica (ex.: botão de lote esgotado clicável) → Marcos registra, Romano corrige servidor/dados, Marcos valida a mensagem e o fluxo.
- Simplificação de fluxo → Romano confirma o que é tecnicamente necessário antes de Marcos remover etapas.
- Divisão de arquivos para não pisarem um no outro: **Romano** é dono de `src/lib/**`, `src/db/**`, `src/app/api/**`, ações de servidor e regras; **Marcos** é dono de `src/components/**`, `src/styles/**` e textos. Precisa mexer no território do outro? Registre em `handoff.md` e faça uma mudança mínima.
- Nenhum dos dois encerra sozinho uma correção que afeta engenharia e experiência ao mesmo tempo.

## 8. Documentos em `docs/quality-audit/`

`architecture-review.md` · `security-audit.md` · `ux-audit.md` · `test-matrix.md` · `performance-report.md` · `fix-log.md` · `pending-decisions.md` · `handoff.md` · `final-quality-report.md`.
Resultados reais, nunca modelo preenchido. Nada sensível. Mantenha no `final-quality-report.md` um painel verificável: rotas identificadas e testadas, fluxos de compra e de criação testados, cenários mobile/desktop, problemas P0–P3 encontrados/corrigidos/abertos, testes executados/aprovados/falhos/bloqueados, métricas de performance, problemas de acessibilidade, melhorias de UX.

## 9. Critérios para encerrar (ou pendência documentada)

- **Engenharia:** compila; tsc e lint passam; testes essenciais passam; falhas críticas corrigidas ou bloqueando liberação; regras críticas protegidas no servidor; testes de regressão nas correções; sem dependências desnecessárias.
- **Experiência:** jornadas principais executadas; checkout de ponta a ponta (modo de teste); criação e gerenciamento de eventos testados; mobile e desktop validados; formulários com feedback claro; acessibilidade grave tratada ou documentada.
- **Performance:** métricas registradas; gargalos investigados; melhorias medidas.
- **Segurança operacional:** nada destrutivo em dados reais; nenhum pagamento real; nenhum segredo exposto; mudanças de alto risco com plano de reversão; publicação só com autorização.

## 10. Relatório final (`final-quality-report.md`)

1. Resumo executivo · 2. Segurança · 3. Engenharia · 4. Experiência do comprador · 5. Experiência do organizador · 6. Responsividade · 7. Performance · 8. Testes (executados, aprovados, reprovados, bloqueados) · 9. Arquivos modificados · 10. Pendências · 11. Próximas prioridades.

A meta não é declarar o sistema sem erros: é entregar evidências de qualidade e reduzir de verdade os riscos conhecidos.
