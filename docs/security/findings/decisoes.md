# Decisões para o dono (operação de segurança)

Cada agente acrescenta as suas entradas. P0 aberto vai no topo com "P0 ABERTO". Nenhuma mudança de schema, regra de pagamento ou segredo foi aplicada na produção.

---

## Agente 04 (financeiro)

### D-SEC-04-1 · Modo de teste de pagamento sem trava explícita (SEC-100, P1; P0 se a produção vende sem a chave)
- **Hoje:** sem `STRIPE_SECRET_KEY`, o checkout confirma pelo botão "Já fiz o pagamento" e emite ingressos válidos com referência `TEST-…` (fora do saldo do produtor, mas entram na portaria). Isso já foi decidido como "manter" na rodada 2 da auditoria de qualidade (D-07), enquanto a Stripe espera o CNPJ. Não mudei nada.
- **Por que voltar ao tema:** a decisão depende de duas coisas que não consigo ver daqui (por regra, sem teste na produção): se a produção já tem evento pago à venda e se a chave está configurada lá. Se houver evento pago à venda sem a chave, qualquer pessoa leva ingresso sem pagar.
- **Proposta pronta (pequena, em `src/lib/payments/stripe.ts` + `compra.ts`/`checkout.ts`):** função `testPaymentsAllowed()` = sem chave **e** (`ALLOW_TEST_PAYMENTS=1` ou o site não é `ticketswin.com.br`). Sem chave e sem a variável na produção: o checkout mostra "Pagamento indisponível no momento" e `confirmPayment` recusa. Para manter o comportamento atual basta publicar com `ALLOW_TEST_PAYMENTS=1`; uma chave perdida no futuro passa a parar a venda em vez de dar ingresso.
- **Opções:** (a) aplicar a proposta e publicar com `ALLOW_TEST_PAYMENTS=1` até a Stripe entrar; (b) aplicar sem a variável (a produção para de vender evento pago até a chave entrar); (c) manter.
- **Recomendação:** (a).

### D-SEC-04-2 · Repasse ao vendedor da revenda (SEC-106, P3)
- **Hoje:** o vendedor recebe o e-mail "Você recebe R$ X" (95% do anúncio), mas o sistema não registra saldo, extrato nem saque do vendedor; o pagamento a ele é manual. Num cancelamento do evento, o comprador da revenda é estornado e não há registro se o vendedor já foi pago.
- **Decidir:** como e quando o vendedor é pago (registro no Banco do comprador-vendedor, prazo, retenção até o evento acontecer) e o que acontece com o repasse se o evento for cancelado.

### D-SEC-04-3 · Restrições CHECK de valores no banco (SEC-108, P3) — SQL para o branch de teste e, com autorização, a produção (antes do código)
Não aplicado. Conferir antes que nenhum registro viola (consulta abaixo) para a criação não falhar.
```sql
-- conferência (deve voltar 0 em todas)
select count(*) from orders where total_cents < 0 or refunded_cents < 0 or refunded_cents > total_cents;
select count(*) from ticket_types where sold < 0 or quantity < 0;
select count(*) from coupons where uses < 0;
-- restrições
alter table orders add constraint orders_money_chk check (total_cents >= 0 and refunded_cents >= 0 and refunded_cents <= total_cents);
alter table ticket_types add constraint ticket_types_counts_chk check (sold >= 0 and quantity >= 0);
alter table coupons add constraint coupons_uses_chk check (uses >= 0);
```
(`sold <= quantity` fica fora de propósito: a lotação já é conferida em transação e o produtor não reduz abaixo do vendido.)

### D-SEC-04-4 · Contestação (chargeback) (SEC-107, P3)
- **Hoje:** `charge.dispute.created` não é tratado; com contestação aberta o ingresso segue válido.
- **Opções:** (a) ouvir o evento e marcar o pedido "em contestação" para o produtor e a central decidirem (sem cancelar sozinho); (b) cancelar os ingressos ao abrir a contestação; (c) manter. **Recomendação:** (a). Exige adicionar o evento no webhook da Stripe (painel da Stripe, pelo dono).

---

## Agente 02 (Blue Team: infraestrutura, segredos, dependências, CI)

Detalhes em `findings/blue-team.md`. Nenhum segredo foi girado, nenhuma configuração da Cloudflare/Neon/Stripe foi tocada e o bloqueio da CSP não foi ligado.

### D-SEC-02-1 · Segredo mestre único e igual no desenvolvimento (SEC-200, P1 — urgente)
- **Hoje:** `NEON_AUTH_COOKIE_SECRET` assina o cache de sessão do login **e** tudo o que é nosso (QR, portaria, banco, segunda etapa, cifra do app autenticador). O mesmo valor está em `.env.local`, `.dev.vars` e `.env.cloudflare` (conferido por igualdade, sem exibir). Quem tiver o valor se passa por qualquer conta, inclusive a central.
- **Problema extra:** trocar o valor hoje quebra todos os QR já enviados (a portaria passa a aceitar só o código digitado), o 2FA por app de todo mundo (inclusive o seu) e os acessos da portaria.
- **Opções:** (a) AppSec separa as chaves por finalidade, com chave anterior aceita por 60 dias e recifragem do TOTP; depois você gira na produção e põe um segredo próprio no desenvolvimento; (b) girar já, aceitando os efeitos acima (só se houver sinal de vazamento); (c) manter.
- **Recomendação:** (a) nesta semana; (b) imediatamente se houver qualquer indício de que esses arquivos ou transcrições de sessão saíram do ambiente.

### D-SEC-02-2 · Repositório público (SEC-201, P1)
- **Hoje:** `lucashector-ai/ticket` está público: código, histórico e todos os relatórios de segurança, inclusive os achados ainda abertos desta operação, que são publicados a cada push.
- **Opções:** (a) tornar privado (GitHub → Settings → General → Danger Zone → Change visibility) e conferir no painel da Cloudflare que o deploy continua (a integração usa o app do GitHub, que funciona com repositório privado); (b) manter público e tirar `docs/security` e `docs/quality-audit` do repositório; (c) manter.
- **Recomendação:** (a), antes do próximo push com achado aberto. Não encontrei nenhum segredo no histórico (Gitleaks + busca manual).

### D-SEC-02-3 · Senha do banco e papel da aplicação (SEC-203 P1, SEC-202 P2)
- **Senha:** a senha do papel do banco apareceu em comandos de uma sessão anterior; você já foi orientado. Passos: Console do Neon → Roles → resetar a senha → `pnpm exec wrangler secret put DATABASE_URL` (colar quando pedir) → conferir o site → atualizar `.env.local`/`.dev.vars` se usarem esse papel. Status: **aguardando o dono**.
- **Papel da aplicação:** hoje a produção usa o papel dono (`*_owner`), com poder de apagar tabelas. Proposta (testar primeiro no branch de teste, com `tests/db` rodando com a URL nova): criar o papel `app_rw` no Console do Neon (Roles; a senha é gerada lá) e aplicar:
```sql
grant usage on schema public to app_rw;
grant select, insert, update, delete on all tables in schema public to app_rw;
grant usage, select on all sequences in schema public to app_rw;
alter default privileges in schema public grant select, insert, update, delete on tables to app_rw;
alter default privileges in schema public grant usage, select on sequences to app_rw;
grant usage on schema neon_auth to app_rw;
grant select on neon_auth."user", neon_auth.account to app_rw;
grant update (email, "emailVerified", name, "updatedAt") on neon_auth."user" to app_rw;
```
  (`alter default privileges` precisa rodar com o papel dono, que é quem cria as tabelas no `db:push`.) Depois: `DATABASE_URL` do Worker com `app_rw`; o papel dono fica só para `db:push`. Aproveitar a troca para resolver a senha exposta.
- **Recomendação:** girar a senha já; papel novo na próxima janela, depois do teste.

### D-SEC-02-4 · Separar desenvolvimento e produção (SEC-204, P2)
- Tirar `DATABASE_URL_PROD` do `.env.local` e o arquivo `.env.cloudflare` da pasta do projeto (guardar num cofre de senhas); `pnpm db:push:prod` passa a receber a URL só na hora. Segredos próprios para desenvolvimento (inclui D-SEC-02-1). **Recomendação:** sim.

### D-SEC-02-5 · Ligar o bloqueio da CSP (D-10, S-30)
- Continua em Report-Only; não liguei. Minha leitura: o código está pronto (validado nos 3 navegadores na auditoria anterior; banners resolvidos na S-36). Falta só olhar no log do Worker se há avisos `csp` de `script-src` vindos da produção (scripts que a Cloudflare injeta, VLibras, Google/Apple).
- **Recomendação:** mantida a (a) da D-10: uma semana de log sem aviso de `script-src` → `CSP_MODE=enforce` como variável do Worker (volta apagando a variável).

### D-SEC-02-6 · HSTS para subdomínios (SEC-209, P3)
- Hoje `max-age=31536000` sem `includeSubDomains`. Ligar protege todos os subdomínios (inclusive os que ainda vão existir) contra rebaixamento para HTTP, mas qualquer subdomínio sem HTTPS para de abrir por até 1 ano no navegador de quem visitou o site.
- **Decidir:** confirmar que todos os subdomínios (DNS na Cloudflare, links de rastreio de e-mail, BIMI) servem HTTPS e, se sim, trocar para `max-age=31536000; includeSubDomains` em `next.config.ts` (o Blue Team aplica; a troca reinicia o `next dev`, por isso ficou para quando o servidor puder reiniciar). `preload` só depois de meses com `includeSubDomains`.

### D-SEC-02-7 · Guarda de `security_events` (SEC-208, P3)
- IP e aparelho guardados para sempre. **Proposta:** 1 ano (prazo para investigar fraude e contestação), poda no cron. Decidir junto com a retenção da D-03 (LGPD).

### D-SEC-02-8 · Conferências no painel que só o dono pode fazer (SEC-210, SEC-213)
- Neon: qual a janela de restauração para um momento (PITR) do plano; fazer uma restauração de teste num branch.
- R2: confirmar que `onde-media` (tem PDFs de ingresso com QR) não tem acesso público (r2.dev ou domínio) nem listagem.
- Cloudflare: guardar o log do Worker por mais tempo (Logpush) e criar alertas de erro do Worker (Notifications). Custo é decisão sua.

### D-SEC-02-9 · Exceções do audit no CI (SEC-205)
- O CI aceita até 31/12/2026 três avisos do SDK do Neon Auth (better-auth 1.7.6, zod 4.5.4) que não rodam no nosso Worker; depois disso volta a falhar até alguém reavaliar. Pendência sua: perguntar ao suporte do Neon (perguntas na D-06).
