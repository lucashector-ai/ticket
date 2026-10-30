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
