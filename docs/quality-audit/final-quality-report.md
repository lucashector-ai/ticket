# Relatório final de qualidade · Tickets Win

Auditoria noturna de 30/10/2026, branch `claude/auditoria-noturna` (não publicado). Equipe: Romano (engenharia e segurança) e Marcos (UX). Cada seção diz quem escreveu.
Status usados: NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO.

## 1. Resumo executivo (Romano: engenharia)
A base é cuidadosa: emissão de ingressos idempotente, baixa de estoque atômica, estorno automático, webhook assinado, 2FA e banco com app autenticador. O que encontramos de mais sério estava nas bordas: **quem vendia ou transferia um ingresso ainda entrava no evento com o código antigo**, a **"reserva" de 15 minutos não segurava o lugar** (gente pagando o último ingresso e sendo estornada), **qualquer conta conseguia virar produtor sem aprovação** (via convite de equipe), **ex-membros da equipe mantinham a portaria** e **editar um evento podia quebrar no meio** ao apagar um tipo de ingresso. Tudo isso foi corrigido e coberto por testes. O projeto passou de zero testes para **52 testes automatizados** (unitários + integração no banco de teste), e as dependências vulneráveis de produção caíram de 47 avisos para 8 (os restantes dependem do SDK do Neon Auth, decisão D-06).
**Experiência (Marcos).** As jornadas principais funcionam de ponta a ponta no modo de teste (comprar, achar o ingresso, criar e publicar evento, operar a portaria), e os valores batem em todas as telas. Os problemas de experiência estavam em momentos de confiança e em telas pequenas: **recarregar "Pedido confirmado" abria um checkout novo com os mesmos itens** (risco de compra em dobro), **sessão expirada deixava a pessoa presa** no checkout, **um pedido aberto engolia em silêncio uma escolha nova** (pedia 2, cobrava 1), um **cronômetro de reserva aparecia antes de existir reserva**, o limite "por pessoa" dizia uma coisa e fazia outra, e havia rolagem lateral, textos cortados e etapas inalcançáveis entre 320 e 390 px. Também tratamos acessibilidade (contraste de mais de 500 textos, foco preso na tela de compra, nomes de links, zoom liberado na portaria). Foram **31 problemas de UX encontrados e corrigidos, todos revalidados no navegador** (2 P1, 14 P2, 15 P3); ficam 3 decisões para o dono (DM-1 a DM-3) e 3 ajustes P3 de acessibilidade em aberto.

Ficam para o dono: compra em grupo contornando o limite por pessoa (D-01), confirmação da reserva segurando estoque (D-02, aplicada e reversível), LGPD do e-mail marketing (D-03), app autenticador para trocar a conta de saque (D-04), SDK do login (D-06) e trava do modo de teste na produção (D-07).

## 2. Segurança (Romano)
Detalhes, reprodução e evidências em `security-audit.md`.

| ID | Grav. | Achado | Status |
|---|---|---|---|
| S-01 | P1 | Código do ingresso sobrevivia à transferência/revenda (vendedor entrava ditando o código) | VALIDADO |
| S-02 | P1 | Qualquer conta virava produtor sem aprovação (convite de equipe) | VALIDADO (integração) |
| S-03 | P1 | Excluir evento apagava pedidos com pagamento em andamento | VALIDADO (integração) |
| S-04 | P2 | Saque duplo simultâneo | VALIDADO (integração) |
| S-05 | P3 | Central admin sem exigir e-mail confirmado | CORRIGIDO, NÃO VALIDADO |
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
| S-23 | P3 | "Esqueci a senha" permitia encher a caixa de entrada de outra pessoa | CORRIGIDO, NÃO VALIDADO |
| S-09 | P1 | Grupo contorna o limite por pessoa | ABERTO (D-01) |
| S-10 | P2 | Conta de saque troca sem app autenticador | ABERTO (D-04) |
| S-17 | P1 | SDK do Neon Auth com better-auth 1.7.6 | ABERTO (D-06) |
| S-18 | P1 | Modo de teste liga sozinho sem chave da Stripe | ABERTO (D-07) |

Verificado sem problema: autorização de todas as páginas privadas e de cada ação de servidor lida (pedido, ingresso, PDF, carteira, painel por evento, reembolsos, banco, central); preço sempre recalculado no servidor; check-in com QR assinado e marcação única; webhooks com assinatura e deduplicação; sanitização do HTML do e-mail; redirecionamentos `next` seguros.

## 3. Engenharia (Romano)
- **Testes:** vitest instalado (`pnpm test`), 15 arquivos, 52 testes. Integração real no branch de teste do Neon com `TEST_DATABASE_URL` (pulados sem a variável). Cobrem preço/taxa/cupom/meia/parcelas, limites, concorrência de estoque (10 pelos últimos 2, dois pelo último, confirmação repetida), reserva, evento cancelado, troca de dono do ingresso, portaria (QR adulterado, outro evento, dois operadores), XSS do e-mail, upload e assinatura da Wallet. Conferido que os testes da troca de código, da aprovação de produtor, do saque duplo e da reserva simultânea **falham sem a correção**. Também cobrem permissões do painel (equipe, portaria, excluir evento) e a edição de lotes.
- **Regras num lugar só:** `lib/tickets/limits.ts` (limites usados pela tela e pelo servidor), `lib/tickets/code.ts`, `lib/holds.ts` (vagas seguradas + reconferência), `lib/rate-limit.ts`, `lib/signing-secret.ts`, `lib/image-sniff.ts`.
- **Código morto/legado:** `createOrder`/`validateCoupon` removidos; `payOrder` usa a emissão única; dependências sem uso removidas.
- **Arquitetura:** o driver `neon-http` não tem transação; onde havia corrida sem proteção (reserva, saque, edição de lotes) usamos update condicional + reconferência. Recomendação estrutural em `architecture-review.md`.
- **Build:** `opennextjs-cloudflare build` verde depois de cada bloco (8 builds na cópia `ticket-build`, o último no fim da noite). `tsc --noEmit` sem erros; `eslint src tests` sem erros (3 avisos antigos em arquivos de interface: variável sem uso em `painel/promoters/page.tsx` e `criar/steps-tk.tsx`, `window.location.assign` em `compra-flow.tsx`).
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

**Técnico (Romano):** checkout ponta a ponta no navegador no modo de teste VALIDADO (2 ingressos, 1 enviado para outra pessoa, total com taxa correto, estoque e ingressos conferidos no banco); duas abas retomam o mesmo pedido em vez de disputar o lugar (VALIDADO); cronômetro "Reservados por" aparece antes de existir reserva (FALHOU, repassado ao Marcos).

## 5. Experiência do organizador
**Marcos.** Criação de evento executada até publicar 2 vezes (show, ingresso pago, cartaz e banner), mais 5 percursos parciais testando erros; painel inicial, painel do evento, equipe/portaria e app da portaria testados.
- Caminho do iniciante: 9 toques em "Continuar" + ~8 respostas + 2 imagens, com padrões bons (horário, lotação, meia e taxa prontas, "vendas abrem ao publicar") e revisão com nota e "!" no que falta. A trava mais pesada é exigir **duas** artes (DM-2).
- Corrigido: etapas do topo inalcançáveis no celular (U-23); foco no campo que falta, cidade repetida e "Na Tickets Win" na busca de local, botões e opções quebrando em 3 linhas na revisão, erro de proporção que exigia um tamanho exato (U-24); nome do evento numa coluna de 70 px no painel a 1280 (U-25); equipe da portaria com campos de 17 px, QR ilegível e "Desligar" sem confirmação (U-08 a U-10); faixa do painel sem a página atual (U-31); link e gráfico do painel do evento fora da tela (U-18).
- Portaria: mensagens grandes e específicas ("Ingresso não encontrado", "Este ingresso é de outro evento (nome)"), tela inteira vermelha/verde, sem câmera explica e oferece "Permitir câmera"; zoom de pinça liberado (antes bloqueado).
- Indicadores do painel: receita líquida, vendidos, pedidos e ticket médio com período (7/30 dias/tudo) e comparação; "Vendas líquidas de eventos futuros" explica quando o dinheiro fica disponível.
- Pendente: texto livre de cancelamento que pode contradizer a regra (DM-3, mitigado com "Observação do produtor"); criar conta de produtor do zero NÃO TESTADO (evitei conta nova); "Escrever com IA" NÃO TESTADO.

**Técnico (Romano):** editar evento com lotes já usados em pedidos não quebra mais; portaria pelo painel lendo QR por câmera VALIDADA com câmera falsa do Chromium.

## 6. Responsividade
**Marcos.** 38 rotas × 8 larguras (320×568, 375×667, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1920×1080) = 304 telas medidas (rolagem lateral, elementos fora da tela, alvos de toque, erros de JS), mais celular deitado (844×390). Só Chromium; Firefox e WebKit/Safari: BLOQUEADO.
- Corrigidos: rolagem lateral em `/eventos/*` (320) e `/painel/evento/[id]` (320–390); lista do Estado saindo da tela (/conta); etapas do criador cortadas; campos de 17 px e coluna de 65 px na equipe; nomes espremidos no painel a 1280; abas atuais fora da faixa no celular; textos cortados (data no topo da compra, ingresso da confirmação, filtros, placeholders). Botão de acessibilidade virou aba de 32×44 na borda (antes cobria listas, o "Continuar" do criador e o menu do painel).
- Depois das correções: nenhuma rota com rolagem lateral nas 8 larguras (revalidado nas telas afetadas). Reflow a 320 px equivale ao zoom de 400% em 1280 (WCAG 1.4.10).
- Em aberto (P3): pontos do carrossel da home com largura de toque < 24 px.


## 7. Performance (Romano)
Detalhes em `performance-report.md`. JS da rota: `/entrar` 353 → 105 KB, `/cadastro` 358 → 110 KB, `/checkout` 449 → 201 KB, `/portaria` 234 → 107 KB (sem compressão). Página do evento 8–11% mais rápida no servidor (A/B no dev). Carga: não executada.

## 8. Testes (Romano, parte técnica)
| Tipo | Executados | Aprovados | Reprovados | Bloqueados |
|---|---|---|---|---|
| Unitários (vitest) | 21 | 21 | 0 | 0 |
| Integração no banco de teste (vitest) | 31 | 31 | 0 | 0 |
| Navegador (Playwright, Chromium) | 13 fluxos (checkout e2e ×2, duas abas, upload, cupom, login Google, login com e-mail inexistente, câmera da portaria, portaria offline, "me avise", prévia OG, CSV, Meus ingressos/PDF) | 12 | 1 (cronômetro, texto, com o Marcos) | Firefox/WebKit: BLOQUEADO (não instalados) |
| Navegador, UX (Marcos; Playwright, Chromium) | 304 telas (8 larguras) + axe em 76 + 21 jornadas/cenários (ver `test-matrix.md`) | 21 cenários aprovados ao fim (11 falharam antes e foram corrigidos) | 0 em aberto | leitor de tela real, Firefox/WebKit, câmera real: BLOQUEADO |
| Pagamento real com Stripe (cartão, 3D Secure, Pix real, webhook real) | 0 | — | — | BLOQUEADO (sem chave de teste no local) |

## 9. Arquivos modificados (Romano, principais)
- Regras e integridade: `src/lib/holds.ts`, `src/lib/tickets/{limits,code,qr}.ts`, `src/lib/payments/fulfill.ts`, `src/lib/criar/save.ts`, `src/lib/pricing.ts`.
- Ações de servidor: `src/lib/actions/{compra,checkout,tickets,painel,eventos,banco,grupo,auth,launch,senha}.ts`; removido `src/lib/actions/checkin-link.ts` (morto).
- Segurança: `src/lib/{rate-limit,signing-secret,image-sniff,csv,admin,bank,mfa,portaria,checkin,password-link}.ts`.
- Rotas/páginas: `src/app/api/{midia,admin/banner,og/evento/[slug]}/route.ts`, `src/app/api/ingressos/[code]/pdf/route.ts`, `src/app/eventos/[slug]/page.tsx`, `src/app/checkout/page.tsx`, `src/lib/data/events.ts`, `src/lib/wallet/pass-data.ts`.
- Performance (mudança mínima em componentes do Marcos, avisada no handoff): `src/lib/auth/client-lazy.ts` + 3 componentes de login, `src/components/checkin/use-qr-camera.ts`, 4 exportações CSV do painel.
- Testes: `vitest.config.mts`, `tests/unit/*` (6), `tests/db/*` (9), `tests/e2e/checkout.e2e.mjs`; `package.json` (`test`, `test:watch`, `test:e2e`; vitest; node-forge 1.4.2; sem jspdf/html-to-image).

**Marcos (interface):** `src/components/evento/{buy-sheet,tickets-card,evento-view,lineup,organizer-card}.tsx`, `src/components/compra/compra-flow.tsx`, `src/components/ingressos/{meus-ingressos,ticket-stack}.tsx`, `src/components/criar/{flow,steps,steps-tk,shared}.tsx`, `src/components/painel/{checkin-links,evento,shell}.tsx`, `src/components/conta/{dados,shell}.tsx`, `src/components/{city-select,error-scroll,broken-images,event-card,back-to-top,site-header}.tsx`, `src/components/explorar/{filters,explorar-view}.tsx`, `src/components/ajuda/help-search.tsx`, `src/components/portaria/install.tsx`; estilos em `src/styles/{base,a11y,components,footer}.css` e `src/styles/pages/*.css` (contraste em 26 arquivos). Mudanças mínimas fora do meu território (avisadas no handoff): `src/app/layout.tsx` (BrokenImages), `src/app/checkout/page.tsx` (prop `wanted`), `src/app/eventos/[slug]/page.tsx` ("Observação do produtor"), `src/app/portaria/layout.tsx` (zoom), `src/app/painel/promoters/page.tsx` (aviso de lint). `@axe-core/playwright` como devDependency. `eslint src` agora sem avisos.

## 10. Pendências (Romano)
Decisões D-01 a D-07 em `pending-decisions.md`. Técnicas: testar com a chave de teste da Stripe (cartão, 3D Secure, Pix, webhook fora de ordem) num ambiente autorizado; agregar o financeiro no SQL; limite por pessoa entre contas com o mesmo CPF confirmando ao mesmo tempo (P2); CSP de scripts.

**Marcos:** decisões DM-1 (loader de 1,45 s no evento), DM-2 (exigir só o cartaz para publicar) e DM-3 (campo livre de cancelamento) em `pending-decisions.md`. Técnicas de UX em aberto (P3): foco de teclado nas tabelas roláveis do painel, barras do gráfico de vendas por teclado, largura de toque dos pontos do carrossel. Testar com leitor de tela real e Safari/Firefox num aparelho. Build final depois dos commits de interface desta madrugada: ver handoff.

## 11. Próximas prioridades (Romano)
1. Decidir D-01, D-06 e D-07 (risco de dinheiro e de login).
2. Rodar o checkout com a chave de **teste** da Stripe num preview autorizado (cartão recusado, 3D Secure, Pix, webhook duplicado e fora de ordem).
3. Transações nas operações financeiras (driver com WebSocket ou funções SQL).
4. Financeiro agregado no banco e paginação do painel para produtores grandes.
5. CSP de scripts e aviso de saída nos links de e-mail.

**Marcos (experiência):**
1. Decidir DM-2 (só o cartaz para publicar): maior ganho de ativação do produtor iniciante.
2. Decidir DM-1 (loader do evento): tira 1,45 s de espera na página que mais vende.
3. Teste com leitor de tela (VoiceOver no iPhone, TalkBack) e Safari real nas jornadas de compra e portaria.
4. Fechar os 3 P3 de acessibilidade do painel e da home.
5. Teste de usabilidade com 5 compradores e 3 produtores reais (gravação de tela) para medir o que a automação não mede: entendimento da taxa, do limite e da reserva.
