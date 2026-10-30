# Revisão de arquitetura (Romano)

Levantamento feito no código do branch `claude/auditoria-noturna` em 30/10/2026.

## Stack real
- **Next.js 16.4.3** (App Router, Turbopack), React 19.3, TypeScript estrito. Sem `src/middleware`; proteção de rota feita em cada página/ação (`getSessionUser`, `painelAccess`, `adminUser`).
- **Cloudflare Workers** via OpenNext (`@opennextjs/cloudflare` 1.20), `custom-worker.js` com cron a cada minuto chamando `/api/cron` com token só do isolate.
- **Banco:** Neon Postgres + Drizzle (`src/db/schema.ts`, 43 tabelas) com o driver **`neon-http`**: **sem transação interativa**. Toda operação de várias etapas usa update condicional atômico + compensação (desfazer) em vez de transação. Isso é a decisão de arquitetura mais importante para integridade (ver "Riscos").
- **Login:** Neon Auth (Better Auth) com cookies próprios; 2FA próprio (`src/lib/mfa.ts`: TOTP com proteção contra reuso no KV, códigos de recuperação, código por e-mail); Entrar com Apple e Google.
- **Pagamentos:** Stripe (cartão com parcelamento e Pix) dentro do checkout próprio; sem `STRIPE_SECRET_KEY` roda o modo de teste (`TEST-…`, fora do saldo do produtor). Webhook `/api/webhooks/stripe` com assinatura e deduplicação no KV.
- **Arquivos:** R2 `onde-media` (imagens, PDFs de ingresso em cache); **KV** (limites de tentativa, deduplicação de webhook, fila virtual, cotas de IA/Google Places, uploads); **Images** binding; e-mail pelo **Resend** (desligado no local).
- Integrações: Google Places, Spotify, Anthropic (texto do evento, mapa por IA), Apple/Google Wallet, IBGE (cidades), VLibras, Turnstile.

## Mapa
- **56 páginas**, **31 rotas** (`route.ts`), **33 arquivos de ações de servidor** (`src/lib/actions`).
- Público: home, `/explorar`, `/eventos/[slug]`, `/produtor/[slug]`, `/artistas/[slug]`, `/ajuda`, `/legal/*`, `/sobre`, `/contato`.
- Comprador: `/checkout` (fluxo novo, tela cheia), `/checkout/[orderId]` (pedido antigo/resumo), `/meus-ingressos`, `/ingressos/[code]`, `/conta/*`, `/transferencia/[token]`, `/grupo/[code]`, `/lista/[token]`.
- Produtor: `/criar-evento`, `/painel/*` (evento, financeiro, marketing, e-mails, equipe, público, promoters, configurações), `/meus-eventos`, `/banco/*` (saques, com app autenticador), `/produtores/*` (inscrição e cadastro).
- Portaria: `/portaria` (app por código ou link, cookie assinado), `/painel/portaria/[id]`, `/checkin/[token]`, `/api/checkin`.
- Central admin: `/tw-central` (lista `ADMIN_EMAILS` @ticketswin.com.br + app autenticador; 404 para os outros).
- Webhooks: Stripe, Neon Auth (assinatura Ed25519 via JWKS, idade ≤ 5 min).

## Papéis implementados
visitante · comprador · produtor (dono do `organizer`, com cadastro aprovado) · equipe do produtor (`admin` ou `portaria`, por convite com e-mail confirmado) · aparelho da portaria (acesso por código/link, sem conta) · admin da central.
Regra central: `getPainelScope` (dono → membro → só eventos que criou) + checagem por evento em cada ação.

## Fluxo de compra (resumo técnico)
1. Página do evento → escolha (limites e estoque calculados no servidor e repetidos no navegador).
2. `/checkout` → `placeOrder`: confere abertura/fila/pré-venda, limite por pessoa (conta + CPF), estoque menos vagas seguradas, recalcula preço (`priceOrder`), libera pedidos abertos anteriores da mesma pessoa e cria o pedido pendente de 15 min.
3. Pix (Stripe ou teste) ou cartão (`payCard`), confirmação por webhook ou `checkPayment`, ambos chamando `fulfillOrder` (idempotente, trava por `paid_at`, baixa atômica, estorno automático se já cobrado e não deu para emitir).

## Inventário: completo × pela metade
- **Completo e cuidadoso:** emissão idempotente, reembolsos com trilha (`order_refunds`), cancelamento de evento em lotes, revenda oficial com teto de preço, transferência com aceite, portaria por código, 2FA, banco com app autenticador, e-mail marketing com descadastro.
- **Pela metade / legado:** `src/lib/actions/checkout.ts` (`createOrder`/`payOrder`): fluxo antigo, sem limite por CPF, sem fila e sem pré-venda. A UI só usa `payOrderForm` e `cancelOrderForm` na página `/checkout/[orderId]`; com a Stripe ligada `payOrder` recusa pedido com valor e pedidos do fluxo novo são desviados para `confirmPayment`. `createOrder` não é chamado por ninguém. Candidato a remoção (ver `fix-log.md`).
- **Sem testes automatizados** até esta auditoria; agora há vitest (unitário + integração no banco de teste).

## Riscos de arquitetura
1. **Sem transações interativas** (`neon-http`): cada fluxo novo precisa de update condicional + reconferência. Onde faltava, corrigimos (reserva, saque). **Rodada 2:** a emissão passou a usar `db.batch` (o Neon executa a lista de comandos como uma transação) com conferências `ensure` que abortam a transação (`src/lib/payments/fulfill.ts`); é o padrão recomendado para as próximas operações de várias etapas (reembolso, saque). Alternativa para lógica mais complexa: `drizzle-orm/neon-serverless` (WebSocket) só nessas operações.
2. **Limites por pessoa** dependem de conta + CPF informado; grupos contornam (D-01).
3. **Segredos com valor padrão no código** (`NEON_AUTH_COOKIE_SECRET ?? "onde"` no HMAC do QR e `?? "tw"` no cookie da portaria): na produção a variável existe (o login depende dela), mas sem ela os QRs ficariam forjáveis. Recomendação: falhar se faltar.
4. **Queda do Worker no meio da emissão** (RESOLVIDO na rodada 2, S-24: transação única, `tests/db/fulfill-atomic.test.ts`). Antes: `fulfillOrder` baixava o estoque, depois gravava os ingressos; a lista de "desfazer" ficava na memória. Se o Worker cair entre as duas etapas (limite de CPU/tempo), a nova tentativa do webhook (depois de 2 min) baixa o estoque de novo: o lote fica com `sold` maior que o real (nunca vende acima; pode deixar de vender lugares). Correção recomendada: `db.batch()` do driver `neon-http` roda vários comandos numa transação (sem lógica entre eles); a baixa condicional + inserção dos ingressos de cada item cabem num `insert … select` a partir do `update … returning`, e a nova tentativa pula itens que já têm ingressos. Não alterei de madrugada por ser o coração da emissão; os testes de `tests/db/stock.test.ts` servem de rede para essa mudança.
5. Cron a cada minuto sem "varredura" de pedidos pendentes vencidos (status fica `pending`; todas as consultas filtram por `expires_at`, então não há efeito em estoque).
