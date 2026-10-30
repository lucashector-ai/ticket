# Auditoria de UX (Marcos)

Testes reais no Chromium (Playwright) contra o servidor local com a cópia do banco. Firefox e WebKit: **BLOQUEADO** (não existem nesta máquina).
Prints na pasta de rascunho da sessão (não versionados): `scratchpad/marcos/shots/` (antes/depois desta auditoria) e `scratchpad/qa2/` (QA inicial). Nos registros abaixo, "M:" = `scratchpad/marcos/shots/`, "QA:" = `scratchpad/qa2/`.

Status: NÃO TESTADO · BLOQUEADO · FALHOU · CORRIGIDO, NÃO VALIDADO · VALIDADO.

## Parte 1 · Itens do QA inicial

### U-01 · Limite por pessoa diz uma coisa e faz outra (QA 1) · P2 · VALIDADO
- **Tela:** `/eventos/aurora-ao-vivo`, tela cheia de compra (celular) e cartão lateral (desktop).
- **Objetivo:** saber quantos ingressos dá para levar.
- **Antes:** "Até 6 ingressos por pessoa", mas dá para levar 6 Meia + 2 Meia-social (o limite é por tipo; o pedido vai até 8). O "+" continuava ativo no limite; só um aviso aparecia ao tocar. M: `antes-01-limite.png`.
- **Problema/impacto:** regra mal explicada gera desconfiança ("o site deixou passar?") e toques que não fazem nada.
- **Solução (com o Romano, regra intacta):** texto "Até 6 de cada tipo por pessoa, no máximo 8 por compra" (o máximo só aparece quando aperta); um tipo só: "Até 6 ingressos por pessoa"; limites diferentes: cada tipo mostra o seu. "+" apagado (`aria-disabled`) quando não cabe mais, mas o toque ainda mostra o motivo (`incBlock` do Romano). "Você já tem N" no tipo que a pessoa logada já comprou.
- **Depois:** M: `depois-01-limite.png` (celular), `depois-01-desktop-card.png`. Novo teste: 6 Meia → "+" da Meia apagado; +2 Meia-social → os três "+" apagados, toque explica "Máximo de 8 ingressos por compra, somando todos os tipos.". Commit 3063bb8.

### U-02 · Taxa por linha não fecha com o total (QA 2) · P3 · VALIDADO
- **Antes:** linha "R$ 550,00 + R$ 43,95 taxa"; com 2, a conta de cabeça dá 87,90, o total cobra 87,89.
- **Solução:** com 2 ou mais na linha, mostra "2 × R$ 275,00 + R$ 43,95 taxa", onde a taxa é a fatia da taxa do pedido (`feeShares` do Romano): a soma das linhas é exatamente a taxa do total. Sem escolha, continua a taxa de um ingresso. Regra de cálculo não mudou.
- **Também:** o cartão lateral do desktop mostrava o total **sem** taxa ("A taxa de serviço aparece antes do pagamento") e o celular **com** taxa. Agora o desktop mostra "Taxa de serviço + R$ X" e o total com taxa, igual ao celular (transparência de preço; sem surpresa no checkout).
- **Evidência:** M: `antes-02-taxa.png` → `depois-02-taxa.png`, `depois-01-desktop-card.png`. Commit 3063bb8.

### U-03 · Data longa corta o horário no topo da compra (QA 3) · P3 · VALIDADO
- **Antes:** 360px: "Quinta, 19 de novembro de 2026 · …" (sem o horário). QA: `t2-04-360.png`.
- **Solução:** sem o ano quando é o ano corrente e a linha do setor quebra em vez de cortar.
- **Depois:** 320 e 360: "Quinta, 19 de novembro · 21:00" inteiro. M: `depois-03-320-setor.png`, `depois-03-360-ingressos.png`. Commit 3063bb8.

### U-04 · "Comprar ingresso" × "Comprar ingressos" (QA 4) · P3 · VALIDADO
- Barra fixa do celular agora diz "Comprar ingressos", como o botão principal. M: `depois-04-mbar.png`. Commit 3063bb8.

### U-05 · Botão de acessibilidade cobre a lista de setores (QA 5) · P3 · VALIDADO
- **Antes:** círculo preto de 48px fixo no canto, por cima do nome do setor. M: `antes-05-mapa.png`.
- **Solução (componente global):** até 1024px vira uma aba de 32×44 presa na borda esquerda, na margem da página; o ponto verde de "opções ligadas" continua. Alvo de toque acima do mínimo de 24px (WCAG 2.2).
- **Depois:** só cobre o respiro do cartão, não o texto. M: `depois-05-mapa.png`. Commit 8ae2c2d.

### U-06 · Reabrir a compra vai direto ao último setor (QA 6) · P3 · VALIDADO
- **Avaliação:** com ingressos de **um** setor escolhidos, voltar direto à lista deles é bom (a pessoa continua de onde parou e tem "Trocar"). Sem escolha, já começava do início. O caso ruim era escolha em **mais de um** setor/data: abria só o primeiro e a pessoa não via os outros.
- **Solução:** com escolha espalhada, abre no começo, onde cada setor/data mostra o contador. Commit 3063bb8.

### U-07 · /conta › Endereço: lista do Estado sai da tela (QA 7) · P2 · VALIDADO
- **Antes:** lista de 220px na meia coluna da direita passava da tela (rolagem horizontal); "Escolha o est" cortado. QA: `t7-01-conta-uf-pop.png`.
- **Solução:** (1) componente de Estado/Cidade do site todo: se a lista passar da borda, alinha pela direita do campo; nunca mais larga que a tela. (2) /conta: Estado e Cidade na mesma linha no desktop (2+2 colunas) e linha inteira no celular.
- **Depois:** 320/390/768 sem rolagem horizontal, textos inteiros; teste forçando a meia coluna antiga: lista alinhada à direita (131–351 em 390). M: `depois-07-conta-390.png`, `depois-07-conta-768.png`, `depois-07-flip-390.png`. Commit bdba77b.

### U-08 · Equipe: campos da portaria com 17px de altura (QA 8) · P2 · VALIDADO
- **Causa:** `flex:1` (base 0) num formulário em coluna virava altura zero. Agora 42px e largura toda. M: `depois-08-equipe-form-390.png`, `-320.png`. Commit 554fb4c.

### U-09 · Equipe: texto do QR numa coluna de 65px (QA 9) · P2 · VALIDADO
- No celular o QR (180px) fica em cima e o texto embaixo, com a largura toda. QA: `t8-02-qr.png` → M: `depois-09-equipe-qr-390.png`. Commit 554fb4c.

### U-10 · Equipe no desktop: campos estreitos e nome truncado (QA 10) · P3 · VALIDADO
- Campos com no mínimo 200px (os botões descem quando não cabem); o nome do acesso quebra linha (antes cortava e escondia o código). QA: `t8-05-desktop-equipe.png` → M: `depois-10-equipe-1280.png`.
- **Extra (prevenção de erro):** "Desligar" derruba o acesso na hora e não volta; agora pede um segundo toque ("Confirmar: desligar", volta sozinho em 5 s). Testado: 1º clique não apaga, 2º apaga e avisa. M: `depois-10-equipe-confirmar.png`. Commit 554fb4c.

### U-11 · Imagem de evento quebrada (QA 11, com o Romano) · P3 · VALIDADO (local)
- Causa no ambiente local (R2 local sem os arquivos; ver D-05). Para o caso real de arquivo sumido: `BrokenImages` no layout esconde qualquer imagem que falha (fica o fundo: cartaz listrado de "sem cartaz", avatar, cor do banner) em vez do ícone de imagem quebrada. Vale também para fotos de artistas do Spotify quando a rede falha. M: `depois-11-festa.png`, `depois-11-lineup.png`. Commit 8ae2c2d.

### U-12 · Cadastro: foco fica no botão, não no campo com erro (QA 12) · P3 · VALIDADO
- **Solução (global):** o `ErrorScroll` agora também põe o foco no primeiro campo com erro quando ele já está à vista (antes só quando precisava rolar). Não tira o foco de quem está digitando em outro campo.
- **Depois:** /cadastro com e-mail inválido → foco no E-mail (320, 390, 1280); /entrar vazio → foco no E-mail. M: `depois-12-cadastro-390.png`. Commit cffe40f.

### U-13 · Aviso (toast) preso a meia tela · P3 · VALIDADO
- `left:50%` sem largura: o aviso ocupava só a metade direita e quebrava em 4–5 linhas no celular (QA: `t8-02-qr.png`). Agora largura pelo texto até 560px, com margem para a aba de acessibilidade. M: `depois-09-equipe-qr-390.png`. Commit cffe40f.
