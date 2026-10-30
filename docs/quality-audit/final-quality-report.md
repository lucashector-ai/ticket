# Relatório final de qualidade · Tickets Win

Auditoria noturna de 30/10/2026, branch `claude/auditoria-noturna` (não publicado). Equipe: Romano (engenharia e segurança) e Marcos (UX). Cada seção diz quem escreveu.
Status usados: NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO.

## 1. Resumo executivo (Romano: engenharia)
A base é cuidadosa: emissão de ingressos idempotente, baixa de estoque atômica, estorno automático, webhook assinado, 2FA e banco com app autenticador. O que encontramos de mais sério estava nas bordas: **quem vendia ou transferia um ingresso ainda entrava no evento com o código antigo**, a **"reserva" de 15 minutos não segurava o lugar** (gente pagando o último ingresso e sendo estornada), **qualquer conta conseguia virar produtor sem aprovação** (via convite de equipe), **ex-membros da equipe mantinham a portaria** e **editar um evento podia quebrar no meio** ao apagar um tipo de ingresso. Tudo isso foi corrigido e coberto por testes. O projeto passou de zero testes para **39 testes automatizados** (unitários + integração no banco de teste), e as dependências vulneráveis de produção caíram de 47 avisos para 8 (os restantes dependem do SDK do Neon Auth, decisão D-06).
Ficam para o dono: compra em grupo contornando o limite por pessoa (D-01), confirmação da reserva segurando estoque (D-02, aplicada e reversível), LGPD do e-mail marketing (D-03), app autenticador para trocar a conta de saque (D-04), SDK do login (D-06) e trava do modo de teste na produção (D-07).

## 2. Segurança (Romano)
Detalhes, reprodução e evidências em `security-audit.md`.

| ID | Grav. | Achado | Status |
|---|---|---|---|
| S-01 | P1 | Código do ingresso sobrevivia à transferência/revenda (vendedor entrava ditando o código) | VALIDADO |
| S-02 | P1 | Qualquer conta virava produtor sem aprovação (convite de equipe) | VALIDADO (integração) |
| S-03 | P1 | Excluir evento apagava pedidos com pagamento em andamento | VALIDADO (integração) |
| S-04 | P2 | Saque duplo simultâneo | CORRIGIDO, NÃO VALIDADO |
| S-05 | P3 | Central admin sem exigir e-mail confirmado | CORRIGIDO, NÃO VALIDADO |
| S-06 | P1 | Ex-membro mantinha acesso pessoal de portaria | VALIDADO (integração) |
| S-07 | P2 | Upload sem conferir conteúdo nem limite | VALIDADO |
| S-08 | P1 | Reserva de 15 min não segurava estoque | VALIDADO |
| S-11 | P2 | Assinaturas com segredo padrão no código | VALIDADO |
| S-12 | P2 | Checkout antigo com regras mais fracas | CORRIGIDO, NÃO VALIDADO no navegador |
| S-13 | P3 | Login revelava se o e-mail tinha conta | CORRIGIDO, NÃO VALIDADO |
| S-14 | P2 | Cupom sem limite de consultas | VALIDADO |
| S-15 | P1 | jspdf (críticos) sem uso; node-forge desatualizado | VALIDADO |
| S-16 | P1 | Editar evento quebrava no meio ao apagar tipo citado em pedido | VALIDADO |
| S-09 | P1 | Grupo contorna o limite por pessoa | ABERTO (D-01) |
| S-10 | P2 | Conta de saque troca sem app autenticador | ABERTO (D-04) |
| S-17 | P1 | SDK do Neon Auth com better-auth 1.7.6 | ABERTO (D-06) |
| S-18 | P1 | Modo de teste liga sozinho sem chave da Stripe | ABERTO (D-07) |

Verificado sem problema: autorização de todas as páginas privadas e de cada ação de servidor lida (pedido, ingresso, PDF, carteira, painel por evento, reembolsos, banco, central); preço sempre recalculado no servidor; check-in com QR assinado e marcação única; webhooks com assinatura e deduplicação; sanitização do HTML do e-mail; redirecionamentos `next` seguros.

## 3. Engenharia (Romano)
- **Testes:** vitest instalado (`pnpm test`), 9 arquivos, 39 testes. Integração real no branch de teste do Neon com `TEST_DATABASE_URL` (pulados sem a variável). Cobrem preço/taxa/cupom/meia/parcelas, limites, concorrência de estoque (10 pelos últimos 2, dois pelo último, confirmação repetida), reserva, evento cancelado, troca de dono do ingresso, portaria (QR adulterado, outro evento, dois operadores), XSS do e-mail, upload e assinatura da Wallet. Conferido que os testes da troca de código e da aprovação de produtor **falham sem a correção**. Também cobrem permissões do painel (equipe, portaria, excluir evento) e a edição de lotes.
- **Regras num lugar só:** `lib/tickets/limits.ts` (limites usados pela tela e pelo servidor), `lib/tickets/code.ts`, `lib/holds.ts` (vagas seguradas + reconferência), `lib/rate-limit.ts`, `lib/signing-secret.ts`, `lib/image-sniff.ts`.
- **Código morto/legado:** `createOrder`/`validateCoupon` removidos; `payOrder` usa a emissão única; dependências sem uso removidas.
- **Arquitetura:** o driver `neon-http` não tem transação; onde havia corrida sem proteção (reserva, saque, edição de lotes) usamos update condicional + reconferência. Recomendação estrutural em `architecture-review.md`.
- **Build:** `opennextjs-cloudflare build` verde depois de cada bloco (5 builds na cópia `ticket-build`). `tsc --noEmit` e `eslint` limpos em todos os commits.

## 4. Experiência do comprador
(Marcos: ver `ux-audit.md`.) Do lado técnico (Romano): checkout ponta a ponta no navegador no modo de teste VALIDADO (2 ingressos, 1 enviado para outra pessoa, total com taxa correto, estoque e ingressos conferidos no banco); duas abas retomam o mesmo pedido em vez de disputar o lugar (VALIDADO); cronômetro "Reservados por" aparece antes de existir reserva (FALHOU, repassado ao Marcos).

## 5. Experiência do organizador
(Marcos.) Técnico (Romano): editar evento com lotes já usados em pedidos não quebra mais; portaria pelo painel lendo QR por câmera VALIDADA com câmera falsa do Chromium.

## 6. Responsividade
(Marcos.)

## 7. Performance (Romano)
Detalhes em `performance-report.md`. JS da rota: `/entrar` 353 → 105 KB, `/cadastro` 358 → 110 KB, `/checkout` 449 → 201 KB, `/portaria` 234 → 107 KB (sem compressão). Página do evento 8–11% mais rápida no servidor (A/B no dev). Carga: não executada.

## 8. Testes (Romano, parte técnica)
| Tipo | Executados | Aprovados | Reprovados | Bloqueados |
|---|---|---|---|---|
| Unitários (vitest) | 19 | 19 | 0 | 0 |
| Integração no banco de teste (vitest) | 20 | 20 | 0 | 0 |
| Navegador (Playwright, Chromium) | 7 fluxos (checkout e2e, duas abas, upload, cupom, login Google, câmera da portaria, imagem) | 6 | 1 (cronômetro, texto) | Firefox/WebKit: BLOQUEADO (não instalados) |
| Pagamento real com Stripe (cartão, 3D Secure, Pix real, webhook real) | 0 | — | — | BLOQUEADO (sem chave de teste no local) |

## 9. Arquivos modificados (Romano, principais)
`src/lib/holds.ts`, `src/lib/tickets/{limits,code}.ts`, `src/lib/payments/fulfill.ts`, `src/lib/actions/{compra,checkout,tickets,painel,eventos,banco,grupo,auth}.ts`, `src/lib/criar/save.ts`, `src/lib/{rate-limit,signing-secret,image-sniff}.ts`, `src/lib/{admin,bank,mfa,portaria,pricing}.ts`, `src/lib/data/events.ts`, `src/lib/auth/client-lazy.ts`, `src/app/api/{midia,admin/banner}/route.ts`, `src/app/eventos/[slug]/page.tsx`, `src/app/checkout/page.tsx`, `src/components/checkin/use-qr-camera.ts` e 3 componentes de login (só o import), `tests/**`, `vitest.config.mts`, `package.json`.

## 10. Pendências (Romano)
Decisões D-01 a D-07 em `pending-decisions.md`. Técnicas: testar com a chave de teste da Stripe (cartão, 3D Secure, Pix, webhook fora de ordem) num ambiente autorizado; agregar o financeiro no SQL; limite por pessoa entre contas com o mesmo CPF confirmando ao mesmo tempo (P2); CSP de scripts.

## 11. Próximas prioridades (Romano)
1. Decidir D-01, D-06 e D-07 (risco de dinheiro e de login).
2. Rodar o checkout com a chave de **teste** da Stripe num preview autorizado (cartão recusado, 3D Secure, Pix, webhook duplicado e fora de ordem).
3. Transações nas operações financeiras (driver com WebSocket ou funções SQL).
4. Financeiro agregado no banco e paginação do painel para produtores grandes.
5. CSP de scripts e aviso de saída nos links de e-mail.
