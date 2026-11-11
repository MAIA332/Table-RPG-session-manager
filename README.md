# Table-RPG-session-manager

# Integração Gamepad/TV — Over the Magic School

Este patch foi preparado sobre `arquivo_final(1).zip` e contém **somente arquivos novos ou modificados**, mantendo a estrutura `Table-RPG-session-manager/`.

## Implementado

1. **Fundação de entrada:** `ControllerProvider` em `app/layout.tsx`, leitura da Gamepad API, reconhecimento de conexão/desconexão, deadzone, gatilhos, modificador LT, combinações LT+A/B/X/Y, LT+RB, antirrepetição, teclado em modo TV e ponte opcional WebView2. Ações nomeadas e prioridade por escopo; desfazer a pressão de LT não confirma ação B/A acidentalmente.
2. **Navegação:** foco direcional espacial para elementos HTML interativos, confirmação/cancelamento, integração com login/campanhas por foco nativo, abertura de ficha, mochila, lore, mapa e atalhos GM. Modais com `role="dialog"` têm precedência, e o modal da ficha recebeu ação de fechar acessível.
3. **Experiência RPG:** menu visual circular e páginas de slots LT; quatro habilidades adquiridas podem ser localizadas e focadas na ficha, mas **ativação e custo exigem confirmação posterior** via ação existente. Mapa com cursor por células, câmera, zoom, posicionamento/terreno, QTE priorizado e confirmação pelo botão A. Configurações locais para slots, deadzone, velocidade de repetição, escala TV e vibração opcional; feedback visual limitado ao modo controle.
4. **Modo TV/Xbox:** foco ampliado e HUD exibidos **somente** no modo gamepad/TV; entrada native-host WebView2 `otms.input.v1`. Diretório `xbox-prototype/` tem os arquivos `MainPage.xaml`, `MainPage.xaml.cs` e instruções para inserir num projeto UWP Blank App/WinUI2.
5. **Segurança/estabilidade:** novas senhas scrypt, autenticação de contas antigas SHA-256 preservada com atualização no próximo login, sessão criptograficamente aleatória, cookies `Secure` em produção, expiração de sessão e rate limit básico por processo em registro/login; `useRealtime` reconecta após retorno do BFCache. Testes Node (`npm run test:input`) sem dependências adicionais.

## Teclas padrão

| Comando | Ação |
|---|---|
| A | Confirmar/clicar no elemento com foco |
| B | Voltar/cancelar/fechar modal |
| Direcional ou analógico esquerdo | Mover foco; no mapa, câmera ou cursor de células |
| X | Mochila; no mapa, modo mover/câmera |
| Y | Ficha; no mapa, alternar ferramentas (inclui GM) |
| LB / RB | Anterior/próximo; mapa: zoom ou trocar token/terreno |
| LT + A/B/X/Y | Slots 1–4; por padrão, selecionar habilidade 1–4 na ficha |
| LT + RB | Alternar conjunto de quatro slots |
| View | Abrir/fechar mapa |
| Menu | Configurações de controle |
| RT | Levar foco à área de combate; **não ataca automaticamente** |
| Analógico direito no mapa | Deslocar câmera |

## Proteção da experiência PC

- `data-input="desktop"` é o comportamento padrão, sem HUD, estilos ampliados ou interceptação das setas/Enter/Escape.
- Detecção de controle é passiva e o polling diminui para aproximadamente 2,5 verificações/segundo enquanto o dispositivo não estiver sendo usado. Só ativamos o modo controle após nova entrada do gamepad ou opt-in.
- Ao clicar com o mouse, o modo `auto` volta para desktop. Os atalhos gamepad não invocam ataques/consumo de recursos sem passar pelas ações de UI ou servidor já existentes.
- O modo TV pode ser testado sem controle adicionando `?tv=1` à URL; a partir dele, as setas e Enter/Escape emularão navegação. `Ctrl+Alt+G` alterna o modo enquanto TV estiver ativo ou um controle estiver conectado.

## Testes executados neste ambiente

- `node --experimental-strip-types --test tests/input.test.mjs` — **11 testes passaram**: combinações, LT, anti-disparo de botão ao soltar LT, zona morta, repetição, segurança de configurações, prioridade de eventos, reconexão básica, password hashing e rate limit.
- Transpilação/sintaxe dos TS/TSX modificados via TypeScript — sem diagnósticos de sintaxe.
- Parsing XML de `xbox-prototype/MainPage.xaml` — válido.

**Não foi possível compilar o Next.js com todas as dependências aqui:** a instalação npm falhou por acesso DNS à registry (`EAI_AGAIN`); o projeto original não inclui `node_modules`. Isso também impede afirmar que todo o build está livre de erros de tipagem. Não foram realizados testes end-to-end de interface, simulação de mouse nem testes físicos com gamepad/Xbox.

## Pendências antes de certificar/publicar

- Executar `npm install` ou `pnpm install` conforme a configuração da equipe, `npm run test:input`, `npx tsc --noEmit`, `npm run build` e teste completo de regressão num ambiente com dependências instaladas. O `next.config.mjs` original possui `typescript.ignoreBuildErrors: true`; **não removi automaticamente**, pois há risco de interromper o build por erros legados não relacionados ao patch.
- Realizar testes de foco em todos os modais, editores de texto, controles 3D, importação de arquivos, menus especializados e tela de teclado virtual no Xbox real. A navegação genérica alcança controles semanticamente focáveis; elementos não acessíveis fora dos fluxos principais ainda podem requerer adaptação.
- Empacotar o shell nativo com projeto UWP, certificados e capacidades apropriadas; configurar URL HTTPS e teste em Developer Mode do console. Os arquivos do shell **não são um aplicativo pronto ou compilado**.
- Validar categoria do produto com a Microsoft: sessões síncronas/áudio/chat podem exigir Xbox network e ID@Xbox conforme política 10.13 vigente. Ver `xbox-prototype/README.md`. Nenhuma aprovação/publicação foi obtida.
- Se usar múltiplas instâncias do backend, trocar o barramento de eventos em memória por mensageria compartilhada (e rate limiter distribuído). O patch **não adiciona Redis ou migração de infraestrutura não solicitada**.
- Autenticação: testar migração das contas legadas e aplicar limites no gateway/proxy de produção. Garantir HTTPS em produção (cookies `Secure`).

## Recursos/requisitos na Store

- https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winui2
- https://learn.microsoft.com/en-us/windows/uwp/gaming/gamepad-and-vibration
- https://learn.microsoft.com/en-us/windows/apps/publish/store-policies-and-code-of-conduct
