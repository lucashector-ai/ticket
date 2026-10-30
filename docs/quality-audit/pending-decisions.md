# Decisões pendentes do dono

Cada item: o que é, por que precisa da decisão, opções e a recomendação. Nada aqui foi aplicado sem estar marcado.

## Rodada 4 · schema para a produção (aplicar ANTES de publicar a rodada 4)

D-12 (rastro de cada ingresso, só a central vê). Tabela nova, sem mexer em nenhuma linha existente; o código grava nela dentro das mesmas transações de emissão, envio por e-mail, transferência, revenda, reembolso/cancelamento e check-in. Já criada e testada no branch de **teste** (`teste-r4`). Idempotente (pode rodar mais de uma vez). Ingressos antigos não precisam de migração: a central monta o rastro deles a partir dos dados que já existem.

```sql
-- D-12: rastro dos ingressos (central /tw-central › Ingressos)
CREATE TABLE IF NOT EXISTS ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  code varchar(24),
  prev_code varchar(24),
  from_user_id text,
  to_user_id text,
  to_email varchar(254),
  holder_name varchar(160),
  order_id uuid,
  ref_id uuid,
  amount_cents integer,
  note varchar(200),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_events_ticket_idx ON ticket_events (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS ticket_events_code_idx ON ticket_events (code);
CREATE INDEX IF NOT EXISTS ticket_events_prev_code_idx ON ticket_events (prev_code);
CREATE INDEX IF NOT EXISTS ticket_events_to_email_idx ON ticket_events (to_email);
CREATE INDEX IF NOT EXISTS ticket_events_from_idx ON ticket_events (from_user_id);
CREATE INDEX IF NOT EXISTS ticket_events_to_idx ON ticket_events (to_user_id);
```

Importante: **o código da rodada 4 não funciona sem esta tabela** (a emissão, a transferência e o check-in gravam nela na mesma transação; sem a tabela, essas operações falham). Por isso o SQL vai antes do código.
Reversão (só se o código da rodada 4 for desfeito): `DROP TABLE IF EXISTS ticket_events;` (apaga só o rastro).

**Banner livre no carrossel da home (aplicar antes de publicar o código do banner de produtores):** tabela nova `hero_slides` para slides do carrossel que não são evento (HTML ou imagem + link + rótulo + posição + ligado/desligado + tamanho de projeto). Só cria tabela e índice: não mexe em nenhuma linha existente. Já aplicada no branch de teste (`teste-r4`), rodada duas vezes (idempotente). Sem ela, a home do código novo dá erro 500: por isso vem **antes** do código.

```sql
-- Banner livre do carrossel da home (não é evento): HTML ou imagem + link + rótulo + posição + ligado/desligado
CREATE TABLE IF NOT EXISTS hero_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label varchar(160) NOT NULL,
  html text,
  image varchar(300),
  href varchar(500) NOT NULL,
  cta varchar(40),
  width integer NOT NULL DEFAULT 1440,
  height integer NOT NULL DEFAULT 800,
  bg varchar(7) NOT NULL DEFAULT '#111111',
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hero_slides_art_chk CHECK ((html IS NULL) <> (image IS NULL)),
  CONSTRAINT hero_slides_html_chk CHECK (html IS NULL OR length(html) <= 300000),
  CONSTRAINT hero_slides_href_chk CHECK (href ~ '^(/([^/\\]|$)|https://)'),
  CONSTRAINT hero_slides_size_chk CHECK (width BETWEEN 320 AND 3840 AND height BETWEEN 180 AND 2160),
  CONSTRAINT hero_slides_bg_chk CHECK (bg ~ '^#[0-9A-Fa-f]{6}$')
);
CREATE INDEX IF NOT EXISTS hero_slides_active_pos_idx ON hero_slides (active, position);
```

Depois da tabela, o banner "BEM-VINDO, PRODUTOR." (1º slide, leva para `/produtores`) entra pelo INSERT idempotente gerado a partir do arquivo da arte (não está no repositório porque o HTML tem 55 KB): `insert-banner-produtores.sql` na pasta de rascunho do agente do banner (`…/scratchpad/banner/`). Id fixo + `ON CONFLICT (id) DO NOTHING`: rodar de novo não duplica nem desfaz o que for editado na central. Posição 0 = antes dos eventos do banner (que começam em 1). Depois de publicado, dá para editar, ordenar, desligar ou apagar na central (Destaques).

Reversão (só se o código do banner for desfeito): `DROP TABLE IF EXISTS hero_slides;`

**Para o dono (risco conhecido, não é deste banner só):** os banners em HTML (os de evento e os livres) rodam num iframe `srcdoc`, que herda a CSP da página. Hoje a CSP está em "só avisar" (D-10) e nada é bloqueado; **se ela for ligada em modo bloquear, o script de animação dos banners HTML para de rodar**. Conferido no Chromium trocando o cabeçalho para bloquear: neste banner o texto todo começa escondido e fica **só o fundo amarelo** (print `home-chromium-1280-csp-enforce.png` na pasta `shots/` do banner). Antes de ligar o bloqueio: servir o HTML do banner por uma rota própria, fora da CSP do site e com CSP própria (`sandbox allow-scripts`, sem acesso a nada do site), e apontar o iframe para ela no lugar do `srcdoc`. Também: a arte usa `Inter Tight` do Google Fonts sem fonte reserva; se o Google Fonts não carregar, o subtítulo e o botão da arte saem em fonte serifada.

## Schema para a produção (aplicar ANTES de publicar o código das rodadas 2 e 3, já aplicado)

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
- **Rodada 4 (30/10): DECIDIDO (a), mantido.** Dono: "deixa esses produtores normal". Quem já é produtor segue com painel, criar evento, página do produtor e saques sem confirmar o e-mail; a ativação vale só para quem ainda não é produtor (inscrição, cadastro do aprovado, `/criar-evento`). Nada mudou no comportamento; teste de regressão novo em `tests/db/activation.test.ts` (produtor antigo sem e-mail confirmado cria evento e atualiza a página). Commit eaca993. **VALIDADO (integração).**
- **Observação técnica:** o `neon_auth` do branch de teste é uma cópia parcial (15 contas para 30 perfis); a checagem de ativação usa a sessão e, quando ela diz "não", confere no `neon_auth."user"` da produção (o mesmo que a central já lê).

## D-09 · Meia-entrada por dois caminhos no mesmo evento (achado do Marcos, Romano, P2, regra comercial)
- **Hoje (não alterado):** com "Meia automática" ligada (padrão), o criador de eventos gera para cada Inteira um tipo **Meia-entrada** com preço de 50% e cota de **40%** da Inteira (`effTypes` em `src/lib/criar/model.ts`). O checkout continua oferecendo, em cada ingresso **Inteira**, a caixa "Meia-entrada" (`meiaOk = !kind || kind === "inteira"` em `src/app/checkout/page.tsx` e `src/lib/actions/compra.ts`), que cobra 50% e baixa o estoque da **Inteira**.
- **Efeito:** dois preços de meia para a mesma coisa na tela; quem compra pela caixa contorna a cota do tipo Meia (que existe para o produtor controlar os 40% da Lei 12.933). Com a cota do tipo Meia esgotada, a caixa da Inteira ainda vende meia. O valor cobrado está certo nos dois caminhos (o servidor recalcula), então não há perda de dinheiro além da meia "fora da cota".
- **Opções:**
  - (a) **A caixa só aparece onde o setor/data não tem tipo Meia** (eventos antigos, tipos sem `kind` e eventos sem meia automática continuam com a caixa; eventos com tipo Meia vendem meia só pelo tipo, respeitando a cota). Mudança pequena no servidor (`meiaOk` nos dois arquivos, com teste) e nenhuma no criador.
  - (b) Manter os dois caminhos, mas a meia marcada na caixa passa a contar na cota do tipo Meia do mesmo setor (mais complexo: estoque compartilhado entre tipos, trava em dois tipos na reserva).
  - (c) Tirar a caixa de vez e exigir tipo Meia em todo evento pago (muda eventos antigos já à venda).
  - (d) Manter como está.
- **Recomendação:** (a). É a que preserva a cota que o produtor configurou, não mexe em evento antigo e é a menor mudança. Depois de aprovada: ajuste em `meiaOk` (checkout e `placeOrder`), teste de regressão "Inteira com tipo Meia no mesmo setor não aceita meia=true" e revisão do texto da Ajuda ("Se alguém tiver direito à meia-entrada, marque aqui").
- **Pergunta jurídica junto:** a cota de 40% é por evento (lei) e hoje o sistema aplica por setor (40% de cada Inteira). Se a interpretação do jurídico for "40% do total do evento", a regra do criador também muda.
- **Status:** aguardando decisão do dono. Nada alterado.
- **Rodada 4 (30/10): DECIDIDO e APLICADO.** Dono: "seria legal a pessoa poder editar o valor". (1) No criar evento › Ingressos (e na edição), o preço da meia automática é editável; sugerido = metade da inteira, com o aviso da Lei 12.933/2013 (tela do Marcos, 78894f4; campo `meia` da Inteira no rascunho, vazio = metade). O servidor confere ao publicar: a meia nunca passa do preço da inteira (`src/lib/criar/meia.ts`). (2) Caminho duplo acabou: onde o setor/data tem tipo Meia, o checkout **não** oferece a caixa "Meia-entrada" na Inteira e o `placeOrder` ignora `meia=true` (cobra a inteira); onde não tem (eventos antigos, tipos sem `kind`, sem meia automática), a caixa continua com **metade** do preço. Regra única `meiaBoxOk` em `src/lib/pricing.ts`. Pedidos já feitos não mudam (o valor pago está no pedido). Commit 27c2900. Testes: `tests/unit/meia.test.ts`, `tests/db/place-order.test.ts` (falha com a regra antiga). **VALIDADO (unitário + integração).**
- **Observação:** a caixa não tem valor configurável (não existe campo para isso na criação); quem quiser outro valor de meia usa o tipo Meia, que tem preço próprio. A pergunta jurídica dos 40% (por evento × por setor) continua aberta.

## D-10 · Política de segurança de conteúdo (CSP) dos scripts: só avisar ou bloquear (Romano, P2 de segurança, rodada 3)
- **O que foi feito (aplicado, modo "só avisar"):** toda página recebe uma CSP com **nonce novo por pedido** e `'strict-dynamic'` (`src/lib/csp.ts`, `src/proxy.ts`): só rodam os scripts do próprio Next (que recebem o nonce sozinho), o que eles carregam (Turnstile, cartão, VLibras) e o único script escrito na página (loader do evento, liberado pelo hash, `src/lib/inline-scripts.ts`). Script injetado por XSS (sem nonce) e atributos `onerror=` não rodam. Também: `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`, terceiros listados por diretiva. Estilos ficam com `'unsafe-inline'` (o React escreve muitos `style=`; risco baixo perto do de script). Violações vão para `/api/csp-report`, que registra no log do Worker só diretiva, origem bloqueada e o primeiro trecho do caminho (sem código de ingresso, token ou parâmetro). A 404 passou a ser gerada a cada pedido (sem isso, a página estática não teria o nonce).
- **Validação com a política BLOQUEANDO** (`E2E_CSP=enforce`, que troca o cabeçalho no navegador de teste): Chromium, Firefox e WebKit, 1280 px e 390 px, visitante e logado, **0 violações e 0 erros de JavaScript, todas as páginas hidratadas**: home, evento, evento com a folha de compra em tela cheia (390 px), checkout, explorar, entrar, cadastro, ajuda, 404, Meus ingressos, ingresso com QR, conta, painel, painel do evento, financeiro, e-mails, portaria com câmera aberta, criar evento e banco. Checkout de ponta a ponta (Pix de teste até o número do pedido) e portaria pela câmera (6 casos) com a política bloqueando: sem violação. Bancada com os terceiros reais: Turnstile (chave pública de teste da Cloudflare) devolveu token, o campo de cartão ficou pronto e o player do Spotify abriu nos 3 navegadores; o `<script>` sem nonce e o `onerror` injetados foram barrados.
- **Não validado (BLOQUEADO no sandbox):** VLibras (o domínio `vlibras.gov.br` não abre daqui); Entrar com Google/Apple (login da produção); scripts que a Cloudflare injeta na resposta da produção (análise de bots/"JavaScript detections", Web Analytics, ofuscação de e-mail) — esses não passam pelo servidor local e são a maior chance de violação na produção.
- **Opções:** (a) publicar em **Report-Only** (padrão do código), olhar os avisos `csp` no log do Worker por 1 a 2 semanas e então ligar o bloqueio com a variável `CSP_MODE=enforce` (sem mudar código; voltar é apagar a variável); (b) publicar já bloqueando; (c) não publicar a CSP.
- **Recomendação:** (a). O que dava para testar aqui passou bloqueando nos 3 navegadores, mas o que só existe na produção (scripts da Cloudflare, VLibras, logins sociais) não. Bloquear às cegas pode quebrar o login ou o checkout; o Report-Only não muda nada para o usuário e mostra exatamente o que falta liberar. Critério para ligar: uma semana sem aviso `csp` de `script-src` vindo de páginas do site (avisos de extensões do navegador, `chrome-extension:`/`moz-extension:`, podem ser ignorados).
- **Status:** APLICADO em Report-Only, aguardando o dono para ligar o bloqueio na produção.

## D-11 · Transferência comum: quem tem o link fica com o ingresso (H-R3-2 do Marcos, Romano, P2 de segurança/produto)
- **Hoje (não alterado):** no envio feito **na compra** ("presente"), aceitar exige estar na conta do e-mail indicado. Na **transferência comum** (Meus ingressos → Transferir), `acceptTransfer` aceita com qualquer conta logada que abrir o link do e-mail; a tela diz "Enviado para <e-mail>". Se o e-mail for encaminhado (ou lido por outra pessoa), quem abrir primeiro fica com o ingresso, e o código antigo deixa de valer.
- **Opções:** (a) exigir o mesmo e-mail também na transferência comum (igual ao presente; quem recebe sem conta cria a conta com esse e-mail); (b) manter e mudar o texto ("Quem abrir o link com uma conta Tickets Win recebe o ingresso"); (c) manter.
- **Recomendação:** (a). É a mesma regra que já existe no presente (menos surpresa, menos golpe de "me encaminha o link"). Mudança pequena em `acceptTransfer` + teste; o Marcos revisa o texto de erro ("Este ingresso foi enviado para outro e-mail. Entre com a conta de <e-mail parcial>.").
- **Status:** aguardando decisão. Nada alterado.
- **Rodada 4 (30/10): DECIDIDO (a) e APLICADO.** Dono: "o ingresso é de quem tem o e-mail cadastrado no ingresso". A transferência comum vale só para a conta do e-mail de destino, com o e-mail confirmado (como o envio da compra). Outra conta: "Este ingresso foi enviado para m•••@gmail.com. Entre com esse e-mail para receber." A página do link mostra o e-mail só com a primeira letra para quem não é o destino. Commit 3f526a8 (textos da tela revistos pelo Marcos). Teste: `tests/db/tickets.test.ts` (outra conta recusada, mesmo e-mail sem ativar pede ativação, conta certa recebe; falha sem a correção). **VALIDADO (integração).**

## D-12 · Quem vendeu na revenda ou transferiu perde o rastro do ingresso (H-R3-1 do Marcos, P2)
- **Hoje:** depois da S-01 o código do ingresso muda na revenda e na transferência; o link antigo `/ingressos/<código antigo>` dá 404 e nada aparece em Meus ingressos ou na Conta. O e-mail "Seu ingresso foi vendido" leva para Meus ingressos, onde ele não está mais.
- **Proposta do Marcos (`ux-audit.md`, parte 4):** guardar o código antigo e mostrar "Vendido em … por R$ X, você recebe R$ Y" / "Transferido para …", mais uma seção "Vendidos e enviados" com quando o dinheiro cai.
- **O que precisa no servidor:** a revenda e a transferência já ficam registradas (`resale_listings`, `ticket_transfers`); falta guardar o código anterior (ou só listar por quem vendeu/enviou, sem reabrir o link antigo) e uma consulta "meus vendidos e enviados". O link antigo **não deve voltar a mostrar o QR** (é exatamente o que a S-01 fechou).
- **Recomendação:** listar por quem vendeu/enviou (sem schema novo) numa seção de Meus ingressos e fazer o link antigo mostrar "Este ingresso foi vendido/transferido" sem QR para quem era o dono. Próxima rodada, com o Marcos.
- **Status:** aguardando decisão. Nada alterado.
- **Rodada 4 (30/10): DECIDIDO e APLICADO (rastro só para a equipe).** Dono: registrar o histórico de cada ingresso e mostrar só na central. Tabela nova `ticket_events` (SQL no topo deste arquivo), gravada **na mesma transação** de: emissão (comprador, titular, valor, pedido), envio por e-mail na compra (para quem), transferência enviada/reenviada/cancelada/aceita (de quem → para quem, código anterior → novo), revenda vendida (vendedor → comprador, valor, códigos), reembolso/cancelamento (origem e quem fez) e check-in (operador), mais check-in recusado (motivo). Leitura: `adminTicketTrail(q)` em `src/lib/admin-trail.ts` (busca por código atual ou anterior, com ou sem hífen, e-mail ou número do pedido; titular atual e anteriores; passos em ordem). Ingressos antigos: montados na consulta a partir de pedidos, transferências, anúncios, reembolsos e check-in, marcados "reconstruído", sem migração. Tela: aba "Ingressos" da central (Marcos). Nada aparece para produtor ou comprador. Teste: `tests/db/trail.test.ts` (4 cenários, incluindo "emissão que falha não deixa rastro" e ingresso antigo). **VALIDADO (integração); tela: ver `ux-audit.md`.**
- **Fica para depois (não pedido):** a parte da proposta original para o comprador ("Vendidos e enviados" em Meus ingressos).
