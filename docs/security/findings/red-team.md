# Achados do Red Team (Agente 01) — SEC-001 a SEC-099

Fase 1 da operação de segurança. Escopo e regras: `docs/security/MISSAO-SEGURANCA.md`. Mapa das superfícies: `docs/security/attack-surface.md`.

**Como foi feito.** Leitura do código do branch `claude/auditoria-noturna` (base `2865fda`), conferência das correções S-01…S-37 de `docs/quality-audit/security-audit.md` e reprodução controlada com testes de banco (sessão simulada, contas fictícias `qa-test-…@example.com`, banco de teste `teste-r5`). Nenhum login real, nenhuma conta nova no Neon Auth, nenhum pedido a terceiros (Neon Auth, Apple, Google, Stripe, Resend). Nenhum código de produção (`src/**`) foi alterado.

**Reprodução:** `tests/db/sec-red-team.test.ts` (4 testes `it.fails`: afirmam o comportamento seguro e hoje falham porque a falha existe). Rodar:
`TEST_DATABASE_URL="$(cat $S/.dburl)" pnpm exec vitest run tests/db/sec-red-team.test.ts --reporter=verbose --disableConsoleIntercept`
Saída sanitizada guardada em `$S/sec/red-team/run2.txt`. Depois da correção, cada `it.fails` passa a acusar erro e deve virar `it` (fica como regressão). Banco conferido limpo depois da rodada (`$S/sec/red-team/leftovers.mjs`: 0 produtoras, 0 eventos `qa-test-` sobrando).

Status usados: Hipótese · Confirmada · Em correção · Corrigida · Validada · Bloqueada (registro do prompt, seção 26), com o status de teste da missão entre parênteses.

## Resumo

| ID | Sev. | Título | Status | Encaminhar |
|---|---|---|---|---|
| SEC-001 | **P1** | Conta da equipe (portaria/admin) conclui o "cadastro do produtor aprovado" e vira produtora sem aprovação da central | CORRIGIDO, NÃO VALIDADO (`9c8f713`) | AppSec |
| SEC-002 | P2 | Login com Apple assume conta criada por outra pessoa com o mesmo e-mail (não confirmada) e a marca como confirmada; a senha de quem criou continua valendo | Hipótese forte (código; NÃO TESTADO: Apple é terceiro) | AppSec + decisão do dono |
| SEC-003 | P2 | Admin removido da equipe continua com todos os acessos de portaria que via no painel (token e código não mudam) | CORRIGIDO, NÃO VALIDADO (`708a8ce`) | AppSec |
| SEC-004 | P2 | Sessão com 2FA por e-mail cadastra um app autenticador novo sem o código do e-mail (sessão roubada vira tomada da conta) | CORRIGIDO, NÃO VALIDADO (`458fad2`) | AppSec |
| SEC-005 | P2 | "Criar nova senha" pelo link não encerra as outras sessões (o comentário diz que encerra) | Hipótese (NÃO TESTADO: depende da configuração do Neon Auth, que é o da produção) | AppSec |
| SEC-006 | P3 | `/api/auth/*` repassa ao Neon Auth endpoints que o site não usa (envio de código, redefinição de senha, link mágico) sem Turnstile nem o freio do site | CORRIGIDO, NÃO VALIDADO (`3ea2589`) | AppSec / Agente 05 |
| SEC-007 | P3 | Convite de equipe é aceito sozinho: qualquer produtor põe qualquer conta confirmada na equipe dele, sem a pessoa aceitar | Confirmada (código + testes existentes) | decisão de produto + AppSec |
| SEC-008 | P3 | Oráculo de cupons entre produtoras: criar cupom/evento responde "esse código já existe" para código de outro evento, sem limite | PARCIAL: checkout CORRIGIDO, NÃO VALIDADO; criação aberta (schema, D-SEC-03-3) (`98bb01c`) | AppSec |
| SEC-009 | P3 | Público do e-mail marketing: "excluir quem comprou o evento X" aceita evento de outra produtora (descobre se um contato comprou no concorrente) | CORRIGIDO, NÃO VALIDADO (`87cc3f3`) | AppSec |
| SEC-010 | P3 | Painel e e-mail marketing abertos a qualquer conta logada sem ser produtora (papel "dono" por padrão) | CORRIGIDO, NÃO VALIDADO (`b92e206`) | AppSec |
| SEC-011 | P3 | Recursos pagos para qualquer conta logada: IA de descrição e de mapa (cota por conta) e detalhes do Google Places (`pickPlace`, sem cota) | CORRIGIDO, NÃO VALIDADO (`a86a911`) | Agente 05 |
| SEC-012 | P3 | Admin da equipe cancela o evento inteiro (estorno de todos os pedidos) e estorna pedidos: sem separação de função em relação ao dono | Confirmada por código (pode ser decisão de produto) | decisão do dono |

**Por severidade:** P0: 0 · P1: 1 · P2: 4 · P3: 7.

Nenhum P0 confirmado. O SEC-001 foi classificado como P1 pelo mesmo critério das S-02 e S-34 (mesma classe: virar produtor sem aprovação).

---

## Matriz de permissões (conferida no servidor)

Legenda: ✅ permitido e conferido · ❌ recusado no servidor · ⚠️ permitido com ressalva (achado) · — não se aplica.

| Recurso / operação | Anônimo | Comprador | Portaria (equipe) | Admin (equipe) | Dono | Central | Onde é conferido |
|---|---|---|---|---|---|---|---|
| Ver evento publicado | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | `src/app/eventos/[slug]/page.tsx:163` |
| Ver prévia de rascunho | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | `canEditEvent` (`src/lib/data/org-access.ts:62-66`) |
| Criar evento | ❌ | ❌ (sem aprovação) | ❌ (`PORTARIA_ONLY`) **⚠️ SEC-001** | ✅ na produtora da dona | ✅ | — | `src/lib/actions/criar.ts:15-21`, `src/lib/criar/save.ts:277-283` |
| Editar evento | ❌ | ❌ | ❌ | ✅ | ✅ | — | `src/lib/criar/save.ts:239-245` |
| Excluir evento (sem venda) | ❌ | ❌ | ❌ | ✅ | ✅ | — | `src/lib/actions/eventos.ts:21-23` |
| Cancelar evento / estornar pedido | ❌ | ❌ | ❌ | ✅ **⚠️ SEC-012** | ✅ | — | `src/lib/actions/reembolsos.ts:29-36` |
| Ver compradores (nome, e-mail) e participantes | ❌ | ❌ | ❌ | ✅ | ✅ | — | `painelAccess("admin")`, `getPainelScope` |
| Ver CPF de comprador | ❌ | só o próprio | ❌ | ❌ | ❌ | ❌ | CPF só em `src/app/conta/**`, `checkout` e `orderDetail(id, userId)` |
| Cupons do evento | ❌ | ❌ | ❌ | ✅ **⚠️ SEC-008** | ✅ | — | `src/lib/actions/painel.ts:119-147` |
| Lista free: montar / liberar entrada | ❌ | ❌ | só liberar | ✅ | ✅ | — | `src/lib/actions/lista.ts:28-35` |
| Links da portaria (criar/ver/revogar) | ❌ | ❌ | ❌ | ✅ **⚠️ SEC-003** | ✅ | — | `src/lib/actions/painel.ts:60-106`, `src/app/painel/equipe/page.tsx:19-21` |
| Check-in (painel e app) | ❌ | ❌ | ✅ | ✅ | ✅ | — | `src/lib/actions/painel.ts:37-42`, `src/app/api/checkin/route.ts:6-20` |
| Equipe (convidar, papel, remover) | ❌ | ❌ | ❌ | ❌ | ✅ **⚠️ SEC-007** | — | `scope("owner")` + `isProducer` (`src/lib/actions/painel.ts:24-33`) |
| Configurações / conta de recebimento | ❌ | ❌ | ❌ | ❌ | ✅ (TOTP para trocar o destino, D-04) | — | `src/lib/actions/painel.ts:218-237` |
| Banco (saldo, saque) | ❌ | ❌ | ❌ | ❌ | ✅ senha do banco + TOTP | — | `bankScope` só produtora de que é dona (`src/lib/bank.ts:37-48`), `src/lib/actions/banco.ts:146-177` |
| E-mail marketing | ❌ | ⚠️ SEC-010 | ❌ | ✅ | ✅ | — | `src/lib/actions/emails.ts:23-36` |
| Parceiros (promoters) | ❌ | ❌ | ❌ | ✅ | ✅ | — | `src/lib/actions/promoters.ts:15-20` |
| Perfil público da produtora, posts, respostas | ❌ | ❌ | ❌ | ❌ | ✅ | — | `ownOrganizer` (`src/lib/actions/produtor.ts:16-21`) |
| Trocar produtora ativa (cookie `tw_org`) | — | só entre as próprias | só entre as próprias | só entre as próprias | só entre as próprias | — | `pickActive` (`src/lib/data/org-access.ts:49-51`), `src/lib/actions/produtoras.ts:32-41` |
| Pedido / ingresso / PDF / Wallet / ICS | ❌ | só o titular/dono | — | — | — | — | `holderUserId`/`userId` em cada rota |
| Transferência: aceitar | ❌ | só a conta do e-mail de destino, confirmada | — | — | — | — | `src/lib/actions/tickets.ts:112-116` |
| Cartões salvos | ❌ | só os do próprio cliente Stripe | — | — | — | — | `src/lib/actions/cartoes.ts:36,56` |
| Central: inscrições, saques, destaques, liberar produtor | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (e-mail do domínio + confirmado + TOTP) | `src/lib/admin.ts:19-35`, `src/lib/actions/admin.ts:17-22` |

Tentativas de escalonamento conferidas e barradas: cookie `tw_org` com id de outra produtora (S-35); admin tentando equipe/configurações/banco (S-34, `tests/db/team.test.ts`); portaria criando evento (S-34); conta qualquer convidando equipe (S-02); ids de outra produtora em cupom, link de portaria, lista, campanha, parceiro, anúncio da revenda, reembolso e pedido (todas conferem `s.events`/`org.id`/`userId` no servidor, ver "Verificado e OK"). Mass assignment: nenhuma ação grava `organizerId`, `ownerUserId`, `role`, `status`, `sold`, `price` de pedido ou `userId` vindos do navegador; `saveEventAs` só reaproveita ids de sessões/tipos que já são do evento (`src/lib/criar/save.ts:250-253`), e a produtora do evento vem da edição ou da produtora ativa (`:277-283`).

---

## SEC-001 · Conta da equipe vira produtora sem aprovação da central

- **Identificador:** SEC-001
- **Título:** Membro da equipe (portaria ou admin) conclui o "cadastro do produtor aprovado" e passa a ter produtora própria, com eventos vendáveis, sem inscrição nem aprovação.
- **Severidade:** P1 (contorno da aprovação de produtor; mesma classe e mesma nota de S-02 e S-34).
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `9c8f713`, ver `docs/security/security-fixes.md`. Antes: Confirmada (teste de banco; status de teste: FALHOU no comportamento seguro).
- **Componente:** cadastro de produtor / autorização de função.
- **Localização:** `src/lib/actions/onboarding.ts:46-71` (`finishOnboarding`, condição na linha 50); `src/app/produtores/cadastro/page.tsx:19-21`; causa em `src/lib/producer-apply.ts:26-30` (`producerStatus`) e `src/lib/data/producer.ts:13-23` (`isProducer`).
- **Descrição:** `finishOnboarding` aceita `status === "approved"` **ou** `"producer"`. `producerStatus` devolve `"producer"` sempre que `isProducer(user)` é verdadeiro, e `isProducer` é verdadeiro para quem tem **qualquer** linha em `organizer_members` (admin ou portaria; inclusive convite pendente para o e-mail confirmado). A página `/produtores/cadastro` usa a mesma regra e abre o formulário para a portaria. Concluído o cadastro, a conta passa a ser dona de uma produtora com `onboarding` preenchido, que é exatamente o que a aprovação da central concede. Depois disso, `saveEvent` aceita evento novo e `saveEventAs` grava na produtora própria (a primeira da lista, papel dono). Sair (ou ser removida) da equipe não desfaz nada.
- **Impacto:** a aprovação de produtor (o filtro de quem recebe dinheiro e responde por pedidos) deixa de valer para qualquer pessoa que um produtor coloque na equipe, inclusive a portaria contratada para uma noite. Combinado com SEC-007 (convite aceito sozinho), um produtor aprovado pode "aprovar" quantas contas quiser, inclusive contas recusadas pela central. A conta nova ganha também saldo e Banco próprios.
- **Causa-raiz:** "é produtor" (`isProducer`, pensada para mostrar o menu Painel) foi reutilizada como "foi aprovado para ter produtora própria". A S-34 fechou a criação de evento pela portaria, mas não o cadastro da produtora.
- **Evidência (sanitizada):** `tests/db/sec-red-team.test.ts`, teste SEC-001:
  `{"statusAntes":"producer","cadastro":true,"produtoraPropriaComCadastro":true,"statusDepoisDeSair":"producer","eventoCriado":true,"eventoNaProdutoraPropria":true}` — a conta foi convidada como **portaria**, concluiu o cadastro, foi removida da equipe e ainda criou evento na produtora própria.
- **Correção recomendada (na causa):** separar as duas perguntas. Em `finishOnboarding` e em `/produtores/cadastro`, liberar só quem (a) tem inscrição `approved` (ou liberação da central, `grantProducer`) ou (b) já é dona de uma produtora com `onboarding` (produtor antigo atualizando o cadastro). Sugestão: função `canOnboard(user)` em `src/lib/producer-apply.ts` com essas duas regras, usada nos dois lugares; `producerStatus` deve devolver `"producer"` só para dona com cadastro ou criadora de evento (sem equipe), e a equipe ganha um estado próprio (ex.: `"team"`) que abre o painel mas não o cadastro. Revisar também o uso de `producerStatus === "producer"` em `src/lib/actions/criar.ts:19` (evento novo): hoje vale para equipe, e a portaria só é barrada depois, em `saveEventAs`.
- **Teste de regressão proposto:** `tests/db/sec-red-team.test.ts` › "SEC-001" (trocar `it.fails` por `it` depois da correção). Casos extras: admin da equipe também recusado; produtor antigo com produtora e cadastro continua conseguindo atualizar; inscrição aprovada continua conseguindo concluir.
- **Validação:** pendente (Agente 06).
- **Risco residual:** contas que já usaram o caminho precisam ser conferidas no banco de produção (produtoras com `onboarding` cuja dona não tem inscrição aprovada nem liberação da central) — consulta só de leitura, com o dono.
- **Arquivos modificados:** nenhum código de produção; teste novo `tests/db/sec-red-team.test.ts`.

## SEC-002 · Login com Apple assume conta não confirmada criada por outra pessoa

- **Identificador:** SEC-002
- **Título:** "Pré-sequestro" de conta: quem cria antes uma conta com senha usando o e-mail da vítima mantém o acesso depois que a vítima entra com a Apple.
- **Severidade:** P2 (exige que o atacante crie a conta antes e que a vítima use a Apple com o mesmo e-mail, sem "ocultar meu e-mail"; impacto é a conta inteira).
- **Status:** Hipótese forte, confirmada por leitura de código; NÃO TESTADO de ponta a ponta (exige login real na Apple e no Neon Auth, fora do escopo).
- **Componente:** autenticação (Apple OIDC próprio).
- **Localização:** `src/lib/auth/apple.ts:144-175` (`completeAppleSignIn`): conta existente achada pelo e-mail (`:146-148`), entrada por OTP (`:155-163`), e `emailVerified = true` (`:170`).
- **Descrição:** o cadastro com senha funciona antes da confirmação do e-mail (`src/lib/actions/auth.ts:57-73`, "A conta já funciona antes de confirmar"). Um atacante cria a conta `vitima@…` com uma senha dele (passa pelo Turnstile normalmente). A vítima nunca digita o código de ativação. Quando ela entra com a Apple (e-mail confirmado pela Apple), `completeAppleSignIn` encontra a conta existente, entra nela e grava `emailVerified = true`, sem conferir se a conta tinha senha criada por outra pessoa e sem encerrar as sessões existentes. A vítima passa a usar a conta (compras, CPF, endereço, talvez virar produtora). O atacante continua entrando com a senha que criou (e com a sessão que já tinha).
- **Impacto:** acesso total e persistente à conta da vítima (ingressos, dados pessoais, transferências; se a vítima virar produtora, painel e dados de compradores). O e-mail confirmado ainda dá à conta do atacante os direitos que dependem de confirmação (aceitar ingresso enviado, entrar em equipe, inscrição de produtor).
- **Causa-raiz:** vínculo implícito por e-mail com uma conta cuja posse do e-mail nunca foi provada, promovendo-a a "confirmada" sem neutralizar as credenciais anteriores. O mesmo vale, possivelmente, para o Google pelo Neon Auth (vínculo implícito do better-auth): NÃO TESTADO, depende da configuração do Neon.
- **Evidência (sanitizada):** leitura de código (linhas acima). Sem execução: criar conta no Neon Auth e entrar com a Apple são proibidos pela missão.
- **Correção recomendada:** em `completeAppleSignIn`, quando a conta existente **não** está confirmada: (1) não confiar na senha anterior — trocar a senha por uma aleatória (ou apagar a credencial) e encerrar todas as sessões da conta antes de criar a nova; ou (2) recusar o vínculo e pedir "Esqueci a senha"/ativação primeiro. Registrar em `security_events` e avisar por e-mail. Pedir ao Neon (ou conferir no console) se o vínculo do Google faz o mesmo e, se fizer, aplicar a mesma regra num gancho `user.created`/primeiro login.
- **Teste de regressão proposto:** teste de unidade de `completeAppleSignIn` com o Neon Auth simulado: conta existente não confirmada com credencial → depois do login com Apple, a senha antiga não vale e as outras sessões foram revogadas.
- **Validação:** pendente.
- **Risco residual:** contas já vinculadas assim não são detectáveis só pelo nosso banco (o login fica no Neon Auth).
- **Arquivos modificados:** nenhum.

## SEC-003 · Ex-admin mantém os acessos da portaria que via no painel

- **Identificador:** SEC-003
- **Título:** Remover um admin da equipe não troca token nem código dos acessos de portaria que ele via; com qualquer um deles ele continua entrando no app da portaria.
- **Severidade:** P2 (exige ter sido admin; impacto: marcar ingressos como usados — quem pagou é barrado com "Ingresso já utilizado" — e ver o nome de todos os titulares, até um dia depois do fim do evento).
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `708a8ce`, ver `docs/security/security-fixes.md`. Antes: Confirmada (teste de banco).
- **Componente:** equipe / portaria.
- **Localização:** tela Equipe entrega token e código de todos os acessos ativos a dono **e admin** (`src/app/painel/equipe/page.tsx:19-21`, `:35`); `removeMember` só revoga os acessos pessoais criados pelo próprio removido (`src/lib/actions/painel.ts:177-197`); `activeAccess` aceita token ou código enquanto o acesso não for revogado (`src/lib/portaria.ts:50-59`).
- **Descrição:** a S-06 cobriu o acesso pessoal do ex-membro. Mas o admin vê (e pode copiar) token e código de todos os acessos dos próximos eventos, inclusive os criados pela dona para a equipe da porta. Depois da remoção esses valores continuam iguais e válidos. Ele também pode, antes de sair, criar acessos com qualquer rótulo e e-mail, que não batem com a regra de revogação.
- **Impacto:** ex-admin (demitido, em conflito) abre o app da portaria e: marca ingressos de terceiros como usados (negação de entrada a quem pagou), libera nomes da lista free, consulta a lista de titulares.
- **Causa-raiz:** segredo compartilhado (token/código) visível a um papel revogável, sem rotação quando o papel é revogado.
- **Evidência (sanitizada):** teste SEC-003: `{"adminViaOEvento":true,"tokenAindaAbre":true,"codigoAindaAbre":true}`.
- **Correção recomendada:** em `removeMember` de um admin, gerar **token e código novos** para todos os acessos ativos dos eventos da produtora (o cookie `tw_portaria` dos aparelhos já conectados guarda só o id do acesso, então a porta continua funcionando) e revogar os acessos criados pelo removido (`createdByUserId`), não só os pessoais; mostrar à dona o que foi trocado. Alternativa mais forte: o painel deixa de mostrar o token puro (só "enviar por e-mail"/QR na hora) e cada aparelho conectado vira um registro próprio revogável.
- **Teste de regressão proposto:** `tests/db/sec-red-team.test.ts` › "SEC-003" (`it.fails` → `it`), mais um caso: aparelho já conectado (cookie do id) continua lendo depois da rotação.
- **Validação:** pendente.
- **Risco residual:** um aparelho que o ex-admin já tenha conectado com um acesso alheio continua conectado pelo id; só revogar aquele acesso resolve (decisão operacional da dona).
- **Arquivos modificados:** nenhum.

## SEC-004 · Trocar o 2FA por e-mail por um app autenticador sem o código do e-mail

- **Identificador:** SEC-004
- **Título:** Com a sessão (já liberada) de alguém que usa código por e-mail, dá para cadastrar um app autenticador novo sem provar o fator atual; ligar o app numa conta sem 2FA também não pede reautenticação.
- **Severidade:** P2 (exige sessão roubada; transforma o roubo temporário em tomada permanente: o próximo login da vítima pede o código do app do atacante, e "Esqueci a senha" não desliga o 2FA).
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `458fad2`, ver `docs/security/security-fixes.md`. Antes: Confirmada (teste de banco).
- **Componente:** conta / verificação em duas etapas.
- **Localização:** `src/lib/actions/conta.ts:260-288` (`startTotp`/`confirmTotp`): a conferência do fator atual só existe quando o método já é `totp` (`:263-266`). Comparar com `startEmailMfa` (`:218-229`), que exige o código do app para sair do app.
- **Descrição:** `startTotp()` sem argumento devolve o QR para quem tem método `email` ou nenhum; `confirmTotp` com o código do app novo grava `mfaMethod = "totp"` e libera a sessão. O dono da conta recebe um e-mail de aviso, mas perde o acesso.
- **Impacto:** tomada de conta persistente a partir de uma sessão roubada; para quem é dona de produtora, o app novo também satisfaz a troca da conta de recebimento (D-04) e o código de saque do Banco (o acesso ao Banco ainda pede o código no e-mail para criar a senha do banco, o que limita essa parte).
- **Causa-raiz:** a troca de fator é tratada como "ligar" quando o método atual é o e-mail.
- **Evidência (sanitizada):** teste SEC-004: `{"startSemCodigo":true,"appCadastrado":true,"metodoAgora":"totp"}`.
- **Correção recomendada:** em `startTotp`, quando o método atual for `email`, exigir o código do e-mail com propósito próprio (`issueCode(…, "setup")` + `checkCode`) antes de gerar o segredo; quando não houver 2FA, exigir a senha atual ou um código por e-mail. Mesma regra em `confirmEmailMfa` para quem não tinha 2FA (hoje o código vai para o e-mail da própria conta, o que já cobre). Encerrar as outras sessões ao trocar de fator.
- **Teste de regressão proposto:** `tests/db/sec-red-team.test.ts` › "SEC-004" (`it.fails` → `it`).
- **Validação:** pendente.
- **Risco residual:** sessões roubadas continuam valendo até expirar (não há "sair de todos os aparelhos" automático em eventos de risco).
- **Arquivos modificados:** nenhum.

## SEC-005 · Redefinir a senha pelo link não encerra as outras sessões

- **Identificador:** SEC-005
- **Título:** Depois de "Criar nova senha", sessões abertas em outros aparelhos (inclusive a de quem roubou a conta) podem continuar valendo.
- **Severidade:** P2 (se confirmada: a resposta padrão a uma invasão, trocar a senha, não expulsa o invasor).
- **Status:** Hipótese. NÃO TESTADO: depende de `revokeSessionsOnPasswordReset` no Neon Auth, que é o mesmo da produção (não pode ser exercitado).
- **Componente:** autenticação / recuperação de senha.
- **Localização:** `src/lib/actions/senha.ts:48-59` (`resetWithLink`): o comentário diz "Desconecta os outros aparelhos", mas o código só chama `auth.emailOtp.resetPassword` e manda o aviso; não há `revokeSessions`/`revokeOtherSessions` nem `logSecurity`.
- **Descrição / impacto:** se o Neon Auth não revogar por conta própria, o invasor segue logado; a 2FA própria não ajuda porque a sessão dele já passou pela segunda etapa (`tw_mfa` é por sessão).
- **Causa-raiz:** dependência implícita de configuração do provedor.
- **Correção recomendada:** depois do `resetPassword`, revogar explicitamente as sessões da conta no servidor (API administrativa do Neon Auth ou `revoke-sessions` com a sessão nova), registrar `logSecurity(userId, "password", …)`; conferir no console do Neon a opção de revogar ao redefinir.
- **Teste de regressão proposto:** unidade de `resetWithLink` com `auth` simulado conferindo a chamada de revogação.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-006 · Proxy do login repassa endpoints que o site não usa

- **Identificador:** SEC-006
- **Título:** `/api/auth/[...path]` funciona como lista de bloqueio: tudo que não está em `BLOCKED` vai para o Neon Auth, inclusive envio de código e redefinição de senha.
- **Severidade:** P3.
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `3ea2589`, ver `docs/security/security-fixes.md`. Antes: Confirmada por código; efeito NÃO TESTADO (exigiria pedidos ao Neon Auth da produção, que dispara o webhook da produção e e-mails pela Resend).
- **Componente:** autenticação (borda).
- **Localização:** `src/app/api/auth/[...path]/route.ts:13-41`.
- **Descrição:** o navegador do site só usa `get-session`, `sign-in/social` (Google), `callback/*` e `email-otp/verify-email` (`src/components/auth/*.tsx`, `src/components/compra/inline-auth.tsx`). Todo o resto que o site faz (esqueci a senha, reenviar ativação, OTP da Apple) é chamado **do servidor** direto no Neon Auth. Mesmo assim o proxy aceita, por exemplo, `email-otp/send-verification-otp`, `forget-password/email-otp`, `email-otp/reset-password`, `request-password-reset`/`forget-password`, `reset-password`, `send-verification-email`, `sign-in/magic-link` (se habilitados no Neon). Quem chama direto pula o Turnstile e o freio do site (`linkThrottled`, 30 s e 6/h por e-mail) e fica só com os limites do Neon. Em `request-password-reset`, o endereço de volta (`redirectTo`) vai no link do e-mail que o nosso webhook monta (`mailAuthLink`, `src/lib/notify.ts:100-107`); se a lista de domínios confiáveis do Neon estiver frouxa, o token iria para outro site (NÃO TESTADO).
- **Impacto:** envio de e-mails de código/senha para qualquer endereço sem o freio do site (incômodo, reputação do domínio de envio); superfície maior do que a necessária no login da produção.
- **Correção recomendada:** trocar por **lista de permissão**: `get-session`, `sign-in/social`, `callback/*`, `email-otp/verify-email`, `sign-out` (e o que o Google precisar); o resto 403. Conferir no console do Neon os domínios confiáveis.
- **Teste de regressão proposto:** unidade do `guard` (caminhos permitidos passam; `email-otp/send-verification-otp`, `forget-password/email-otp`, `request-password-reset` dão 403).
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-007 · Convite de equipe aceito sem consentimento

- **Identificador:** SEC-007
- **Título:** Qualquer produtor coloca qualquer conta com e-mail confirmado na equipe dele (admin ou portaria) sem a pessoa aceitar.
- **Severidade:** P3 (sozinho tem impacto baixo; é o que torna o SEC-001 trivial em escala).
- **Status:** Confirmada (código; o próprio `tests/db/team.test.ts` usa esse comportamento). AppSec: não corrigido (precisa de tela de aceite); com o SEC-001 corrigido o convite não dá mais produtora própria a ninguém.
- **Localização:** `src/lib/data/painel.ts:33-38` (`getPainelScope` grava `userId`/`acceptedAt` em todo convite pendente do e-mail confirmado na primeira chamada); `src/lib/data/producer.ts:13-23` (convite pendente já conta como produtor).
- **Impacto:** a conta convidada passa a "ser produtora" (menu, `/produtores/cadastro`, SEC-001), aparece na produtora de outra pessoa e, se não tiver produtora própria, essa vira a ativa (eventos criados por ela iriam para a produtora de quem convidou).
- **Correção recomendada:** aceite explícito (botão "Entrar na equipe de X" no painel ou link do e-mail), só então gravar `userId`/`acceptedAt`; `isProducer` deixa de contar convite pendente.
- **Teste de regressão proposto:** `getPainelScope` de uma conta convidada e não aceita não lista a produtora; depois do aceite lista.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-008 · Oráculo de cupons entre produtoras

- **Identificador:** SEC-008
- **Título:** Criar cupom (ou salvar evento com cupom) responde "esse código já existe" para código de evento de outra produtora, sem limite de tentativas.
- **Severidade:** P3 (exige conta de produtor ou admin; códigos de cupom são palavras escolhidas, fáceis de adivinhar por dicionário).
- **Status:** PARCIAL: checkout CORRIGIDO, NÃO VALIDADO; criação aberta (schema, D-SEC-03-3) — AppSec, commit `98bb01c`, ver `docs/security/security-fixes.md`. Antes: Confirmada (teste de banco).
- **Localização:** `src/lib/actions/painel.ts:129-130` (busca global por `code`); `src/lib/criar/save.ts:269-273` (devolve o código em conflito); checkout: `src/lib/actions/compra.ts:70-77` responde "Cupom não vale para este evento" (diferente de "inválido"), o que também revela a existência (com o limite de 20 erros por IP da S-14).
- **Descrição / impacto:** um produtor descobre os cupons das concorrentes (ex.: `VIP100`, `STAFF`, cupons de 100%) e os vaza ou usa no evento delas; o limite por IP do `checkCoupon` (S-14) não vale nesse caminho.
- **Evidência (sanitizada):** teste SEC-008: `{"resposta":{"ok":false,"error":"Esse código já existe. Escolha outro."}}`.
- **Causa-raiz:** unicidade global do código, necessária porque `findCoupon` busca só por código.
- **Correção recomendada:** unicidade por evento (`unique(event_id, code)`; mudança de schema: só no banco de teste e SQL em `decisoes.md`) e `findCoupon(code, eventId)` buscando pelos dois; checkout responde só "Cupom inválido ou expirado" para cupom de outro evento.
- **Teste de regressão proposto:** `tests/db/sec-red-team.test.ts` › "SEC-008" (`it.fails` → `it`) + checkout com cupom de outro evento responde a mesma mensagem de cupom inexistente.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-009 · Público do e-mail marketing revela compras em outra produtora

- **Identificador:** SEC-009
- **Título:** "Excluir quem comprou o evento X" aceita evento de qualquer produtora.
- **Severidade:** P3. **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `87cc3f3`, teste `tests/db/sec-audience.test.ts`, ver `docs/security/security-fixes.md`. Antes: Confirmada por código (sem teste dinâmico).
- **Localização:** `src/lib/mail/data.ts:138-142` (`exclude` aceita qualquer uuid); exposto por `audienceCount` (`src/lib/actions/emails.ts:128-133`).
- **Descrição / impacto:** com um contato conhecido no público (ex.: o e-mail de alguém inscrito no "me avise" do próprio evento), o produtor compara a contagem com e sem `excludeBuyersOf = [evento da concorrente]` e descobre se aquela pessoa comprou lá. Dado pessoal de compra de outra controladora (LGPD).
- **Correção recomendada:** filtrar `excludeBuyersOf` para os eventos da própria produtora (`own.has(id)`), como já é feito em `buyerIds`.
- **Teste de regressão proposto:** `resolveAudience` com exclusão de evento de outra produtora não muda o resultado.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-010 · Painel e e-mail marketing para conta que não é produtora

- **Identificador:** SEC-010
- **Título:** Conta sem produtora recebe papel "dono" por padrão e passa por `painelAccess` e pelo `scope()` do e-mail marketing.
- **Severidade:** P3 (hoje não vaza dado de terceiros: os eventos são os criados pela própria conta; permite criar campanhas/modelos e mandar e-mail de teste para o próprio endereço).
- **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `b92e206`, ver `docs/security/security-fixes.md`. Antes: Confirmada por código.
- **Localização:** `src/lib/data/painel.ts:42` (`role = active?.role ?? "owner"`); `src/lib/painel/access.ts:9-15` (não confere `isProducer`); `src/lib/actions/emails.ts:23-29`.
- **Correção recomendada:** sem produtora e sem evento próprio, `getPainelScope` devolve um papel "nenhum" que `painelAccess`, `emails.scope`, `promoters.orgScope` e `launch.eventScope` recusam (defesa em profundidade; a S-02 tratou só as ações de dono).
- **Teste de regressão proposto:** conta sem produtora: `createCampaign`/`saveTemplate` recusados e `/painel` redireciona.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-011 · Recursos pagos para qualquer conta logada

- **Identificador:** SEC-011
- **Título:** IA de descrição (30/dia), IA de mapa (20/dia) e Google Places (`searchVenues` 300/dia; `pickPlace` **sem cota**) para qualquer conta, produtora ou não.
- **Severidade:** P3. **Status:** CORRIGIDO, NÃO VALIDADO — AppSec, commit `a86a911` (com o SEC-308), ver `docs/security/security-fixes.md`. Antes: Confirmada por código. Encaminhado ao Agente 05 (consumo).
- **Localização:** `src/app/api/criar/descricao/route.ts:29-42`, `src/app/api/mapa/gerar/route.ts:45-59`, `src/lib/actions/criar.ts:31-60` e `:63-73` (`pickPlace`).
- **Impacto:** custo (Anthropic, Google) multiplicado por contas criadas em série (o cadastro não exige confirmar o e-mail).
- **Correção recomendada:** exigir produtora aprovada (ou e-mail confirmado + evento em rascunho) nessas rotas; cota diária também em `pickPlace` e cota por IP além da por conta.
- **Teste de regressão proposto:** conta sem produtora recebe 403 nas duas rotas de IA; `pickPlace` respeita a cota.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

## SEC-012 · Admin da equipe cancela o evento inteiro

- **Identificador:** SEC-012
- **Título:** Cancelar o evento (estorno de todos os pedidos), adiar e estornar pedidos estão liberados para admin, não só para a dona.
- **Severidade:** P3 (pode ser escolha de produto; sem separação de função para a operação mais destrutiva do painel).
- **Status:** Confirmada por código.
- **Localização:** `src/lib/actions/reembolsos.ts:29-36` (`eventScope` recusa só a portaria), usado em `cancelEventAction` (`:108-131`) e `refundOrderAction` (`:86-104`).
- **Correção recomendada (para decisão do dono):** cancelar/adiar o evento só para a dona (ou admin com confirmação da dona por e-mail/TOTP); estornos individuais podem seguir com admin, com registro no rastro.
- **Teste de regressão proposto:** admin recebe recusa em `cancelEventAction`; dona consegue.
- **Validação:** pendente. **Arquivos modificados:** nenhum.

---

## Verificado e OK (controles conferidos no código)

Autenticação e sessão
- Sessão pendente de 2FA é tratada como deslogada em todo o site: `getSessionUser` (`src/lib/auth/server.ts:44-47`); `tw_mfa` = HMAC do id da sessão, comparação em tempo constante (`src/lib/mfa.ts:48-59`); `signOut` apaga o `tw_mfa` (`src/lib/actions/auth.ts:75-86`).
- Proxy do Neon Auth confere o caminho já decodificado e recusa `%`, `\`, `.`/`..` e segmentos vazios; bloqueia login/cadastro por senha e OTP de login fora das nossas ações; ações de conta exigem 2FA concluída (`src/app/api/auth/[...path]/route.ts:23-34`). (A troca para lista de permissão está em SEC-006.)
- Login: Turnstile, aviso único "E-mail ou senha incorretos." (S-13 de pé, `src/lib/actions/auth.ts:97-101`).
- Códigos por e-mail: 6 dígitos, guardados como hash com segredo, 10 min, 5 tentativas, 30 s entre envios, 8 por hora (`src/lib/mfa.ts:76-108`). TOTP: proteção contra reuso do mesmo passo e 6 tentativas / 5 min (`src/lib/mfa.ts:175-190`, `:236-262`); segredo cifrado AES-GCM; códigos de recuperação só como hash.
- Troca de e-mail: código no e-mail atual (autorização de 15 min) **e** no novo, checagem de e-mail já usado, aviso ao antigo (`src/lib/actions/conta.ts:91-155`).
- Link de senha: token aleatório de 24 bytes, guardado por hash no KV, 15 min, uso único, resposta igual com ou sem conta, freio por e-mail (S-23 de pé, `src/lib/password-link.ts:20-51`, `src/lib/actions/senha.ts:26-59`).
- `next`: `safeNextParam` recusa `//`, `\` e caracteres de controle (`src/lib/auth/next-param.ts:9-13`); usado em login, cadastro, verificação, Apple; redirecionamentos de cliente (`window.location.href = next`) recebem só valores já normalizados.
- Apple: state em tempo constante, nonce com hash, id_token RS256 com JWKS da Apple, `iss`/`aud`/`exp`/`email_verified` conferidos (`src/lib/auth/apple.ts:42-84`); cookie da volta lacrado (AES-GCM), 2 min, `path=/entrar/apple` (`src/app/api/apple/callback/route.ts:42-44`). (O vínculo com conta existente é o SEC-002.)
- Webhook do Neon Auth: Ed25519 com JWKS do próprio Neon Auth, idade máxima 5 min, deduplicação (`src/lib/auth/webhook.ts:23-38`).
- Central: e-mail na lista **e** no domínio `@ticketswin.com.br`, e-mail confirmado (S-05 de pé), TOTP para qualquer ação, 404 para os outros (`src/lib/admin.ts:19-35`, `src/lib/actions/admin.ts:17-22`); toda ação registra `security_events`.
- Banco: senha própria PBKDF2 100k + TOTP (recuperação não vale), bloqueio 5 erros/15 min com aviso, cookies HMAC `SameSite=Strict` de 30 min, só dona de produtora com evento (`src/lib/actions/banco.ts:41-81`, `src/lib/bank.ts:193-236`, `:37-57`); saque com TOTP, trava por pessoa e conferência do saldo na transação (S-04/S-28 de pé, `src/lib/actions/banco.ts:146-177`).

Autorização e isolamento
- Produtora ativa por cookie só entre as da conta (S-35 de pé): `pickActive` (`src/lib/data/org-access.ts:49-51`), `setActiveOrganizer` (`src/lib/actions/produtoras.ts:32-41`); banco ignora produtoras em que a conta é só equipe (`src/lib/bank.ts:37-48`).
- Ações de dono exigem `isProducer` (S-02 de pé, `src/lib/actions/painel.ts:24-33`); portaria não cria evento (S-34 de pé, `src/lib/criar/save.ts:280-281`); edição por `canEditEvent` (`src/lib/data/org-access.ts:62-66`).
- IDs vindos do navegador sempre conferidos contra o escopo do servidor: links de portaria (`painel.ts:61-62`, `:90-91`, `:101-102`), cupons (`painel.ts:125`, `:142-143`), equipe por `organizerId` (`painel.ts:172`, `:180`), lista free (`lista.ts:28-43`), parceiros (`promoters.ts:54`), campanhas e modelos (`emails.ts:32-36`, `:83`, `:233`), eventos de bloco de e-mail só publicados quando de outra produtora (`emails.ts:246-255`), lançamento e inscritos (`launch.ts:46-52`, `:120-123`), reembolsos com pedido do mesmo evento (`reembolsos.ts:72-73`), revenda (`revenda.ts:85-91`), perfil da produtora (`produtor.ts:16-21`), avaliações só de quem teve ingresso de evento passado (`produtor.ts:121-124`).
- Comprador: ingresso/PDF/Wallet/ICS só do titular (`src/app/api/ingressos/[code]/*/route.ts`), pedido e comprovante só do dono (`orderDetail(id, user.id)`), transferência só do titular e aceite só pela conta do e-mail confirmada (S-32 de pé, `src/lib/actions/tickets.ts:29`, `:65`, `:112-116`), cartões só do cliente Stripe da conta (`src/lib/actions/cartoes.ts:36`, `:56-57`), revenda só do vendedor (`revenda.ts:19`, `:46`), grupo só do líder (`grupo.ts:94`).
- Equipe: portaria não vê tokens de portaria (`src/app/painel/equipe/page.tsx:19-21`); ex-membro perde o acesso pessoal (S-06 de pé, `src/lib/actions/painel.ts:185-194`).
- Portaria: cookie HMAC do id, conferência do acesso ligado e do fim do evento a cada ação, liberação manual só de ingresso do evento do acesso (`src/lib/portaria.ts:50-69`, `src/lib/actions/portaria.ts:52-58`); 8 códigos errados por IP a cada 15 min, código de ~40 bits (`src/lib/actions/portaria.ts:20-34`).
- Dados pessoais: CPF nunca chega ao painel do produtor (só em `src/app/conta/**`, checkout e comprovante do próprio comprador); página do grupo mostra só primeiro nome; página do parceiro sem dados de comprador; página do evento usa `toData` (sem `draft`, cupons, `sellerUserId` cru).
- Rastro dos ingressos (D-12) só pela central (`src/lib/admin-trail.ts`).

Entradas, injeção e navegador
- SQL: só templates parametrizados do Drizzle; nenhum `sql.raw` em `src/**`; buscas `ilike` escapam `%`, `_`, `\` (`src/lib/actions/criar.ts:36`).
- XSS: `dangerouslySetInnerHTML` só com SVG gerado pelo servidor (QR codes), script fixo do JSON-LD, e HTML do editor de e-mail passado por `cleanHtml` (tags permitidas, `href` só http(s)/mailto, `<`/`>` soltos escapados; `src/lib/mail/design.ts:133-153`, `tests/unit/clean-html.test.ts`); variáveis da pessoa escapadas no HTML (`src/lib/mail/render.ts:113`); botões forçam `https://` (`render.ts:97-109`); prévias de e-mail em `iframe sandbox` sem `allow-scripts`; "ver no navegador" com CSP `sandbox; script-src 'none'` (`src/app/e/ver/[token]/route.ts:36-40`); banners HTML em origem opaca com CSP própria (S-36 de pé, `src/app/api/arte-html/route.ts`).
- Injeção em CSV neutralizada (S-21 de pé, `src/lib/csv.ts:8`).
- Uploads: tipo declarado + assinatura dos bytes, sem SVG, 10 MB, 60/h por conta, nome gerado pelo servidor (S-07 de pé, `src/app/api/midia/route.ts:13-34`); central idem com GIF (`src/app/api/admin/banner/route.ts:11-26`); leitura só de `eventos/` e `destaques/` sem `..` (PDFs em `pdf/` não saem) (`src/app/midia/[...key]/route.ts:7`); `nosniff` global.
- SSRF: nenhuma URL vinda do usuário é buscada pelo servidor (Places com `placeId` codificado, Wikipédia por termo codificado, rascunho do mapa lido do R2 por chave e com tipo de imagem conferido) (`src/lib/places.ts:25-44`, `src/app/api/mapa/gerar/route.ts:61-67`).
- Spotify: `state` + `uid` no cookie conferidos na volta, `safeNext` (`src/app/api/spotify/callback/route.ts:18-22`).
- Cron só com token do isolate (`src/app/api/cron/route.ts:5-8`); webhook da Stripe assinado (`src/app/api/webhooks/stripe/route.ts:47`).
- CSRF: Server Actions com conferência de origem do Next; sessão `SameSite=Lax`; banco `SameSite=Strict`.
- Assinador do QR fora de arquivo `"use server"` (S-22 de pé, `src/lib/tickets/qr.ts:6-10`); segredos sem valor padrão (S-11 de pé, `src/lib/signing-secret.ts`).

## Conferência das correções anteriores (S-01…S-37)

Conferidas por leitura (e, quando indicado, pelos testes existentes, não reexecutados por mim fora do meu arquivo): S-02, S-05, S-06, S-07, S-11, S-13, S-14, S-19, S-20, S-21, S-22, S-23, S-31, S-32, S-34, S-35, S-36 continuam no código como descritas. S-01, S-03, S-04, S-08, S-09, S-24, S-25, S-27, S-28, S-29, S-37 (pagamento, estoque, QR, emissão) ficaram com o Agente 04. Regressão encontrada em relação ao objetivo da S-02/S-34: SEC-001 (o mesmo objetivo, "ninguém vira produtor sem aprovação", furado por outro caminho).

## NÃO TESTADO / BLOQUEADO

| Item | Por quê |
|---|---|
| SEC-002 ponta a ponta (Apple, e o mesmo com Google) | exige login real na Apple/Google e conta nova no Neon Auth da produção |
| SEC-005 (revogação de sessões na redefinição) | depende da configuração do Neon Auth da produção; não se pode redefinir senha real |
| SEC-006 efeito real (envio direto de código, `redirectTo`) | pedido ao Neon Auth da produção dispara o webhook e e-mails reais |
| Testes no servidor local `:3042` com navegador/curl | não foram necessários: todas as hipóteses fortes foram reproduzidas por teste de banco com sessão simulada, sem tocar no login compartilhado |
| Pagamentos, estoque, QR, emissão | escopo do Agente 04 |
| Limites de tentativa/força bruta | proibidos pela missão (só leitura do código; ver Agente 05) |

## Observações de baixo risco (sem ID)
- Sessão do Banco é sem estado: sair ou trocar a senha do banco só apaga o cookie do navegador atual; um cookie copiado vale até 30 min. Sugestão: guardar uma "versão" da credencial no cookie e conferir.
- Bloqueio do Banco (5 senhas erradas → 15 min) pode ser disparado por quem sabe o e-mail da dona (com Turnstile a cada tentativa). Encaminhado ao Agente 05.
- Contador de cliques do parceiro (`/r/[code]`) inflável sem limite (só número exibido ao parceiro).
- `setProducerNotify(orgId)` não confere se o id existe (grava um "seguir" para id qualquer; sem efeito fora da própria conta).
