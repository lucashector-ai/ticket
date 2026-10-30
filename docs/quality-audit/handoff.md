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
