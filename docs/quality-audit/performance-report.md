# Performance (Romano)

## Como foi medido
- **JavaScript por rota:** build de produção (`opennextjs-cloudflare build`) na cópia `ticket-build`; soma dos arquivos de `static/chunks` listados no `page_client-reference-manifest.js` de cada rota (JS próprio da rota, **sem compressão**; o que vai pela rede é bem menor com gzip/brotli).
- **Tempo até o primeiro byte (TTFB):** `curl` no servidor local de desenvolvimento (porta 3042, banco de teste no Neon), mediana de 10 acessos depois de um de aquecimento. Em modo dev os números absolutos são piores que na produção (sem minificação, compilação sob demanda); servem para comparar antes × depois na mesma máquina. Não foi possível medir a produção (regra da auditoria) nem subir um segundo servidor com o build (regra: um servidor por projeto).
- Carga (rodada 3): `pnpm test:load` (vitest, `tests/load/`) chama as ações do servidor direto no **banco de teste**, sem HTTP e sem login (a sessão de cada comprador é simulada; o login é o da produção e fica fora). Página por HTTP: `tests/load/pagina-evento.load.mjs`, só contra o servidor local. "Antes" = cópia do código em 53a672a (antes de 334f10d e 58f7dc1), "depois" = HEAD da rodada 3; mesma máquina, mesmo banco, rodadas seguidas.

## Antes × depois

| O quê | Antes | Depois | Commit |
|---|---|---|---|
| JS da rota `/entrar` | 353 KB | 105 KB | 4fbf9d8 (cliente de login sob demanda) |
| JS da rota `/cadastro` | 358 KB | 110 KB | idem |
| JS da rota `/ativar-conta` | 356 KB | 108 KB | idem |
| JS da rota `/checkout` | 449 KB | 201 KB | idem |
| TTFB `/eventos/festa-da-putaria` (dev) | 1,31 s | 1,17 s | 52b6384 |
| TTFB `/eventos/qa-romano-checkout` (dev) | 1,19 s | 1,10 s | 52b6384 |
| TTFB `/eventos/halloween-…` (dev) | 1,31 s | 1,19 s | 52b6384 |
| Dependências de produção | jspdf + html-to-image sem uso | removidas | bb0f74f |
| JS da rota `/portaria` | 234 KB | 107 KB | 5943600 (leitor de QR sob demanda) |
| JS da rota `/painel/portaria/[id]` | 229 KB | 102 KB | idem |

O cliente do Neon Auth (~250 KB) entrava no carregamento inicial dessas telas só por causa do botão do Google e da confirmação do código; agora é importado no clique (`src/lib/auth/client-lazy.ts`).

## Linha de base de outras páginas (dev, mediana de 5)
| Página | TTFB |
|---|---|
| `/` | 0,70 s |
| `/explorar` | 1,06 s |
| `/produtores` | 0,73 s |
| `/ajuda` | 0,42 s |

## JS por rota (build, depois das mudanças, maiores)
`/checkout` 201 KB · `/criar-evento` 286 KB · `/painel/evento/[id]` 238 KB · `/painel/emails/[id]` 237 KB · `/portaria` 234 KB · `/eventos/[slug]` 221 KB · `/` 192 KB.

## Gargalos investigados
- **Driver HTTP do Neon:** cada consulta é uma ida e volta HTTP; o que mais pesa é a sequência de rodadas, não o tamanho das consultas. Na página do evento eram 4 rodadas (evento+sessão → parecidos/seguir → pré-venda → revenda/reservas/compras) e a consulta grande do evento rodava 2× (metadados + página). Agora: 2 rodadas e 1 consulta do evento.
- **Home:** já carrega tudo em paralelo (2 rodadas). Sem mudança.
- **Consultas dentro de laços:** só em operações administrativas pequenas (ordem dos destaques, datas de sessões no adiamento) e no cancelamento em lote (com limite e orçamento de tempo). Sem N+1 em páginas públicas.
- **Painel financeiro / extrato do banco** (RESOLVIDO na rodada 2, 351ca5c): antes, `listOrders` trazia todos os pedidos pagos dos eventos do produtor para somar no servidor. Agora `orderSums` soma no banco, agrupando por evento, situação, dia (São Paulo), teste e valor do pedido (o número de linhas cresce com os dias de venda e os preços distintos, não com os pedidos), e a taxa continua arredondada pedido a pedido (paridade centavo a centavo em `tests/db/finance-sums.test.ts`). A tabela "Por evento" do financeiro é paginada (25 por página). Rodada 3: início do painel, Público e Marketing também somados no banco (aaabf87); ainda usa `listOrders` o painel de um evento.

## Teste de carga (rodada 3, 30/10)

### Abertura de vendas: N compradores ao mesmo tempo no mesmo tipo, estoque = 60% de N
Cada comprador faz `placeOrder` (reserva) e, se conseguiu, `confirmPayment` (Pix de teste → emissão). Conferido no fim: vendido ≤ estoque, ingressos = vendidos = pedidos pagos, nenhuma exceção (os 6 cenários passaram antes e depois).

| N (estoque) | Vendidos antes → depois | `placeOrder` p50 / p95 antes | depois | confirmar p50 / p95 antes | depois | Duração total antes → depois |
|---|---|---|---|---|---|---|
| 10 (6) | 5 → **6** | 1536 / 1941 ms | 957 / 1084 ms | 1054 / 1412 ms | 1046 / 1055 ms | 2,99 → 2,04 s |
| 50 (30) | 24 → **30** | 1612 / 1723 ms | 1113 / 1198 ms | 1050 / 1103 ms | 1057 / 1076 ms | 3,06 → 2,26 s |
| 100 (60) | 39 → **60** | 1653 / 1972 ms | 1535 / 3042 ms | 1049 / 1096 ms | 1069 / 1130 ms | 3,13 → 3,19 s |

- **O que mudou (334f10d):** antes, cada pedido gravava e depois reconferia o estoque contando todos os pedidos abertos; com muitos ao mesmo tempo, todos se viam e se recusavam, e **sobrava lugar** (100 pessoas por 60 lugares: 39 vendidos, 21 lugares sem dono até a reserva vencer). Agora pedido + itens + conferência vão num lote só com trava por tipo: os primeiros ficam com todos os lugares e ninguém passa do estoque (em nenhuma rodada, antes ou depois, vendeu acima).
- **Custo:** a trava enfileira as reservas do mesmo tipo; com 100 ao mesmo tempo o p95 da reserva sobe para ~3 s (o p50 cai). É o comportamento esperado de uma fila justa; a fila virtual do evento (`queueMode`) existe para picos maiores.

### Portaria: N ingressos, dois operadores lendo cada QR quase juntos (2N leituras)

| N (leituras) | p50 antes → depois | p95 antes → depois | Duração total antes → depois | Resultado |
|---|---|---|---|---|
| 10 (20) | 497 → 360 ms | 624 → 418 ms | 0,69 → 0,55 s | 10 liberados, 10 "já utilizado", 10 usados no banco |
| 50 (100) | 607 → 529 ms | 758 → 592 ms | 0,99 → 0,90 s | 50 / 50 / 50 |
| 100 (200) | 803 → 549 ms | 1034 → 779 ms | 3,04 → 1,20 s | 100 / 100 / 100 |

- **O que mudou (58f7dc1):** marcar como usado e tirar da revenda num comando só (uma ida ao banco a menos por leitura). Cada ingresso entrou uma vez só em todas as rodadas; nenhuma exceção. A conferência do dia (5c4e43b) só faz uma consulta a mais em ingresso de evento de várias datas.

### Página do evento e home por HTTP (servidor local de desenvolvimento)

| Página | N simultâneos | p50 | p95 | Erros |
|---|---|---|---|---|
| `/eventos/qa-romano-checkout` | 10 / 50 / 100 | 3,4 / 11,3 / 17,1 s | 3,4 / 14,0 / 25,6 s | 0 / 0 / 0 |
| `/` | 10 / 50 / 100 | 2,2 / 9,3 / 15,4 s | 2,6 / 11,7 / 23,2 s | 0 / 0 / 0 |

- Sem erro nem página quebrada em nenhuma rodada. As latências são do **servidor de desenvolvimento** (um processo só, sem minificação, renderização em série): ele atende ~4 a 7 páginas por segundo, então a fila cresce com N. Não representa a produção (Workers escalam por instância); serve só para mostrar que nada quebra sob concorrência. Uma medida com o build, num ambiente de pré-produção autorizado, fica como próxima oportunidade.
- Tempo até o primeiro byte, um acesso por vez (mediana de 10, depois da CSP no proxy): `/` 0,56 s (linha de base 0,70 s) e `/eventos/qa-romano-checkout` 0,63 s (1,10 s na rodada 1). A CSP (nonce por pedido) não trouxe custo mensurável.

## Próximas oportunidades
1. `/criar-evento` (286 KB): ver o que dá para carregar só na etapa que usa (mapa, IA). O leitor de QR da portaria já foi feito.
2. ~~Levar a soma no banco para o início do painel, público e marketing~~ feito na rodada 3 (aaabf87, paridade em `tests/db/painel-sums.test.ts`). Falta o painel de um evento (`/painel/evento/[id]`).
3. Medir LCP/INP/CLS no navegador em produção (ou num preview autorizado) com o build minificado.
4. Carga por HTTP com o build (não o servidor de dev) num ambiente de pré-produção autorizado, incluindo o checkout.
