# Performance (Romano)

## Como foi medido
- **JavaScript por rota:** build de produção (`opennextjs-cloudflare build`) na cópia `ticket-build`; soma dos arquivos de `static/chunks` listados no `page_client-reference-manifest.js` de cada rota (JS próprio da rota, **sem compressão**; o que vai pela rede é bem menor com gzip/brotli).
- **Tempo até o primeiro byte (TTFB):** `curl` no servidor local de desenvolvimento (porta 3042, banco de teste no Neon), mediana de 10 acessos depois de um de aquecimento. Em modo dev os números absolutos são piores que na produção (sem minificação, compilação sob demanda); servem para comparar antes × depois na mesma máquina. Não foi possível medir a produção (regra da auditoria) nem subir um segundo servidor com o build (regra: um servidor por projeto).
- Carga: não executada (o login é o da produção; teste de carga só no banco de teste e sem tocar no login ficou fora desta noite).

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
- **Painel financeiro / extrato do banco** (RESOLVIDO na rodada 2, 351ca5c): antes, `listOrders` trazia todos os pedidos pagos dos eventos do produtor para somar no servidor. Agora `orderSums` soma no banco, agrupando por evento, situação, dia (São Paulo), teste e valor do pedido (o número de linhas cresce com os dias de venda e os preços distintos, não com os pedidos), e a taxa continua arredondada pedido a pedido (paridade centavo a centavo em `tests/db/finance-sums.test.ts`). A tabela "Por evento" do financeiro é paginada (25 por página). Ainda usam `listOrders` (todas as linhas): início do painel, público, marketing e o painel de um evento; próximos candidatos à mesma troca.

## Próximas oportunidades
1. `/criar-evento` (286 KB): ver o que dá para carregar só na etapa que usa (mapa, IA). O leitor de QR da portaria já foi feito.
2. Levar a soma no banco (`orderSums`) para o início do painel, público e marketing.
3. Medir LCP/INP/CLS no navegador em produção (ou num preview autorizado) com o build minificado.
