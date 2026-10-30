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
- **Risco conhecido:** várias contas podem segurar ingressos por 15 min sem pagar (o mesmo que já acontece com grupos por 60 min). Se virar problema: limite de pedidos pendentes por CPF.

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
