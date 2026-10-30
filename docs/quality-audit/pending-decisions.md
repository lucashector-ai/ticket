# Decisões pendentes do dono

Cada item: o que é, por que precisa da decisão, opções e a recomendação. Nada aqui foi aplicado sem estar marcado.

## D-01 · Compra em grupo contorna o limite por pessoa (Romano, P1)
- **Hoje:** partes de compra em grupo não contam para o limite por pessoa (regra escrita na Ajuda). Mas nada impede a mesma conta de pagar **todas** as partes do grupo, nem de abrir vários grupos. Com isso o limite por pessoa (anticambista) deixa de valer: um grupo de 8, pago inteiro pela mesma pessoa, repetido.
- **Opções:** (a) cada conta paga no máximo **uma** parte por grupo (mantém o espírito "cada amigo paga a sua"); (b) partes pagas contam para o limite de quem pagou (muda o texto da Ajuda); (c) no máximo 1 grupo aberto por pessoa por evento; (d) manter.
- **Recomendação:** (a) + (c). Mudança pequena no servidor (`claimSpecial`/`createGroup`), sem mexer em preço.
- **Status:** aguardando decisão. Nada alterado.

## D-02 · Reserva de 15 minutos segura o lugar (Romano) · APLICADO, reversível
- **O que mudou:** o pedido pendente (a "reserva" com cronômetro do checkout) agora tira o lugar da venda enquanto vale. Antes, só a confirmação do pagamento baixava o estoque, e com os últimos ingressos várias pessoas pagavam e eram estornadas.
- **Efeito visível:** com estoque baixo, um tipo pode aparecer esgotado por até 15 minutos e voltar se a pessoa não pagar. A própria pessoa não se bloqueia. Quem já pagou continua com prioridade.
- **Por que decidir:** é o comportamento padrão de bilheteria e o que a tela já promete ("reserva"), mas muda o que o público vê. Para desfazer: reverter o commit 163ea2a.
- **Risco conhecido:** várias contas podem segurar ingressos por 15 min sem pagar (o mesmo que já acontece com grupos por 60 min). Mitigação aplicada: no máximo 12 pedidos por conta a cada 10 min (d72c91c). Se virar problema: limite de pedidos pendentes por CPF.

## D-03 · E-mail marketing para quem comprou (Romano, LGPD)
- **Hoje:** o painel deixa o produtor mandar campanhas para todos os compradores pagos dos eventos dele (há descadastro e o link "sair" em um clique).
- **Por que decidir:** a base legal (legítimo interesse × consentimento) para usar o e-mail do comprador em marketing do produtor precisa de análise jurídica; não presumimos conformidade. Também falta definir retenção de CPF e telefone em `orders`/`user_profiles`.
- **Recomendação:** análise jurídica; tecnicamente dá para exigir opt-in no checkout ("quero receber novidades deste produtor").

## D-04 · Trocar a conta de recebimento sem app autenticador (Romano, P2)
- **Hoje:** `saveSettings` (Painel → Configurações) troca Pix/banco de destino dos saques só com a sessão; avisa o dono por e-mail e registra no log de segurança. O saque em si exige o app autenticador.
- **Risco:** sessão roubada troca o destino; o dono saca depois sem notar e o dinheiro vai para outra conta.
- **Opções:** exigir o código do app para mudar o destino quando a conta tem app; ou mostrar o destino em destaque na confirmação do saque (já aparece no extrato).
- **Recomendação:** exigir o código do app. Muda a tela de Configurações (Marcos) e a ação (Romano).

## D-05 · Imagem 404 na produção (item 11 do QA) · NÃO TESTADO
- No ambiente local a imagem some porque o R2 local não tem os arquivos da produção (2 eventos). Não testamos a produção (regra da auditoria). Conferir no site: `/midia/eventos/56899a8bb6eb/mvqr4wvg-076766523c83.png`.

## D-06 · SDK do Neon Auth com better-auth 1.7.6 (Romano, segurança)
- `pnpm audit --prod` (depois de remover jspdf/html-to-image e atualizar node-forge): 8 avisos, 1 crítico e 2 altos, **todos** dentro de `@neondatabase/auth@0.7.0-beta` (a última publicada), que fixa `better-auth@1.7.6` e `zod@4.5.4`. Os avisos críticos (OAuth state / OAuth proxy permitindo entrar como outra pessoa) são de código que roda no servidor de login; o Neon Auth é hospedado pelo Neon, então a correção principal é deles.
- **Opções:** (a) perguntar ao suporte do Neon se o servidor do Neon Auth já está em ≥ 1.7.7; (b) forçar no projeto `pnpm.overrides` de `better-auth` para 1.7.14 dentro do SDK (mesma linha 1.7) e testar login, cadastro, Google, Apple e 2FA num ambiente que não seja a produção antes de publicar.
- **Por que não fiz:** o login é o mesmo da produção; trocar a versão de biblioteca de login sem um teste completo de todos os provedores é arriscado para uma madrugada sem supervisão.

## D-07 · Modo de teste liga sozinho se a chave da Stripe faltar (Romano, P1 de configuração)
- **Hoje:** sem `STRIPE_SECRET_KEY` o checkout entra no modo de teste: "Já fiz o pagamento" confirma o pedido e emite os ingressos sem cobrança (referência `TEST-…`, fora do saldo do produtor). É o que permite testar no local.
- **Risco:** se a variável sumir na produção (erro de configuração, troca de chave), o site passa a entregar ingressos de graça até alguém notar.
- **Opções:** (a) na produção (`NEXT_PUBLIC_SITE_URL` = ticketswin.com.br), modo de teste só com uma variável explícita `ALLOW_TEST_PAYMENTS=1`; sem chave e sem essa variável, o checkout mostra "pagamento indisponível"; (b) manter.
- **Por que não fiz:** não sei se a produção hoje já roda com a Stripe ligada ou ainda em modo de teste de propósito (a página antiga do pedido ainda fala "Ambiente de teste"). Aplicar (a) sem saber poderia parar as vendas. Recomendo (a) assim que confirmar que a chave está configurada.

## DM-1 · Tela "Preparando seus ingressos" de 1,45 s em toda página de evento (Marcos, P2, conversão)
- **Hoje:** toda visita a `/eventos/*` mostra por 1,45 s um ingresso animado cobrindo a página ("Preparando seus ingressos…"), mesmo com a página já pronta (vem do servidor). Com "reduzir movimento" do sistema, 0,1 s. Print: `scratchpad/marcos/shots/depois-320-etbuy.png` (tirado 1 s depois de abrir).
- **Por que decidir:** é um atraso artificial na página que mais vende; quem volta ao evento (do checkout, de um link) espera de novo. Faz parte do design original, por isso não removi.
- **Opções:** (a) remover; (b) mostrar só na primeira visita da sessão; (c) encurtar para ~400 ms e só enquanto a imagem do topo carrega; (d) manter.
- **Recomendação:** (b) ou (c). Mudança pequena em `src/components/evento/evento-view.tsx` (sem servidor).

## DM-2 · Produtor precisa enviar 2 artes (cartaz 3:4 e banner 16:9) para publicar (Marcos, P2, ativação)
- **Hoje:** "Envie o cartaz (3:4) e o banner (16:9) antes de publicar." O servidor já usa o cartaz no lugar do banner quando falta (`bannerId: media.banner ?? media.poster` em `src/lib/criar/save.ts`), mas a validação exige os dois.
- **Por que decidir:** é a única trava "dura" da criação além de nome/data/local/preço; o iniciante quase sempre tem só o flyer. Mas o banner 16:9 com o cartaz 3:4 cortado fica feio no topo da página.
- **Opções:** (a) exigir só o cartaz e montar o banner com o cartaz centralizado sobre um fundo desfocado dele mesmo (como o fundo da página já faz); (b) manter os dois.
- **Recomendação:** (a). Romano: soltar a validação; Marcos: banner composto no `BannerArt`.

## DM-3 · Texto livre "Política de cancelamento" pode contradizer a regra do sistema (Marcos, P2, confiança)
- **Hoje:** a regra real de cancelamento é a estruturada (`cancelPolicy` + direito de arrependimento), e a página do evento mostra o texto dela. O campo livre da revisão ("Até 7 dias após a compra, com 48h de antecedência") é colado em seguida, então a página repete a mesma regra com outras palavras, e um produtor pode escrever "Não há reembolso", contradizendo o que o sistema faz.
- **O que fiz (reversível):** na página do evento, o texto livre agora aparece como "Observação do produtor: …", separado da regra do sistema.
- **Opções:** (a) trocar o campo livre por "Observações (opcional)" sem texto padrão; (b) remover o campo; (c) manter.
- **Recomendação:** (a).
