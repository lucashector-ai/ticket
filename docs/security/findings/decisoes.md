# Decisões para o dono (operação de segurança)

Cada agente acrescenta as suas entradas. P0 aberto vai no topo com "P0 ABERTO". Nenhuma mudança de schema, regra de pagamento ou segredo foi aplicada na produção.

---

## Agente 04 (financeiro)

### D-SEC-04-1 · Modo de teste de pagamento sem trava explícita (SEC-100, P1; P0 se a produção vende sem a chave)
- **Hoje:** sem `STRIPE_SECRET_KEY`, o checkout confirma pelo botão "Já fiz o pagamento" e emite ingressos válidos com referência `TEST-…` (fora do saldo do produtor, mas entram na portaria). Isso já foi decidido como "manter" na rodada 2 da auditoria de qualidade (D-07), enquanto a Stripe espera o CNPJ. Não mudei nada.
- **Por que voltar ao tema:** a decisão depende de duas coisas que não consigo ver daqui (por regra, sem teste na produção): se a produção já tem evento pago à venda e se a chave está configurada lá. Se houver evento pago à venda sem a chave, qualquer pessoa leva ingresso sem pagar.
- **Proposta pronta (pequena, em `src/lib/payments/stripe.ts` + `compra.ts`/`checkout.ts`):** função `testPaymentsAllowed()` = sem chave **e** (`ALLOW_TEST_PAYMENTS=1` ou o site não é `ticketswin.com.br`). Sem chave e sem a variável na produção: o checkout mostra "Pagamento indisponível no momento" e `confirmPayment` recusa. Para manter o comportamento atual basta publicar com `ALLOW_TEST_PAYMENTS=1`; uma chave perdida no futuro passa a parar a venda em vez de dar ingresso.
- **Opções:** (a) aplicar a proposta e publicar com `ALLOW_TEST_PAYMENTS=1` até a Stripe entrar; (b) aplicar sem a variável (a produção para de vender evento pago até a chave entrar); (c) manter.
- **Recomendação:** (a).

### D-SEC-04-2 · Repasse ao vendedor da revenda (SEC-106, P3)
- **Hoje:** o vendedor recebe o e-mail "Você recebe R$ X" (95% do anúncio), mas o sistema não registra saldo, extrato nem saque do vendedor; o pagamento a ele é manual. Num cancelamento do evento, o comprador da revenda é estornado e não há registro se o vendedor já foi pago.
- **Decidir:** como e quando o vendedor é pago (registro no Banco do comprador-vendedor, prazo, retenção até o evento acontecer) e o que acontece com o repasse se o evento for cancelado.

### D-SEC-04-3 · Restrições CHECK de valores no banco (SEC-108, P3) — SQL para o branch de teste e, com autorização, a produção (antes do código)
Não aplicado. Conferir antes que nenhum registro viola (consulta abaixo) para a criação não falhar.
```sql
-- conferência (deve voltar 0 em todas)
select count(*) from orders where total_cents < 0 or refunded_cents < 0 or refunded_cents > total_cents;
select count(*) from ticket_types where sold < 0 or quantity < 0;
select count(*) from coupons where uses < 0;
-- restrições
alter table orders add constraint orders_money_chk check (total_cents >= 0 and refunded_cents >= 0 and refunded_cents <= total_cents);
alter table ticket_types add constraint ticket_types_counts_chk check (sold >= 0 and quantity >= 0);
alter table coupons add constraint coupons_uses_chk check (uses >= 0);
```
(`sold <= quantity` fica fora de propósito: a lotação já é conferida em transação e o produtor não reduz abaixo do vendido.)

### D-SEC-04-4 · Contestação (chargeback) (SEC-107, P3)
- **Hoje:** `charge.dispute.created` não é tratado; com contestação aberta o ingresso segue válido.
- **Opções:** (a) ouvir o evento e marcar o pedido "em contestação" para o produtor e a central decidirem (sem cancelar sozinho); (b) cancelar os ingressos ao abrir a contestação; (c) manter. **Recomendação:** (a). Exige adicionar o evento no webhook da Stripe (painel da Stripe, pelo dono).
