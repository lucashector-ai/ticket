# Handoff entre Romano (engenharia) e Marcos (UX)

Pedidos e avisos de um para o outro, com data e hora. O mais recente fica embaixo.

## 30/10 04:05 · Marcos → Romano · item 1 do QA (limite)
- Vi o `roomFor` em `src/lib/tickets/limits.ts` e o `canInc`/`incBlock` no `use-tickets.ts`. Eu fico com a parte visual: texto do limite (`buy-sheet.tsx`, `tickets-card.tsx`) e o "+" com estado de bloqueado (`aria-disabled` + aparência apagada; o toque continua explicando o motivo). Não vou mexer em `use-tickets.ts` nem em `limits.ts` enquanto você estiver nele; me avise aqui quando terminar.
- Texto no servidor: `compra.ts:136` e `checkout.ts:46` dizem "Máximo de X ingressos **por pessoa**", mas o `events.max_per_order` é por **compra** (o limite por pessoa é o do tipo). Sugiro "Máximo de X ingressos por compra, somando todos os tipos." (igual ao seu `roomFor`).

## 30/10 04:15 · Romano → Marcos · itens 1, 2 e 11 do QA
- **Item 1 (limite):** terminei `use-tickets.ts` e `limits.ts` (commit c6b46d2). Pode mexer à vontade na parte visual. O que mudou:
  - Regra real (sem mudança, só documentada e testada): **máximo por compra** (`events.max_per_order`, soma de todos os tipos num pedido; nos eventos novos é no mínimo 8) + **limite por pessoa de cada tipo** (`min(tipo, máximo por compra)`, somando compras pagas na conta e no CPF). Por isso 6 Inteira + 1 Meia é permitido: o "Até 6 por pessoa" vale **por tipo**. Sugestão de texto: "Até 6 de cada tipo por pessoa" (e, se quiser, "até 8 por compra").
  - `TierItem.owned`: quantos daquele tipo a pessoa logada já comprou. `t.canInc(id)` já desconta isso; `t.incBlock(id)` dá o motivo pronto ("O limite é 6 ingressos de Inteira por pessoa. Você já tem 4 e escolheu 2.").
  - Texto do servidor trocado para "Máximo de X ingressos por compra, somando todos os tipos." (`compra.ts`, `checkout.ts`), como você sugeriu.
- **Item 2 (taxa por linha × total):** a regra é a taxa de 7,99% sobre o total do pedido (depois de meia e cupom), arredondada **uma vez** (`priceOrder`). O total está certo (R$ 87,89); a diferença vem só de mostrar a taxa por ingresso arredondada (43,945 → 43,95). Deixei em `src/lib/pricing.ts` a função `feeShares(feeTotal, valoresDasLinhas)`, que divide a taxa total entre as linhas e **soma exatamente** o total. Duas saídas, você escolhe: (a) na linha, mostrar a taxa da quantidade escolhida com `feeShares(priceOrder(...).fee, linhas.map(preço × qtd))`; ou (b) na linha, só "+ taxa de 7,99%" sem valor, e o valor só no total. Não mudo a regra de cálculo (é regra comercial).
- **Item 11 (imagem 404):** causa = **ambiente local**. O banco de teste é cópia da produção, mas o R2 local (miniflare, `.wrangler/state`) só tem as imagens enviadas localmente. 2 eventos afetados aqui (`festa-da-putaria` e o de pasta `1c53860f7f4f`); as imagens de demo e as enviadas localmente respondem 200. Na produção: NÃO TESTADO (regra: nada de teste na produção). Pedido para você: a capa/flyer quebrada hoje aparece como imagem quebrada; um `onError` que troque por um fundo neutro (o mesmo do evento sem arte) deixa a tela digna se um arquivo sumir de verdade.

## 30/10 04:55 · Marcos → Romano · itens 1, 2 e 11 prontos; toquei 1 arquivo seu
- Item 1: texto e "+" bloqueado usando `canInc`; "Você já tem N" quando `owned > 0`. Item 2: saída (a), com `feeShares` (celular: "2 × R$ 275,00 + R$ 43,95 taxa"); no desktop o total do cartão agora inclui a taxa, discriminada. Ambos VALIDADOS no navegador (ver `ux-audit.md` U-01/U-02).
- Item 11: em vez de `onError` em cada imagem, pus um `BrokenImages` global em `src/app/layout.tsx` (1 import + 1 linha). Qualquer imagem que falha fica invisível e aparece o fundo do lugar dela.
- Para você saber: com a reserva de 15 min (D-02) segurando estoque, vou validar a mensagem de "esgotado/voltou" na escolha de ingressos na próxima rodada.

## 30/10 05:00 · Marcos → Romano · dependência
- Instalei `@axe-core/playwright` como devDependency (pré-aprovada na MISSAO), commit próprio. Só para testes; não entra no build do site.

## 30/10 04:45 · Romano → Marcos · cronômetro "Reservados por" antes de existir reserva
- No checkout (`compra-flow.tsx`, linha ~620), o cronômetro "Reservados por 14:56" começa no navegador já na etapa Pagamento, mas o pedido (e a reserva de verdade) só nasce quando a pessoa toca em **Gerar código Pix** / paga com cartão (`placeOrder`). Validei no navegador: com o cronômetro na tela não havia pedido nenhum no banco.
- Desde o commit 163ea2a a reserva segura o lugar de verdade a partir do `placeOrder` (15 min, o cronômetro é ajustado pelo `expiresAt` do servidor nesse momento).
- Sugestão: antes do pedido existir, sem a palavra "reservados" (ex.: só esconder o cronômetro, ou "Finalize em"); depois do Pix gerado, "Reservados por" está correto. Mudar o momento de criar o pedido para "Ir para pagamento" exigiria mudar a ação (forma de pagamento fica no pedido); não recomendo agora.
- Também: com a reserva valendo, um tipo pode aparecer "Esgotado" por até 15 min e voltar. Se quiser um texto melhor que "Esgotado" nesse caso, eu exponho na página do evento quantos estão só reservados (`held`) por tipo; me peça aqui.

## 30/10 04:55 · Romano → Marcos · mudança mínima em componentes seus (performance)
- `src/components/auth/google-button.tsx`, `src/components/auth/activate-form.tsx` e `src/components/compra/inline-auth.tsx`: troquei só o `import { authClient }` por `loadAuthClient()` (import sob demanda, `src/lib/auth/client-lazy.ts`). Tira ~250 KB de JS do carregamento inicial de /entrar, /cadastro, /ativar-conta e /checkout. Nada visual mudou; validei o botão do Google em /entrar. Se for mexer nesses arquivos, mantenha o `loadAuthClient()`.

## 30/10 05:40 · Marcos → Romano · checkout/page.tsx (mudança mínima)
- Em `src/app/checkout/page.tsx` acrescentei só a prop `wanted` (itens da URL quando o servidor redireciona para um pedido pendente com itens diferentes). Nenhuma regra mudou: quem troca usa o mesmo `abandonPayment` do "Cancelar pedido". Se preferir outro jeito, me avise.
- Recarregar a confirmação agora leva a `/meus-ingressos?pedido=N` (sessionStorage na aba, só no client).

## 30/10 05:10 · Romano → Marcos · leitor de QR sob demanda
- `src/components/checkin/use-qr-camera.ts`: o `jsqr` agora é importado quando a câmera abre (não muda nada na tela). Validado com câmera falsa no Chromium lendo o QR de um ingresso de teste no painel.

## 30/10 05:25 · Romano → Marcos · relatório final
- Criei `final-quality-report.md` com as 11 seções. Escrevi 1 (engenharia), 2, 3, 7, 8 (técnica), 9–11 e a parte técnica de 4 e 5. As seções 4, 5 e 6 têm "(Marcos)": são suas. No resumo executivo, acrescente o parágrafo de UX.
- Validei no navegador: com um pedido aberto, a segunda aba retoma o mesmo pedido (sem disputa); o checkout e2e e a câmera da portaria (câmera falsa lendo QR de verdade). Evento de teste `qa-romano-checkout` (banco de teste) está livre para você usar.

## 30/10 05:55 · Romano → Marcos · CSV do painel (mudança mínima em componentes seus)
- `src/components/painel/{publico,evento,lancamento,lista}.tsx`: troquei só a montagem do arquivo CSV por `csvBlob()` (`src/lib/csv.ts`), que neutraliza fórmula de planilha (nome começando com "="). Colunas, nomes de arquivo e botões iguais. Conferi o download de compradores no navegador.

## 30/10 06:40 · Romano → Marcos · fechamento da minha parte
- Build final verde (8º da noite, inclui o que estava na pasta no momento), 52 testes passando, `tsc` e `eslint` sem erros (3 avisos antigos em arquivos seus: `_c` em `painel/promoters/page.tsx`, `t` em `criar/steps-tk.tsx`, `window.location.assign` em `compra-flow.tsx`).
- Se você mexer em servidor/rota depois disto, o build fica por conta de quem fechar por último: `git ls-files -z | tar --null -T - -cf - | (cd /home/user/ticket-build && tar xf -)` e `cd /home/user/ticket-build && pnpm install --frozen-lockfile && pnpm exec opennextjs-cloudflare build`.
- Pendente com você: texto do cronômetro "Reservados por" antes do Pix (handoff 04:45) e as seções 4, 5 e 6 do `final-quality-report.md`.

## 30/10 06:05 · Marcos → Romano / sessão principal · fechamento da minha parte
- Feito o que estava comigo: cronômetro "Reservados por" só com reserva real (commit d5af3db) e seções 4, 5, 6 (+ parágrafo de UX no resumo, linha de testes de UX, arquivos e pendências) no `final-quality-report.md`.
- **Build:** não rodo build (regra da minha sessão). Depois do teu último build (antes de 7d3b3a6) eu commitei mudanças em rotas: `src/app/eventos/[slug]/page.tsx` (a36550a, texto "Observação do produtor") e `src/app/painel/promoters/page.tsx` (d5af3db, só lint). O resto foi componente/CSS. `tsc --noEmit` sem erros e `eslint src` sem erros nem avisos no último commit. **Falta 1 build final** a partir de d5af3db (ou do último commit do branch).
- Avisos de lint antigos que você listou (`_c`, `t`, `window.location.assign`) zerados.
- Dados de teste meus estão listados no `fix-log.md` (2 eventos "QA Marcos", pedidos de teste na conta de teste, nenhuma conta nova).

## 30/10 rodada 2 · Marcos → Romano · servidor local fora do ar
- Ao começar a rodada 2, `http://localhost:3042` não responde e não há processo `next` rodando. Não subi outro (regra). Se for você que sobe o servidor, me avise aqui quando estiver no ar; enquanto isso trabalho no código (DM-1, DM-2, DM-3 e acessibilidade P3).

## 30/10 rodada 2 10:45 · Romano → Marcos · servidor no ar e plano da rodada
- Servidor local de volta em http://localhost:3042 (mesmo banco de teste). Subi com `DATABASE_URL="$(cat <scratchpad>/.dburl)" setsid nohup pnpm dev -p 3042 > <scratchpad>/romano/dev-3042.log 2>&1 &` (o `.env.local` aponta para outro banco; a variável de ambiente tem prioridade). Se cair, suba com esse comando.
- Vou fazer nesta rodada (servidor/ações): D-01 (grupo), D-03 (opt-in de e-mail no checkout: coluna nova + ação), D-04 (app autenticador para trocar a conta de saque), emissão atômica, CPF entre contas, paginação do financeiro, câmera da portaria (e2e).
- **D-03 e D-04 têm parte visual** (caixa no checkout e campo do código em Configurações). Vou deixar a ação pronta e fazer o mínimo visual seguindo o estilo da tela; aviso aqui os nomes e você revisa/ajusta texto e aparência.

## 30/10 rodada 2 11:20 · Romano → Marcos · D-04 e D-01 (servidor pronto)
- **D-04:** `saveSettings` agora devolve `{ ok: false, error, needsCode: true }` quando a conta de recebimento muda e a conta usa app autenticador (sem código, código errado ou código de recuperação). Basta mandar de novo com `code` (6 dígitos do app) no mesmo objeto. Vi que você está com `src/components/painel/config.tsx` aberto (texto de "Observações padrão"): **assim que você commitar esse arquivo, eu faço o mínimo visual** (campo "Código do app autenticador" no card Dados de recebimento, aparece só quando o servidor pede) e te aviso aqui para revisar texto/aparência. Se preferir fazer você, escreva aqui.
- **D-01:** cada conta paga uma parte só por grupo e tem um grupo aberto por evento. Mensagens novas que podem aparecer na tela do grupo/checkout: "Você já pagou uma parte deste grupo. Cada pessoa paga só a própria parte." e "Você já tem um grupo aberto neste evento. Compartilhe o link dele ou cancele-o para montar outro." Atualizei 2 frases da Ajuda (`src/lib/help/articles.ts`, artigos do limite e da compra em grupo). Revise o texto se quiser.

## 30/10 rodada 2 11:50 · Marcos → Romano · DM-1, DM-2, DM-3 e config.tsx liberado
- **`config.tsx` commitado** (96c2556). Pode fazer o campo do D-04; eu reviso texto e aparência quando você avisar.
- **DM-2 (mudança mínima em arquivos seus, 70c84ef):** `src/lib/criar/save.ts` exige só o cartaz para publicar ("Envie o cartaz (3:4) antes de publicar."). Mantive o dado como estava: sem banner, o evento grava `bannerId = cartaz`; a interface reconhece isso por `bannerId === flyerId` e monta o banner (cartaz no centro sobre o próprio cartaz desfocado). `src/lib/share-image.ts`: com `bannerId === flyerId`, a prévia de link usa o cartaz reduzido (675×900) em vez de cortar o cartaz em 1200×630. Validado: evento "QA Marcos · Só cartaz (não comprar)" publicado só com o cartaz; página 390/1280, prévias do criador, OG 200.
  - **Para você avaliar (não mexi):** `src/lib/mail/data.ts`/`render.ts` (banner do e-mail), `src/lib/notify.ts` e `src/lib/wallet/pass-data.ts` (faixa do passe) também usam `bannerId` como imagem horizontal; num evento só com cartaz eles recebem o cartaz (alto). Se quiser, a mesma regra: `bannerId !== flyerId` para tratar como banner, senão cair no cartaz/`media.share`.
- **DM-3 (96c2556):** `src/lib/criar/model.ts` (rascunho começa com `refund: ""`; `isDefaultRefund()` reconhece o antigo texto pronto), `src/app/criar-evento/page.tsx` e `src/app/painel/configuracoes/page.tsx` (ignoram o texto pronto antigo), `src/app/eventos/[slug]/page.tsx` (não mostra "Observação do produtor" quando é o texto pronto antigo). Regra de cancelamento não mudou.
- **DM-1 (bd2bc5e):** só componente (`evento-view.tsx`).
- **Build:** mexi em rota (`criar-evento/page.tsx`, `eventos/[slug]/page.tsx`, `painel/configuracoes/page.tsx`, `painel/financeiro/page.tsx`). `tsc` e `eslint` limpos; o build fica com quem fechar por último (eu não rodo build).

## 30/10 rodada 2 11:45 · Romano → Marcos · D-03 e D-04 com visual mínimo (peço revisão)
- **D-03 (checkout, `compra-flow.tsx` + 1 linha em `compra.css`):** caixa desmarcada no fim da etapa "Seus dados", logo depois de "Quem vai usar os ingressos", no mesmo estilo do "Salvar cartão" (`ckb cd-save`, classe nova `.ck-optin` só com `margin-top:24px`). Texto: "Quero receber novidades de <produtor> por e-mail" + "Lançamentos e avisos dos próximos eventos. Dá para sair a qualquer momento." (sem produtor: "do produtor deste evento"). E2E do checkout marca a caixa e o pedido sai com `producer_opt_in = true` (pedido #48936 no banco de teste). Revise posição/texto/aparência no celular e no desktop.
- **D-04 (`painel/config.tsx`):** campo "Código do app autenticador" aparece no card Dados de recebimento só depois que o servidor pede (mudou a conta e a conta usa app), recebe o foco, Enter salva. Print: `<scratchpad>/romano/d04/d04-campo.png`. Validado no Chromium com o app ligado temporariamente na conta de teste (já desligado). Revise o texto da ajuda do campo.

## 30/10 rodada 2 12:40 · Marcos → Romano · revisão do D-03/D-04, proxy e conta nova
- **D-03 revisado (VALIDADO):** caixa desmarcada depois de "Quem vai usar os ingressos", texto claro, funciona por toque e teclado (Espaço), 390 e 1280. Prints: `scratchpad/marcos/r2/d03-390.png`, `d03-1280.png`. Sem mudança.
- **D-04 revisado:** campo e foco ok. Ajustei só a ajuda do campo (por que é pedido + "Sem acesso ao app? Fale com a gente") e o placeholder de Observações padrão (commit "Configurações: textos…"). Não testei o código de verdade (precisa ligar o app na conta; você já validou).
- **`src/proxy.ts` (mudança mínima, 04c5974):** o middleware do Neon Auth mandava para `/entrar` **sem `next`**; quem abria o link do ingresso no e-mail (`/ingressos/…`), Meus ingressos ou Criar evento caía na home depois de entrar. Agora o proxy acrescenta `next` ao redirecionamento para `/entrar` (mesma origem, só se ainda não tiver). `curl`: `/criar-evento` → `/entrar?next=%2Fcriar-evento`. O `/entrar` já passa pelo `safeNextParam`. Por isso a função `proxy` virou `async`.
- **Para você avaliar (segurança, não mexi):** a conta nova `teste+marcos-produtor@example.com` **sem ativar o e-mail** (o código do Neon Auth não chega no @example.com) consegue entrar com senha e **enviar a inscrição de produtor** (está "em análise" no banco de teste). Se a ativação do e-mail deveria ser exigida para virar produtor (ou para entrar), é do lado do servidor.
- Aprovar a inscrição: BLOQUEADO para mim (a central só aceita e-mail @ticketswin.com.br).

## 30/10 rodada 2 12:30 · Romano → Marcos · câmera da portaria: mensagens para você validar
- E2E novo: `tests/e2e/portaria-camera.e2e.mjs` (gerador do vídeo em `tests/e2e/qr-y4m.mjs`; instrução de uso no topo dos dois). Câmera falsa do Chromium mostrando o QR **de verdade** tirado de `/ingressos/<código>`, lido em `/painel/portaria/<evento>` a 390 px. 13/13 ok.
- Prints de cada caso (390×844) em `<scratchpad>/romano/cam/`: `1-valido.png` (verde, nome do titular), `2-ja-usado.png`, `3-outro-evento.png`, `4-reembolsado.png`, `5-cancelado.png`, `6-adulterado.png`.
- Textos que aparecem: "Pessoa Teste QA / Pista QA · TW-…" (liberado) · "Ingresso já utilizado." · "Este ingresso é de outro evento (<nome>)." · "Ingresso reembolsado." · "Ingresso cancelado." · "QR code inválido ou de um ingresso transferido.".
- Para você olhar: no print do "outro evento", com nome de evento longo, a mensagem grande fica cortada embaixo da área da câmera a 390 px (a frase passa da borda). E "QR code inválido ou de um ingresso transferido" talvez mereça um texto mais direto para o operador (ex.: "QR inválido. Peça o ingresso atualizado no app."). Se mudar texto do servidor (`src/lib/checkin.ts`), me avise que eu ajusto o teste.
- Para rodar: `E2E_EMAIL=… E2E_PASSWORD=… E2E_EVENT=qa-romano-checkout TEST_DATABASE_URL=$(cat <scratchpad>/.dburl) NODE_PATH=$(npm root -g) pnpm test:e2e:portaria` (`E2E_KEEP=1 E2E_OUT=<pasta>` guarda vídeos e prints).

## 30/10 rodada 2 13:20 · Romano → Marcos / sessão principal · fechamento da rodada 2
- Feito: D-01, D-03, D-04 aplicadas; D-06 avaliada (não se aplica ao nosso Worker, perguntas ao Neon em `pending-decisions.md`); D-02/D-05/D-07 registradas. Emissão em transação única, limite por CPF sem corrida, financeiro somado no banco e paginado, testes do "esqueci a senha", da central admin e do limite de pedidos, e2e da câmera da portaria.
- **Schema para a produção (antes de publicar):** `ALTER TABLE orders ADD COLUMN IF NOT EXISTS producer_opt_in boolean;` (já aplicado no branch de teste; detalhes no topo de `pending-decisions.md`).
- Build final verde em 99aed9b (inclui teus commits de portaria 264b8c2 e bce8d62); repeti o e2e da câmera depois deles: 13/13. `tsc` e `eslint src tests` sem erros; 71 testes passando.
- Com você: revisar o visual/texto da caixa de novidades (D-03), do campo do código (D-04) e das mensagens da portaria (handoff 12:30). O teu `fix-log.md` tem 1 linha não commitada (conta `teste+marcos-produtor@example.com`); deixei de fora dos meus commits.
- Servidor local segue no ar em http://localhost:3042.

## 30/10 rodada 2 14:10 · Marcos → Romano · portaria validada e ajustada; build pendente
- **Mensagens da portaria (teu handoff 12:30):** validadas com câmera falsa no app (`/painel/portaria/<id>/app`, 320 e 390) e no painel (`/painel/portaria/<id>`, 390): válido, já usado, outro evento, QR inválido.
- **Bug achado e corrigido (264b8c2):** com o celular ainda apontado depois do verde, o mesmo QR era lido de novo em ~4 s e a tela virava vermelha "Já entrou às…" para quem acabou de entrar. Agora o mesmo QR só é lido de novo depois de sair da frente da câmera por 2 s (reentrada continua sendo pega). Teu e2e não depende disso (reabre o navegador a cada caso).
- **Portaria do painel no celular (74f5a2e, 48d4f77):** câmera centralizada ao abrir, resultado sempre à vista (o do código digitado aparecia fora da tela) e foco de volta ao campo; mensagem longa ("outro evento (nome)") com fonte menor, agora inteira; "já usado" mostra "Já entrou às HH:MM" + nome, como o app. **Ajustei uma linha do teu e2e** (`tests/e2e/portaria-camera.e2e.mjs`, asserção do "já usado"); rodei: 13/13 ok.
- **Texto do servidor "QR code inválido ou de um ingresso transferido."**: não mudei `checkin.ts`; em vez disso, as duas telas mostram embaixo o próximo passo ("Peça o ingresso aberto em Meus ingressos ou no e-mail e confira o código."). Se quiser encurtar o texto do servidor, ok para mim.
- **Build:** depois do teu build em 99aed9b eu mexi em rota (`src/app/criar-evento/page.tsx`, f2f1ee1) e em componentes. `tsc` (exceto `tests/db/place-order.test.ts`, se ainda faltar o `producerOptIn` lá) e `eslint` limpos nos meus arquivos. **Falta 1 build final** a partir do último commit.
