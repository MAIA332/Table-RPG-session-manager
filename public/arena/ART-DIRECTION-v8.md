# Arena — revisão de modelos, interface e músicas

As caminhadas de Fander, Andreas, Valya, Thorfinn e Langris usam as linhas 1 e 2 dos próprios atlas `movement.webp`. Elas compartilham desenho, figurino e referência de altura de 200 pixels com os outros estados. Valya mantém o leque aberto. Joffrey usa novamente o repouso da linha 0 do seu modelo original, na mesma escala. Os arquivos antigos permanecem disponíveis, mas não são carregados para esses estados.

Lightea conserva sua caminhada aprovada. Seus outros 72 desenhos foram editados usando um recorte do rosto dessa caminhada como referência de óculos: armação angular escura, lentes discretas castanhas/cinzas e hastes finas. As poses foram separadas em seis pranchas de 12 quadros para a edição. Não se usou o rascunho anterior de óculos redondos dourados. O jogo carrega `movement-v8.webp` e `combat-v8.webp`.

As referências, os prompts completos e os caminhos das imagens originais estão em `.local-data/arena-v8/exact-glasses-generation.json`. `scripts/pack-arena-v8-glasses.mjs` apenas recorta e reorganiza os quadros gerados; `scripts/prepare-arena-v4.mjs .local-data/arena-v8/exact-pack.json` empacota os atlas. O manifesto v8 registra hashes e limites de cada quadro. A comparação ampliada dos rostos está em `.local-data/arena-v8/exact-glasses-comparison.png`.

A interface mostra apenas “Sair”, com fonte maior. O subtítulo do personagem recebeu deslocamento à direita, calculado com as métricas da fonte do nome. “SELEÇÃO DE PERSONAGEM” e “PERSONAGENS” compartilham a mesma família, peso e estilo. Foram retirados os subtítulos de mapas, a confirmação com check do card grande e o link de créditos do modal de comandos. As licenças dos sons continuam nos arquivos distribuídos.

`Tema arena.mp3` toca no menu; `Tema arena 2.mp3` toca na batalha. Um único player e uma única conexão de áudio são reutilizados, com ganho 0,12 e 0,035 na pausa. O mudo vale para ambos. O script `scripts/prepare-arena-v8-audio.mjs` copia os arquivos originais, sem recompressão.

Validação desta revisão:

- Build de produção e TypeScript sem erros.
- 40 testes de lógica, animação, integridade de assets e áudio passaram.
- Auditoria dos atlas sem quadros vazios, pixels encostados na borda ou fundos opacos detectados.
- 186 ações dos 12 personagens capturadas no renderizador real; relatório e imagens em `test-results/arena-character-review/index.html`.
- Teste no navegador de músicas, mudo, pausa, textos, menus e corpo imóvel de Miguel com marionete.
- Movimento, ataques, pausa e recuperação de carregamento com stream indisponível; seis tamanhos de tela sem rolagem do menu.
- Controle simulado com L3 + R3, direcional, confirmação, escolha de cenário, ataques e pausa.
- Navegação por todos os botões em três larguras e decodificação de 82 arquivos de efeitos sonoros.

Os testes de navegador usam exclusivamente a instância isolada em `127.0.0.1:3101` e seu banco de testes.
