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

## Parte 2 · Auditoria completa

Varredura automática: 38 rotas (20 públicas + 18 logadas) × 8 larguras (320×568, 375×667, 390×844, 430×932, 768×1024, 1280×800, 1440×900, 1920×1080) = 304 telas, medindo rolagem horizontal, elementos fora da tela, alvos de toque < 24px e erros de JS; axe-core (WCAG 2.0/2.1/2.2 A e AA) em 390 e 1280. Script: `scratchpad/marcos/sweep.js`, resultado `scratchpad/marcos/sweep/result.json`.

### Jornada do comprador (celular 390, conta de teste, Pix de teste) · executada 5 vezes
Evento → tela cheia (setor → ingresso) → Continuar (3,1–3,5 s até o checkout) → Seus dados (nome, e-mail e celular já preenchidos; CPF obrigatório) → Ir para pagamento (2,6 s) → Pix ou cartão → Gerar código Pix (3,1 s) → "Já fiz o pagamento" (teste) → Pedido confirmado (5,6–9,5 s com a animação) → Meus ingressos. Total, taxa e subtotal batem em todas as telas (R$ 550,00 + R$ 43,95 = R$ 593,95).

### U-14 · Recarregar "Pedido confirmado" abria um checkout novo · P1 · VALIDADO
- **Tela:** `/checkout` depois do pagamento. **Objetivo:** rever a confirmação.
- **Antes:** a URL voltava para `/checkout?evento=…&itens=…`; recarregar mostrava "Seus dados" com os mesmos itens e um cronômetro novo de 15 min, como se nada tivesse sido comprado. Risco real de compra em dobro (quem recarrega para "ter certeza").
- **Solução:** a aba guarda que essa URL terminou no pedido N; recarregar (ou voltar pelo histórico) até 3 h depois leva a `/meus-ingressos?pedido=N`. Navegar para o checkout de novo (comprar mais) continua normal.
- **Depois:** testado 3 vezes: confirmação aparece normalmente; recarregar → Meus ingressos com "Pedido #N confirmado!". Commit 1da30aa.

### U-15 · Meus ingressos depois da compra destacava outro evento · P2 · VALIDADO
- **Antes:** vindo de "Ver meus ingressos", o banner dizia "Pedido #48321 confirmado!", mas o ingresso grande era de **outro** evento (o próximo da agenda); o comprado ficava num cartão pequeno com o nome cortado. M: `j2-05-meus-ingressos.png`.
- **Solução:** com `?pedido=N`, o evento desse pedido vem primeiro, com o selo "Compra confirmada". Commit bf6b171.

### U-16 · Ingresso da confirmação com nome cortado · P3 · VALIDADO
- "Aurora A…" e "Qui, 19 Nov · 21h · Ar…" a 390px. Agora até 2 linhas para o nome e a data/local inteiros. M: `j2-04-confirmacao.png` → `j3-04-confirmacao-top.png`. Commit bf6b171.

### U-17 · Com pedido aberto, a escolha nova era ignorada em silêncio · P2 · VALIDADO
- **Antes:** havia um pedido Pix não pago (1× Pista); a pessoa voltou ao evento, escolheu 2× e tocou Continuar: caiu no pedido antigo de 1 ingresso com "Continuamos de onde você parou: mesmos ingressos". Ela pagaria 1 achando que eram 2.
- **Solução:** o aviso agora diz "Você já tinha este pedido aberto, com outros ingressos. Agora você escolheu: 2× Pista — 2º lote" e oferece "Trocar pela escolha nova" (cancela o aberto, nada cobrado, abre o checkout com 2). Sem escolha diferente, continua como antes.
- **Depois:** testado de ponta a ponta em `/eventos/marea`. M: `p1-pendente-nova-escolha.png`, `p1-trocado.png`. Commit c5e0768.

### U-18 · Rolagem lateral em 320–390px · P2 · VALIDADO
- `/eventos/*` a 320px: botão "Comprar ingressos" 5px fora da tela (e por isso a tela cheia de compra também rolava). Agora desce para baixo do preço.
- `/painel/evento/[id]` a 320–390px: link do evento, "Copiar link" e o balão do gráfico saíam da tela; cartaz largo apertava o título; "Criar evento" sem respiro interno. M: `sweep/_painel_evento_…-390.png` → `depois-painel-evento-320.png`.
- Novo teste: `scrollWidth = largura` em 320 e 390 nas duas telas.

### U-19 · Contraste de textos secundários · P2 · VALIDADO
- axe: > 500 ocorrências de texto cinza entre 2,8:1 e 4,1:1 (rodapé, metadados de cards, KPIs e menu do painel, lineup, datas). Troca só da cor do texto para tons do mesmo cinza um pouco mais escuros (identidade mantida). Depois: sobram só artes decorativas (`aria-hidden`), o texto animado de /sobre (fica escuro ao rolar) e ingressos inativos. Commit 71e2206.

### U-20 · Nomes acessíveis e estrutura · P2 · VALIDADO (axe) / leitor de tela real: BLOQUEADO
- Card de evento com 3 links para o mesmo lugar (imagem "Ver X", título, seta "Ingressos para X") → 1 link no teclado e no leitor de tela.
- `label-content-name-mismatch` (WCAG 2.5.3) em lineup, artistas parecidos, avatar do produtor, pilha de ingressos e menu da conta; `nested-interactive` no mapa do local; `aria-controls` apontando para elemento inexistente na busca da ajuda; `aria-label` proibido em `div`/`i`.
- Portaria bloqueava o zoom (`maximum-scale=1`, WCAG 1.4.4): liberado o zoom de pinça, mantendo os botões sem zoom de toque duplo.
- Leitor de tela (NVDA/VoiceOver): BLOQUEADO nesta máquina; só verificação por árvore de acessibilidade e axe. Commit 805d704.

### U-21 · "Esgotado" × "Encerrado" para o mesmo lote · P3 · VALIDADO
- Celular dizia "Esgotado" e desktop "Encerrado" para o mesmo lote esgotado. Agora "Esgotado" nos dois; "Encerrado" só quando o produtor encerrou a venda. Lote esgotado/"próxima virada" sem a opacidade que deixava o aviso ilegível. M: `depois-marea-card.png`.

### U-22 · Texto do limite repetido · P3 · VALIDADO
- `/eventos/marea`: "Até 8 de cada tipo por pessoa, no máximo 8 por compra". Quando o limite do tipo é igual ao máximo da compra, fica só "Até 8 ingressos por compra".

### Jornada do produtor (celular 390, conta de teste) · executada de ponta a ponta 2 vezes
Painel → Criar evento → 1 Tipo (Show, uma data) → 2 Nome e faixa etária → 3 Data (atalhos "Esta sexta/Próximo sábado" + calendário, horários com padrão 21h–3h, portões 19h) → 4 Local (lista de locais já usados + busca Google) → 5 Mapa (Sem mapa / Com IA) → 6 Ingressos (pago/gratuito, ingresso único/por setores; Meia e Inteira já montadas; "Se esgotar, você recebe R$ 9.600,00") → 7 Artes (cartaz e banner obrigatórios) → 8 Abertura das vendas → Revisão com nota 0–100 e "!" nos pendentes → Publicar → "Seu evento está no ar!" com link, Compartilhar, Acompanhar vendas.
Resultado: 9 toques em Continuar + ~8 ações + 2 envios de imagem. Publicado: VALIDADO. Erros testados: sem tipo, sem nome, publicar sem artes (leva à etapa Artes com a mensagem certa), cartaz 800×800 e 1200×1500 (recusados), 2160×2880 (aceito).
**O produtor precisa mesmo fazer tudo isso?** Quase tudo tem padrão bom (horário, lotação, meia, taxa, vendas "já"). As travas reais são nome, data, local, preço e **duas** artes; a segunda arte é a que mais pesa para o iniciante (DM-2).

### U-23 · Etapas do criador cortadas no celular · P2 · VALIDADO
- Faixa de etapas com `justify-content:center` + rolagem: a 390px apareciam "3 4 5" e as etapas 1–2 ficavam inalcançáveis. Agora começa do início e a etapa atual rola para o centro. M: `c1-01.png` → `c2-00-top.png`. Commit aed8b41.

### U-24 · Criador: textos e controles · P3 · VALIDADO
- Sem nome/tipo: o foco vai ao campo que falta (antes só um aviso que some). Busca de local repetia a cidade ("São Paulo – SP · São Paulo – SP") e marcava "Na Tickets Win" (virou "Já cadastrado"). Revisão: "Publicar evento" quebrava em 2 linhas; "Quem pode ver" em 3 colunas quebrava cada opção em 3 linhas (agora lista no celular); política de cancelamento cortada numa linha (agora 2 linhas). Erro de proporção dizia "precisa ser 1080 × 1440 px", mas qualquer tamanho na proporção serve (agora explica). Aba de acessibilidade cobria o "Continuar". M: `c3-etapa9.png`. Commits aed8b41, d5cff02.

### U-25 · Painel no desktop: nome do evento numa coluna de 70px · P2 · VALIDADO
- Início do painel a 1280px: "QA / Romano · / checkout / (teste)", uma palavra por linha; o botão de acessibilidade cobria o texto do plano no menu. M: `painel-1280.png` → `painel-1280-depois.png`. Commit d5cff02.

### Portaria (celular 390) · VALIDADO
Equipe → "Abrir app da portaria" → app do evento ("0 de 0 entraram"); sem câmera: "Não conseguimos abrir a câmera." + "Permitir câmera"; "Digitar código": código inexistente → "NÃO LIBERADO · Ingresso não encontrado."; ingresso de outro evento → "NÃO LIBERADO · Este ingresso é de outro evento (nome)". Tela vermelha inteira, texto grande, "Toque para continuar". Câmera real: BLOQUEADO (sem câmera no Chromium headless). Ingresso válido/já usado: NÃO TESTADO (não quis gastar ingressos de teste do Romano).

### Busca (U-26) · P2 · VALIDADO
- "aurra" e "funk" davam 0 resultados (sem tolerância a erro; gênero fora da busca). Agora 1 e 3. Sem resultado: mensagem com "Limpar filtros" (ok). Commit desta rodada.

### Teste do iniciante (contado pela interface, sem atalhos de código)
| Tarefa | Ações | Dúvidas/erros observados |
|---|---|---|
| Achar um evento | 1 toque (card na home) ou busca | busca não perdoava erro de digitação (corrigido) |
| Entender o preço | 0 (card: "A partir de R$ 275"; evento: preço + taxa por tipo) | desktop mostrava total sem taxa e celular com taxa (corrigido) |
| Escolher ingresso | 4 toques (Comprar → setor → + → Continuar) | limite "por pessoa" confuso (corrigido) |
| Concluir compra de teste | CPF + 3 toques (Ir para pagamento → Gerar Pix → Já paguei) | recarregar a confirmação abria checkout novo (corrigido) |
| Achar o ingresso | 1 toque ("Ver meus ingressos") | destaque era de outro evento (corrigido) |
| Criar conta de produtor | NÃO TESTADO (regra: no máximo 3 contas novas; usei a conta existente) | — |
| Criar evento + configurar lote + publicar | 9 Continuar + ~8 ações + 2 imagens | exigência de 2 artes (DM-2); etapas cortadas no topo (corrigido) |
| Achar as vendas | 0 (Início do painel: receita, vendidos, pedidos, ticket médio) | nomes de evento espremidos no desktop (corrigido) |

### U-27 · Teclado na tela cheia de compra · P2 · VALIDADO
- `role=dialog aria-modal` mas o Tab saía para a página e o rodapé por trás; ao fechar com Esc, o foco caía no rodapé. Agora o Tab circula dentro da tela e o foco volta ao "Comprar ingressos". "Voltar ao topo" sem contorno de foco e deixava o foco no rodapé (corrigido). Painel de acessibilidade: Alt+A abre com foco em "Fechar", Esc fecha e devolve o foco (ok; é painel não modal). Commit "Teclado: tela cheia…".

### U-28 · Sessão expirada no meio do checkout · P1 · VALIDADO
- Apagando os cookies e tocando "Gerar código Pix": a tela voltava a "Seus dados" ainda dizendo "Comprando como <e-mail>", sem formulário de login (a pessoa ficava presa). Agora aparece "Entre para continuar" (Já tenho conta / Criar conta) com o aviso "Entre na sua conta para finalizar a compra." e os dados preenchidos ficam. M: `bad-03-sessao.png` (antes).

### Condições ruins (U-29) · resultados
| Condição | Resultado | Status |
|---|---|---|
| Sem internet ao ir de Dados para Pagamento | etapa é local, segue normalmente; o servidor só é chamado no Pix/cartão | VALIDADO |
| 3 toques seguidos em "Ir para pagamento" | uma transição só, sem pedido duplicado | VALIDADO |
| Sessão expirada no meio | U-28 | VALIDADO |
| Rede 3G simulada (400 kbps, 400 ms) | título e botão de compra visíveis em 2,0 s (home) e 2,7 s (evento); carga total 31 s (home) e 11 s (evento) em modo dev | VALIDADO (medido) |
| Imagem do evento sumida | `BrokenImages` (U-11) | VALIDADO |
| Página aberta muito tempo (reserva de 15 min) | cronômetro "Reservados por" no checkout; com o pedido aberto, a volta ao evento oferece trocar (U-17) | VALIDADO |
| Busca sem resultado / com erro de digitação | U-26 | VALIDADO |
| Girar a tela / zoom 200% | NÃO TESTADO nesta rodada | NÃO TESTADO |

### Pós-compra (celular 390) · VALIDADO
Meus ingressos: ingresso em destaque com QR, código, titular, "Baixar PDF" (baixa `ingresso-TW-….pdf`), Transferir (modal com foco no e-mail, Esc fecha), Revender (preço máximo = o que pagou, mostra quanto recebe com a taxa de 5%), Adicionar à agenda. Página do ingresso `/ingressos/[código]` com as mesmas ações.

### U-30 · Cronômetro "Reservados por" antes de existir reserva · P2 · VALIDADO (com o Romano)
- Desde a etapa Dados o checkout mostrava "Reservados por 14:59" e, aos 0:00, "O tempo da reserva acabou · Seus ingressos voltaram para a venda", mas a reserva só nasce ao gerar o Pix ou pagar (handoff do Romano 04:45). Era urgência falsa. Agora cronômetro e vencimento só existem com pedido aberto (ou vaga de grupo/revenda). Teste: Dados e Pagamento sem cronômetro; Pix com "Código expira em 14:59"; voltar do Pix cancela o pedido e o cronômetro some.

### U-31 · Aba atual cortada nas faixas roláveis (Conta e Painel no celular) · P3 · VALIDADO
- /conta/compras ("Minhas compr…"), /conta/seguranca, /painel/equipe e /painel/configuracoes: a faixa começava do início e a aba atual ficava fora. Agora rola até ela (320px: as 4 visíveis). M: `vis-320-montagem2.png` (antes).

### U-32 · Textos cortados em 320px · P3 · VALIDADO
- /explorar: filtros "Todas a…", "Qualque…" → "Todas"/"Todos" (o rótulo já diz o campo). Central de ajuda: placeholder "Busque por reem…" → "Busque sua dúvida". M: `vis-320-montagem.png` → `vis-320-explorar-filtros.png`.

### Celular deitado (844×390) · VALIDADO
- Página do evento sem rolagem lateral; tela cheia de compra com cabeçalho, lista rolável e barra de total visíveis. M: `land-sheet.png`.

## Pendências de UX
Situação depois da rodada 2 (30/10).

| Item | Grav. | Situação |
|---|---|---|
| Loader de 1,45 s na página do evento | P2 | DM-1 aplicada: só na 1ª visita da sessão, 0,9 s (U-33) · VALIDADO |
| 2 artes obrigatórias para publicar | P2 | DM-2 aplicada: só o cartaz; banner montado com o cartaz (U-34) · VALIDADO |
| Texto livre de cancelamento pode contradizer a regra | P2 | DM-3 aplicada: "Observações (opcional)" sem texto pronto (U-35) · VALIDADO |
| Tabelas do painel roláveis sem foco de teclado | P3 | U-36 · VALIDADO |
| Barras do gráfico de vendas só com mouse/toque | P3 | U-37 · VALIDADO |
| Pontos do carrossel da home com 13px de largura de toque | P3 | U-38 · VALIDADO |
| Leitor de tela real (NVDA/VoiceOver/TalkBack) | — | BLOQUEADO (não existe nesta máquina) |
| Firefox e WebKit/Safari | — | BLOQUEADO (a rede não deixa baixar; o dono vai liberar) |
| "Escrever com IA" e "Gerar mapa 3D" (geração real) | — | BLOQUEADO (sem ANTHROPIC_API_KEY no local); falha tratada: VALIDADO |
| Criar conta de produtor do zero | — | VALIDADO até "Ative sua conta"; ativação BLOQUEADO (e-mail do Neon Auth não chega no @example.com); aprovação da inscrição BLOQUEADO (central só @ticketswin.com.br) |
| Câmera real de celular na portaria | — | BLOQUEADO (só câmera falsa do Chromium com vídeo do QR) |

## Parte 3 · Rodada 2 (30/10, decisões do dono e pendências)
Prints desta parte em `scratchpad/marcos/r2/` (indicados como "R2:").

### U-33 · DM-1: "Preparando seus ingressos" só na primeira visita · P2 · VALIDADO
- **Antes:** 1,45 s cobrindo a página em toda visita a `/eventos/*` (voltar do checkout, abrir outro evento).
- **Solução:** marca na sessão (`sessionStorage`, com try/catch: sem storage, mostra); 0,9 s no total (0,6 s visível + 0,3 s saindo). Na carga direta, um script inline (padrão do guia "preventing flash before hydration" do Next) esconde o loader antes da primeira pintura; na navegação interna, `useLayoutEffect`. Com "reduzir movimento": 0,1 s.
- **Teste:** 1ª visita ~0,6 s depois do DOMContentLoaded; recarregar, outro evento (carga direta) e navegação interna: 0 ms; sessão nova: mostra de novo. Commit bd2bc5e.

### U-34 · DM-2: só o cartaz é obrigatório para publicar · P2 · VALIDADO
- **Solução:** criador e servidor exigem só o cartaz ("Envie o cartaz (3:4) antes de publicar."); Banner vira "Opcional · Sem banner, montamos um com o cartaz" e o "Onde aparece" já mostra o resultado. O `BannerArt` monta o banner com o cartaz inteiro no centro sobre o próprio cartaz desfocado quando a imagem é o cartaz (`bannerId === flyerId`, o que o servidor já gravava) ou é alta (proporção < 1,3, detectada ao carregar). Prévia de link: cartaz reduzido (675×900) em vez de cortar o cartaz em 1200×630.
- **Teste:** evento "QA Marcos · Só cartaz (não comprar)" publicado só com o cartaz. Página 390 e 1280, prévia do criador (celular e desktop), tela de contagem, busca, OG 200 image/jpeg. R2: `dm2-390-artes.png`, `dm2-390-pagina.png`, `dm2-1280-pagina.png`, `dm2-390-previa.png`, `dm2-1280-previa.png`. Commit 70c84ef.
- **Para o Romano avaliar:** banner do e-mail, aviso e faixa do passe da carteira também usam `bannerId` como imagem horizontal (handoff 11:50).

### U-35 · DM-3: "Política de cancelamento" → "Observações (opcional)" · P2 · VALIDADO
- **Solução:** o campo começa vazio, com exemplo no placeholder e a nota "Aparece na página do evento como 'Observação do produtor', junto da regra de cancelamento. A regra em si fica no painel, em Cancelamentos e reembolsos." O antigo texto pronto ("Até 7 dias após a compra, com 48h de antecedência") salvo em rascunhos, eventos e Configurações é tratado como sem observação (não aparece mais repetido na página). Configurações: "Observações padrão (opcional)". Regra de cancelamento não mudou.
- **Teste:** evento antigo e novo, 390 e 1280; página do evento sem a "Observação" repetida. R2: `dm3-390-obs.png`, `cfg-1280.png`. Commits 96c2556, e1a2a6d.

### U-36 · Tabelas do painel roláveis pelo teclado · P3 · VALIDADO
- Componente `Tbl` (15 tabelas): quando a tabela rola de lado, entra no Tab com nome ("Compradores", "Cupons"…); sem rolagem, não cria parada à toa. axe `scrollable-region-focusable`: 0 em /painel/publico, /painel/marketing, /painel/financeiro. Commit 4b24197.

### U-37 · Gráfico de vendas pelo teclado · P3 · VALIDADO
- O gráfico vira um controle deslizante: setas (1 dia), Page Up/Down (7 dias), Home/End; o leitor de tela recebe "30 de out, hoje: R$ 0". Foco visível. Clique continua igual. R2: `chart-390.png`. Commit 41f69a8.

### U-38 · Pontos do carrossel da home com 24×24 · P3 · VALIDADO
- Botões de 24×24 (o atual 30×24); o ponto visível continua com 7 px. axe `target-size` sem violação em 320, 390 e 1280. R2: `dots-390-full.png`. Commit 2204011.

### U-39 · Login pedido por página protegida não voltava para ela · P2 · VALIDADO
- **Tela:** qualquer página protegida aberta sem login (link do ingresso no e-mail, Meus ingressos, Criar evento). **Antes:** o middleware do Neon Auth mandava para `/entrar` sem `next`; depois de entrar, a pessoa caía na home. **Solução (mudança mínima no `proxy.ts`, avisada):** o redirecionamento leva `next` com a página pedida. Entrar e Criar conta dizem o motivo ("Entre na sua conta para criar e gerenciar seus eventos."). Commit 04c5974.

### U-40 · Ativação: sem saída para e-mail digitado errado · P2 · VALIDADO
- "E-mail errado? Cadastrar com outro e-mail" sai da conta pendente e volta ao cadastro mantendo o destino. Código errado: "Código incorreto ou expirado. Confira ou peça outro." (ok). Commit 1a724a5.

### U-41 · Inscrição de produtor: um erro por envio · P2 · VALIDADO
- **Antes:** envio vazio mostrava só "Digite a cidade do evento." (antes do estado, que vem primeiro), no fim do formulário, sem marcar campo e com o foco perdido; eram até 10 envios para descobrir tudo. **Depois:** "Faltam 7 campos. Eles estão marcados em vermelho.", cada campo com o motivo embaixo (não só a cor), foco no primeiro; o servidor continua conferindo. Envio válido → "Inscrição enviada!" e, ao recarregar, "Sua inscrição está em análise". R2: `prod-insc-erro.png`. Commit dc9b3ff.

### U-42 · Portaria: "Entrada liberada" virava "Já entrou" com o celular ainda apontado · P1 · VALIDADO
- **Tela:** app da portaria e portaria do painel, leitura pela câmera. **Antes:** depois do verde (1,7 s) a leitura voltava, e o mesmo QR só ficava bloqueado 4 s desde a primeira leitura: quem continuava com o celular na frente via, ~4 s depois, a tela vermelha "JÁ ENTROU ÀS 08:24" (no primeiro teste, um ingresso nunca usado apareceu assim). Na fila, isso gera discussão e retrabalho. **Solução (hook compartilhado):** o mesmo QR só é lido de novo depois de sair da frente da câmera por 2 s; reentrada continua sendo pega. **Teste:** QR parado 14 s → 1 verde e volta à câmera; QR que sai e volta → vermelho "Já entrou às 08:27" (certo). R2: `port-1-valido.png` (antes), `port2-parado-1.png`, `port2-volta-1.png`. Commit 264b8c2.

### U-43 · Portaria: QR inválido sem próximo passo; painel com resultado fora da tela · P2 · VALIDADO
- App e painel: "QR code inválido" / "Ingresso não encontrado" dizem "Peça o ingresso aberto em Meus ingressos ou no e-mail e confira o código.". Painel no celular: a câmera começava na metade de baixo da tela e o resultado do código digitado aparecia fora da vista; agora a câmera é centralizada ao abrir, o resultado é trazido para a vista e o foco volta ao campo; mensagem longa ("outro evento (nome)") com fonte menor e inteira; "já usado" mostra "Já entrou às HH:MM" + nome, como o app. E2E do Romano 13/13 com o texto novo. Commits bce8d62, 74f5a2e, 48d4f77.

### U-44 · Editar evento no ar parecia rascunho · P2 · VALIDADO
- **Antes:** ao editar um evento à venda, o topo dizia "Rascunho na sua conta", o botão "Publicar evento" e, depois de salvar, "Seu evento está no ar! Publicamos…" com confete. **Depois:** "Publicado", "Salvar alterações" e "Alterações salvas · continua no ar, já com as mudanças.". Commit f2f1ee1.

### U-45 · Criador a 320 px e nomes acessíveis · P3 · VALIDADO
- Botão da prévia saía da tela a 320 px (barra de baixo); etapas concluídas no celular (só ícone) sem nome; prévia rolável sem foco. Corrigidos; axe sem violação. Commit f5f01f1.

### U-46 · Ingresso usado/cancelado com texto ilegível · P3 · VALIDADO
- Horário do check-in, pedido e código em cinza 2,3–2,65:1. Agora só a arte e o QR ficam apagados; textos ≥ 4,5:1. R2: `used-ticket.png`. Commit 3aa8503.

### Revisões feitas para o Romano (D-03, D-04)
- **D-03** (caixa de novidades no checkout): desmarcada, depois de "Quem vai usar os ingressos", toque e teclado ok, 390 e 1280. Sem mudança. R2: `d03-390.png`, `d03-1280.png`.
- **D-04** (código do app para trocar a conta de saque): aparece só quando pedido, recebe o foco. Texto da ajuda ajustado (por que é pedido + "Sem acesso ao app? Fale com a gente"). Commit e1a2a6d.

### Teste do iniciante · produtor do zero (rodada 2)
| Passo | Ações | Observado |
|---|---|---|
| Home → "Criar evento" (sem conta) | 2 toques (menu, Criar evento) | ia para `/entrar` sem contexto e sem voltar depois (U-39, corrigido) |
| Criar conta | 5 campos + aceite + 1 toque | claro; o nome e o celular são reaproveitados na inscrição |
| Ativar conta | código de 6 números | BLOQUEADO (o e-mail não chega no @example.com); sem saída para e-mail errado (U-40, corrigido) |
| Inscrição de produtor | 10 campos obrigatórios | um erro por envio (U-41, corrigido); depois: 1 envio vazio mostra tudo |
| Aprovação | — | BLOQUEADO (central só para @ticketswin.com.br) |

