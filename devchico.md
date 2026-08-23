Ajustes do Chico:

- Criei um botão “Levantar a mão” só para jogadores, onde o mestre e os demais participantes recebem aviso central na tela e som
O arquivo alterado foi principalmente: campaign-room.tsx

- Adicionei um mixer de “Música de fundo” e “Efeitos sonoros”, que persiste por campanha e fecha ao clicar fora ou apertar Esc
Os arquivos alterados foram: campaign-room.tsx e soundpad.tsx

- Adicionei controles de + e - nos Zenits da ficha, edição direta pelo teclado e proteção para nunca salvar valor negativo na API
Os arquivos alterados foram: character-sheet.tsx e app/api/characters/[id]/route.ts

- Corrigi o rodapé dos cards da Galeria Arcana para o nome não empurrar nem esconder os botões de visibilidade e exclusão
O arquivo alterado foi somente: imagepad.tsx

Rodada 1:

No campaign-room.tsx:
- Troquei o texto do retorno de “Aviso enviado” para “Enviado”
- Troquei “Aviso enviado ao mestre.” pelo nome do participante ou viajante que levantou a mão
- Mantive a notificação central sincronizada para a sessão inteira
- Removi a notificação duplicada “Jogador quer falar” que aparecia no canto superior direito do mestre
- Fiz o dropdown do mixer fechar ao clicar fora ou apertar Esc

No character-sheet.tsx:
- Fixei a altura da aba Condições para o contador não aumentar o card nem quebrar a linha
- Ajustei a área lateral dos cards para a borda esquerda não ficar cortada

No imagepad.tsx:
- Corrigi o rodapé para os botões Mostrar/Ocultar e Excluir continuarem visíveis ao lado de nomes longos

Rodada 2:

No app/globals.css:
- Troquei a estética azul, tecnológica e de dashboard por uma identidade dark academia de RPG
- Criei tokens de carvão, madeira escura, couro, pergaminho, bronze, vinho, musgo, marfim e branco quente
- Refiz painéis, cards, botões, inputs, modais, tabs, badges, barras, scrollbars, estados vazios, foco, hover e sombras
- Reduzi cantos excessivamente arredondados e removi a aparência de glassmorphism e neon
- Criei materiais diferentes para fichas de viajantes, ferramentas do mestre e documentos cartográficos
- Adicionei o fundo da academia arcana com textura, vinheta e contraste para manter a leitura
- Adicionei suporte visual para responsividade e prefers-reduced-motion

No app/layout.tsx:
- Organizei as famílias de fonte para títulos de fantasia, texto editorial, interface, manuscrito e números

No app/page.tsx, app/campaigns/page.tsx e components/campaigns-dashboard.tsx:
- Reformulei login, cadastro e Salão de Campanhas para a nova identidade editorial de Over the Magic School
- Mantive autenticação, criação de campanha e entrada por código funcionando

Nos componentes do frontend:
- Reformulei cards, formulários, criação de viajante, atributos, mapas, galeria, sons, cenas, bestiário, berçário, loot e modais
- Preservei handlers, APIs, estados, permissões de mestre/jogador e sincronização em tempo real

Rodada 3:

No campaign-room.tsx e app/globals.css:
- Transformei a navbar em um documento cartográfico de campanha
- Transformei Mapas da Campanha e Histórico da jornada em painéis de pergaminho e diário de viagem
- Diferenciei visualmente os cards dos viajantes da navegação e da sidebar
- Refiz o Grimório do Mestre com ferramentas agrupadas, cores semânticas e menos dourado repetido
- Adicionei microinterações discretas para botões, cards, mapas, histórico e alterações de valores

No character-sheet.tsx:
- Mantive a estrutura da ficha expandida e poli hierarquia, espaçamento, contraste e recursos
- Deixei o valor de Zenits clicável para edição direta com Enter, Escape e confirmação ao perder o foco
- Mostrei condições ativas de forma compacta nos cards, com ícones, cores e tooltips
- Adicionei uma Galeria de Molduras para o retrato e persistência retrocompatível da moldura escolhida

No character-portrait.tsx, portrait-frames.ts e lib/types.ts:
- Criei o componente reutilizável de retrato e molduras bronze, madeira, pergaminho, arcana, acadêmica, natureza, gótica, ornamentada e simples
- Garanti que viajantes antigos sem moldura configurada continuem usando a moldura padrão

No session-effects.tsx, campaign-room.tsx e app/globals.css:
- Adicionei apresentação central sincronizada para rolagens de dados
- Adicionei dados animados de acordo com a rolagem e destaque para o resultado final
- Adicionei animação central temática para Levantar a mão
- Mantive os eventos registrados normalmente no Histórico da jornada

Rodada 4:

No character-sheet.tsx:
- Aumentei inicialmente HP/MP e a descrição dos cards e depois refinei os tamanhos conforme os testes visuais
- Deixei HP e MP com rótulos semânticos coloridos e valores em branco quente
- Troquei “Cender Controle” por “Ceder” e aumentei os controles Ceder e Arquivar
- Deixei texto, borda e SVG de Arquivar em branco bege
- Troquei Vida, Mente e Inventário para branco bege, mantendo as cores apenas nos SVGs
- Troquei o ícone de Mente por um símbolo coerente com magia
- Refiz o hover das abas Principal, Testes e Perícias e Condições para um estilo escuro e editorial
- Removi o fundo amarelo sólido da aba selecionada e usei o mesmo estilo elegante do hover
- Ajustei o indicador de condições para sumir quando a aba está selecionada e reaparecer nas demais abas
- Aumentei levemente o contador de condições e troquei o vermelho por uma cor integrada ao tema

No campaign-room.tsx:
- Troquei “Meus personagens” por “Meus viajantes”
- Troquei “Personagens do Mestre” por “Viajantes do Mestre”
- Troquei “Personagens dos jogadores” por “Viajantes dos jogadores”
- Troquei “Histórico da Jornada” por “Histórico da jornada”
- Ajustei “Sessão” na navbar e usei a mesma fonte do título da campanha
- Centralizei melhor nome da campanha, código, estado da conexão e clima
- Aproximei Ao vivo/Conectando do clima
- Deixei o texto Ao vivo/Conectando em branco bege e o ícone de conexão em verde
- Aumentei nome do perfil e horário no histórico
- Reduzi e travei o texto de clima para ele não quebrar linha

Rodada 5:

No campaign-room.tsx:
- Transformei Grade de batalha em um botão recolhível que expande o painel somente quando solicitado
- Posicionei Bestiário abaixo de Gerenciar loots e removi o visual totalmente vermelho do botão
- Levei o Berçário para dentro do Bestiário e mantive o Bestiário aberto ao mostrar o Berçário
- Depois movi o Berçário para fora do modal, à esquerda de Novo viajante, conforme o ajuste mais recente
- Troquei “Loots de NPC” por “Gerenciar loots”
- Troquei “Gerenciar Cutscenes” por “Gerenciar cenas”
- Troquei “Gerenciar Enquetes” por “Gerenciar enquetes”
- Troquei “Baú do Mestre” por “Baú do mestre”
- Troquei “Loots Caídos (NPCs)” por “Loots (NPCs)”
- Troquei “Berçário de NPCs” por “Berçário” nas áreas visíveis

No soundpad.tsx:
- Troquei “Biblioteca de Ambiencias” por “Biblioteca de sons”
- Deixei Música de fundo e Efeitos sonoros em branco bege
- Troquei o ícone de Efeitos sonoros por um alto-falante

No app/page.tsx e campaigns-dashboard.tsx:
- Corrigi “Ja tem uma sessao aberta?” para “Já tem uma sessão aberta?”
- Corrigi o placeholder “Código” para capitalização normal
- Deixei o placeholder Código com a mesma fonte de Nome da campanha

No lorebook.tsx e character-sheet.tsx:
- Aumentei Mapas da Campanha e Histórico da jornada
- Aumentei texto e SVG de Ler história completa
- Troquei o texto da História do personagem por uma fonte medieval mais coerente e legível

Rodada 6:

No campaign-room.tsx e app/globals.css:
- Criei ícones diferentes e coerentes para Céu limpo, Ensolarado, Nublado, Neblina, Chuvoso e Nevasca
- Troquei o ícone de Céu limpo na navbar para o mesmo sol com nuvem usado no painel
- Aumentei os SVGs de clima, Clima Dinâmico e Sincronizar
- Mantive Céu limpo com o fundo normal e mais visível
- Adicionei raios discretos de sol saindo do canto superior esquerdo em Ensolarado
- Deixei Nublado mais acinzentado e com nuvens em movimento
- Criei neblina translúcida com movimento constante e cobertura em camadas
- Restaurei a chuva caindo no fundo, com tonalidade azulada e sem riscos estáticos
- Restaurei a neve caindo no fundo e reduzi o excesso de branco da Nevasca
- Mantive as animações contínuas mesmo com regras globais de redução de movimento, respeitando o modo reduzido quando solicitado pelo sistema

Rodada 7:

No character-sheet.tsx e session-effects.tsx:
- Adicionei som de dado rolando para dados comuns, testes e perícias
- Troquei temporariamente os botões DEX, INS, MIG e WLP por um dado animado durante a apresentação da rolagem
- Impedi hover nos atributos de viajantes de outros jogadores, mantendo interação apenas nos viajantes controláveis
- Aumentei levemente o texto descritivo da notificação de rolagem
- Removi a repetição do resultado pequeno em rolagens normais e mantive somente o número final grande
- Coloquei a decomposição de testes e perícias abaixo do resultado final
- Deixei Mod negativo em vermelho e Mod positivo em verde
- Mantive exemplos como “[Vigor d8]”, “Percepção [INS+DEX d10 + d8]” e o cálculo detalhado legíveis

No character-sheet.tsx:
- Fixei HP/MP em 13px após os refinamentos de tamanho
- Fixei a descrição compacta e expandida no mesmo tamanho visual
- Ajustei a descrição expandida para não ficar maior do que a retraída

Rodada 8:

No app/globals.css e character-sheet.tsx:
- Aumentei muito levemente a escala geral da interface
- Reduzi separadamente a escala dos cards compactos para eles continuarem menores
- Reduzi padding, retrato e hierarquia dos cards sem alterar HP/MP de 13px
- Reduzi o véu escuro e a textura sobre a imagem de fundo para ela ficar mais nítida
- Criei uma linha lateral dourada somente no card dos viajantes pertencentes ao jogador
- Mantive nos demais cards apenas a borda estrutural comum

No campaign-room.tsx:
- Deixei Galeria arcana, Abrir acervo visual, Registros da Jornada e Enquete em andamento em branco bege
- Mantive os SVGs da galeria em azul e os SVGs do diário/enquete em amarelo/dourado
- Troquei “Abrir Acervo Visual” por “Abrir acervo visual”
- Troquei “Ler Diário do Mundo” temporariamente por “Ler dial” e depois corrigi para “Ler diário do mundo”
- Troquei “Enquete em Andamento” por “Enquete em andamento”

No battlemap-engine.tsx:
- Troquei “Sair do Mapa” por “Sair do mapa”
- Removi o botão destrutivo totalmente vermelho e apliquei o estilo bronze, preto e branco bege da interface

No imagepad.tsx:
- Reduzi levemente o SVG de Transmitir exibido no hover das imagens

Rodada 9:

No character-sheet.tsx:
- Aumentei novamente somente a foto e a moldura dentro dos cards, preservando os paddings compactos
- Aumentei levemente o nome dos viajantes nos cards compactos e expandidos
- Mantive HP/MP em 13px e a descrição no tamanho já aprovado

No app/globals.css e campaign-room.tsx:
- Retirei mais do véu sobre a imagem de fundo especificamente no clima Céu limpo
- Removi a coloração adicional do Céu limpo e reduzi sua vinheta
- Diferenciei a Neblina do Nublado com sete faixas horizontais translúcidas em alturas diferentes
- Adicionei deriva alternada, variação de opacidade, escala e movimento constante para a neblina
- Reduzi a coloração cinza geral da Neblina para ela parecer névoa em movimento, não apenas tempo nublado

Rodada 10:

No lib/store.ts:
- Removi o auto-save periódico que podia regravar um estado antigo da memória sobre o banco mais novo
- Passei a validar a estrutura do JSON antes de carregar ou salvar
- Criei gravação imediata em arquivo temporário, sincronização em disco e substituição atômica do banco
- Criei o arquivo vtt-database.json.bak com a última versão válida antes de cada substituição
- Criei bloqueio entre processos para impedir duas gravações simultâneas
- Adicionei recuperação pelo backup quando o banco principal estiver ausente ou corrompido
- Impedi que um banco inválido seja substituído por uma store vazia
- Preservei arquivos corrompidos com sufixo próprio antes do reparo
- Adicionei reconciliação por updatedAt para manter a versão mais nova de cada personagem
- Adicionei registros de exclusão para diferenciar remoção intencional de desaparecimento acidental
- Passei a carregar e persistir também o lore no mesmo banco

Nas APIs:
- Corrigi a criação de personagem para salvar a store ativa em vez de recarregar um retrato possivelmente antigo do disco
- Passei a salvar imediatamente criação, edição, transferência e exclusão de personagens
- Passei a salvar imediatamente criação, entrada e saída de campanhas
- Passei a salvar imediatamente criação, renomeação, exclusão, tokens e terreno de mapas
- Passei a salvar imediatamente alterações do lore e novas sessões de autenticação
- Registrei exclusões intencionais antes de remover personagens por arquivamento, morte ou saída de campanha

Na validação:
- Testei tudo em uma cópia isolada do banco real
- Confirmei cinco personagens no banco principal e cinco no backup após uma atualização
- Corrompi propositalmente a cópia principal e confirmei a recuperação da campanha com a Amélia presente
- Confirmei que a gravação seguinte reparou o principal e preservou o arquivo corrompido para diagnóstico
- Confirmei por SHA-256 que o vtt-database.json real não foi alterado durante o teste

Correções posteriores:

No character-sheet.tsx:
- Aumentei os retratos compactos para 72px no mobile e 80px no desktop
- Aumentei os retratos expandidos para 88px no mobile e 104px no desktop
- Aumentei os nomes compactos para 20px no mobile e aproximadamente 24px no desktop
- Aumentei também os nomes da ficha expandida
- Troquei a descrição compacta e expandida da fonte editorial serifada para Source Sans 3, mais arredondada e legível

No app/globals.css:
- Deixei o efeito Nublado mais azulado tanto na camada geral quanto nas nuvens em movimento
- Deixei a Neblina mais clara com tons de branco e cinza quente
- Removi o blend que podia criar artefatos sobre a interface durante o movimento da neblina
- Suavizei o blur e a opacidade das faixas para preservar a leitura dos cards

Na Galeria de Molduras:
- Aumentei o botão Escolher moldura de 22px para 30px e o SVG interno de 12px para 16px
- Ampliei o modal para até 768px, com título, subtítulo, botão de fechar, espaçamento e opções maiores
- Aumentei as prévias das molduras de 64px para até 96px
- Aumentei nomes, descrições e indicador de seleção das molduras
- Mantive duas colunas no mobile, três no desktop e rolagem interna em telas baixas

Correções de expansão, transições e hospedagem:

Na Galeria de Molduras:
- Troquei o nome da moldura “Ornamentada” por “Ornamental” sem alterar seu identificador salvo

No campaign-room.tsx e character-sheet.tsx:
- Mantive a tela da campanha montada enquanto a página de Novo viajante está aberta
- Removi a remontagem das fichas e o esqueleto rápido que aparecia ao voltar do criador
- Passei a controlar na sala qual viajante está expandido
- Fiz a expansão de uma ficha retrair automaticamente qualquer outra ficha aberta
- Suavizei padding, retrato, nome, borda e conteúdo durante a retração das fichas
- Mantive a expansão independente nas fichas abertas dentro dos modais de combate
- Coloquei a margem, a altura e a opacidade da Grade de batalha na mesma animação
- Isolei o acabamento interno da Grade de batalha para remover o salto final causado por padding e borda

Nos títulos e ações do mestre:
- Troquei somente os textos Berçário e Prontos para Invocação para branco bege
- Troquei somente os textos Gerenciar cenas, Diário do Mundo e Gerenciar enquetes para branco bege
- Troquei somente os textos Baú do mestre, Loots (NPCs), Bestiário do Mestre e Importar Mapa para branco bege
- Preservei as cores temáticas originais dos SVGs desses títulos e ações

Na auditoria de funcionamento:
- Confirmei a compilação TypeScript e o build otimizado do Next.js
- Confirmei a inicialização e as rotas em modo de produção
- Protegi transferência de viajantes com autenticação, posse ou permissão de mestre e vínculo do destino com a campanha
- Protegi leitura de mapas, lore e galeria para participantes autenticados da campanha
- Mantive o movimento de tokens disponível aos jogadores autenticados
- Validei ID, coordenadas e tipo antes de persistir movimentos de tokens
- Restringi importação, renomeação, exclusão e terreno dos mapas ao mestre
- Restringi edição do Diário do Mundo, da Galeria Arcana e controle de sons ao mestre
- Impedi que IDs de mapas de outra campanha sejam alterados pelas rotas atuais
- Testei criação, edição de zenits, transferência, movimento de token, mapa, lore, som e exclusão em uma cópia isolada
- Confirmei tombstone após exclusão e a presença da Amélia no banco principal e no backup de teste
- Confirmei que o banco real permaneceu com os cinco personagens e não recebeu os dados temporários da auditoria

Correções de fluidez e primeiro carregamento:

Nos cards de viajantes:
- Substituí a animação de altura do Framer Motion por uma transição contínua de linhas CSS Grid
- Mantive o conteúdo montado durante toda a retração e passei a desmontá-lo somente depois do fim da animação
- Sincronizei padding, retrato, nome e conteúdo com a mesma duração e curva de movimento
- Desativei a âncora automática de rolagem na lista e nas fichas
- Adicionei compensação progressiva da rolagem quando o conteúdo final deixa de precisar de scrollbar
- Reduzi o salto medido de rolagem de 220px em um quadro para no máximo 17px distribuídos continuamente
- Mantive a posição da ficha e o scroll da página totalmente estáveis no mobile
- Removi o esqueleto intermediário exibido por cada ficha no primeiro paint
- Passei a montar o conteúdo completo somente quando a ficha é realmente expandida
- Mantive a retração automática das outras fichas e a reabertura após desmontagem funcionando

Na Grade de batalha:
- Substituí montagem e desmontagem animada por uma estrutura estável em CSS Grid
- Mantive bordas, padding e conteúdo dentro da área recortada durante toda a retração
- Troquei a curva acelerada por uma curva simétrica e mais suave
- Reduzi o maior deslocamento medido por quadro de aproximadamente 49px para 13px
- Mantive o conteúdo invisível e sem interação quando a Grade de batalha está retraída

No primeiro carregamento:
- Adicionei aquecimento das páginas inicial, Salão de Campanhas e sala de campanha antes de abrir o navegador
- Adiei leitura e gravação dos caches locais pesados para o período ocioso do navegador
- Garanti que mapas e lore novos da API sempre prevaleçam sobre caches locais antigos
- Preservei a restauração do último mapa ativo mesmo quando a API responde antes do cache
- Confirmei primeiro conteúdo em aproximadamente 128ms e fichas em aproximadamente 164ms com o servidor aquecido
- Confirmei ausência de esqueletos, overflow e erros de console nos testes desktop e mobile
- Separei a montagem do conteúdo do estado visual de expansão para garantir animação também na primeira abertura e após a desmontagem
- Confirmei abertura, retração, reabertura e troca entre viajantes com 32 alturas intermediárias no desktop e no mobile
- Aumentei a duração da expansão e da retração dos cards de 520ms para 1100ms, com moldura, espaçamento, nome e rolagem sincronizados
- Confirmei de 65 a 66 alturas intermediárias por animação, sem alteração de scroll ou overflow no desktop e no mobile
- Corrigi a regra global de movimento reduzido que anulava a animação dos cards com uma duração forçada de 0,01ms quando as animações do Windows estavam desativadas
- Mantive a preferência de movimento reduzido no restante da interface e preservei 1100ms somente na expansão, retração, retrato, nome e espaçamento dos cards
- Ajustei a duração final dos cards de 1100ms para 850ms, mantendo a animação visível mesmo com as animações do Windows desativadas
- Reduzi a duração dos cards para 480ms e troquei a curva simétrica por uma curva de interface mais rápida, preservando a fluidez sem efeito de câmera lenta
- Corrigi a separação visual de "Abrir acervo visual" e "Ler diário do mundo" com espaços inseparáveis e espaçamento tipográfico explícito
- Adicionei identificadores individuais às conexões de presença e liberação imediata ao sair ou fechar a sala
- Removi o fallback antigo de presença do Salão de Campanhas e mantive múltiplas abas do mesmo usuário contabilizadas corretamente
- Reordenei a sidebar exclusiva dos jogadores para exibir Galeria arcana e Registros da Jornada antes de Mapas da Campanha

Temas, modais e habilidades de classe:

Nas habilidades dos viajantes:
- Substituí a montagem animada da descrição das Habilidades de Classe Ativas por uma expansão estável em CSS Grid
- Mantive a descrição da habilidade montada durante a abertura e a retração para eliminar o salto visual
- Preservei a animação da habilidade mesmo quando as animações do Windows estão desativadas
- Ajustei a duração para 280ms e confirmei estados intermediários contínuos ao abrir e fechar

No sistema de temas:
- Adicionei o botão Tema à navbar da sala de campanha
- Criei uma galeria visual com os temas Arquivo Arcano, Academia Celeste e Observatório Rubro
- Fiz cada tema trocar o papel de parede, a paleta principal, cards, navbar, sidebar, modais, abas e superfícies da interface
- Mantive o tema Arquivo Arcano com a identidade visual original
- Adicionei uma identidade azul-petróleo e ciano para o tema Academia Celeste
- Adicionei uma identidade carvão, vinho e dourado para o tema Observatório Rubro
- Criei o novo papel de parede gothic-observatory.png para o tema Observatório Rubro
- Salvei a escolha somente no localStorage de cada navegador, sem sincronização por campanha, API ou banco de dados
- Apliquei o tema antes do primeiro paint para evitar a troca visual durante o carregamento
- Confirmei que duas sessões do mesmo usuário podem manter temas diferentes ao mesmo tempo

Nos modais e ações das fichas:
- Removi o texto Personalização do retrato da Galeria de Molduras
- Troquei os títulos Mochila do Herói, Mercado & Forja e Ceder para branco bege
- Aumentei levemente a altura vertical do modal Ceder
- Troquei os textos dos botões Mochila e Loja da ficha expandida para branco bege sem alterar as cores dos SVGs
- Permiti fechar todos os modais ao clicar na área externa, preservando cliques e ações dentro do conteúdo
- Corrigi também o clique externo da imagem aberta em tela cheia na Galeria Arcana

No Baú do mestre e no Berçário:
- Troquei as abas Itens de Sistema, Criar Relíquia e Dar Dinheiro para o mesmo estilo de seleção das abas das fichas
- Mantive o mesmo hover escuro e a ausência do antigo fundo sólido no estado selecionado
- Aumentei o espaço inferior da área Sua Essência para impedir que o formulário encoste na borda do Berçário

Na validação visual:
- Confirmei os três temas em desktop e o seletor de temas no mobile
- Confirmei ausência de overflow horizontal nas duas larguras
- Confirmei fechamento por clique externo nos modais de tema, mochila, loja, Baú do mestre e Berçário
- Confirmei por medição que a habilidade percorre múltiplas alturas intermediárias ao abrir e fechar sem desmontar o conteúdo

Ajustes posteriores dos temas:
- Troquei o texto Diário do Mundo por Diário do mundo e apliquei branco bege somente ao texto do botão
- Substituí o fundo da Academia Celeste por uma academia-observatório noturna mais escura, contida e menos luminosa
- Atualizei também a prévia da Academia Celeste no seletor de temas
- Troquei o botão Novo viajante do tema Academia Celeste por um azul sólido, sem degradê
- Removi a malha quadriculada do Histórico da jornada nos temas Academia Celeste e Observatório Rubro
- Criei fundos próprios para o Histórico da jornada, com superfícies azul-petróleo e vinho, textura suave, bordas e cabeçalhos coerentes com cada tema
- Expandi o azul sólido do botão Novo viajante para todos os botões primários equivalentes do tema Academia Celeste
- Preservei os estilos próprios de botões outline, ghost, destrutivos e mágicos
- Mantive os seletores de clima e botões com tons funcionais próprios fora da substituição azul

Correções de superfícies nos novos temas:
- Troquei os textos principais do Histórico da jornada por tons claros próprios da Academia Celeste e do Observatório Rubro
- Criei cores secundárias legíveis para perfil, horário, rótulos e estados vazios do Histórico em cada tema
- Mantive os resultados destacados em ciano na Academia Celeste e em coral no Observatório Rubro
- Removi a herança das cores escuras do pergaminho dentro do Histórico dos novos temas
- Criei superfícies internas azuis para Galeria arcana, Biblioteca de sons e Diário do Mundo na Academia Celeste
- Criei superfícies internas vinho e rubras para esses mesmos modais no Observatório Rubro
- Personalizei fundos laterais, áreas profundas, campos e cards internos sem alterar estados ativos ou páginas de pergaminho
- Mantive os demais modais que já usavam rpg-modal sincronizados com as paletas dos temas
- Troquei o fundo antigo da Grade de batalha por uma cartografia azul na Academia Celeste
- Troquei o fundo antigo da Grade de batalha por uma cartografia rubra no Observatório Rubro
- Ajustei botões de mapas, estados ativos, ações e hovers para acompanharem cada paleta
- Removi a borda amarela e laranja de Mapas da Campanha na visão de jogador dos novos temas
- Confirmei por cores computadas e capturas reais os dois temas na visão de mestre e jogador
- Confirmei ausência de overflow horizontal em desktop e mobile

Persistência, recursos dos viajantes e áudio sincronizado:

Nos recursos das fichas:
- Passei Vida, Mente, Inventário, Pontos de Fabula e XP a usar um estado visual estável durante as alterações
- Fiz cliques rápidos de aumentar e diminuir serem calculados sobre o valor otimista mais recente
- Coloquei as gravações de recursos em uma fila sequencial para impedir respostas antigas de sobrescreverem valores novos
- Mantive a barra animada durante a atualização sem recuar ou avançar para um valor intermediário antigo
- Adicionei restauração do último valor confirmado caso uma gravação falhe
- Tornei o horário de atualização das fichas monotônico e ignorei eventos realtime mais antigos que o estado exibido

Na persistência do conteúdo da campanha:
- Criei um estado persistente central por campanha dentro do vtt-database.json
- Passei a salvar Galeria arcana, Diário do mundo, cenas, Berçário, loots de NPCs, rascunhos de enquetes, sons personalizados e clima no banco
- Mantive localStorage apenas como cache rápido e como origem de migração para instalações antigas
- Fiz o primeiro carregamento migrar automaticamente dados antigos do navegador e arquivos gallery separados sem apagar listas vazias válidas
- Fiz o estado retornado pelo servidor prevalecer imediatamente sobre caches antigos após a migração
- Mantive Galeria e Diário compatíveis com as rotas antigas, agora apontando para o mesmo estado central
- Mantive itens privados da Galeria e do Diário filtrados para jogadores sem permissão
- Adicionei gravação atômica, arquivo de backup e reconciliação do estado da campanha durante o salvamento do banco

No áudio da mesa:
- Criei um estado autoritativo dos sons ativos no servidor
- Fiz tocar, parar e parar tudo atualizarem esse estado antes da transmissão realtime
- Fiz o mestre parar o áudio localmente no mesmo instante do clique
- Impedi alterações no mixer de recriarem a conexão realtime
- Fiz cada reconexão consultar a lista atual de sons para corrigir automaticamente eventos de play ou pause perdidos
- Removi duplicações de uma mesma instância de áudio ao receber eventos repetidos
- Passei os links de sons personalizados para a persistência central da campanha

Na validação:
- Confirmei a compilação TypeScript sem erros
- Salvei todos os tipos de conteúdo em uma cópia isolada do banco, reiniciei completamente o servidor e confirmei a restauração de todos
- Confirmei por duas sessões reais de navegador que o pause chega ao jogador durante alterações rápidas no mixer
- Confirmei que um áudio parado não volta a tocar após recarregar e reconciliar a conexão do jogador
- Confirmei 103 amostras contínuas da barra de Vida sem movimento inverso durante cliques rápidos

Bloco de notas pessoal e editor de retratos:

No bloco de notas:
- Adicionei o botão Bloco de notas à navbar para mestre e jogadores
- Criei um modal responsivo para listar, pesquisar, criar, editar, salvar e excluir anotações
- Fiz alterações pendentes serem salvas antes de trocar de nota ou fechar o modal pelo fundo
- Adicionei tratamento visual de carregamento, salvamento e falhas de rede
- Limitei títulos, conteúdo e quantidade de notas para proteger o banco contra dados excessivos
- Criei uma API que identifica o usuário somente pela sessão autenticada e nunca aceita outro userId pelo navegador
- Separei as notas por campanha e usuário para que nem jogadores nem mestre tenham acesso aos blocos uns dos outros
- Persisti as notas pessoais dentro do vtt-database.json com timestamp monotônico, gravação atômica e backup
- Reconciliei as notas do banco principal e do backup sem misturar usuários

No editor de retratos:
- Fiz o clique direto no retrato abrir o editor somente para o proprietário do viajante
- Mantive o clique no nome e na seta como formas de expandir ou retrair a ficha
- Adicionei troca de imagem por arquivo local ou link direto
- Comprimi arquivos locais em WebP e reduzi dimensões grandes antes de persistir para limitar o crescimento do banco
- Adicionei reposicionamento por arraste e controles separados para eixo horizontal, eixo vertical e zoom
- Salvei o enquadramento sem alterar destrutivamente a imagem original
- Apliquei posição e zoom em cards, combate, Grade de batalha, painel do mestre e prévias de molduras
- Restringi também a API para impedir que mestre ou outro jogador altere foto e enquadramento de um viajante alheio
- Mantive troca de moldura independente do novo enquadramento

Na validação:
- Confirmei que mestre e jogador recebem blocos distintos e não conseguem ler as notas um do outro
- Reiniciei o servidor de teste e confirmei a persistência das notas das duas contas
- Confirmei que a alteração de retrato por um não proprietário recebe bloqueio 403
- Confirmei que posição e zoom do proprietário sobrevivem à reinicialização
- Validei abertura, salvamento e reaplicação visual do enquadramento em navegador real
- Inspecionei os modais em 1440x1000 e 390x844 sem overflow horizontal
- Confirmei ausência de erros de console e de página nos testes desktop e mobile
