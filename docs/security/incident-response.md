# Resposta a incidentes — Tickets Win

Autor: Agente 02 (Blue Team), 31/10/2026. Procedimento prático para a operação real: Worker `ticket` na Cloudflare, Neon (branch `main` = produção), Neon Auth, R2, KV, Stripe, Resend. Arquitetura: `security-architecture.md`. Achados citados: `findings/*.md`.

Regras que valem em qualquer incidente:
- **Primeiro conter, depois investigar, depois corrigir.** Não apague registro, linha de banco nem log antes de copiar o que precisa.
- **Nunca cole segredo em chat, issue, commit ou documento.** Este repositório é público (SEC-201).
- **Não reative `app_errors`** (decisão do dono). Use o log do Worker e as tabelas abaixo.
- **Nunca "pause pagamentos" apagando `STRIPE_SECRET_KEY`:** sem ela o checkout entra no modo de teste e **emite ingresso sem cobrança** (S-18/D-07). Para parar vendas, use o item C3.
- Anote tudo numa linha do tempo (hora, quem, o que viu, o que fez). Ela vira o relatório final.

## 1. Gravidade e tempo de resposta

| Nível | Exemplos neste projeto | Começar em | Quem decide |
|---|---|---|---|
| P0 | segredo mestre ou senha do banco vazada fora do ambiente; ingressos pagos emitidos sem pagamento em escala; acesso indevido à central; dados pessoais vazados em massa | imediato | dono |
| P1 | conta de produtor tomada; saque para conta estranha; QR forjado; site fora do ar em dia de evento | até 1 h | dono |
| P2 | fraude isolada de cartão; picos de robô; e-mail de phishing usando o domínio | no mesmo dia | dono ou suporte |
| P3 | aviso de dependência, cabeçalho, configuração | próxima janela | equipe |

## 2. Contatos e acessos

Preencha os telefones fora do repositório (cofre de senhas) e deixe aqui só onde estão.

| Quem / o quê | Para quê | Onde |
|---|---|---|
| Dono (Lucas) — responsável por todo incidente | decidir, rodar segredos, falar com clientes e produtores | e-mail do domínio; telefone no cofre |
| Admin da central (`ADMIN_EMAILS` em `wrangler.jsonc`) | pausar produtor, recusar saque, ver o rastro de ingressos | `/tw-central` (exige app autenticador) |
| Cloudflare | Workers (versões, logs, segredos), R2, KV, WAF, modo "Under Attack" | painel da Cloudflare; status: cloudflarestatus.com |
| Neon | banco (papéis, senhas, branches, restauração), Neon Auth | Console do Neon; status: neonstatus.com; suporte pelo Console |
| Stripe | pagamentos, estornos, disputas, chaves, webhook | Dashboard da Stripe; status: status.stripe.com |
| Resend | e-mail transacional e campanhas; chaves; logs de envio | painel da Resend |
| Apple Developer / Google Cloud | certificados do Wallet, Sign in with Apple, Google Wallet | consoles respectivos |
| GitHub `lucashector-ai/ticket` | código; integração de deploy da Cloudflare | GitHub |
| ANPD | comunicação de incidente com dados pessoais (LGPD art. 48; Resolução CD/ANPD nº 15/2024: até 3 dias úteis do conhecimento, em caso de risco ou dano relevante aos titulares) | gov.br/anpd (peticionamento) |

## 3. Primeiros 15 minutos (qualquer incidente)

1. Abrir a linha do tempo. Classificar (seção 1). Se for P0/P1, avisar o dono.
2. Preservar: abrir o log do Worker em tempo real (Cloudflare → Workers → `ticket` → Logs) e salvar o que aparece; anotar ids de pedido, ingresso, conta e evento envolvidos.
3. Conter com a menor ação que resolve (seção 4).
4. Só então investigar (consultas da seção 6, sempre como leitura).

## 4. Alavancas de contenção que já existem

| # | Ação | Como | Efeito colateral |
|---|---|---|---|
| C1 | Voltar o site para a versão anterior | Cloudflare → Workers → `ticket` → Deployments → versão anterior → Rollback. Depois reverter o commit no branch de produção (o próximo push publica de novo) | volta código, não volta banco |
| C2 | Barrar tráfego/robô | Cloudflare: modo "Under Attack", regra de WAF bloqueando o caminho ou o país, limite de taxa | pode atrapalhar compradores reais |
| C3 | Parar as vendas de um evento | editor do evento: encerrar as vendas dos lotes; em emergência, o dono no Console do Neon: `update ticket_types set status = 'closed' where event_id = :evento` (compra recusada: `src/lib/tickets/limits.ts:19`); em último caso, cancelar o evento (estorna todos os pedidos: `src/lib/payments/cancel-event.ts`) | cancelar é irreversível; anotar o status anterior dos lotes para voltar |
| C4 | Tirar o poder de um produtor | central → produtores → revogar (`revokeProducer`, `src/lib/actions/admin.ts:198`) | ele deixa de criar/editar eventos |
| C5 | Segurar dinheiro | saques são pagos à mão: central → saques → **Recusar** (`updatePayout`, `src/lib/actions/admin.ts:46`). Não pague saque pendente durante a investigação | atrasa o repasse legítimo |
| C6 | Cortar um aparelho da portaria | painel → portaria → revogar o acesso; corta na hora (`src/lib/portaria.ts:50-59`) | o aparelho precisa entrar de novo com acesso novo |
| C7 | Derrubar sessões de uma conta | a pessoa: Minha conta → Segurança → sair dos outros aparelhos e trocar a senha; o dono: Console do Neon → Auth → usuário → revogar sessões | o cache de sessão do SDK ainda vale alguns minutos |
| C8 | Derrubar todas as sessões | trocar `NEON_AUTH_COOKIE_SECRET` | **hoje quebra QR, 2FA por app, banco e portaria** (SEC-200); só em P0, seguindo o Playbook 1 |
| C9 | Bloquear o script injetado (XSS) | variável `CSP_MODE=enforce` no Worker (D-10) | se faltar liberar algum terceiro, ele para de funcionar; volta apagando a variável |
| C10 | Parar o cron (e-mails, avisos, cancelamentos em lote) | Cloudflare → Workers → `ticket` → Triggers → remover o cron temporariamente | fila de e-mail e cancelamentos param até religar |

## 5. Playbooks

### Playbook 1 — Vazamento de segredo e rotação

**Sinais:** segredo em commit/print/log/chat; Gitleaks falhou no CI; uso estranho num painel de terceiro (envios na Resend que ninguém fez, conexões estranhas no Neon, chamadas na Stripe).

1. **Conter:** identificar qual segredo e onde apareceu. Se foi em commit, **não** resolva só apagando o arquivo: o histórico guarda. Gire o segredo primeiro.
2. **Girar** (ordem: o mais poderoso primeiro). Para cada um: criar o novo, trocar no Worker (`pnpm exec wrangler secret put NOME`, colando o valor quando pedir, nunca na linha de comando), trocar nos arquivos locais que precisam dele, conferir o site, revogar o antigo.

| Segredo | Onde gira | Efeito de girar | Cuidados |
|---|---|---|---|
| `DATABASE_URL` (senha do papel) | Console do Neon → Roles → reset password | conexões antigas caem; Worker reconecta com a nova | trocar na hora no Worker para não derrubar o site; também em `.env.local`/`.dev.vars` se usados. Ideal: papel próprio da aplicação (SEC-202) |
| `NEON_AUTH_COOKIE_SECRET` | gerar com `openssl rand -base64 32` | **hoje:** desloga o cache de sessão **e** invalida todos os QR (a portaria lê só o código digitado), os segredos TOTP guardados (quem usa app autenticador, inclusive admin, não consegue mais entrar), códigos de recuperação, cookies da portaria e do banco | antes, se der tempo, aplicar a separação de chaves de SEC-200. Se não der (P0): avisar produtores com evento nos próximos dias; preparar a central para zerar o 2FA de quem pedir (com conferência de identidade); reemitir/reenviar ingressos dos eventos próximos |
| `STRIPE_SECRET_KEY` | Dashboard da Stripe → Developers → API keys → Roll key (com prazo para a antiga) | nenhum se trocar dentro do prazo | **nunca** deixar vazia (modo de teste emite ingresso de graça) |
| `STRIPE_WEBHOOK_SECRET` | Dashboard → Webhooks → endpoint → Roll secret | webhooks falham até trocar no Worker; a Stripe repete por até 3 dias | trocar no Worker logo após girar |
| `RESEND_API_KEY` | painel da Resend → API Keys → criar nova, apagar a antiga | e-mails falham entre a troca | conferir o log de envios da Resend por envios estranhos (phishing com o domínio) |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | sem a chave, o desafio desliga sozinho (SEC-312) | trocar as duas chaves juntas |
| `APPLE_PASS_P12`/`APPLE_WWDR_PEM`, `GOOGLE_WALLET_SERVICE_ACCOUNT` | Apple Developer (revogar certificado) / Google Cloud (apagar a chave da conta de serviço) | passes novos falham até a troca | passes já emitidos continuam no celular das pessoas |
| `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SPOTIFY_CLIENT_SECRET` | consoles respectivos | só o recurso some | olhar a fatura: o uso indevido custa dinheiro |

3. **Investigar:** desde quando estava exposto; o que dava para fazer com ele; sinais de uso (logs do terceiro, `security_events`, pedidos e saques do período).
4. **Limpar:** se veio de commit, depois de girar, abrir pedido para reescrever o histórico (decisão do dono; repositório público: considerar que já foi copiado).
5. **Prevenir:** o CI (Gitleaks) roda em cada push; um falso positivo vai para `.gitleaksignore` pela impressão digital, nunca pelo valor.

**Pendentes hoje:** senha do papel do banco exposta em sessão anterior (SEC-203, rotação com o dono) e segredo mestre igual no desenvolvimento (SEC-200).

### Playbook 2 — Fraude de pagamento

**Sinais:** disputa/chargeback na Stripe; muitos pedidos do mesmo CPF, cartão ou conta; ingressos emitidos sem cobrança na produção (`payment_ref` começando com `TEST-`); estornos em sequência; webhook com assinatura inválida no log; reclamação de produtor sobre saldo.

1. **Conter:** parar a venda do evento afetado (C3, sem cancelar ainda); recusar saques pendentes do produtor envolvido (C5); se for robô, C2.
2. **Confirmar o modo de pagamento:** se aparecerem pedidos `TEST-` na produção, a chave da Stripe sumiu ou nunca foi posta (D-07): repor a chave é a contenção.
3. **Levantar os pedidos** (leitura): pedidos pagos do evento no período, agrupados por `buyer_cpf`, `user_id` e `payment_ref`; comparar com os `payment_intent` da Stripe (todo pedido pago com cobrança tem `stripe_payment_intent_id`, índice único).
4. **Desfazer:** estornar pelo painel (o estorno invalida os ingressos e grava `order_refunds` e `ticket_events`); na Stripe, responder disputas com o rastro do ingresso (central → rastro: compra, transferências, check-in).
5. **Corrigir a causa** (regra de negócio ou de limite) com teste de regressão em `tests/db`.
6. **Comunicar** o produtor (saldo ajustado) e, se houve dados de cartão envolvidos, a Stripe.

### Playbook 3 — Conta de produtor comprometida

**Sinais:** e-mail "A conta de recebimento mudou" que o produtor não reconhece; saque que ele não pediu; membros novos na equipe; eventos, cupons ou campanhas de e-mail que ele não criou; login de IP/aparelho estranho em Minha conta → Segurança.

1. **Conter:**
   - recusar todos os saques pendentes dele (C5);
   - derrubar as sessões dele (C7) e pedir troca de senha e app autenticador ligado;
   - se houver risco para compradores (campanha de phishing, evento falso), revogar o produtor (C4) e despublicar os eventos afetados;
   - painel → equipe: remover quem ele não reconhece. Atenção (SEC-003): acessos de portaria que um admin removido via no painel continuam valendo; revogar e recriar todos os acessos dos eventos próximos (C6);
   - conferir a conta de recebimento e voltar a correta.
2. **Investigar** (leitura, seção 6): `security_events` da conta (login, senha, e-mail, 2FA, conta de recebimento, saques, com IP e aparelho); `payout_requests` (destino de cada saque); `organizer_members`; `checkin_links` criados no período; cupons e campanhas criados. Lacuna: convites, papéis e remoções da equipe não ficam em `security_events` (SEC-207); use `organizer_members.created_at/accepted_at`.
3. **Recuperar:** devolver o controle ao dono legítimo (e-mail confirmado, app autenticador); reverter cupons/eventos alterados; avisar compradores se receberam e-mail falso.
4. **Registrar** a causa provável (senha reaproveitada, e-mail do produtor tomado, sessão roubada).

### Playbook 4 — QR duplicado no evento

**Sinais:** a portaria mostra "Ingresso já utilizado" (com o horário da primeira entrada) para quem jura que não entrou; várias recusas seguidas; dois aparelhos aceitando o mesmo código (não deveria acontecer: a marcação é condicional, só a primeira leitura vale).

1. **Na porta:** não liberar automaticamente. Conferir nome do titular (aparece na leitura) e documento. Quem entrou primeiro está registrado com hora e operador.
2. **Ver o histórico do ingresso:** central → rastro → código ou e-mail: compra, presente, transferências, revenda e check-in (com operador e recusas). Transferência ou revenda trocam o código (S-01): o código antigo mostra "QR code inválido ou de um ingresso transferido".
3. **Casos comuns:**
   - print do QR compartilhado/vendido por fora: vale a primeira entrada; o produtor decide se deixa entrar a segunda pessoa;
   - golpe de revenda fora da plataforma: orientar a vítima; registrar o código e o e-mail do vendedor (rastro);
   - ingresso de outra data do mesmo evento: recusado com a data certa (S-27).
4. **Sinal de incidente maior (escalar para P1/P0):** muitos códigos válidos aparecendo duplicados de uma vez (lista exportada vazada, aparelho da portaria comprometido) ou QR assinado de ingresso que não existe (só é possível com o segredo mestre: SEC-200). Conter: revogar os acessos da portaria (C6) e criar novos; tratar o segredo pelo Playbook 1.
5. **Sem internet na porta:** a portaria não funciona sem conexão (`public/portaria/sw.js`). Antes de evento grande, o produtor exporta a lista de participantes do painel como plano B e define quem faz a conferência manual.

### Playbook 5 — Indisponibilidade

1. **Descobrir onde é:** status da Cloudflare, Neon, Stripe e Resend; painel do Worker (erros, CPU, pedidos); `curl -sI https://ticketswin.com.br/` (cabeçalhos e código).
2. **Por causa:**
   - **Deploy novo quebrou:** C1 (rollback no painel) e reverter o commit.
   - **Banco (Neon) fora/lento:** conferir compute suspenso ou limite do plano no Console; o site não emite ingresso sem banco. Pagamentos confirmados enquanto o banco estava fora são repetidos pela Stripe (webhook com repetição; emissão idempotente).
   - **Dado corrompido/apagado:** criar um branch do Neon a partir de um momento antes do problema (restauração para um momento), conferir nele e só então trocar ou copiar os dados. Conferir antes a janela de restauração do plano (SEC-210).
   - **Stripe fora:** checkout falha ao pagar; nada a fazer além de avisar. Não apagar a chave (modo de teste).
   - **Resend fora:** e-mails de código e ingresso não saem; a fila de campanhas tenta de novo a cada minuto. Ingressos ficam em Meus ingressos.
   - **Robô/DDoS:** C2.
3. **Comunicar:** mensagem curta nas redes/e-mail para produtores com evento no dia; para a porta, plano B do Playbook 4.
4. **Depois:** conferir pedidos pendentes do período e webhooks atrasados; nenhum pedido pago sem ingresso (consulta da seção 6).

## 6. Consultas de investigação (só leitura)

Rodar no Console do Neon (branch `main`) em modo leitura, ou num branch criado a partir da produção. Troque `:conta`, `:evento` pelos ids.

```sql
-- acontecimentos de segurança de uma conta (IP e aparelho)
select created_at, kind, detail, ip, user_agent from security_events where user_id = :conta order by created_at desc limit 200;
-- saques e destino
select created_at, status, amount_cents, destination, note from payout_requests where user_id = :conta order by created_at desc;
-- equipe de uma produtora
select email, role, user_id, created_at, accepted_at from organizer_members where organizer_id = :produtora order by created_at;
-- acessos de portaria de um evento
select label, email, created_by_user_id, created_at, revoked_at, scans, last_used_at from checkin_links where event_id = :evento;
-- pedidos pagos sem cobrança real na produção (modo de teste)
select id, created_at, total_cents from orders where status = 'paid' and payment_ref like 'TEST-%' order by created_at desc;
-- pedido pago sem ingresso (não deveria existir)
select o.id from orders o where o.status = 'paid' and not exists (select 1 from tickets t where t.order_id = o.id);
```

## 7. Comunicação

- **Compradores e produtores:** fatos, o que fazer, sem detalhe técnico que ajude atacante. Nunca citar o nome do processador de pagamento para o usuário final.
- **Dados pessoais (LGPD):** se houver risco ou dano relevante (ex.: CPF, e-mail e telefone de compradores expostos), o dono comunica a ANPD e os titulares em até 3 dias úteis (Resolução CD/ANPD nº 15/2024), com: o que vazou, quantas pessoas, quando, medidas tomadas e contato.
- **Stripe:** em fraude com cartão ou disputa em volume.

## 8. Depois do incidente

1. Relatório em `docs/security/incidents/AAAA-MM-DD-<nome>.md` (sem segredo, sem dado pessoal): linha do tempo, causa, impacto, o que funcionou, o que falhou.
2. Teste de regressão para a causa (unitário ou `tests/db`).
3. Atualizar este documento e `security-architecture.md` se uma alavanca faltou.
4. Revisar se algum segredo ficou em print, log ou chat; se ficou, Playbook 1.
