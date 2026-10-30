# Relatório final de qualidade · Tickets Win

Auditoria noturna de 30/10/2026, branch `claude/auditoria-noturna`. A primeira parte foi publicada pelo dono (commit 21c5408); a **rodada 2** (30/10, depois da aprovação das decisões) está neste branch, ainda não publicada. Equipe: Romano (engenharia e segurança) e Marcos (UX). Cada seção diz quem escreveu.
Status usados: NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO.

## 1. Resumo executivo (Romano: engenharia)
A base é cuidadosa: emissão de ingressos idempotente, baixa de estoque atômica, estorno automático, webhook assinado, 2FA e banco com app autenticador. O que encontramos de mais sério estava nas bordas: **quem vendia ou transferia um ingresso ainda entrava no evento com o código antigo**, a **"reserva" de 15 minutos não segurava o lugar** (gente pagando o último ingresso e sendo estornada), **qualquer conta conseguia virar produtor sem aprovação** (via convite de equipe), **ex-membros da equipe mantinham a portaria** e **editar um evento podia quebrar no meio** ao apagar um tipo de ingresso. Tudo isso foi corrigido e coberto por testes. O projeto passou de zero testes para **52 testes automatizados** (unitários + integração no banco de teste), e as dependências vulneráveis de produção caíram de 47 avisos para 8 (os restantes dependem do SDK do Neon Auth, decisão D-06).
**Experiência (Marcos).** As jornadas principais funcionam de ponta a ponta no modo de teste (comprar, achar o ingresso, criar e publicar evento, operar a portaria), e os valores batem em todas as telas. Os problemas de experiência estavam em momentos de confiança e em telas pequenas: **recarregar "Pedido confirmado" abria um checkout novo com os mesmos itens** (risco de compra em dobro), **sessão expirada deixava a pessoa presa** no checkout, **um pedido aberto engolia em silêncio uma escolha nova** (pedia 2, cobrava 1), um **cronômetro de reserva aparecia antes de existir reserva**, o limite "por pessoa" dizia uma coisa e fazia outra, e havia rolagem lateral, textos cortados e etapas inalcançáveis entre 320 e 390 px. Também tratamos acessibilidade (contraste de mais de 500 textos, foco preso na tela de compra, nomes de links, zoom liberado na portaria). Foram **31 problemas de UX encontrados e corrigidos, todos revalidados no navegador** (2 P1, 14 P2, 15 P3); ficam 3 decisões para o dono (DM-1 a DM-3) e 3 ajustes P3 de acessibilidade em aberto.

**Rodada 2 (Romano).** Com as decisões do dono aplicadas: compra em grupo não contorna mais o limite por pessoa (D-01), campanhas do produtor só para quem marca a caixa no checkout (D-03, com coluna nova: SQL pronto em `pending-decisions.md`), troca da conta de saque exige o app autenticador (D-04). Fechados dois riscos estruturais que estavam abertos: **a emissão agora é uma transação única** (uma queda do servidor no meio não deixa estoque baixado sem ingresso nem baixa duas vezes) e **o limite por CPF vale mesmo com contas diferentes confirmando ao mesmo tempo**; os dois foram reproduzidos antes por teste. O financeiro e o extrato do Banco passaram a somar no banco (paridade centavo a centavo) e a tabela por evento é paginada. A portaria foi testada lendo o QR pela câmera em todos os casos (válido, já usado, outro evento, reembolsado, cancelado, adulterado). Testes: 52 → **71**, todos passando; build verde.
Decisões que o dono manteve como estão: reserva segurando estoque (D-02) e modo de teste sem a chave da Stripe (D-07). D-05 fechada (imagem existe na produção). D-06: o código vulnerável do better-auth não roda no nosso servidor; falta só a confirmação do Neon (perguntas em `pending-decisions.md`).

## 2. Segurança (Romano)
Detalhes, reprodução e evidências em `security-audit.md`.

| ID | Grav. | Achado | Status |
|---|---|---|---|
| S-01 | P1 | Código do ingresso sobrevivia à transferência/revenda (vendedor entrava ditando o código) | VALIDADO |
| S-02 | P1 | Qualquer conta virava produtor sem aprovação (convite de equipe) | VALIDADO (integração) |
| S-03 | P1 | Excluir evento apagava pedidos com pagamento em andamento | VALIDADO (integração) |
| S-04 | P2 | Saque duplo simultâneo | VALIDADO (integração) |
| S-05 | P3 | Central admin sem exigir e-mail confirmado | VALIDADO (rodada 2) |
| S-06 | P1 | Ex-membro mantinha acesso pessoal de portaria | VALIDADO (integração) |
| S-07 | P2 | Upload sem conferir conteúdo nem limite | VALIDADO |
| S-08 | P1 | Reserva de 15 min não segurava estoque | VALIDADO |
| S-11 | P2 | Assinaturas com segredo padrão no código | VALIDADO |
| S-12 | P2 | Checkout antigo com regras mais fracas | VALIDADO (integração) |
| S-13 | P3 | Login revelava se o e-mail tinha conta | VALIDADO |
| S-14 | P2 | Cupom sem limite de consultas | VALIDADO |
| S-15 | P1 | jspdf (críticos) sem uso; node-forge desatualizado | VALIDADO |
| S-16 | P1 | Editar evento quebrava no meio ao apagar tipo citado em pedido | VALIDADO |
| S-19 | P2 | "Me avise" e transferências disparavam e-mails sem limite | VALIDADO |
| S-20 | P3 | Prévia OG mostrava arte de rascunho | VALIDADO |
| S-21 | P3 | CSV do painel sem neutralizar fórmulas | VALIDADO |
| S-22 | P3 | Assinador do QR exposto como ação de servidor; ação morta | VALIDADO |
| S-23 | P3 | "Esqueci a senha" permitia encher a caixa de entrada de outra pessoa | VALIDADO (rodada 2, teste do limitador) |
| S-09 | P1 | Grupo contorna o limite por pessoa | VALIDADO (rodada 2, D-01) |
| S-10 | P2 | Conta de saque troca sem app autenticador | VALIDADO (rodada 2, D-04) |
| S-24 | P1 | Emissão sem transação: queda no meio baixava o estoque duas vezes | VALIDADO (rodada 2) |
| S-25 | P2 | Mesmo CPF em contas diferentes confirmando juntas passava do limite | VALIDADO (rodada 2) |
| S-26 | P3 | fflate 0.8.2 (aviso moderado) | VALIDADO (0.8.3) |
| S-17 | P1 | SDK do Neon Auth com better-auth 1.7.6 | NÃO SE APLICA ao nosso servidor (D-06); confirmar com o Neon |
| S-18 | P1 | Modo de teste liga sozinho sem chave da Stripe | MANTIDO por decisão do dono (D-07) |

Verificado sem problema: autorização de todas as páginas privadas e de cada ação de servidor lida (pedido, ingresso, PDF, carteira, painel por evento, reembolsos, banco, central); preço sempre recalculado no servidor; check-in com QR assinado e marcação única; webhooks com assinatura e deduplicação; sanitização do HTML do e-mail; redirecionamentos `next` seguros.

## 3. Engenharia (Romano)
- **Rodada 2:** emissão (`fulfillOrder`/revenda) numa transação só via `db.batch` do driver HTTP, com conferências que abortam a transação (`ensure`) e trava por conta/CPF (`pg_advisory_xact_lock`); regras da D-01 em `lib/special.ts` e `actions/grupo.ts`; D-04 em `saveSettings`; D-03 em `placeOrder` + `resolveAudience`; `orderSums` (somas no banco) no financeiro e no extrato do Banco. 19 testes novos, vários escritos para falhar antes da correção (conferido). E2E novos: portaria pela câmera e caixa de novidades no checkout.
- **Testes:** vitest instalado (`pnpm test`); rodada 2: 23 arquivos, **71 testes** (27 unitários + 44 de integração), todos passando. Na primeira parte eram 15 arquivos e 52 testes. Integração real no branch de teste do Neon com `TEST_DATABASE_URL` (pulados sem a variável). Cobrem preço/taxa/cupom/meia/parcelas, limites, concorrência de estoque (10 pelos últimos 2, dois pelo último, confirmação repetida), reserva, evento cancelado, troca de dono do ingresso, portaria (QR adulterado, outro evento, dois operadores), XSS do e-mail, upload e assinatura da Wallet. Conferido que os testes da troca de código, da aprovação de produtor, do saque duplo e da reserva simultânea **falham sem a correção**. Também cobrem permissões do painel (equipe, portaria, excluir evento) e a edição de lotes.
- **Regras num lugar só:** `lib/tickets/limits.ts` (limites usados pela tela e pelo servidor), `lib/tickets/code.ts`, `lib/holds.ts` (vagas seguradas + reconferência), `lib/rate-limit.ts`, `lib/signing-secret.ts`, `lib/image-sniff.ts`.
- **Código morto/legado:** `createOrder`/`validateCoupon` removidos; `payOrder` usa a emissão única; dependências sem uso removidas.
- **Arquitetura:** o driver `neon-http` não tem transação; onde havia corrida sem proteção (reserva, saque, edição de lotes) usamos update condicional + reconferência. Recomendação estrutural em `architecture-review.md`.
- **Build:** `opennextjs-cloudflare build` verde depois de cada bloco (8 builds na cópia `ticket-build` na primeira parte; rodada 2: build verde dos commits 85e8bff e 99aed9b, o último já com as mudanças de portaria do Marcos, exportado do git, sem arquivos fora do commit). `tsc --noEmit` sem erros; `eslint src tests` sem erros (3 avisos antigos em arquivos de interface: variável sem uso em `painel/promoters/page.tsx` e `criar/steps-tk.tsx`, `window.location.assign` em `compra-flow.tsx`).
- **Freios contra abuso** (`lib/rate-limit.ts`, pensados para CGNAT): cupom errado por IP, pedidos criados por conta, "me avise" por IP, transferências por conta, "esqueci a senha" por e-mail, upload por conta.

## 4. Experiência do comprador
**Marcos.** Detalhes, prints antes/depois e status em `ux-audit.md` (U-01 a U-32). Jornada executada 5 vezes no celular (390) e no desktop (1280): evento → tela cheia (data → setor → ingressos) → Seus dados → Pix de teste → confirmação → Meus ingressos; total e taxa conferidos em cada tela.

| ID | Grav. | Problema | Status |
|---|---|---|---|
| U-14 | P1 | Recarregar "Pedido confirmado" abria checkout novo (compra em dobro) | VALIDADO |
| U-28 | P1 | Sessão expirada no checkout: "Comprando como…" sem formulário de login | VALIDADO |
| U-17 | P2 | Pedido aberto ignorava a escolha nova (pedia 2, cobrava 1) → "Trocar pela escolha nova" | VALIDADO |
| U-30 | P2 | Cronômetro "Reservados por" e "reserva acabou" antes de existir reserva (urgência falsa) | VALIDADO |
| U-01 | P2 | "Até 6 por pessoa" × regra por tipo; "+" não travava → texto por tipo/por compra e "+" bloqueado com motivo | VALIDADO |
| U-15 | P2 | Meus ingressos destacava outro evento depois da compra | VALIDADO |
| U-26 | P2 | Busca sem tolerância a erro e sem gênero ("aurra", "funk" = 0) | VALIDADO |
| U-02 | P3 | Taxa por linha não fechava com o total; desktop mostrava total sem taxa | VALIDADO |
| U-03, U-16, U-21, U-22, U-32 | P3 | Datas/nomes cortados, "Esgotado"×"Encerrado", texto do limite repetido, filtros cortados | VALIDADO |
| U-04, U-06, U-11, U-13 | P3 | Botões com nomes diferentes, reabrir a compra, imagem quebrada, aviso a meia tela | VALIDADO |

Confiança: sem urgência falsa (cronômetro só com reserva real), taxa discriminada antes de pagar no celular e no desktop, aviso claro ao trocar de pedido ("nada é cobrado"), confirmação que não se repete. Pendente do dono: tela "Preparando seus ingressos" de 1,45 s em toda visita ao evento (DM-1).

**Técnico (Romano), rodada 2:** caixa "Quero receber novidades de <produtor>" (desmarcada) no fim de "Seus dados"; e2e do checkout marca a caixa e o pedido sai com o opt-in gravado (VALIDADO); emissão nova testada de ponta a ponta no navegador (pedidos #48933–#48936). Na compra em grupo, mensagens novas para quem tenta pagar 2 partes ou abrir 2 grupos.

**Técnico (Romano):** checkout ponta a ponta no navegador no modo de teste VALIDADO (2 ingressos, 1 enviado para outra pessoa, total com taxa correto, estoque e ingressos conferidos no banco); duas abas retomam o mesmo pedido em vez de disputar o lugar (VALIDADO); cronômetro "Reservados por" aparece antes de existir reserva (FALHOU, repassado ao Marcos).

## 5. Experiência do organizador
**Marcos.** Criação de evento executada até publicar 2 vezes (show, ingresso pago, cartaz e banner), mais 5 percursos parciais testando erros; painel inicial, painel do evento, equipe/portaria e app da portaria testados.
- Caminho do iniciante: 9 toques em "Continuar" + ~8 respostas + 2 imagens, com padrões bons (horário, lotação, meia e taxa prontas, "vendas abrem ao publicar") e revisão com nota e "!" no que falta. A trava mais pesada é exigir **duas** artes (DM-2).
- Corrigido: etapas do topo inalcançáveis no celular (U-23); foco no campo que falta, cidade repetida e "Na Tickets Win" na busca de local, botões e opções quebrando em 3 linhas na revisão, erro de proporção que exigia um tamanho exato (U-24); nome do evento numa coluna de 70 px no painel a 1280 (U-25); equipe da portaria com campos de 17 px, QR ilegível e "Desligar" sem confirmação (U-08 a U-10); faixa do painel sem a página atual (U-31); link e gráfico do painel do evento fora da tela (U-18).
- Portaria: mensagens grandes e específicas ("Ingresso não encontrado", "Este ingresso é de outro evento (nome)"), tela inteira vermelha/verde, sem câmera explica e oferece "Permitir câmera"; zoom de pinça liberado (antes bloqueado).
- Indicadores do painel: receita líquida, vendidos, pedidos e ticket médio com período (7/30 dias/tudo) e comparação; "Vendas líquidas de eventos futuros" explica quando o dinheiro fica disponível.
- Pendente: texto livre de cancelamento que pode contradizer a regra (DM-3, mitigado com "Observação do produtor"); criar conta de produtor do zero NÃO TESTADO (evitei conta nova); "Escrever com IA" NÃO TESTADO.

**Técnico (Romano):** editar evento com lotes já usados em pedidos não quebra mais; portaria pelo painel lendo QR por câmera VALIDADA com câmera falsa do Chromium.
**Rodada 2 (Romano):** portaria pela câmera com o QR real de ingressos de teste em 6 casos (válido → verde com o nome; já usado; outro evento; reembolsado; cancelado; adulterado), 13/13 ok, versionado em `tests/e2e/portaria-camera.e2e.mjs` (mensagens na tela com o Marcos). Configurações: trocar a conta de recebimento pede o código do app quando a conta tem app (VALIDADO no Chromium). Financeiro: somas no banco e tabela por evento paginada (25 por página).

## 6. Responsividade
**Marcos.** 38 rotas × 8 larguras (320×568, 375×667, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1920×1080) = 304 telas medidas (rolagem lateral, elementos fora da tela, alvos de toque, erros de JS), mais celular deitado (844×390). Só Chromium; Firefox e WebKit/Safari: BLOQUEADO.
- Corrigidos: rolagem lateral em `/eventos/*` (320) e `/painel/evento/[id]` (320–390); lista do Estado saindo da tela (/conta); etapas do criador cortadas; campos de 17 px e coluna de 65 px na equipe; nomes espremidos no painel a 1280; abas atuais fora da faixa no celular; textos cortados (data no topo da compra, ingresso da confirmação, filtros, placeholders). Botão de acessibilidade virou aba de 32×44 na borda (antes cobria listas, o "Continuar" do criador e o menu do painel).
- Depois das correções: nenhuma rota com rolagem lateral nas 8 larguras (revalidado nas telas afetadas). Reflow a 320 px equivale ao zoom de 400% em 1280 (WCAG 1.4.10).
- Em aberto (P3): pontos do carrossel da home com largura de toque < 24 px.


## 7. Performance (Romano)
Detalhes em `performance-report.md`. Rodada 2: financeiro e extrato do Banco deixaram de trazer todos os pedidos (soma no banco por evento/dia/valor; paridade centavo a centavo). JS da rota: `/entrar` 353 → 105 KB, `/cadastro` 358 → 110 KB, `/checkout` 449 → 201 KB, `/portaria` 234 → 107 KB (sem compressão). Página do evento 8–11% mais rápida no servidor (A/B no dev). Carga: não executada.

## 8. Testes (Romano, parte técnica)
| Tipo | Executados | Aprovados | Reprovados | Bloqueados |
|---|---|---|---|---|
| Unitários (vitest) | 27 | 27 | 0 | 0 |
| Integração no banco de teste (vitest) | 44 | 44 | 0 | 0 |
| E2E versionados (rodada 2): checkout com a caixa de novidades; portaria pela câmera | 6 + 13 passos | 19 | 0 | Firefox/WebKit: BLOQUEADO |
| Navegador (Playwright, Chromium) | 13 fluxos (checkout e2e ×2, duas abas, upload, cupom, login Google, login com e-mail inexistente, câmera da portaria, portaria offline, "me avise", prévia OG, CSV, Meus ingressos/PDF) | 12 | 1 (cronômetro, texto, com o Marcos) | Firefox/WebKit: BLOQUEADO (não instalados) |
| Navegador, UX (Marcos; Playwright, Chromium) | 304 telas (8 larguras) + axe em 76 + 21 jornadas/cenários (ver `test-matrix.md`) | 21 cenários aprovados ao fim (11 falharam antes e foram corrigidos) | 0 em aberto | leitor de tela real, Firefox/WebKit, câmera real: BLOQUEADO |
| Pagamento real com Stripe (cartão, 3D Secure, Pix real, webhook real) | 0 | — | — | BLOQUEADO (sem chave de teste no local) |

## 9. Arquivos modificados (Romano, principais)
- Regras e integridade: `src/lib/holds.ts`, `src/lib/tickets/{limits,code,qr}.ts`, `src/lib/payments/fulfill.ts`, `src/lib/criar/save.ts`, `src/lib/pricing.ts`.
- Ações de servidor: `src/lib/actions/{compra,checkout,tickets,painel,eventos,banco,grupo,auth,launch,senha}.ts`; removido `src/lib/actions/checkin-link.ts` (morto).
- Segurança: `src/lib/{rate-limit,signing-secret,image-sniff,csv,admin,bank,mfa,portaria,checkin,password-link}.ts`.
- Rotas/páginas: `src/app/api/{midia,admin/banner,og/evento/[slug]}/route.ts`, `src/app/api/ingressos/[code]/pdf/route.ts`, `src/app/eventos/[slug]/page.tsx`, `src/app/checkout/page.tsx`, `src/lib/data/events.ts`, `src/lib/wallet/pass-data.ts`.
- Performance (mudança mínima em componentes do Marcos, avisada no handoff): `src/lib/auth/client-lazy.ts` + 3 componentes de login, `src/components/checkin/use-qr-camera.ts`, 4 exportações CSV do painel.
- Rodada 2: `src/lib/payments/fulfill.ts` (transação), `src/lib/special.ts`, `src/lib/actions/{grupo,painel,compra}.ts`, `src/lib/mail/data.ts`, `src/lib/payments/pending.ts`, `src/lib/data/painel.ts` (`orderSums`), `src/lib/bank.ts`, `src/lib/help/articles.ts` (2 frases), `src/db/schema.ts` (`orders.producer_opt_in`), `src/app/painel/financeiro/page.tsx`, `src/app/checkout/page.tsx`; mínimo visual (avisado no handoff): `src/components/compra/compra-flow.tsx` (caixa), `src/components/painel/config.tsx` (campo do código), 1 regra em `compra.css` e 2 em `painel.css`; `package.json` (fflate 0.8.3, `test:e2e:portaria`). Testes novos: `tests/db/{fulfill-atomic,grupo,payout-destination,optin,finance-sums,order-rate}.test.ts`, `tests/unit/{password-throttle,admin-guard}.test.ts`, `tests/e2e/{portaria-camera.e2e,qr-y4m}.mjs`.
- Testes: `vitest.config.mts`, `tests/unit/*` (6), `tests/db/*` (9), `tests/e2e/checkout.e2e.mjs`; `package.json` (`test`, `test:watch`, `test:e2e`; vitest; node-forge 1.4.2; sem jspdf/html-to-image).

**Marcos (interface):** `src/components/evento/{buy-sheet,tickets-card,evento-view,lineup,organizer-card}.tsx`, `src/components/compra/compra-flow.tsx`, `src/components/ingressos/{meus-ingressos,ticket-stack}.tsx`, `src/components/criar/{flow,steps,steps-tk,shared}.tsx`, `src/components/painel/{checkin-links,evento,shell}.tsx`, `src/components/conta/{dados,shell}.tsx`, `src/components/{city-select,error-scroll,broken-images,event-card,back-to-top,site-header}.tsx`, `src/components/explorar/{filters,explorar-view}.tsx`, `src/components/ajuda/help-search.tsx`, `src/components/portaria/install.tsx`; estilos em `src/styles/{base,a11y,components,footer}.css` e `src/styles/pages/*.css` (contraste em 26 arquivos). Mudanças mínimas fora do meu território (avisadas no handoff): `src/app/layout.tsx` (BrokenImages), `src/app/checkout/page.tsx` (prop `wanted`), `src/app/eventos/[slug]/page.tsx` ("Observação do produtor"), `src/app/portaria/layout.tsx` (zoom), `src/app/painel/promoters/page.tsx` (aviso de lint). `@axe-core/playwright` como devDependency. `eslint src` agora sem avisos.

## 10. Pendências (Romano)
Decisões D-01 a D-07: status de cada uma em `pending-decisions.md` (D-01, D-03, D-04 aplicadas; D-02 e D-07 mantidas; D-05 fechada; D-06 sem efeito no nosso servidor, perguntar ao Neon). **Antes de publicar a rodada 2: aplicar na produção o SQL de "Schema para a produção"** (`ALTER TABLE orders ADD COLUMN IF NOT EXISTS producer_opt_in boolean;`). Técnicas: testar com a chave de teste da Stripe (cartão, 3D Secure, Pix, webhook fora de ordem) num ambiente autorizado; levar `orderSums` para o início do painel, público e marketing; CSP de scripts; Firefox/Safari (BLOQUEADO: a rede não baixa os navegadores); login Google/Apple no local (BLOQUEADO); carga (não executada: o dev local não é representativo e o login é o da produção); retenção de CPF/telefone (jurídico, D-03).

**Marcos:** decisões DM-1 (loader de 1,45 s no evento), DM-2 (exigir só o cartaz para publicar) e DM-3 (campo livre de cancelamento) em `pending-decisions.md`. Técnicas de UX em aberto (P3): foco de teclado nas tabelas roláveis do painel, barras do gráfico de vendas por teclado, largura de toque dos pontos do carrossel. Testar com leitor de tela real e Safari/Firefox num aparelho. Build final depois dos commits de interface desta madrugada: ver handoff.

## 11. Próximas prioridades (Romano)
1. Aplicar o SQL do schema na produção e publicar a rodada 2 (emissão em transação, D-01, D-03, D-04).
2. Perguntar ao Neon sobre o better-auth do Neon Auth hospedado (D-06).
3. Rodar o checkout com a chave de **teste** da Stripe num preview autorizado (cartão recusado, 3D Secure, Pix, webhook duplicado e fora de ordem); ao ligar a Stripe de verdade, rever D-07.
4. Mesmo padrão de transação (`db.batch` + `ensure`) no reembolso e no saque, que hoje usam update condicional + reconferência.
5. CSP de scripts e aviso de saída nos links de e-mail.

**Marcos (experiência):**
1. Decidir DM-2 (só o cartaz para publicar): maior ganho de ativação do produtor iniciante.
2. Decidir DM-1 (loader do evento): tira 1,45 s de espera na página que mais vende.
3. Teste com leitor de tela (VoiceOver no iPhone, TalkBack) e Safari real nas jornadas de compra e portaria.
4. Fechar os 3 P3 de acessibilidade do painel e da home.
5. Teste de usabilidade com 5 compradores e 3 produtores reais (gravação de tela) para medir o que a automação não mede: entendimento da taxa, do limite e da reserva.
