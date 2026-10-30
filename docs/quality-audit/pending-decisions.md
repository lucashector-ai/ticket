# Decisões pendentes do dono

Cada item: o que é, por que precisa da decisão, opções e a recomendação. Nada aqui foi aplicado sem estar marcado.

## Schema para a produção (aplicar ANTES de publicar o código desta rodada)

A produção recebe o schema antes do código (decisão do dono). Já aplicado e testado no branch de **teste**. É idempotente (pode rodar mais de uma vez) e não mexe em nenhuma linha existente: os pedidos antigos ficam com `NULL` (= "de antes da caixa", seguem recebendo campanhas como antes).

```sql
-- D-03: caixa "Quero receber novidades de <produtor> por e-mail" no checkout
ALTER TABLE orders ADD COLUMN IF NOT EXISTS producer_opt_in boolean;
```

Reversão (só se o código desta rodada for desfeito): `ALTER TABLE orders DROP COLUMN IF EXISTS producer_opt_in;`

**Rodada 3 (aplicar antes de publicar a rodada 3):** um reembolso em andamento por pedido (dois reembolsos diferentes do mesmo pedido ao mesmo tempo não chegam os dois à Stripe). Já aplicado no branch de teste. Antes, conferir que não há pedido com duas linhas pendentes (a criação do índice falharia):

```sql
-- conferência (deve voltar vazio; linhas "pending" antigas podem ser marcadas 'failed' depois de conferidas na Stripe)
SELECT order_id, count(*) FROM order_refunds WHERE status = 'pending' GROUP BY order_id HAVING count(*) > 1;
-- índice
CREATE UNIQUE INDEX IF NOT EXISTS order_refunds_one_pending_idx ON order_refunds (order_id) WHERE status = 'pending';
```

Reversão: `DROP INDEX IF EXISTS order_refunds_one_pending_idx;`

## D-01 · Compra em grupo contorna o limite por pessoa (Romano, P1)
- **Hoje:** partes de compra em grupo não contam para o limite por pessoa (regra escrita na Ajuda). Mas nada impede a mesma conta de pagar **todas** as partes do grupo, nem de abrir vários grupos. Com isso o limite por pessoa (anticambista) deixa de valer: um grupo de 8, pago inteiro pela mesma pessoa, repetido.
- **Opções:** (a) cada conta paga no máximo **uma** parte por grupo (mantém o espírito "cada amigo paga a sua"); (b) partes pagas contam para o limite de quem pagou (muda o texto da Ajuda); (c) no máximo 1 grupo aberto por pessoa por evento; (d) manter.
- **Recomendação:** (a) + (c). Mudança pequena no servidor (`claimSpecial`/`createGroup`), sem mexer em preço.
- **Status:** aguardando decisão. Nada alterado.
- **Rodada 2 (30/10): APROVADO (a) + (c) e APLICADO.** Cada conta paga no máximo uma parte de cada grupo (conferido ao segurar a vaga e de novo na emissão, dentro da transação, com trava por conta) e tem no máximo 1 grupo aberto por evento (inclusive com dois pedidos no mesmo instante: fica o primeiro). Ajuda atualizada (artigos do limite e da compra em grupo). Commits 1c12a57 e 67f9873. Teste: `tests/db/grupo.test.ts` (3 cenários, falham sem a correção). **VALIDADO (integração).**

## D-02 · Reserva de 15 minutos segura o lugar (Romano) · APLICADO, reversível
- **O que mudou:** o pedido pendente (a "reserva" com cronômetro do checkout) agora tira o lugar da venda enquanto vale. Antes, só a confirmação do pagamento baixava o estoque, e com os últimos ingressos várias pessoas pagavam e eram estornadas.
- **Efeito visível:** com estoque baixo, um tipo pode aparecer esgotado por até 15 minutos e voltar se a pessoa não pagar. A própria pessoa não se bloqueia. Quem já pagou continua com prioridade.
- **Por que decidir:** é o comportamento padrão de bilheteria e o que a tela já promete ("reserva"), mas muda o que o público vê. Para desfazer: reverter o commit 163ea2a.
- **Rodada 2 (30/10):** o dono decidiu **manter** a reserva segurando estoque. Nada a fazer.
- **Risco conhecido:** várias contas podem segurar ingressos por 15 min sem pagar (o mesmo que já acontece com grupos por 60 min). Mitigação aplicada: no máximo 12 pedidos por conta a cada 10 min (d72c91c). Se virar problema: limite de pedidos pendentes por CPF.

## D-03 · E-mail marketing para quem comprou (Romano, LGPD)
- **Hoje:** o painel deixa o produtor mandar campanhas para todos os compradores pagos dos eventos dele (há descadastro e o link "sair" em um clique).
- **Por que decidir:** a base legal (legítimo interesse × consentimento) para usar o e-mail do comprador em marketing do produtor precisa de análise jurídica; não presumimos conformidade. Também falta definir retenção de CPF e telefone em `orders`/`user_profiles`.
- **Recomendação:** análise jurídica; tecnicamente dá para exigir opt-in no checkout ("quero receber novidades deste produtor").
- **Rodada 2 (30/10): APROVADO o opt-in e APLICADO.** Caixa **desmarcada** no checkout ("Quero receber novidades de <produtor> por e-mail"), gravada no pedido (`orders.producer_opt_in`). Campanhas do produtor para compradores vão só para quem marcou. **Compradores anteriores (pedidos de antes da caixa, `NULL`): mantidos como estavam, por decisão do dono**, com o "sair" em um clique em toda campanha. Exige a coluna nova (ver "Schema para a produção" no topo). Commit 09de382. Testes: `tests/db/optin.test.ts` + e2e do checkout marcando a caixa. **VALIDADO (integração + navegador).** Continua pendente (jurídico): retenção de CPF e telefone em `orders`/`user_profiles`.

## D-04 · Trocar a conta de recebimento sem app autenticador (Romano, P2)
- **Hoje:** `saveSettings` (Painel → Configurações) troca Pix/banco de destino dos saques só com a sessão; avisa o dono por e-mail e registra no log de segurança. O saque em si exige o app autenticador.
- **Risco:** sessão roubada troca o destino; o dono saca depois sem notar e o dinheiro vai para outra conta.
- **Opções:** exigir o código do app para mudar o destino quando a conta tem app; ou mostrar o destino em destaque na confirmação do saque (já aparece no extrato).
- **Recomendação:** exigir o código do app. Muda a tela de Configurações (Marcos) e a ação (Romano).
- **Rodada 2 (30/10): APROVADO e APLICADO.** Com o app autenticador ligado, trocar a conta de recebimento exige o código de 6 dígitos do app (código de recuperação não vale e não é gasto); a tela mostra o campo só quando o servidor pede. Sem o app, fluxo de antes (aviso por e-mail + registro de segurança). Commits 4cc67ad e 4a29bdf. Teste: `tests/db/payout-destination.test.ts` (falha sem a correção) + Chromium com o app ligado temporariamente na conta de teste. **VALIDADO.**

## D-05 · Imagem 404 na produção (item 11 do QA) · NÃO TESTADO
- No ambiente local a imagem some porque o R2 local não tem os arquivos da produção (2 eventos). Não testamos a produção (regra da auditoria). Conferir no site: `/midia/eventos/56899a8bb6eb/mvqr4wvg-076766523c83.png`.
- **Rodada 2 (30/10): FECHADO.** O dono conferiu: a imagem existe na produção (200, image/png). Era só o R2 local da auditoria.

## D-06 · SDK do Neon Auth com better-auth 1.7.6 (Romano, segurança)
- `pnpm audit --prod` (depois de remover jspdf/html-to-image e atualizar node-forge): 8 avisos, 1 crítico e 2 altos, **todos** dentro de `@neondatabase/auth@0.7.0-beta` (a última publicada), que fixa `better-auth@1.7.6` e `zod@4.5.4`. Os avisos críticos (OAuth state / OAuth proxy permitindo entrar como outra pessoa) são de código que roda no servidor de login; o Neon Auth é hospedado pelo Neon, então a correção principal é deles.
- **Opções:** (a) perguntar ao suporte do Neon se o servidor do Neon Auth já está em ≥ 1.7.7; (b) forçar no projeto `pnpm.overrides` de `better-auth` para 1.7.14 dentro do SDK (mesma linha 1.7) e testar login, cadastro, Google, Apple e 2FA num ambiente que não seja a produção antes de publicar.
- **Por que não fiz:** o login é o mesmo da produção; trocar a versão de biblioteca de login sem um teste completo de todos os provedores é arriscado para uma madrugada sem supervisão.
- **Rodada 2 (30/10): avaliado com evidência → NÃO SE APLICA ao nosso servidor; nada alterado.**
  - O que roda no nosso Worker do SDK: `createNeonAuth` (`@neondatabase/auth/next/server`), que só repassa `/api/auth/*` para o Neon Auth hospedado (`handleAuthProxyRequest`, com `NEON_AUTH_BASE_URL`) e lê a sessão. Esse código importa de `better-auth` apenas `better-auth/cookies` (`parseCookies`, `parseSetCookieHeader`) e `jose` (conferido em `node_modules/@neondatabase/auth/dist/server-*.mjs` e `next/server/index.mjs`).
  - Os dois avisos graves (GHSA-965c-763c-88jm, crítico: "OAuth state usado como magic link"; GHSA-r4xp-prcw-77qf, alto: "OAuth Proxy permite entrar como outra pessoa") estão no roteador do servidor de login do better-auth (callback OAuth e plugin oauth-proxy). No build do Worker (`.open-next/server-functions`) não existe nenhuma dessas rotas: as palavras de rota (`/callback/`, `magic-link`) só aparecem no pedaço do **cliente** de login (`src_lib_auth_client_ts…js`, que monta URLs). Quem executa o callback OAuth é o Neon Auth hospedado.
  - Por isso não apliquei `pnpm.overrides`: trocaria só a cópia do cliente/cookies, sem efeito sobre a falha, e arriscaria descompasso com o servidor do Neon. Os outros avisos do SDK: zod 4.5.4 (alto, só usado pelo cliente do SDK; o nosso zod é 4.6.7), drizzle-adapter (baixo, servidor do Neon), deepmerge (baixo, e-mails da UI do SDK, não usamos), esbuild (dev). `fflate` (moderado, nosso) atualizado para 0.8.3.
  - **O que perguntar ao suporte do Neon:** (1) "O Neon Auth hospedado do nosso projeto já roda better-auth ≥ 1.7.7 (correções de GHSA-965c-763c-88jm e GHSA-r4xp-prcw-77qf)?"; (2) "O plugin oauth-proxy está ligado no nosso projeto?"; (3) "Quando sai um `@neondatabase/auth` que dependa de better-auth ≥ 1.7.7 e zod ≥ 4.6.6?". Login por e-mail/Google/Apple/2FA não foram retestados nesta rodada porque nada mudou no login (Google/Apple seguem BLOQUEADO no local).

## D-07 · Modo de teste liga sozinho se a chave da Stripe faltar (Romano, P1 de configuração)
- **Hoje:** sem `STRIPE_SECRET_KEY` o checkout entra no modo de teste: "Já fiz o pagamento" confirma o pedido e emite os ingressos sem cobrança (referência `TEST-…`, fora do saldo do produtor). É o que permite testar no local.
- **Risco:** se a variável sumir na produção (erro de configuração, troca de chave), o site passa a entregar ingressos de graça até alguém notar.
- **Opções:** (a) na produção (`NEXT_PUBLIC_SITE_URL` = ticketswin.com.br), modo de teste só com uma variável explícita `ALLOW_TEST_PAYMENTS=1`; sem chave e sem essa variável, o checkout mostra "pagamento indisponível"; (b) manter.
- **Por que não fiz:** não sei se a produção hoje já roda com a Stripe ligada ou ainda em modo de teste de propósito (a página antiga do pedido ainda fala "Ambiente de teste"). Aplicar (a) sem saber poderia parar as vendas. Recomendo (a) assim que confirmar que a chave está configurada.
- **Rodada 2 (30/10): o dono decidiu MANTER como está** (modo de teste enquanto a Stripe espera o CNPJ). Comportamento não alterado. Quando a chave da Stripe entrar, rever a opção (a).

## DM-1 · Tela "Preparando seus ingressos" de 1,45 s em toda página de evento (Marcos, P2, conversão)
- **Hoje:** toda visita a `/eventos/*` mostra por 1,45 s um ingresso animado cobrindo a página ("Preparando seus ingressos…"), mesmo com a página já pronta (vem do servidor). Com "reduzir movimento" do sistema, 0,1 s. Print: `scratchpad/marcos/shots/depois-320-etbuy.png` (tirado 1 s depois de abrir).
- **Por que decidir:** é um atraso artificial na página que mais vende; quem volta ao evento (do checkout, de um link) espera de novo. Faz parte do design original, por isso não removi.
- **Opções:** (a) remover; (b) mostrar só na primeira visita da sessão; (c) encurtar para ~400 ms e só enquanto a imagem do topo carrega; (d) manter.
- **Recomendação:** (b) ou (c). Mudança pequena em `src/components/evento/evento-view.tsx` (sem servidor).
- **Status (rodada 2): APLICADO (b) + mais curto, VALIDADO.** Só na primeira página de evento da sessão (sessionStorage com try/catch), 0,9 s; recarregar, voltar do checkout e abrir outro evento não mostram de novo. Commit bd2bc5e (`ux-audit.md` U-33).

## DM-2 · Produtor precisa enviar 2 artes (cartaz 3:4 e banner 16:9) para publicar (Marcos, P2, ativação)
- **Hoje:** "Envie o cartaz (3:4) e o banner (16:9) antes de publicar." O servidor já usa o cartaz no lugar do banner quando falta (`bannerId: media.banner ?? media.poster` em `src/lib/criar/save.ts`), mas a validação exige os dois.
- **Por que decidir:** é a única trava "dura" da criação além de nome/data/local/preço; o iniciante quase sempre tem só o flyer. Mas o banner 16:9 com o cartaz 3:4 cortado fica feio no topo da página.
- **Opções:** (a) exigir só o cartaz e montar o banner com o cartaz centralizado sobre um fundo desfocado dele mesmo (como o fundo da página já faz); (b) manter os dois.
- **Recomendação:** (a). Romano: soltar a validação; Marcos: banner composto no `BannerArt`.
- **Status (rodada 2): APLICADO (a), VALIDADO.** Criador e servidor exigem só o cartaz (`src/lib/criar/save.ts`, mudança mínima avisada ao Romano); sem banner, o `BannerArt` monta o banner com o cartaz inteiro sobre ele mesmo desfocado; prévia de link usa o cartaz reduzido. Evento "QA Marcos · Só cartaz (não comprar)" publicado e conferido em 390/768/1280, prévias, busca e prévia de link. Commit 70c84ef (U-34). Em aberto para o Romano: e-mail, aviso e passe da carteira ainda tratam o cartaz como banner horizontal (handoff 11:50).

## DM-3 · Texto livre "Política de cancelamento" pode contradizer a regra do sistema (Marcos, P2, confiança)
- **Hoje:** a regra real de cancelamento é a estruturada (`cancelPolicy` + direito de arrependimento), e a página do evento mostra o texto dela. O campo livre da revisão ("Até 7 dias após a compra, com 48h de antecedência") é colado em seguida, então a página repete a mesma regra com outras palavras, e um produtor pode escrever "Não há reembolso", contradizendo o que o sistema faz.
- **O que fiz (reversível):** na página do evento, o texto livre agora aparece como "Observação do produtor: …", separado da regra do sistema.
- **Opções:** (a) trocar o campo livre por "Observações (opcional)" sem texto padrão; (b) remover o campo; (c) manter.
- **Recomendação:** (a).
- **Status (rodada 2): APLICADO (a), VALIDADO.** "Observações (opcional)" sem texto padrão no criador e "Observações padrão (opcional)" em Configurações; o antigo texto pronto salvo é tratado como vazio; a página do evento mantém "Observação do produtor". Regra de cancelamento intacta. Commits 96c2556, e1a2a6d (U-35).

## D-08 · Produtores antigos sem e-mail confirmado (Romano, P2, rodada 3)
- **O que mudou (aplicado):** conta sem e-mail ativado não envia inscrição de produtor nem monta a página do produtor depois da aprovação (achado do Marcos: a conta nova entrava com senha e mandava a inscrição). Comprar continua liberado sem ativar (regra atual do checkout em linha). Teste: `tests/db/activation.test.ts`.
- **O que não mudou e precisa de decisão:** quem **já é produtor** continua usando o painel e criando eventos mesmo sem o e-mail confirmado. A conta de teste da auditoria (produtora com 5 eventos) está assim, então pode haver produtores reais nessa situação. Travar o painel deles agora pararia vendas de quem já opera.
- **Opções:** (a) manter (só contas novas precisam ativar para virar produtor); (b) aviso no painel "Confirme seu e-mail" sem travar; (c) exigir a ativação para saque e troca da conta de recebimento (o resto do painel segue); (d) exigir para todo o painel a partir de uma data avisada.
- **Recomendação:** (b) + (c). Antes, contar na produção (consulta só de leitura): `select count(*) from organizers o join neon_auth."user" u on u.id::text = o.owner_user_id where not u."emailVerified";`
- **Observação técnica:** o `neon_auth` do branch de teste é uma cópia parcial (15 contas para 30 perfis); a checagem de ativação usa a sessão e, quando ela diz "não", confere no `neon_auth."user"` da produção (o mesmo que a central já lê).
