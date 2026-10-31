# Modelo de ameaças (STRIDE) — Tickets Win

Agente 06, depois da fase 2 (HEAD `52191a2` + testes do Agente 06). Cada linha diz a ameaça, o controle que existe **hoje** (com o arquivo), o risco que sobra e o achado ligado (`vulnerability-register.md`). S = falsificação de identidade · T = adulteração · R = repúdio · I = vazamento de informação · D = negação de serviço · E = elevação de privilégio.

Atores: anônimo, comprador, produtor (dono), equipe (admin/portaria), aparelho da portaria, central (admin da Tickets Win), sistema (cron, webhooks), terceiros (Stripe, Neon Auth, Resend, Apple, Google). Fronteiras de confiança: navegador ↔ Worker; Worker ↔ Neon Auth hospedado; Worker ↔ Postgres; Stripe/Neon → webhooks; aparelho da portaria ↔ Worker.

## 1. Autenticação (login, cadastro, sessão, 2FA, Apple/Google)

Ativos: contas, sessões, segundo fator. Entradas: ações `src/lib/actions/auth.ts`, `verificacao.ts`, `senha.ts`, `conta.ts`; proxy `src/app/api/auth/[...path]/route.ts`; `src/app/api/apple/*`.

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Teste de senhas vazadas | Turnstile + 5 tentativas por e-mail/15 min antes do Neon Auth (`src/lib/login-guard.ts`) | Turnstile falha aberto sem chaves; quem chama o Neon Auth hospedado direto não passa pelo nosso freio | SEC-300 (VALIDADO), SEC-312, SEC-403 |
| S | Chute do código de 2FA em paralelo | Tentativa reservada antes de comparar, contador atômico (`src/lib/attempts.ts`, `src/lib/mfa.ts`) | Anti-reuso do mesmo TOTP no KV não é atômico (limitado pelo contador) | SEC-301 (VALIDADO) |
| S | Forjar sessão/2FA com o segredo do login | Chaves por finalidade (`src/lib/signing-secret.ts`) | Até a rotação, o segredo atual (igual no desenvolvimento) abre tudo | SEC-200 (VALIDADO no código), SEC-204 |
| S | Pré-sequestro pela Apple (conta não confirmada) | Nenhum (vínculo pelo e-mail em `src/lib/auth/apple.ts`) | Conta inteira | SEC-002 (aberto) |
| T | Trocar o 2FA com sessão roubada | `startTotp` exige o fator atual (`src/lib/actions/conta.ts`) | Sessões abertas não são encerradas na troca | SEC-004 (VALIDADO) |
| R | Negar ter mudado senha/e-mail/2FA | `security_events` + aviso por e-mail (`logSecurity`) | Redefinir senha pelo link não registra | SEC-005, SEC-207 |
| I | Descobrir quais e-mails têm conta | Mesma resposta no login e na troca de e-mail (`conta.ts`), 10/dia | Cadastro ainda revela (padrão, com Turnstile) | SEC-309 (VALIDADO) |
| D | Travar o login de alguém | Trava curta (15 min), mesma mensagem | Quem sabe o e-mail trava a conta por 15 min | SEC-300 (residual) |
| E | Rotas do Neon Auth pelo nosso domínio sem Turnstile (código, link mágico, redefinir) | Lista de permissão (6 rotas) + freio na ativação + freio no webhook | O host do Neon Auth é público (aparece na volta do Google): as rotas dele seguem acessíveis direto | SEC-303/SEC-006 (VALIDADO), SEC-403 |
| E | Sessão "pendente de 2FA" usada como logada | `getSessionUser` trata pendente como deslogado (`src/lib/auth/server.ts`) | — | — |

## 2. Checkout e pagamento

Ativos: pedidos, estoque, cupons, valores. Entradas: `placeOrder`, `confirmPayment` (`src/lib/actions/compra.ts`), `payOrder` (`checkout.ts`), `payCard`/`checkPayment` (`pagamento.ts`).

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Pedido de outra conta | `ownOrder`/`userId` em toda ação | — | — |
| T | Preço, taxa, parcelas, quantidade do navegador | Tudo recalculado no servidor (`priceOrder`, `src/lib/pricing.ts`) | — | Prioridade 2 (VALIDADO) |
| T | "Já fiz o pagamento" sem pagar | `testPaymentsAllowed()` (`src/lib/payments/stripe.ts`) | Decide "produção" por `NEXT_PUBLIC_SITE_URL`, que o Next grava no build: build feito na pasta de desenvolvimento liga o modo de teste na produção | SEC-100 (VALIDADO), **SEC-402** |
| T | Cupom de 1 uso usado várias vezes | Uso segurado na reserva e conferido na emissão (`src/lib/payments/coupon.ts`) | Grupo/revenda não aceitam cupom | SEC-102 (VALIDADO) |
| I | Descobrir cupons (dicionário) | 20 erros/IP e 10/conta em 10 min, mensagem única | Rajada simultânea passa do limite; criação revela código de outra produtora | SEC-307, **SEC-400**, SEC-008 |
| D | Segurar estoque sem pagar | 3 eventos por conta, 1 pedido por CPF por evento, 12 pedidos/10 min | Contas e CPFs gerados em série; grupo de 60 min; fila reaproveitável | SEC-305 (parcial), SEC-306 |
| E | Vender acima da capacidade | Trava por tipo e conferência na emissão (`src/lib/holds.ts`, `src/lib/payments/fulfill.ts`), editor não reduz abaixo de vendidos+reservados | — | SEC-104, SEC-105 (VALIDADOS) |

## 3. Webhooks (Stripe e Neon Auth)

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Webhook forjado | Stripe: assinatura (`src/lib/payments/stripe.ts`); Neon: Ed25519 + JWKS + 5 min (`src/lib/auth/webhook.ts`) | — | — |
| T | PaymentIntent de outro valor/moeda/modo | `paidMatchesOrder`, `livemode` (`fulfill.ts`, `src/app/api/webhooks/stripe/route.ts`) | `payCard` emite sem passar o valor (PI criado pelo servidor) | SEC-101 (VALIDADO) |
| R | Falha de assinatura sem rastro | Log do console; `email_log` para o webhook do Neon | Log do Worker de poucos dias, sem alerta | SEC-207 |
| D | Repetição de evento | Dedupe no KV + emissão idempotente | — | — |
| D | Enxurrada de códigos/links por e-mail | Freio no webhook (1 a cada 10 s, 8/h por tipo e destinatário) (`src/app/api/webhooks/neon-auth/route.ts`) | Freio no KV (não atômico), suficiente para a cadência do Neon | SEC-303 |
| I | Chargeback ignorado | Nenhum | Ingresso contestado entra | SEC-107 |

## 4. Ingressos e QR

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Forjar QR | HMAC por ingresso com segredo do servidor, tempo constante (`src/lib/tickets/qr.ts`) | Segredo igual ao do login até a rotação | SEC-200 |
| T | Código antigo depois de transferência/revenda | Código e segredo trocados (`src/lib/actions/tickets.ts`, `fulfillResale`) | — | — |
| I | Baixar PDF/Wallet de outro | `holderUserId` em cada rota (`src/app/api/ingressos/[code]/*`) | Bucket R2 com PDFs não conferido | SEC-213 |
| I | Adivinhar código de ingresso | 40 bits | Mensagens diferentes em "cancelar meu ingresso" | SEC-316 |
| E | Ingresso sem pagamento | Só nasce na transação que marca pago (`fulfill.ts`) | Ver SEC-402 | Prioridade 1 |

## 5. Portaria

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Aparelho sem acesso | Cookie HMAC do id + acesso ligado + fim do evento (`src/lib/portaria.ts`) | — | — |
| S | Chutar o código de acesso | 8 erros/IP em 15 min, código de ~40 bits (`src/lib/actions/portaria.ts`) | Rajada simultânea passa do limite (40 de 40 conferidos no teste) | **SEC-400** |
| T | Reusar QR / dois operadores | Marcação condicional `status='valid'` (`src/lib/checkin.ts`) | — | Prioridade 4 (VALIDADO, inclusive no navegador) |
| T | Evento cancelado ou pedido não pago | Recusados (`checkin.ts`) | — | SEC-103 (VALIDADO) |
| E | Ex-admin continua com a portaria | Rotação de token/código ao remover/rebaixar admin (`src/lib/actions/painel.ts`) | A rotação reenvia o token novo para e-mails que o ex-admin cadastrou; aparelho que ele conectou continua | SEC-003 (**FALHOU**), **SEC-401** |
| I | Lista de titulares | Só com acesso ligado | Ex-admin (acima) | SEC-401 |

## 6. Painel do produtor e equipe

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| E | Equipe vira produtora sem aprovação | `producerStatus`/`canOnboard`/`ownProducer` (`src/lib/producer-apply.ts`) | Contas que já usaram o caminho (consulta D-SEC-03-4) | SEC-001 (VALIDADO) |
| E | Conta qualquer no painel/e-mail marketing | `painelAccess` + `isProducer` + e-mail confirmado (`src/lib/painel/access.ts`, `src/lib/actions/emails.ts`) | — | SEC-010, SEC-304 (VALIDADOS) |
| E | Convite aceito sozinho | Nenhum | Qualquer produtor põe qualquer conta na equipe | SEC-007 |
| E | Admin cancela o evento inteiro | Só portaria barrada | Sem separação de função | SEC-012 |
| I | Dados de outra produtora (IDs no navegador) | Todo id conferido no escopo do servidor (`getPainelScope`, `org-access.ts`) | — | Prioridade 3 (VALIDADO) |
| I | Público do e-mail revela compras no concorrente | `excludeBuyersOf` só de evento próprio (`src/lib/mail/data.ts`) | — | SEC-009/SEC-321 (VALIDADO) |
| R | Mudanças de equipe sem rastro | Nenhum | Não dá para saber quem entrou na equipe | SEC-207 |
| D | Custo de IA/Google | Só produtor confirmado, cota atômica por conta e teto da plataforma (`src/lib/ai-quota.ts`) | — | SEC-308/SEC-011 (VALIDADOS) |

## 7. Financeiro e saques (Banco Tickets Win)

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Entrar no banco de outro produtor | Senha própria (PBKDF2) + TOTP, cookie HMAC `SameSite=Strict` 30 min (`src/lib/bank.ts`, `src/lib/actions/banco.ts`) | Cookie sem estado vale até 30 min depois de sair | — |
| T | Saque acima do saldo / duplo | Trava por pessoa e conferência na transação | — | — |
| T | Trocar a conta de recebimento | TOTP (D-04) | — | — |
| I | Saldo de outra produtora | `bankScope` só da dona (`bank.ts`) | — | Prioridade 3 (`finance-isolation`, VALIDADO) |
| I | Venda de teste vira saldo | `TEST-…` fora do saldo (`bank.ts`) | — | — |
| D | Travar o banco do dono | 5 erros → 15 min | Terceiro trava e gera e-mails | SEC-315 |
| R | Repasse da revenda sem registro | Nenhum | Conciliação manual | SEC-106 |

## 8. Central admin (`/tw-central`)

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Conta comum vira central | E-mail na lista **e** no domínio `@ticketswin.com.br`, confirmado, TOTP para agir, 404 para os outros (`src/lib/admin.ts`, `src/lib/actions/admin.ts`) | Segredo único (forja de sessão + 2FA) até a rotação | SEC-200 |
| R | Ação sem rastro | `security_events` em toda ação | Sem alerta | SEC-207 |
| E | Upload da central | Exige sessão "secure" + tipo pelos bytes (`src/app/api/admin/banner/route.ts`) | — | — |

## 9. Uploads e mídia

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| T | Arquivo malicioso (SVG/HTML) | Tipo pelos bytes, sem SVG, 10 MB, nome do servidor (`src/app/api/midia/route.ts`); `nosniff` | `/midia` sem CSP de sandbox; arquivos antigos não conferidos | SEC-209 |
| D | Encher o R2 | 60/h por conta (KV, janela fixa) | Qualquer conta logada; corpo lido antes do limite; órfãos | SEC-313 |
| I | Ler PDFs de ingresso no bucket | `/midia` só serve `eventos/` e `destaques/` | Acesso público do bucket não conferido | SEC-213 |

## 10. E-mail (transacional, campanhas, webhooks do login)

| | Ameaça | Controle existente | Risco residual | Achado |
|---|---|---|---|---|
| S | Phishing pelo nosso domínio (teste de campanha) | Produtor confirmado + 5/h por campanha e 20/dia por conta | Produtor aprovado escreve o que quiser ao próprio público | SEC-304 (VALIDADO) |
| D | Enxurrada de códigos/links a terceiros | Freios nas ações (30 s, 6/h) e no webhook | Transferência, envio da compra, "me avise" e newsletter ainda disparam e-mail a terceiros | SEC-311, SEC-314, SEC-317 |
| I | Conteúdo HTML de produtor executando script | `cleanHtml`, iframe sandbox, CSP `script-src 'none'` em "ver no navegador" | — | — |
| R | Envio sem registro | `email_log` 30 dias, códigos mascarados | — | — |

## Dependências entre ameaças (cadeias)

1. **SEC-402 → Prioridade 1:** build de produção feito com `.env.local` + produção sem `STRIPE_SECRET_KEY` = modo de teste ligado sem decisão: ingresso pago de graça, que entra na portaria (SEC-103 não ajuda: o pedido fica "pago" com `TEST-…`).
2. **SEC-200 + SEC-204 + SEC-203:** quem tiver os arquivos de ambiente desta pasta tem o segredo do login e a senha do banco: forja de sessão e 2FA de qualquer conta (inclusive central), e leitura/escrita direta no banco com o papel dono (SEC-202).
3. **SEC-007 + (antes) SEC-001:** convite aceito sozinho deixava qualquer produtor "aprovar" contas. Com o SEC-001 corrigido, a cadeia está cortada; o SEC-007 sozinho é baixo.
4. **SEC-401 + SEC-003:** ex-admin mantém a portaria (marca ingressos de terceiros como usados, vê titulares) — negação de entrada a quem pagou no dia do evento.
5. **SEC-403 + SEC-300 + SEC-312:** se o Turnstile estiver sem chaves na produção e o Neon Auth hospedado for chamado direto, o único limite contra teste de senhas é o do Neon.
6. **SEC-002 + SEC-005:** conta pré-sequestrada pela Apple e "trocar a senha" que não expulsa sessões: a vítima não consegue tirar o atacante.
7. **SEC-012 + conta de admin comprometida:** cancelar o evento estorna todos os pedidos (dano operacional e reputacional, sem ganho financeiro para o atacante).
