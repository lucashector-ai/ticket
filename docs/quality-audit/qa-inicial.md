# QA inicial (30/10/2026, antes da auditoria)

Teste automatizado no Chromium (390×844, 360px e 1280×900), servidor local com a cópia do banco. Prints na pasta de rascunho da sessão (não versionados).
Status de cada item: FALHOU (a confirmar e corrigir pela equipe) ou VALIDADO.

## Falhas para a equipe

| # | Gravidade | Onde | Problema | Dono |
|---|---|---|---|---|
| 1 | P2 | Escolha de ingressos (tela cheia e cartão lateral) | Diz "Até 6 ingressos por pessoa", mas o limite é por tipo: dá para levar 6 Inteira + 1 Meia. O "+" não desabilita no limite, só mostra aviso. Conferir regra no servidor (`maxPerOrder` do evento × `maxPerOrder` do tipo) e alinhar texto e bloqueio. | Romano (regra) + Marcos (texto/estado) |
| 2 | P3 | Tela cheia de compra | Taxa por linha arredondada por ingresso (2 × R$ 43,95 = 87,90) não fecha com o total (taxa calculada no total: 87,89). | Marcos, alinhado com Romano (`priceOrder`) |
| 3 | P3 | Tela cheia, etapa setor, 360px | Data longa ("Quinta, 19 de novembro de 2026 · …") corta o horário no cabeçalho. | Marcos |
| 4 | P3 | Página do evento | `.mbar` diz "Comprar ingresso" e `.et-go` "Comprar ingressos". | Marcos |
| 5 | P3 | Página do evento, mapa | Botão de acessibilidade cobre a lista de setores do mapa. | Marcos |
| 6 | P3 | Tela cheia | Reabrir depois de fechar vai direto aos ingressos do último setor, sem passar pela escolha (avaliar se é bom). | Marcos |
| 7 | P2 | /conta › Endereço, 390px | Lista do Estado (`ul.cs-pop`) passa da tela e cria rolagem horizontal. Placeholders cortados ("Escolha o est"). | Marcos |
| 8 | P2 | /painel/equipe, celular | Campos Nome e E-mail da portaria com 17px de altura. | Marcos |
| 9 | P2 | /painel/equipe, celular | Texto ao lado do QR numa coluna de ~65px (uma palavra por linha). | Marcos |
| 10 | P3 | /painel/equipe, desktop | Campos estreitos (placeholders cortados) e nome do acesso truncado. | Marcos |
| 11 | P3 | Home, eventos, checkout | 404 em `/midia/eventos/56899a8bb6eb/mvqr4wvg-076766523c83.png` (imagem de evento sumida). | Romano |
| 12 | P3 | /cadastro | Página curta: não deu para provar a rolagem até o erro; o foco fica no botão e não no campo com erro. | Marcos |

## Validados
Compra no celular (etapas, total com 7,99%, trocar, voltar do topo e do navegador, cupom inválido, mapa → setor, continuar → Dados, alterar/voltar mantendo a escolha), checkout (sem 1-2-3 no celular, etapas no desktop, sem itens volta à escolha, chega ao pagamento logado), nenhum campo sugerindo celular, rolagem até o erro no checkout, Estado/Cidade (busca, bloqueio, limpeza), convite da portaria (QR, código, "aberto"), nenhuma página "Ops".
