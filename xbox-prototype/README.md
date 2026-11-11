# Over the Magic School — protótipo Xbox UWP/WebView2

**Estado:** código de integração inicial, não é um APPX/MSIX pronto e **não foi executado num Xbox**. O pacote do console exige Visual Studio no Windows, SDK, assinatura e testes no dispositivo. Não distribua como jogo aprovado pela Microsoft Store.

## Preparar o projeto no Windows

1. Visual Studio 2022 com desenvolvimento UWP e Windows SDK 10.0.22621 (ou requisitos atualizados da Microsoft).
2. Criar projeto **Blank App (Universal Windows) em C#**, namespace `OverTheMagicSchoolXbox`.
3. Adicionar pacote NuGet `Microsoft.UI.Xaml` (WinUI 2, versão suportada pelo SDK). Esse pacote disponibiliza o WebView2; consultar a documentação da versão usada.
4. Substituir os arquivos `MainPage.xaml` e `MainPage.xaml.cs` pelos exemplos deste diretório.
5. Em `MainPage.xaml.cs`, definir `SiteUrl` com a origem HTTPS publicada e aprovada. A URL `?tv=1` ativa a interface TV; isso não altera o site no PC.
6. Em Developer Mode no Xbox, compilar/deploy pelo Visual Studio. Verificar navegação A/B, LT+A/X/Y/B, LT+RB, controles D-pad, analógicos, suspender/retomar, teclado virtual, WebView2 e reconexão. O app web envia intenções ao servidor; o host não processa combate.

## Atenções de segurança

- Só navegue para o domínio HTTPS autorizado. O exemplo bloqueia navegação de página principal para outros domínios; revisar fluxos externos (música, OAuth, etc.) antes de publicar.
- A ponte `otms.input.v1` usa `CoreWebView2.PostWebMessageAsJson`; na aplicação React, somente mensagens provenientes de `window.chrome.webview` são aceitas. Em uso nativo, os eventos da Web Gamepad API são ignorados por curto período para evitar duplo disparo.
- Não coloque tokens ou segredos no executável; mantenha sessão em cookie HTTPS, `HttpOnly` e `Secure`.
- Para produção, conectar ciclo de vida real do UWP (`Suspending`, `Resuming`), tratar falhas do WebView2, rede offline, retorno do teclado na tela e múltiplos controles. O código incluído é um **protótipo**, não a implementação completa dos Xbox Requirements (XR).
- Os componentes nativos têm `Microsoft.UI.Xaml.Controls.WebView2` e `Windows.Gaming.Input.Gamepad`, compatíveis com UWP conforme documentação da Microsoft. **Pode existir limitação de recepção de controles diretamente no WebView2**; por isso a ponte nativa foi incluída.

## Categoria e Store — validar antes de publicar

A política 10.13 da Microsoft Store (v. 7.20, em vigor em 22/10/2026) exige, para produtos de jogo com comunicação entre jogadores ou partidas síncronas em Xbox, **Xbox network e aprovação via ID@Xbox**. Por se tratar de um RPG VTT com campanhas sincronizadas, tratar a categoria como pendência de aprovação, inclusive requisitos de login, identidade, interação entre usuários, controle parental, privacidade, dados gerados por usuários e classificação etária. A inclusão deste protótipo **não representa uma validação ou aprovação da Microsoft**.

Referências:
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/get-started/winui2
- https://learn.microsoft.com/en-us/windows/uwp/gaming/gamepad-and-vibration
- https://learn.microsoft.com/en-us/windows/apps/publish/store-policies-and-code-of-conduct
- https://github.com/microsoft/Media-App-Samples-for-Xbox
- https://github.com/MicrosoftEdge/WebView2Feedback/issues/4366
