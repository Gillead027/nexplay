# DISCORD_UI_ATLAS.md

Mapa completo da experiência operacional do NexPlay — toda interação, macro e micro, documentada como ficha individual. Ver `DISCORD_PARITY_PLAN.md` para o resumo de status por feature e `DISCORD_NAVIGATION_TREE.md` para a árvore de navegação. Este documento é vivo: cresce a cada auditoria, nunca resume interações parecidas como um grupo só.

**Como ler cada ficha**: campos vazios não existem — todo campo é preenchido, inclusive com "Não aplicável" quando genuinamente não se aplica (isso é uma resposta auditada, não uma omissão).

**Convenção de status por ficha**: `CORE` (existe, funciona, é o caminho normal do app), `PARTIAL` (existe mas incompleto — o campo relevante explica o que falta), `MISSING` (não existe — a ficha documenta o comportamento *esperado*, não o real, e isso é dito explicitamente), `DESKTOP_ONLY`, `ADMIN_ONLY`.

Progresso deste documento: **Roteiro 0 completo** (24 fichas, cliente desktop). **Roteiro 1 completo** (18 fichas, login/sessão). **Roteiro 2 completo** (11 fichas, navegação). **Roteiro 3 completo** (19 fichas, servidores e canais). **Roteiro 4 completo** (23 fichas, mensagens). **Roteiro 5 completo** (8 fichas, tempo real). **Roteiro 6 completo** (9 fichas, voz — núcleo). **Roteiro 7 completo** (12 fichas, voz — participantes/dispositivos/chat da call/PTT/perfis de microfone). **Roteiro 8 completo** (8 fichas, vídeo e tela compartilhada — exibição em grid/foco). **Roteiro 9 completo** (15 fichas, cargos/permissões/membros/moderação/convites). **Roteiro 10 completo** (7 fichas, configurações — aparência). **Roteiro 11 completo** (13 fichas, amigos e DMs). **Roteiro 12 completo** (8 fichas, configurações — meu perfil/conta e segurança/privacidade). **Roteiro 13 completo** (17 fichas, lista de membros, mini-perfil e painel do próprio usuário; numeração do Atlas, equivale aos roteiros 18 a 20 do pedido original). **Roteiro 14 completo** (14 fichas, notificações, não lidas, badges e avisos do desktop; equivale aos roteiros 32, 34 a 36, 52 e 53 do pedido original). **Roteiro 15 completo** (13 fichas, teclado, Esc, duplo clique, histórico, scroll, copiar, links e modo desenvolvedor; equivale aos roteiros 38 a 40, 54 a 60 do pedido original). Próximos (numeração do Atlas): 16 estados vazios/carregando/offline/permissões de dispositivo, 17 Premium/Loja/Sobre.

---

# ROTEIRO 0 — PROCESSO DO APLICATIVO DESKTOP

Arquitetura real (verificada lendo `apps/desktop/src/main.ts`, `preload.ts`, `updater.ts`, `activity.ts`, `picker.html`/`picker-renderer.ts`, e `apps/web/src/components/AppChrome.tsx`): Electron 44, janela única `frame: false` (título/bordas customizados), sandbox habilitado, `nodeIntegration` desabilitado, preload com `contextBridge` expondo só uma API `window.desktop.*` explícita. **Não existe processo separado de "servidor" local** — a janela carrega diretamente a URL de produção configurada (`desktop-config.json` no build empacotado, ou `NEXPLAY_APP_URL` em dev); todo o app roda como SPA remota dentro da `BrowserWindow`.

---

## 0.1 — APP_LAUNCH

**ID**: `APP_LAUNCH`
**NOME**: Iniciar o aplicativo
**PLATAFORMA**: `DESKTOP_WINDOWS` (código não tem branch por SO nesta etapa, mas só empacotado/testado pra Windows — ver `DISCORD_PARITY_PLAN.md` §0)
**CAMINHO EXATO**: `Executável NexPlay.exe (atalho, Menu Iniciar, ou duplo clique no instalador após instalação)`
**POSIÇÃO NA INTERFACE**: Não aplicável (ainda não há interface).
**APARÊNCIA**: Não aplicável antes do primeiro frame. Ícone do processo: `apps/desktop/build/icon.ico`.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Entre `app.whenReady()` e o primeiro `ready-to-show` da janela, não existe nenhuma tela de splash/loading visível — a `BrowserWindow` é criada com `show: false` e só aparece (`window.show()`) no evento `ready-to-show`, ou forçada após timeout de 8s (`forceShowTimer`) caso `ready-to-show` nunca dispare. Não há indicador de progresso visível ao usuário nesse intervalo — tela do SO fica como estava antes do clique.
**TRIGGER**: Duplo clique no ícone/atalho, ou Enter com o item focado no Menu Iniciar.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: Processo principal (`main.ts`) inicia; `app.setName('NexPlay')`; `app.enableSandbox()`; `app.requestSingleInstanceLock()` é chamado (ver `APP_SECOND_INSTANCE`).
**RESULTADO VISUAL**: Ícone aparece na barra de tarefas do Windows assim que a janela é criada (mesmo com `show:false`, o Electron já registra o processo). Nenhuma janela visível até `ready-to-show`.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Se `readConfiguredUrl()` falhar (arquivo `desktop-config.json` ausente/corrompido no build empacotado) ou se a URL configurada não for `https:` num build empacotado, o `whenReady().catch()`/`try` captura o erro e só grava em `debugLog` (arquivo `nexplay-startup-debug.log` em `%TEMP%`) — **nenhum diálogo nativo é mostrado ao usuário nesse caso específico**; o app fica com processo rodando e nenhuma janela visível, sem explicação na tela. Isso é uma lacuna real (ver `ERRO`).
**SEGUNDA ETAPA**: Ordem real de inicialização dentro de `whenReady()`: (1) resolve `appUrl` via `readConfiguredUrl()`; (2) `Menu.setApplicationMenu(null)` — remove a barra de menu nativa do Electron por completo; (3) `installPickerIpc()` registra todos os handlers IPC; (4) `installSessionSecurity(appUrl)` configura CSP e handlers de permissão de mídia; (5) `createMainWindow(appUrl)` cria e carrega a janela; (6) importa `activity.js` dinamicamente e inicia `startActivityMonitor`; (7) `initAutoUpdater()`.
**RESULTADO FINAL**: Janela visível, carregando a SPA web de produção via `window.loadURL()`. A partir daqui a experiência é idêntica à versão web rodando dentro do wrapper Electron — login, conexão ao backend e ao realtime acontecem inteiramente dentro do `WebContents`, não no processo principal.
**EFEITO LOCAL**: Novo processo do SO.
**EFEITO REMOTO**: Nenhum até o login.
**REALTIME**: Não aplicável nesta etapa (a conexão WebSocket só é aberta pelo código React depois de autenticado).
**BACKEND**: Nenhuma chamada de rede feita pelo processo principal nesta etapa — só o `WebContents` (a página web carregada) faz chamadas, e só depois que a página inicializa.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável (é o próprio boot).
**RECONEXÃO**: Não aplicável.
**ERRO**: Se `desktop-config.json` estiver ausente/corrompido: falha silenciosa, só logada em arquivo (`nexplay-startup-debug.log`), sem diálogo. Se a URL configurada não responder (servidor fora do ar): `did-fail-load` dispara e mostra `dialog.showMessageBox` do tipo erro com título "NexPlay indisponível" e detalhe com a origem + descrição do erro (exceto `errorCode === -3`, que é abort de navegação normal e é ignorado). **`MISSING`: nenhuma tela de "tentando reconectar automaticamente" com retry — o diálogo de erro é o estado final até o usuário fechar e reabrir o app.**
**CANCELAMENTO**: Não aplicável (não há passo intermediário cancelável pelo usuário).
**REVERSÃO**: Fechar o app (ver `WINDOW_CLOSE`).
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável nesta etapa.

---

## 0.2 — APP_SECOND_INSTANCE

**ID**: `APP_SECOND_INSTANCE`
**NOME**: Impedir/tratar segunda instância do aplicativo
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Sistema operacional > usuário abre o executável NexPlay.exe uma segunda vez enquanto a primeira instância já está rodando`
**POSIÇÃO NA INTERFACE**: Não aplicável.
**APARÊNCIA**: Não aplicável — não existe nenhuma UI própria para esse evento.
**ESTADO NORMAL**: `app.requestSingleInstanceLock()` chamado logo no início do `main.ts`, antes de qualquer criação de janela.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Segundo lançamento do executável (duplo clique no atalho, ou abrir de novo pelo Menu Iniciar) enquanto o primeiro processo ainda está vivo.
**PRÉ-CONDIÇÕES**: Uma instância já precisa deter o lock (`hasSingleInstanceLock === true` na primeira).
**RESULTADO IMEDIATO**: Na instância nova, `app.requestSingleInstanceLock()` retorna `false`; `app.quit()` é chamado imediatamente — a segunda instância encerra sem nunca chegar a `app.whenReady()`, sem criar janela nenhuma.
**RESULTADO VISUAL**: Na instância original (a que já estava rodando), o listener `app.on('second-instance', ...)` dispara: se `mainWindow.isMinimized()`, chama `mainWindow.restore()`; sempre chama `mainWindow.focus()`. A janela existente vem para frente e ganha foco.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: A animação de restaurar/focar janela é a nativa do compositor do Windows (Electron não controla isso diretamente).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Não há — o fluxo termina na janela existente ganhando foco.
**RESULTADO FINAL**: Apenas um processo NexPlay.exe continua vivo; a janela desse processo está visível, restaurada (se estava minimizada) e focada.
**EFEITO LOCAL**: Nenhuma mudança de estado de aplicação (não recarrega, não reconecta).
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado — a conexão WebSocket da instância original continua intacta.
**BACKEND**: Nenhuma chamada nova.
**BANCO**: Não aplicável.
**REFRESH**: Não ocorre.
**RECONEXÃO**: Não aplicável.
**ERRO**: `if (!mainWindow) return;` dentro do handler de `second-instance` — se por algum motivo a instância original ainda não tiver criado `mainWindow` (corrida rara durante o próprio boot), o evento é simplesmente ignorado, sem erro visível.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

**Nota de auditoria**: não existe *nenhuma* forma de o usuário abrir duas janelas do NexPlay lado a lado no Windows (nem para logar duas contas simultaneamente) — diferente do Discord real, que também é single-instance por padrão.

---

## 0.3 — WINDOW_MINIMIZE

**ID**: `WINDOW_MINIMIZE`
**NOME**: Minimizar janela
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > barra de título customizada (topo) > canto superior direito > primeiro dos três botões de janela`
**POSIÇÃO NA INTERFACE**: Extremo canto superior direito da janela, primeiro de três botões agrupados (`.window-controls` dentro de `.app-chrome`), à esquerda do botão de maximizar.
**APARÊNCIA**: Botão sem texto, ícone SVG de um traço horizontal único (`<path d="M0 5h10">`), 10×10px, `stroke: currentColor`. Sem background próprio no estado normal (herda de `.window-controls button` — ver `styles.css`).
**ESTADO NORMAL**: Ícone visível, sem destaque.
**HOVER**: Background muda (classe `.window-controls button:hover` no CSS — cor de destaque neutra, não vermelha, diferente do botão fechar).
**ACTIVE/PRESSED**: Sem estado visual distinto documentado além do `:hover` (não há regra CSS separada para `:active` neste botão).
**SELECTED**: Não aplicável (não é um item de seleção).
**DISABLED**: O botão só existe no DOM quando `window.desktop?.windowAction` está presente (isto é, dentro do wrapper Electron) — na versão web pura (navegador comum), o bloco inteiro `.window-controls` não é renderizado. Não existe estado "disabled" visual — é presença/ausência condicional.
**LOADING**: Não aplicável — a ação é síncrona do lado do SO.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Rodando dentro do cliente desktop Electron (não a versão web em navegador).
**RESULTADO IMEDIATO**: `window.desktop.windowAction('minimize')` chama `ipcRenderer.send('window:action', 'minimize')`; no processo principal, o handler `ipcMain.on('window:action', ...)` valida `event.sender === mainWindow.webContents` e chama `mainWindow.minimize()`.
**RESULTADO VISUAL**: Janela desaparece da área de trabalho e vai para a barra de tarefas do Windows, com a animação nativa de minimizar do próprio SO.
**RESULTADO SONORO**: Nenhum som próprio do NexPlay tocado nesta ação.
**ANIMAÇÃO**: Nativa do Windows (Electron não personaliza).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Clicar no ícone da barra de tarefas restaura a janela (comportamento nativo do SO, não código próprio do NexPlay).
**RESULTADO FINAL**: Processo continua rodando; se conectado a canal de voz, transmitindo tela, ou com WebSocket aberto, tudo continua ativo em segundo plano (ver `ROTEIRO 51 — BACKGROUND BEHAVIOR`, ainda não documentado neste arquivo) — não há código que pause/desconecte nada ao minimizar.
**EFEITO LOCAL**: Apenas visual — janela oculta.
**EFEITO REMOTO**: Nenhum — outros usuários não percebem diferença (usuário continua "conectado" normalmente se estava em call).
**REALTIME**: WebSocket não é afetado por minimizar.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Se `mainWindow` for `null` (janela já destruída) o handler simplesmente retorna sem fazer nada (`if (!mainWindow) return;`).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar no ícone da barra de tarefas do Windows.
**ATALHO**: Nenhum atalho de teclado dedicado documentado no código (`before-input-event` não trata nenhuma combinação para minimizar).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Minimizar"` no botão. Alcançável via Tab (é um `<button>` HTML padrão). Ativável via Enter/Espaço quando focado (comportamento nativo de `<button>`).

**Status**: `PARTIAL` — funciona, mas não há atalho de teclado nem feedback sonoro (Discord real também não tem som aqui, então isso não é uma lacuna real de paridade).

---

## 0.4 — WINDOW_MAXIMIZE

**ID**: `WINDOW_MAXIMIZE`
**NOME**: Maximizar janela
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > barra de título customizada > canto superior direito > segundo botão (do meio)`
**POSIÇÃO NA INTERFACE**: Entre o botão de minimizar e o de fechar.
**APARÊNCIA**: Ícone SVG de um quadrado vazado (`<rect>` sem preenchimento, borda 1px). Mesmo tratamento visual de fundo que o botão minimizar.
**ESTADO NORMAL**: Ícone de quadrado (representa "maximizar").
**HOVER**: Mesmo comportamento de destaque de fundo que `WINDOW_MINIMIZE`.
**ACTIVE/PRESSED**: Sem regra CSS distinta documentada.
**SELECTED**: Não aplicável.
**DISABLED**: Mesma condicional de presença que `WINDOW_MINIMIZE` (só existe dentro do Electron).
**LOADING**: Não aplicável.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Cliente desktop Electron.
**RESULTADO IMEDIATO**: `windowAction('toggle-maximize')` → handler `ipcMain.on('window:action', ...)`: `mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()`. **É um toggle único** — o mesmo clique maximiza ou restaura dependendo do estado atual.
**RESULTADO VISUAL**: Janela ocupa toda a área útil do monitor (respeitando a barra de tarefas do Windows).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Clicar no mesmo botão de novo restaura (ver `WINDOW_RESTORE` — é literalmente o mesmo botão/handler, não dois elementos separados).
**RESULTADO FINAL**: Janela maximizada; layout interno (sidebar/painel central/membros) se redistribui pela largura maior via CSS responsivo normal, sem nenhum código específico de "modo maximizado".
**EFEITO LOCAL**: Apenas visual.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Estado de maximizado **não é persistido** entre sessões — não há `window.on('maximize', ...)` salvando preferência em disco; cada novo lançamento do app abre no tamanho fixo `1440×900` definido em `createMainWindow` (`BrowserWindow({ width: 1440, height: 900, ... })`). **Isso é uma lacuna real: `MISSING` a persistência de tamanho/posição da janela entre sessões.**
**RECONEXÃO**: Não aplicável.
**ERRO**: Mesmo guard de `mainWindow` nulo que `WINDOW_MINIMIZE`.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar no mesmo botão de novo (chama `unmaximize()`).
**ATALHO**: Nenhum atalho de teclado dedicado no código. **Duplo clique na barra de título não tem listener no código (a confirmar se o Windows o trata sozinho, ver `DOUBLE_CLICK`, 15.7)** — a `.app-chrome-drag` (região arrastável, ver `WINDOW_DRAG`) não tem listener de `dblclick`, então o comportamento nativo esperado do Windows (duplo clique na titlebar maximiza) **não funciona** nesta janela `frame:false`. `MISSING`.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Maximizar"` fixo — **não muda para "Restaurar" quando a janela já está maximizada** (`PARTIAL`: leitor de tela sempre anuncia "Maximizar" mesmo quando a ação real seria restaurar).

**Status**: `PARTIAL` — funciona como toggle, mas (1) o ícone nunca muda visualmente para indicar "restaurar" quando já maximizado (mesmo SVG de quadrado sempre), (2) o `aria-label` não atualiza, (3) duplo clique na barra de título não maximiza, (4) estado não persiste entre sessões.

---

## 0.5 — WINDOW_RESTORE

**ID**: `WINDOW_RESTORE`
**NOME**: Restaurar janela (desfazer maximizar)
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > barra de título customizada > canto superior direito > mesmo botão de WINDOW_MAXIMIZE`
**POSIÇÃO NA INTERFACE**: Idêntica a `WINDOW_MAXIMIZE` — é o mesmo elemento DOM.
**APARÊNCIA**: Idêntica a `WINDOW_MAXIMIZE` — mesmo ícone de quadrado vazado, **não existe um ícone alternativo de "restaurar" (dois quadrados sobrepostos, como o Windows nativo usa)**.
**ESTADO NORMAL**: Botão visível, ícone de quadrado (o mesmo de maximizar).
**HOVER**: Idêntico a `WINDOW_MAXIMIZE`.
**ACTIVE/PRESSED**: Idêntico.
**SELECTED**: Não aplicável.
**DISABLED**: Idêntico.
**LOADING**: Não aplicável.
**TRIGGER**: Clique esquerdo, com a janela já maximizada.
**PRÉ-CONDIÇÕES**: `mainWindow.isMaximized() === true`.
**RESULTADO IMEDIATO**: Mesmo handler de `WINDOW_MAXIMIZE`: como já está maximizada, chama `mainWindow.unmaximize()`.
**RESULTADO VISUAL**: Janela volta para o tamanho/posição anterior à última maximização (gerenciado internamente pelo Electron/SO, não por código próprio do NexPlay).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — volta ao estado normal de janela flutuante.
**RESULTADO FINAL**: Janela no tamanho anterior à maximização (não necessariamente o tamanho original de 1440×900, se o usuário já tinha redimensionado antes de maximizar).
**EFEITO LOCAL**: Apenas visual.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não recarrega a interface — a SPA React não remonta, só o container nativo muda de tamanho (o CSS responde normalmente a `resize`).
**RECONEXÃO**: Não aplicável.
**ERRO**: Mesmo guard de `mainWindow` nulo.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar de novo maximiza.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Mesma lacuna de `aria-label` estático de `WINDOW_MAXIMIZE`.

---

## 0.6 — WINDOW_RESIZE

**ID**: `WINDOW_RESIZE`
**NOME**: Redimensionar janela arrastando borda/canto
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > borda ou canto da janela (área de ~4-8px sensível a arraste, gerenciada pelo próprio Chromium/SO para janelas frame:false)`
**POSIÇÃO NA INTERFACE**: Perímetro externo da janela.
**APARÊNCIA**: Cursor muda para seta de redimensionamento (↔, ↕, ↖↘, ↗↙) conforme a borda/canto — comportamento nativo do SO para janelas Electron `frame:false` com `resizable` não desabilitado explicitamente (o padrão é `true`).
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Cursor de redimensionamento aparece ao passar sobre a borda.
**ACTIVE/PRESSED**: Durante o arraste, a janela é redimensionada em tempo real (comportamento nativo do compositor do Windows).
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável — não há como desabilitar seletivamente.
**LOADING**: Não aplicável.
**TRIGGER**: Clique e arraste (drag) na borda/canto.
**PRÉ-CONDIÇÕES**: Janela não pode estar maximizada nem em tela cheia (redimensionar manualmente não se aplica nesses estados).
**RESULTADO IMEDIATO**: Dimensões da `BrowserWindow` mudam continuamente durante o arraste.
**RESULTADO VISUAL**: Layout CSS responde via media queries/flex normais — não há um breakpoint documentado explicitamente no código para "sidebar compacta"/"member list oculta" abaixo de uma largura mínima (`minWidth: 1280, minHeight: 720` já impede a janela de ficar pequena o bastante para a maioria dos breakpoints mobile-like listados no pedido do usuário). `PARTIAL`: o app não tem um modo "compacto" dedicado — ele só nunca fica pequeno o suficiente para precisar de um, por causa do `minWidth`/`minHeight` fixos.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Redimensionamento é instantâneo/contínuo, sem transição CSS amortecendo (o app não anima largura/altura de containers principais).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Soltar o botão do mouse finaliza o redimensionamento.
**RESULTADO FINAL**: Nova dimensão de janela.
**EFEITO LOCAL**: Apenas visual/layout.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Tamanho final **não é persistido** — mesma lacuna de `WINDOW_MAXIMIZE` (próximo lançamento sempre abre em 1440×900).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável — o SO impede redimensionar abaixo de `minWidth`/`minHeight`.
**CANCELAMENTO**: Pressionar Esc durante o arraste **não é interceptado** pelo NexPlay — é o comportamento padrão do SO (no Windows, geralmente não cancela um resize por arraste de mouse, diferente de um resize iniciado por teclado).
**REVERSÃO**: Arrastar de novo para o tamanho anterior (não há "desfazer").
**ATALHO**: Nenhum atalho de teclado para redimensionar.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Redimensionar por teclado (Alt+Espaço → Tamanho, no Windows) depende do menu de sistema nativo, que uma janela `frame:false` do Electron tipicamente não expõe da forma padrão — **não testado/confirmado no código**, marcado como lacuna de verificação.

---

## 0.7 — WINDOW_CLOSE

**ID**: `WINDOW_CLOSE`
**NOME**: Fechar janela (botão X)
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > barra de título customizada > canto superior direito > terceiro botão (mais à direita)`
**POSIÇÃO NA INTERFACE**: Extrema direita da barra de título.
**APARÊNCIA**: Ícone SVG de X (duas linhas diagonais cruzadas). Classe CSS própria `.window-close` (distinta dos outros dois botões) — no `styles.css`, geralmente ganha um vermelho de destaque no hover (padrão universal de botão fechar).
**ESTADO NORMAL**: Ícone X visível, sem destaque de cor.
**HOVER**: Fundo do botão fica vermelho/destaque de perigo (classe `.window-close:hover`, diferente do hover neutro dos outros dois botões).
**ACTIVE/PRESSED**: Sem regra CSS distinta documentada além do hover.
**SELECTED**: Não aplicável.
**DISABLED**: Mesma condicional de presença (só existe dentro do Electron).
**LOADING**: Não aplicável.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `windowAction('close')` → `ipcMain.on('window:action', ...)` → `mainWindow.close()`.
**RESULTADO VISUAL**: Janela fecha (desaparece).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: **`MISSING`**: nenhuma confirmação é mostrada mesmo se o usuário estiver conectado a um canal de voz, transmitindo tela ou com uma chamada ativa — `mainWindow.close()` é chamado direto, sem `event.preventDefault()` condicional em nenhum listener de `close`.
**SEGUNDA ETAPA**: `mainWindow.close()` dispara o evento `closed` da janela, que por sua vez seta `mainWindow = null`.
**RESULTADO FINAL — LACUNA CRÍTICA DE PARIDADE**: como `window-all-closed` está registrado como `app.on('window-all-closed', () => { app.quit(); })` **sem nenhuma condição de plataforma nem de "minimizar para bandeja"**, fechar a única janela **sempre mata o processo inteiro imediatamente**. **Não existe system tray, não existe opção "Minimizar para bandeja" em nenhuma configuração, e não existe nenhum código que mantenha o processo vivo com a janela fechada.** Isso é o oposto do comportamento do Discord real descrito no pedido do usuário (ROTEIRO 0.7/0.9): fechar o X deveria, por padrão configurável, apenas ocultar a janela e manter voz/WebSocket/notificações ativos. **Hoje o NexPlay não tem essa opção — X sempre encerra tudo.**
**EFEITO LOCAL**: Processo termina. Se conectado a voz: a conexão LiveKit cai abruptamente (sem um `room.disconnect()` explícito no processo principal — quem desconecta é o próprio navegador/WebContents sendo destruído, o que fecha as conexões de rede da aba, incluindo WebRTC e WebSocket, de forma implícita, não graciosa).
**EFEITO REMOTO**: Outros participantes da call veem o usuário desconectar (o LiveKit detecta a perda de conexão do lado do servidor, não por um evento explícito de "saiu"). Pode haver um pequeno atraso até o SFU detectar a queda comparado a um `disconnect()` explícito.
**REALTIME**: WebSocket fecha abruptamente (`window-all-closed` não dá tempo para um fechamento gracioso com aviso ao backend).
**BACKEND**: Nenhuma chamada explícita de "estou saindo" é feita — o backend só percebe pela conexão caindo (o mesmo tratamento que uma queda de internet).
**BANCO**: Nenhuma escrita síncrona de "última vez visto"/logout documentada nesta etapa.
**REFRESH**: Não aplicável (processo morreu).
**RECONEXÃO**: Não aplicável — reabrir o app é um `APP_LAUNCH` novo, não uma reconexão.
**ERRO**: Nenhum tratamento de erro específico — `app.quit()` é chamado incondicionalmente.
**CANCELAMENTO**: **`MISSING`** — não há como cancelar o fechamento (nenhum diálogo de confirmação existe).
**REVERSÃO**: Não aplicável — uma vez fechado, só reabrir o app do zero (`APP_LAUNCH`).
**ATALHO**: Ver `APP_ALT_F4` — mesmo comportamento, mesmo caminho de código (`window-all-closed`).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Fechar"`. Alcançável via Tab, ativável via Enter/Espaço.

**Status**: `PARTIAL`/`BROKEN` frente ao pedido do usuário — o botão funciona (fecha a janela), mas a *política* esperada (minimizar para bandeja por padrão, opção configurável, processo sobrevivendo com voz ativa) está inteiramente ausente. Ver `DISCORD_PARITY_PLAN.md` para o item de trabalho correspondente.

---

## 0.8 — APP_ALT_F4

**ID**: `APP_ALT_F4`
**NOME**: Atalho de teclado Alt+F4 para fechar
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > qualquer tela > atalho global do Windows Alt+F4`
**POSIÇÃO NA INTERFACE**: Não aplicável (atalho de teclado, sem elemento visual próprio).
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Combinação de teclado Alt+F4.
**PRÉ-CONDIÇÕES**: Janela do NexPlay em foco.
**RESULTADO IMEDIATO**: Alt+F4 é um atalho do **Windows**, não interceptado pelo `before-input-event` do NexPlay (que só trata Ctrl/Cmd+R, F5, F11 e Esc-em-fullscreen) — o SO envia o pedido de fechar janela padrão, que o Electron traduz na mesma sequência de `mainWindow.close()` → `window-all-closed` → `app.quit()` de `WINDOW_CLOSE`.
**RESULTADO VISUAL**: Idêntico a `WINDOW_CLOSE`.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Nenhum (mesma lacuna de `WINDOW_CLOSE`).
**SEGUNDA ETAPA**: Idêntica a `WINDOW_CLOSE`.
**RESULTADO FINAL**: Idêntico a `WINDOW_CLOSE` — processo encerra por completo, sem distinção de política.
**EFEITO LOCAL**: Idêntico a `WINDOW_CLOSE`.
**EFEITO REMOTO**: Idêntico a `WINDOW_CLOSE`.
**REALTIME**: Idêntico a `WINDOW_CLOSE`.
**BACKEND**: Idêntico a `WINDOW_CLOSE`.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Nenhum tratamento específico.
**CANCELAMENTO**: `MISSING`, mesma lacuna de `WINDOW_CLOSE`.
**REVERSÃO**: Não aplicável.
**ATALHO**: É o próprio atalho documentado aqui.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

**Nota de auditoria**: o pedido do usuário pede explicitamente para "não assumir automaticamente que é igual ao X" e "implementar política consistente configurável" — hoje **os dois são literalmente o mesmo código-caminho** (`window-all-closed`), sem nenhuma distinção. Confirmado lendo o código: não existe handler de teclado para Alt+F4 nem qualquer lógica que diferencie a origem do fechamento.

---

## 0.9 — SYSTEM_TRAY *(MISSING)*

**ID**: `SYSTEM_TRAY`
**NOME**: Ícone e menu da bandeja do sistema
**PLATAFORMA**: `DESKTOP_WINDOWS`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência total no código: `main.ts` não importa `Tray` nem `nativeImage` do módulo `electron`, não há nenhuma chamada a `new Tray(...)`, nenhum `tray.setContextMenu(...)`, nenhum `tray.on('click', ...)`. Não existe em nenhum outro arquivo de `apps/desktop/src/`.
**CAMINHO EXATO ESPERADO** (não implementado): `Barra de tarefas do Windows > área de notificação (bandeja) > ícone NexPlay`
**O que isso bloqueia diretamente**:
- Não há ícone na bandeja em momento nenhum, mesmo com o app rodando.
- Não há menu de clique direito na bandeja (Abrir/Mute/Deafen/Desconectar da call/Status/Configurações/Sair).
- Não há diferenciação entre "esconder janela" e "sair de verdade" — porque não existe o mecanismo de bandeja que tornaria essa diferenciação útil (ver `WINDOW_CLOSE`).
- `TRAY_OPEN`, `TRAY_QUIT`, `TRAY_MUTE`, `TRAY_DEAFEN`, `TRAY_DISCONNECT` (IDs sugeridos pelo próprio pedido do usuário): todos `MISSING`, sem exceção.
**Pré-requisito de arquitetura para implementar**: exigiria (a) criar o `Tray` no `main.ts` com um ícone dedicado (não pode reusar o `.ico` da janela sem verificar tamanho recomendado de 16×16/32×32 para bandeja), (b) expor estado de voz (mute/deafen/conectado) do `WebContents` (React) de volta para o processo principal via IPC reverso (hoje o IPC é unidirecional: o preload só expõe chamadas do renderer para o main — não existe um canal para o main perguntar "está mutado?" ao renderer), (c) mudar a política de `WINDOW_CLOSE`/`window-all-closed` para condicionalmente ocultar em vez de encerrar.

---

## 0.10 — AUTO_LAUNCH_ON_BOOT *(MISSING)*

**ID**: `AUTO_LAUNCH_ON_BOOT`
**NOME**: Iniciar o NexPlay junto com o Windows
**PLATAFORMA**: `DESKTOP_WINDOWS`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhuma chamada a `app.setLoginItemSettings(...)` em `main.ts` ou em qualquer outro arquivo de `apps/desktop/src/`.
**CAMINHO EXATO ESPERADO** (não implementado): `Configurações > Aplicativo/Desktop/Windows > "Abrir ao iniciar"`
**O que isso bloqueia**: não existe nem o toggle na UI de configurações (não há uma seção "Windows"/"Desktop" nas configurações do app hoje — ver auditoria de `ROTEIRO 21/22`, pendente neste documento) nem o mecanismo nativo por trás dele.

---

## 0.11 — START_MINIMIZED *(MISSING)*

**ID**: `START_MINIMIZED`
**NOME**: Iniciar o aplicativo já minimizado/na bandeja
**PLATAFORMA**: `DESKTOP_WINDOWS`
**STATUS**: **`MISSING` por completo**, e **`BLOCKED` por `SYSTEM_TRAY` estar ausente** — sem bandeja, "iniciar minimizado" não teria para onde ir (a janela precisaria aparecer na barra de tarefas mesmo assim, ou o app ficaria invisível sem nenhuma forma de abri-lo).
**CAMINHO EXATO ESPERADO** (não implementado): `Configurações > Aplicativo/Desktop/Windows > "Iniciar minimizado"`
**Confirmado por ausência**: `createMainWindow` sempre cria a janela com `show: false` inicial só por causa da técnica de `ready-to-show` (ver `APP_LAUNCH`), não por uma preferência de usuário — a janela sempre aparece assim que carrega, sem checar nenhuma configuração de "iniciar minimizado".

---

## 0.12 — WINDOW_FOCUS / WINDOW_BLUR

**ID**: `WINDOW_FOCUS_BLUR`
**NOME**: Ganhar/perder foco da janela
**PLATAFORMA**: `DESKTOP_WINDOWS` (e `WEB`, via evento de foco do navegador/aba)
**CAMINHO EXATO**: `Sistema operacional > troca de janela ativa (Alt+Tab, clique em outra janela, clique de volta no NexPlay)`
**POSIÇÃO NA INTERFACE**: Não aplicável.
**APARÊNCIA**: Nenhuma mudança visual documentada na própria janela do NexPlay ao perder/ganhar foco (sem "dimming" ou indicador de inatividade no título).
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Troca de janela ativa pelo SO/usuário.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: **`MISSING` no processo principal** — `main.ts` não registra nenhum listener `window.on('focus', ...)`/`window.on('blur', ...)`. Não há nenhum sinal de foco repassado para o processo principal nem para o React via IPC.
**RESULTADO VISUAL**: Nenhum.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: **Lacuna real de paridade**: o pedido do usuário pede explicitamente que notificações desktop nativas apareçam quando o app está sem foco, e que nada seja "marcado como lido automaticamente" só por a janela existir. Como não há detecção de foco/blur em lugar nenhum do código (nem no processo principal, nem confirmado ainda na camada React — ver auditoria pendente de `ROTEIRO 35`), **não é possível hoje diferenciar "app em primeiro plano" de "app em segundo plano" para decidir se dispara notificação nativa**. Isso é uma dependência direta para qualquer sistema de notificações desktop funcionar corretamente (ver `DISCORD_PARITY_PLAN.md`: "Notificações (sistema/push) | MISSING").
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

---

## 0.13 — WINDOW_DRAG (arrastar pela barra de título)

**ID**: `WINDOW_DRAG`
**NOME**: Mover a janela arrastando a barra de título
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > barra de título customizada (topo) > área entre a marca/logo e os três botões de janela`
**POSIÇÃO NA INTERFACE**: Faixa horizontal no topo da janela, elemento `.app-chrome-drag` dentro de `.app-chrome` (`AppChrome.tsx`), ocupando o espaço restante entre a extremidade esquerda e os botões de janela à direita.
**APARÊNCIA**: Invisível — é uma `<div>` sem conteúdo, só com CSS `-webkit-app-region: drag` (inferido pelo padrão universal do Electron para regiões arrastáveis; não lido diretamente no CSS nesta auditoria, mas é o único mecanismo possível para arrastar uma janela `frame:false`).
**ESTADO NORMAL**: Cursor normal.
**HOVER**: Nenhuma mudança visual documentada.
**ACTIVE/PRESSED**: Durante o arraste, a janela segue o cursor.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Clique e arraste (drag) na região.
**PRÉ-CONDIÇÕES**: Janela não pode estar maximizada nem em tela cheia (mover uma janela maximizada normalmente a restaura automaticamente primeiro — comportamento nativo do SO/Electron, não código próprio do NexPlay).
**RESULTADO IMEDIATO**: Janela segue o cursor.
**RESULTADO VISUAL**: Posição da janela na tela muda.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma (movimento 1:1 com o cursor).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Soltar o botão do mouse finaliza o arraste.
**RESULTADO FINAL**: Nova posição de janela na tela.
**EFEITO LOCAL**: Apenas visual.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Posição **não é persistida** — mesma lacuna de `WINDOW_MAXIMIZE`/`WINDOW_RESIZE` (próximo lançamento não lembra onde a janela estava).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável (soltar em qualquer ponto é válido).
**REVERSÃO**: Arrastar de volta manualmente.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Mover janela por teclado (Alt+Espaço → Mover, no Windows) — mesma lacuna de verificação de `WINDOW_RESIZE` (depende do menu de sistema nativo, não confirmado para janela `frame:false`).

---

## 0.14 — APP_FULLSCREEN_TOGGLE (F11)

**ID**: `APP_FULLSCREEN_TOGGLE`
**NOME**: Alternar tela cheia nativa
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > qualquer tela > tecla F11`
**POSIÇÃO NA INTERFACE**: Não aplicável (atalho global dentro da janela, sem botão dedicado na UI documentado nesta auditoria).
**APARÊNCIA**: Não aplicável ao próprio atalho; em tela cheia, a barra de título customizada (`.app-chrome`) continua renderizada pelo React (o toggle é de janela, não afeta o DOM), então os três botões de janela continuam visíveis mesmo em tela cheia — **comportamento a confirmar visualmente**, mas nada no código esconde `.app-chrome` condicionalmente ao estado de fullscreen.
**ESTADO NORMAL**: Janela em modo janela normal.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Tecla F11 (interceptada em `before-input-event`: `if (input.key === 'F11') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }`). Também acionável programaticamente pelo React via `window.desktop.setFullscreen(enabled)` (exposto no preload, usado provavelmente pela função de vídeo/palco de tela — ver `ROTEIRO 17`, pendente).
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `window.setFullScreen(true/false)` chamado no processo principal.
**RESULTADO VISUAL**: Janela ocupa o monitor inteiro, sem bordas nem barra de tarefas visível (fullscreen nativo do SO).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Os listeners `window.on('enter-full-screen', emitFullscreenState)` e `window.on('leave-full-screen', emitFullscreenState)` disparam `window.webContents.send('window:fullscreen-changed', fullscreen)` — o React recebe esse evento via `window.desktop.onFullscreenChanged(listener)` (exposto no preload) e pode reagir (por exemplo, ajustando UI que dependa de saber se está em tela cheia).
**RESULTADO FINAL**: App em modo tela cheia, com o estado sincronizado de volta para o React.
**EFEITO LOCAL**: Apenas visual/janela.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Estado de fullscreen não persiste entre sessões (mesma categoria de lacuna de `WINDOW_MAXIMIZE`).
**RECONEXÃO**: Não aplicável.
**ERRO**: Guard: `if (!mainWindow || event.sender !== mainWindow.webContents || typeof enabled !== 'boolean') return false;` no handler IPC `window:set-fullscreen` — chamada inválida é ignorada silenciosamente, retornando `false`.
**CANCELAMENTO**: Ver `APP_FULLSCREEN_EXIT_ESC`.
**REVERSÃO**: F11 de novo, ou Esc (ver próxima ficha).
**ATALHO**: F11 (documentado acima). É o único atalho de teclado customizado além de reload e Esc-em-fullscreen.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável ao atalho em si; usuários de teclado têm acesso total via F11.

---

## 0.15 — APP_FULLSCREEN_EXIT_ESC

**ID**: `APP_FULLSCREEN_EXIT_ESC`
**NOME**: Sair da tela cheia com Esc
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > modo tela cheia ativo > tecla Esc`
**POSIÇÃO NA INTERFACE**: Não aplicável.
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Não aplicável (só existe estando em fullscreen).
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Tecla Esc, **somente quando `window.isFullScreen() === true`** — código exato: `else if (input.key === 'Escape' && window.isFullScreen()) { event.preventDefault(); window.setFullScreen(false); }`, interceptado antes de chegar ao React.
**PRÉ-CONDIÇÕES**: Janela precisa estar em modo tela cheia.
**RESULTADO IMEDIATO**: `window.setFullScreen(false)` — sai do modo tela cheia imediatamente, sem confirmação.
**RESULTADO VISUAL**: Janela volta ao tamanho/posição de janela normal anterior.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Mesmo evento `leave-full-screen` → `window:fullscreen-changed` de `APP_FULLSCREEN_TOGGLE`.
**RESULTADO FINAL**: Janela em modo normal.
**EFEITO LOCAL**: Apenas visual.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável (a própria ação já é uma "saída").
**REVERSÃO**: F11 ou o gatilho original que ativou fullscreen entra de novo.
**ATALHO**: Esc (documentado acima).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Comportamento importante para acessibilidade de teclado — usuário nunca fica "preso" em tela cheia sem saída por teclado.

**Nota de auditoria importante**: essa interceptação de Esc é feita **inteiramente no processo principal do Electron**, antes de o evento chegar ao React (`event.preventDefault()` no nível do `before-input-event`). Isso significa que a "prioridade de Esc" pedida pelo usuário no `ROTEIRO 39` (fechar modal > fechar menu de contexto > fechar emoji picker > cancelar reply > comportamento padrão) **nunca chega a competir com o Esc de sair da tela cheia** quando ambos poderiam se aplicar — sair do fullscreen sempre vence, incondicionalmente, se `isFullScreen()` for verdadeiro. Se o usuário tiver um modal Y aberto E estiver em tela cheia ao mesmo tempo e apertar Esc, o app sai do fullscreen em vez de fechar o modal. **Isso é um conflito real de prioridade ainda não resolvido**, documentado aqui para ser tratado quando o `ROTEIRO 39` for auditado.

---

## 0.16 — APP_RELOAD (Ctrl+R / F5)

**ID**: `APP_RELOAD`
**NOME**: Recarregar a página do aplicativo
**STATUS ATUAL — CORREÇÃO (Roteiro 15 do Atlas)**: esta ficha deixava "a confirmar" se o app volta ao mesmo servidor e canal. **Não volta**: medido, estando em `#segundo`, o F5 devolveu `#geral`. Ver `STATE_RESTORE_ON_RELOAD` (15.9).
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Aplicativo > qualquer tela > Ctrl+R, Cmd+R, ou F5`
**POSIÇÃO NA INTERFACE**: Não aplicável.
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Durante o reload, a página web recarrega do zero — não há uma tela de loading própria do NexPlay para esse caso específico (é o comportamento padrão de recarregar uma página, com a tela ficando em branco/com o fundo `backgroundColor: '#111315'` da janela até o novo conteúdo pintar).
**TRIGGER**: `Ctrl+R`/`Cmd+R` (sem Alt, sem Shift) ou `F5`, interceptados em `before-input-event`: `window.webContents.reloadIgnoringCache()`.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `reloadIgnoringCache()` — recarrega ignorando qualquer cache HTTP, forçando buscar tudo de novo da rede (não é um reload normal de cache-first).
**RESULTADO VISUAL**: Tela pisca para o `backgroundColor` de fundo e a SPA remonta do zero.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma própria.
**POPOVER**: Fecha (todo estado de UI React é perdido).
**MENU**: Fecha.
**MODAL**: Fecha — qualquer modal aberto (configurações, criar canal, etc.) é perdido sem aviso.
**SEGUNDA ETAPA**: A SPA reinicializa: verifica sessão, reconecta WebSocket, recarrega servidor/canal ativo salvo (comportamento a confirmar na auditoria da camada React, `ROTEIRO 63`/refresh, pendente).
**RESULTADO FINAL**: App volta ao estado pós-login, navegado para o mesmo servidor/canal que estava ativo antes (assumindo que isso é persistido em `localStorage` — a confirmar).
**EFEITO LOCAL**: **Se conectado a um canal de voz no momento do reload, a conexão LiveKit cai** (a mesma sessão de WebContents que hospeda a conexão RTC é recarregada) — **`MISSING`: nenhuma reconexão automática de voz pós-reload confirmada no código auditado até agora** (pendente confirmar na auditoria da camada de voz).
**EFEITO REMOTO**: Outros participantes de uma call veem o usuário cair (mesmo efeito que uma queda de conexão).
**REALTIME**: WebSocket cai e precisa reabrir do zero.
**BACKEND**: Todas as chamadas HTTP de inicialização (sessão, servidores, canais) são refeitas.
**BANCO**: Nenhuma escrita nova além do que o boot normal já faz.
**REFRESH**: É a própria ação.
**RECONEXÃO**: Ver `EFEITO LOCAL` — reconexão de voz após reload não confirmada como automática.
**ERRO**: Se o backend estiver fora do ar no momento do reload, mesmo tratamento de `did-fail-load` de `APP_LAUNCH` se aplica.
**CANCELAMENTO**: Não aplicável — não há como interromper um reload já disparado.
**REVERSÃO**: Não aplicável.
**ATALHO**: Ctrl+R / Cmd+R / F5 (documentado acima).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

---

## 0.17 — APP_AUTO_UPDATE_CHECK

**ID**: `APP_AUTO_UPDATE_CHECK`
**NOME**: Verificação automática de atualização ao iniciar
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Processo principal > initAutoUpdater() > chamado uma vez ao final do whenReady()`
**POSIÇÃO NA INTERFACE**: Não aplicável — inteiramente em segundo plano, sem indicador visual de "verificando".
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: `if (!app.isPackaged) return;` — checagem de atualização **nunca roda em modo desenvolvimento**, só no build empacotado/instalado.
**LOADING**: Nenhum indicador visual — o único feedback é um log em arquivo (`updater.log` em `app.getPath('userData')`) e eventos internos (`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`), **nenhum desses eventos é repassado para a UI React** — o usuário não vê "verificando atualização..." em lugar nenhum da interface.
**TRIGGER**: Automático, uma vez por lançamento do app (`autoUpdater.checkForUpdates()` chamado uma vez dentro de `initAutoUpdater()`). **`MISSING`: nenhum botão manual de "Verificar atualização agora"** em nenhuma tela de configurações auditada até agora (ver `ROTEIRO 69 — Sobre`, pendente de auditoria completa, mas o próprio pedido do usuário lista esse botão como esperado).
**PRÉ-CONDIÇÕES**: `app.isPackaged === true` (só builds instalados, não builds de desenvolvimento).
**RESULTADO IMEDIATO**: `electron-updater` consulta o feed de releases configurado (GitHub Releases, conforme `DISCORD_PARITY_PLAN.md` §0) para comparar a versão instalada (`app.getVersion()`, hoje `0.2.10`) contra a mais recente publicada.
**RESULTADO VISUAL**: Nenhum, a menos que uma atualização seja encontrada e baixada por completo (ver `APP_AUTO_UPDATE_DOWNLOAD`/`APP_AUTO_UPDATE_INSTALL_PROMPT`).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável nesta etapa (só na etapa de instalação, ver próxima ficha).
**SEGUNDA ETAPA**: Se encontrar atualização, `autoUpdater.autoDownload = true` já dispara o download automaticamente, sem pedir permissão prévia ao usuário.
**RESULTADO FINAL**: Log gravado; download iniciado automaticamente se houver versão nova.
**EFEITO LOCAL**: Nenhum visível.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não relacionado ao WebSocket do app (é uma conexão HTTP separada para o feed de updates).
**BACKEND**: Chamada de rede para o serviço de releases (GitHub), não para a API do NexPlay.
**BANCO**: Não aplicável.
**REFRESH**: Roda de novo a cada novo lançamento do app (não uma única vez por instalação).
**RECONEXÃO**: Não aplicável.
**ERRO**: `autoUpdater.on('error', (error) => logUpdate('ERRO: ...'))` — **erro só vai para o arquivo de log, nunca aparece na UI nem em um diálogo.** Se o feed de releases estiver inacessível (ex.: sem internet), a checagem falha silenciosamente do ponto de vista do usuário.
**CANCELAMENTO**: Não aplicável (é automático, sem etapa manual para cancelar).
**REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

---

## 0.18 — APP_AUTO_UPDATE_DOWNLOAD

**ID**: `APP_AUTO_UPDATE_DOWNLOAD`
**NOME**: Download automático da atualização encontrada
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: Continuação de `APP_AUTO_UPDATE_CHECK` — sem etapa de UI própria.
**POSIÇÃO NA INTERFACE**: Não aplicável — nenhuma barra de progresso, nenhuma notificação visível na UI React.
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: `autoUpdater.on('download-progress', (progress) => logUpdate('Baixando… ${Math.round(progress.percent)}%'))` — **progresso só vai para o log em arquivo, nunca para a tela.** `MISSING`: usuário não tem nenhuma forma de saber que um download está em andamento, nem seu progresso, enquanto usa o app normalmente.
**TRIGGER**: Automático, disparado por `APP_AUTO_UPDATE_CHECK` encontrar uma versão nova (`autoUpdater.autoDownload = true`).
**PRÉ-CONDIÇÕES**: `update-available` disparado com sucesso.
**RESULTADO IMEDIATO**: Download do instalador/pacote de atualização começa em segundo plano, sem interromper o uso do app.
**RESULTADO VISUAL**: Nenhum até `update-downloaded`.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável nesta etapa.
**SEGUNDA ETAPA**: `update-downloaded` dispara o diálogo de instalação (ver próxima ficha).
**RESULTADO FINAL**: Pacote de atualização salvo localmente, pronto para instalar.
**EFEITO LOCAL**: Uso de disco/rede em segundo plano — sem limite de banda configurado, sem opção de pausar.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não relacionado.
**BACKEND**: Download de um binário externo (GitHub Releases), não da API do NexPlay.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: **`MISSING`: nenhuma lógica de retry documentada se o download falhar no meio** — só o evento `error` genérico, que vai para o log.
**ERRO**: Mesmo tratamento de `APP_AUTO_UPDATE_CHECK` — só log, nunca UI.
**CANCELAMENTO**: **`MISSING`** — não há nenhuma forma de o usuário cancelar um download de atualização em andamento (nem saberia que está acontecendo).
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

---

## 0.19 — APP_AUTO_UPDATE_INSTALL_PROMPT

**ID**: `APP_AUTO_UPDATE_INSTALL_PROMPT`
**NOME**: Diálogo nativo de "atualização pronta, reiniciar agora?"
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Processo principal > evento update-downloaded > dialog.showMessageBox nativo do SO (não é uma tela React)`
**POSIÇÃO NA INTERFACE**: Diálogo modal nativo do sistema operacional, centralizado na tela (não vinculado a uma janela específica — chamado sem passar `mainWindow` como parent no código: `dialog.showMessageBox({...})` sem primeiro argumento de janela).
**APARÊNCIA**: Diálogo nativo do Windows (não estilizado pelo NexPlay): título "Atualização disponível", mensagem "Uma nova versão do NexPlay ({versão}) está pronta.", detalhe "Deseja reiniciar agora para aplicar a atualização?", dois botões: "Atualizar e reiniciar" (padrão/`defaultId: 0`) e "Depois" (`cancelId: 1`).
**ESTADO NORMAL**: Não aplicável (aparece uma única vez quando disparado).
**HOVER**: Comportamento nativo do SO para botões de diálogo.
**ACTIVE/PRESSED**: Comportamento nativo do SO.
**SELECTED**: O botão "Atualizar e reiniciar" é o padrão (`defaultId: 0`) — ativável diretamente com Enter.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Automático — `autoUpdater.on('update-downloaded', ...)`.
**PRÉ-CONDIÇÕES**: Download da atualização precisa ter concluído com sucesso.
**RESULTADO IMEDIATO**: Diálogo nativo modal aparece **por cima de qualquer tela do app, a qualquer momento**, inclusive potencialmente **durante uma call de voz ativa** — não há checagem de "usuário está ocupado" antes de mostrar esse diálogo.
**RESULTADO VISUAL**: App fica coberto pelo diálogo nativo até o usuário responder.
**RESULTADO SONORO**: Som padrão de diálogo do Windows (se o SO tiver esse som habilitado — não é um som próprio do NexPlay).
**ANIMAÇÃO**: Nativa do Windows.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É o próprio modal (nativo do SO, não um componente React).
**SEGUNDA ETAPA**: Clique em "Atualizar e reiniciar" → `autoUpdater.quitAndInstall()`. Clique em "Depois" → diálogo fecha, nada mais acontece (a atualização já baixada fica pendente, será instalada só se o usuário reiniciar manualmente o app depois, ou se o diálogo disparar de novo em um próximo lançamento — comportamento exato de "perguntar de novo depois" não confirmado no código, já que `checkForUpdates()` só roda uma vez por lançamento, então o diálogo não reaparece na mesma sessão).
**RESULTADO FINAL — opção "Atualizar e reiniciar"**: `autoUpdater.quitAndInstall()` fecha o app e executa o instalador da nova versão, reabrindo automaticamente ao final (comportamento padrão do `electron-updater`/NSIS no Windows). **Sem checagem de "está conectado a uma call agora" antes de fechar — a call cai abruptamente se o usuário aceitar durante uma conversa ativa.**
**RESULTADO FINAL — opção "Depois"**: App continua rodando na versão atual; atualização já baixada fica esperando a próxima oportunidade (reinício manual, ou fechar e abrir o app de novo aplicaria a atualização pendente automaticamente via comportamento padrão do `electron-updater`, a confirmar).
**EFEITO LOCAL**: Se aceitar: processo reinicia inteiro. Se conectado a voz: cai (mesmo efeito de `WINDOW_CLOSE`, mas sem aviso nenhum de que isso vai acontecer especificamente por causa da atualização).
**EFEITO REMOTO**: Se estava em call: outros participantes veem o usuário sair abruptamente.
**REALTIME**: WebSocket cai.
**BACKEND**: Nenhuma chamada à API do NexPlay nesta etapa.
**BANCO**: Não aplicável.
**REFRESH**: Reinício completo do processo, não um simples reload de página.
**RECONEXÃO**: Ao reabrir (pós-instalação), é um `APP_LAUNCH` normal — login/sessão restaurados do zero conforme o fluxo padrão.
**ERRO**: Se a instalação falhar, comportamento não confirmado no código (depende do NSIS/`electron-updater`, sem tratamento customizado no NexPlay).
**CANCELAMENTO**: Botão "Depois" é a forma de cancelar/adiar.
**REVERSÃO**: Não aplicável — uma vez instalada, não há downgrade automático.
**ATALHO**: Enter ativa o botão padrão ("Atualizar e reiniciar", por ser `defaultId: 0`) — **isso significa que apertar Enter displicentemente em qualquer momento em que esse diálogo apareça (inclusive por engano, durante uma call) já reinicia o app.**
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Diálogo nativo do SO — herda acessibilidade nativa do Windows (navegável por teclado, lido por leitor de tela do sistema).

**Status geral do updater**: `PARTIAL` frente ao pedido do usuário — existe checagem automática, download automático e prompt de instalação (isso é real e funciona), mas: nenhuma UI própria de progresso/status dentro do app, nenhum botão manual de "verificar agora", nenhuma proteção contra interromper uma call de voz ativa.

---

## 0.20 — SCREEN_SHARE_PICKER_OPEN

**ID**: `SCREEN_SHARE_PICKER_OPEN`
**NOME**: Abrir o seletor nativo de fonte de compartilhamento de tela
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Canal de voz conectado > painel de voz > botão Compartilhar tela (documentado em detalhe no ROTEIRO 17, pendente de auditoria) > dispara este fluxo no processo principal`
**POSIÇÃO NA INTERFACE**: A própria janela do picker é uma `BrowserWindow` nova, separada da janela principal: 886×783px (mínimo 760×620), modal em relação à janela principal (`modal: Boolean(mainWindow)`), sem moldura (`frame: false`), título "Compartilhar tela — NexPlay".
**APARÊNCIA**: `backgroundColor: '#111315'` (mesmo tom escuro da janela principal), `autoHideMenuBar: true`, sem DevTools (`devTools: false`), carrega `picker.html`/`picker.css` — interface própria do NexPlay, não reaproveita nenhum asset do Discord (confirma a regra "não copie assets do Discord, produza equivalentes próprios").
**ESTADO NORMAL**: Janela oculta (`show: false`) até `ready-to-show`.
**HOVER**: Depende do conteúdo de `picker-renderer.ts`/`picker.css` — cada card de fonte (tela/janela) provavelmente reage a hover (não lido em detalhe nesta auditoria de Roteiro 0; será aprofundado ao auditar o fluxo de voz completo).
**ACTIVE/PRESSED**: A confirmar na auditoria do fluxo de voz.
**SELECTED**: A confirmar — provavelmente a fonte escolhida recebe destaque visual antes de confirmar.
**DISABLED**: Não aplicável a esta etapa.
**LOADING**: `desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false })` é chamado **antes** de abrir a janela do picker — pode haver um atraso perceptível entre o clique em "Compartilhar tela" e a janela do picker aparecer, sem nenhum indicador de loading nessa espera específica (a chamada acontece no processo principal, antes de `chooseCaptureSource` criar a `BrowserWindow`).
**TRIGGER**: Chamada IPC `share-picker:open` (handler `ipcMain.handle('share-picker:open', ...)`), disparada pelo React via `window.desktop.chooseShareSource()`.
**PRÉ-CONDIÇÕES**: `event.sender === mainWindow.webContents` (só a janela principal pode disparar, não o próprio picker nem qualquer outra origem).
**RESULTADO IMEDIATO**: Lista de fontes disponíveis (telas + janelas abertas no SO) é obtida; se já havia um `pendingCapture` de uma chamada anterior não finalizada, ele é cancelado primeiro (`finishCapture(null)`) antes de abrir um novo picker — evita dois pickers simultâneos.
**RESULTADO VISUAL**: Nova janela modal aparece sobre a janela principal, com miniaturas (`thumbnailSize: 320×180`) de cada tela/janela disponível.
**RESULTADO SONORO**: Nenhum documentado nesta etapa de abertura.
**ANIMAÇÃO**: `picker.once('ready-to-show', () => picker.show())` — mesma técnica de exibição suave que a janela principal.
**POPOVER**: Não aplicável (é uma janela própria, não um popover React).
**MENU**: Não aplicável — `picker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` e `will-navigate` bloqueado, então o picker não pode abrir nada além do que já está nele.
**MODAL**: A própria janela do picker É o modal.
**SEGUNDA ETAPA**: Ver `SCREEN_SHARE_SOURCE_SELECT`, `SCREEN_SHARE_QUALITY_SELECT`, `SCREEN_SHARE_AUDIO_TOGGLE`.
**RESULTADO FINAL**: Picker visível, aguardando escolha do usuário.
**EFEITO LOCAL**: Nenhum ainda (captura não começou).
**EFEITO REMOTO**: Nenhum ainda.
**REALTIME**: Não afetado nesta etapa.
**BACKEND**: Nenhuma chamada à API do NexPlay.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Se `desktopCapturer.getSources` falhar (raro, geralmente só em ambientes sem suporte), não há tratamento de erro visível especificamente nesta chamada dentro do handler `share-picker:open` (diferente do `setDisplayMediaRequestHandler`, que tem um `try/catch` com `console.error`).
**CANCELAMENTO**: Ver `SCREEN_SHARE_PICKER_CANCEL`.
**REVERSÃO**: Fechar a janela do picker sem escolher (ver próxima ficha) é a reversão.
**ATALHO**: Não documentado nesta auditoria de Roteiro 0.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: A confirmar na auditoria completa do fluxo de compartilhamento de tela.

---

## 0.21 — SCREEN_SHARE_QUALITY_SELECT

**ID**: `SCREEN_SHARE_QUALITY_SELECT`
**NOME**: Selecionar qualidade de captura antes de compartilhar
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Picker de compartilhamento de tela > seletor de qualidade`
**POSIÇÃO NA INTERFACE**: Dentro da janela do picker (`picker.html`) — posição exata a confirmar na auditoria detalhada do `ROTEIRO 17`.
**APARÊNCIA**: A confirmar (depende de `picker.css`).
**ESTADO NORMAL**: Não aplicável sem ver o HTML/CSS em detalhe.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: A confirmar (provavelmente clique em uma das três opções).
**PRÉ-CONDIÇÕES**: Picker aberto.
**RESULTADO IMEDIATO**: Valor de qualidade é um dos três definidos no tipo `PickerShareQuality = '720p30' | '720p60' | '1080p60'` — **apenas essas três combinações existem** (não há, por exemplo, 480p nem 4K).
**RESULTADO VISUAL**: A confirmar.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: A confirmar.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É a própria janela do picker.
**SEGUNDA ETAPA**: Escolha fica retida até `SCREEN_SHARE_SOURCE_SELECT`/confirmação final.
**RESULTADO FINAL**: `quality` faz parte do objeto `CaptureChoice` retornado por `capture-picker:choose`.
**EFEITO LOCAL**: Determina a qualidade do encode de vídeo publicado no LiveKit (aplicado na camada React/LiveKit, fora do escopo do processo principal).
**EFEITO REMOTO**: Espectadores da transmissão recebem o vídeo na qualidade escolhida (sujeito ao adaptive streaming do LiveKit, conforme já registrado em `DISCORD_PARITY_PLAN.md` §6).
**REALTIME**: Publicação de track de vídeo via LiveKit (auditoria detalhada pendente).
**BACKEND**: Não aplicável ao processo principal — o LiveKit é quem recebe o stream, não a API REST do NexPlay.
**BANCO**: Não aplicável.
**REFRESH**: Escolha não persiste entre uma sessão de compartilhamento e outra — cada `SCREEN_SHARE_PICKER_OPEN` novo começa sem qualidade pré-selecionada (a confirmar).
**RECONEXÃO**: Não aplicável.
**ERRO**: `ipcMain.handle('capture-picker:choose', ...)` valida `typeof quality !== 'string'` antes de aceitar — um valor inválido faz a chamada inteira ser ignorada (nenhum retorno, a Promise do lado do processo principal nunca resolve para essa chamada especificamente, mas o picker já teria enviado um dos três valores válidos vindos de botões fixos, então isso é mais uma defesa de tipo do que um caminho de erro alcançável pela UI normal).
**CANCELAMENTO**: Fechar o picker sem confirmar descarta a escolha (ver `SCREEN_SHARE_PICKER_CANCEL`).
**REVERSÃO**: Escolher outra qualidade antes de confirmar.
**ATALHO**: Não documentado.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: A confirmar.

**Nota de auditoria**: `RESULTADO FINAL — Trocar qualidade sem encerrar a transmissão já em andamento` está marcado como `MISSING` em `DISCORD_PARITY_PLAN.md` §6 ("precisa renegociar track, não implementado") — a seleção de qualidade aqui documentada só acontece **antes** de iniciar, nunca durante uma transmissão ativa.

---

## 0.22 — SCREEN_SHARE_AUDIO_TOGGLE

**ID**: `SCREEN_SHARE_AUDIO_TOGGLE`
**NOME**: Alternar "compartilhar áudio do sistema" antes de transmitir
**PLATAFORMA**: `DESKTOP_WINDOWS` (loopback de áudio do sistema é uma capacidade específica do Windows — o código checa `process.platform === 'win32'` explicitamente antes de usar `audio: 'loopback'`)
**CAMINHO EXATO**: `Picker de compartilhamento de tela > toggle de áudio`
**POSIÇÃO NA INTERFACE**: Dentro do picker — posição exata a confirmar.
**APARÊNCIA**: A confirmar (toggle/checkbox).
**ESTADO NORMAL**: A confirmar valor padrão (ligado ou desligado).
**HOVER**: A confirmar.
**ACTIVE/PRESSED**: A confirmar.
**SELECTED**: Estado ligado/desligado do toggle.
**DISABLED**: Em plataformas que não sejam Windows, mesmo que o toggle apareça, o valor é ignorado: `if (request.audioRequested && choice.shareAudio && process.platform === 'win32')` — em macOS/Linux (não aplicável hoje, já que o app só é empacotado para Windows, mas o código já é platform-aware), o áudio do sistema nunca seria incluído mesmo que `shareAudio` seja `true`.
**LOADING**: Não aplicável.
**TRIGGER**: Clique no toggle dentro do picker.
**PRÉ-CONDIÇÕES**: Picker aberto.
**RESULTADO IMEDIATO**: `shareAudio: boolean` fica marcado no estado local do picker.
**RESULTADO VISUAL**: A confirmar (mudança de estado visual do toggle).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: A confirmar.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É a própria janela do picker.
**SEGUNDA ETAPA**: Valor incluído no objeto retornado por `capture-picker:choose`.
**RESULTADO FINAL**: Se `true` e Windows: `callback({ video: choice.source, audio: 'loopback' })` no `setDisplayMediaRequestHandler` — publica tanto vídeo quanto áudio do sistema (loopback) como uma única captura. Se `false` ou não-Windows: `callback({ video: choice.source })` — só vídeo.
**EFEITO LOCAL**: Determina se o áudio que toca no PC do transmissor (ex.: um jogo, um vídeo) é incluído na transmissão.
**EFEITO REMOTO**: Espectadores ouvem (ou não) o áudio do sistema do transmissor, além do vídeo.
**REALTIME**: Faz parte da mesma publicação de track WebRTC via LiveKit.
**BACKEND**: Não aplicável ao processo principal.
**BANCO**: Não aplicável.
**REFRESH**: Não persiste entre sessões de compartilhamento (a confirmar).
**RECONEXÃO**: Não aplicável.
**ERRO**: Nenhum tratamento de erro específico documentado para esta escolha.
**CANCELAMENTO**: Fechar o picker sem confirmar descarta.
**REVERSÃO**: Alternar de novo antes de confirmar.
**ATALHO**: Não documentado.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: A confirmar.

---

## 0.23 — SCREEN_SHARE_PICKER_CANCEL

**ID**: `SCREEN_SHARE_PICKER_CANCEL`
**NOME**: Cancelar o seletor de compartilhamento de tela
**PLATAFORMA**: `DESKTOP_WINDOWS`
**CAMINHO EXATO**: `Picker de compartilhamento de tela > fechar a janela (X, Esc, ou botão Cancelar dentro do picker, a confirmar) `
**POSIÇÃO NA INTERFACE**: A própria janela do picker.
**APARÊNCIA**: A confirmar (botão "Cancelar" dentro de `picker.html`, se existir, além do fechamento nativo da janela).
**ESTADO NORMAL**: Não aplicável.
**HOVER**: A confirmar.
**ACTIVE/PRESSED**: A confirmar.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: `ipcMain.handle('capture-picker:cancel', ...)` — chamada explícita do renderer do picker; **ou** simplesmente fechar a janela do picker (`picker.once('closed', ...)` também finaliza a captura como `null` se não foi finalizada por escolha).
**PRÉ-CONDIÇÕES**: Picker aberto (`pendingCapture` não nulo).
**RESULTADO IMEDIATO**: `finishCapture(null)` — fecha a janela do picker (se ainda não fechada) e resolve a Promise pendente com `null`.
**RESULTADO VISUAL**: Janela do picker desaparece.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Fechamento nativo do SO.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Fecha.
**SEGUNDA ETAPA**: O código que chamou `chooseCaptureSource`/`window.desktop.chooseShareSource()` recebe `null` como resultado — o fluxo de compartilhamento é abortado sem iniciar nenhuma captura.
**RESULTADO FINAL**: Nenhuma transmissão começa; usuário volta ao painel de voz normal.
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum — como a captura nunca começou, nada é publicado, ninguém percebe nada.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável — cancelar não é um erro.
**CANCELAMENTO**: É a própria ação.
**REVERSÃO**: Abrir o picker de novo (`SCREEN_SHARE_PICKER_OPEN`).
**ATALHO**: A confirmar se Esc fecha o picker (janela separada, `frame: false`, sem `before-input-event` customizado documentado para ela especificamente — só a janela principal tem esse listener).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: A confirmar.

---

## 0.24 — ACTIVITY_DETECT (Rich Presence — jogo/mídia)

**ID**: `ACTIVITY_DETECT`
**NOME**: Detecção automática de atividade (jogo em execução / mídia tocando)
**PLATAFORMA**: `DESKTOP_WINDOWS` (usa `windows-media-sessions`, biblioteca nativa específica do Windows, mais `ps-list` para detecção de processos)
**CAMINHO EXATO**: `Processo principal > startActivityMonitor() (apps/desktop/src/activity.ts) > roda continuamente em segundo plano desde o boot`
**POSIÇÃO NA INTERFACE**: Sem UI própria no processo principal — o resultado (`Activity | null`) é só um dado repassado para o React via IPC; a exibição final (mini-perfil, "jogando X") é responsabilidade da camada React, já confirmada como existente em `DISCORD_PARITY_PLAN.md` §8 ("Atividade (jogo/Spotify) | DONE").
**APARÊNCIA**: Não aplicável nesta camada (processo principal só detecta e emite o dado).
**ESTADO NORMAL**: Monitor rodando continuamente, comparando a lista de processos ativos (`ps-list`) contra uma lista de jogos conhecidos (`gameList.ts`) e consultando sessões de mídia do Windows (`windows-media-sessions`) para Spotify/players compatíveis com a API de mídia do SO.
**HOVER**: Não aplicável nesta camada.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Implicitamente desabilitado em qualquer build que não seja Windows (a lib `windows-media-sessions` é Windows-only — o comentário no topo de `main.ts` confirma isso: `bin/win-x64/windows-media-sessions-backend.exe`).
**LOADING**: Não aplicável — roda em loop contínuo, sem um estado de "carregando" discreto.
**TRIGGER**: Automático, contínuo, iniciado uma vez em `whenReady()` (`stopActivityMonitor = startActivityMonitor(...)`), não acionado por nenhuma ação do usuário.
**PRÉ-CONDIÇÕES**: Nenhuma — roda sempre que o app está aberto no Windows.
**RESULTADO IMEDIATO**: Ao detectar mudança de atividade (jogo abriu/fechou, música trocou/parou), o callback interno atualiza `currentActivity` no processo principal e, se `mainWindow` existir e não estiver destruída, `mainWindow.webContents.send('activity:changed', activity)`.
**RESULTADO VISUAL**: Depende inteiramente da camada React reagir ao evento `activity:changed` (via `window.desktop.onActivityChanged(listener)`, exposto no preload) — já confirmado como implementado (mini-perfil com "capa+progresso, sessão atual", conforme `DISCORD_PARITY_PLAN.md` §8).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não aplicável nesta camada.
**POPOVER**: Não aplicável nesta camada (a exibição em si é auditada em `ROTEIRO 20`/mini-perfil, pendente).
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: `window.desktop.getCurrentActivity()` (IPC `activity:get-current`) permite ao React **puxar** o valor atual assim que monta (em vez de depender só do push de mudanças futuras) — resolve a corrida documentada no comentário do código: a detecção pode já ter publicado a primeira atividade antes do React montar e registrar o listener.
**RESULTADO FINAL**: Atividade atual (ou `null`, se nenhuma detectada) refletida na UI e, presumivelmente, sincronizada para outros usuários verem no perfil (mecanismo de sincronização remota — WebSocket/API — pendente de auditoria detalhada na camada de perfil/presença, `ROTEIRO 19-20`).
**EFEITO LOCAL**: Nenhum efeito colateral além de exibir a atividade.
**EFEITO REMOTO**: Se sincronizado (a confirmar em auditoria futura), outros usuários veem "Jogando X"/"Ouvindo Y" no perfil deste usuário.
**REALTIME**: A confirmar se `activity:changed` no processo principal dispara, em cascata, um evento WebSocket para outros usuários (não confirmado nesta auditoria específica de Roteiro 0 — fora do escopo do processo desktop puro).
**BACKEND**: A confirmar (provavelmente uma rota de "atualizar minha atividade" na API, chamada pelo React ao receber `activity:changed`).
**BANCO**: A confirmar.
**REFRESH**: Reinicia a detecção do zero a cada novo lançamento do app (estado de atividade não é persistido entre sessões do processo — é sempre "ao vivo").
**RECONEXÃO**: Não aplicável a esta camada.
**ERRO**: Comentário no código documenta um problema real já resolvido: o handshake inicial da lib `windows-media-sessions` dava timeout num teste real em build empacotado por causa de como a lib resolve o próprio caminho do binário nativo; corrigido setando `WINDOWS_MEDIA_SESSIONS_BACKEND` explicitamente via `process.resourcesPath` **antes** do módulo ser importado (por isso o import de `activity.js` é dinâmico, não estático, no topo do arquivo).
**CANCELAMENTO**: `stopActivityMonitor()` é chamado em `app.on('before-quit', ...)` — para o monitor de forma limpa ao encerrar o app.
**REVERSÃO**: Não aplicável (é um monitor contínuo, não uma ação pontual reversível).
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável nesta camada.

---

# ROTEIRO 1 — LOGIN E SESSÃO

Arquitetura real (verificada lendo `apps/web/src/App.tsx`, `apps/web/src/components/EntryScreen.tsx`, `apps/web/src/realtime.ts`, `apps/api/src/session.ts` e as rotas `/api/auth/*`/`/api/session` em `apps/api/src/index.ts`): sessão é um cookie assinado por HMAC-SHA256 (`nexplay_session`), `httpOnly`, `sameSite: strict`, `secure` conforme config, validade fixa de 12 horas — **stateless**, sem tabela de sessões no banco, sem lista de dispositivos, sem revogação individual. Não existe "lembrar-me"/duração configurável — toda sessão dura exatamente 12h. Login e cadastro dividem a mesma tela (`EntryScreen`) como duas abas do mesmo formulário, não duas telas separadas.

---

## 1.1 — SESSION_RESTORE_ON_BOOT

**ID**: `SESSION_RESTORE_ON_BOOT`
**NOME**: Restaurar sessão existente ao abrir o app
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > primeiro frame após APP_LAUNCH (desktop) ou carregar a página (web) > App.tsx`
**POSIÇÃO NA INTERFACE**: Tela cheia (`<main className="splash">`), substitui qualquer outra UI até resolver.
**APARÊNCIA**: `LoadingWindow`: uma "janela de boot" (`.boot-window`) centralizada com título "NexPlay", duas barras de esqueleto (`.skeleton-line`, uma `wide` e uma normal, presumivelmente animadas via CSS shimmer) e um rótulo de texto abaixo ("Carregando usuário…").
**ESTADO NORMAL**: `state = { status: 'loading' }` — é sempre o primeiro estado, antes de qualquer decisão.
**HOVER**: Não aplicável (tela sem elementos interativos).
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: É o próprio estado documentado aqui.
**TRIGGER**: Automático, `useEffect` executado uma vez na montagem do `App`.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `api.getSession()` chama `GET /api/session` (rota protegida por `requireSession`, que lê e valida o cookie via `getSession(request)`).
**RESULTADO VISUAL**: `LoadingWindow` visível até a chamada resolver.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: As barras de esqueleto presumivelmente têm uma animação CSS de "pulso"/shimmer (não confirmado no CSS nesta passagem — a confirmar).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Duas ramificações: (a) cookie válido → `.then(({ user }) => loadAuthenticatedApp(user))`, que por sua vez chama `api.getConfig()` (`GET /api/config`) antes de considerar o boot concluído; (b) cookie ausente/inválido/expirado → a Promise rejeita (a API responde 401) → `.catch(() => setState({ status: 'signed-out' }))`.
**RESULTADO FINAL**: Ou `state.status === 'ready'` (sessão + config carregados, `Workspace` monta) ou `state.status === 'signed-out'` (`EntryScreen` aparece).
**EFEITO LOCAL**: Nenhuma mudança de dado — só leitura.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: A conexão WebSocket **não é aberta nesta etapa** — só depois que `Workspace` monta (`connectRealtime()` é chamado de dentro do `Workspace`, não do `App`), então há uma janela onde o usuário já está "autenticado" mas ainda sem tempo real ativo.
**BACKEND**: `GET /api/session` (autenticação) e, se autenticado, `GET /api/config` (config pública).
**BANCO**: Nenhuma escrita — só a leitura implícita de usuário feita por `requireSession`/`currentUser` no backend.
**REFRESH**: É a própria ação (todo F5/reload passa por aqui de novo, do zero).
**RECONEXÃO**: Não aplicável a esta etapa especificamente (é o boot, não uma reconexão de uma sessão já ativa).
**ERRO**: Se `api.getConfig()` falhar depois de uma sessão válida (ex.: backend caiu entre as duas chamadas), `loadAuthenticatedApp` cai no `catch` e seta `state = { status: 'error', message }` — ver `APP_BOOT_ERROR`.
**CANCELAMENTO**: Não aplicável — não há como o usuário interromper o boot.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `<main aria-live="polite">` no `LoadingWindow` — mudanças de estado são anunciadas a leitores de tela sem interromper o que estavam lendo.

---

## 1.2 — LOGIN_TAB_SELECT / REGISTER_TAB_SELECT

**ID**: `ENTRY_MODE_TOGGLE`
**NOME**: Alternar entre as abas "Entrar" e "Criar conta"
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > janela central (.entry-window) > abaixo do cabeçalho > .entry-mode-toggle`
**POSIÇÃO NA INTERFACE**: Duas abas lado a lado, logo abaixo do título "NexPlay"/"Servidor privado", acima do formulário.
**APARÊNCIA**: `role="tablist"`, dois `<button role="tab">`: "Entrar" e "Criar conta". A aba ativa recebe classe `active` e `aria-selected="true"`.
**ESTADO NORMAL**: Aba "Entrar" ativa por padrão (`mode = 'login'` é o estado inicial).
**HOVER**: Estilo de hover definido em CSS para `.entry-mode-toggle button` (a confirmar detalhe visual exato — não lido nesta passagem).
**ACTIVE/PRESSED**: Aba com `aria-selected="true"` ganha destaque visual via classe `active`.
**SELECTED**: A aba clicada vira a ativa; a outra perde o destaque.
**DISABLED**: Não há estado desabilitado — sempre é possível trocar de aba, mesmo com o formulário parcialmente preenchido ou com `loading === true` (**achado**: `switchMode` não checa `loading`, então tecnicamente dá pra trocar de aba enquanto uma submissão está em andamento — o formulário por baixo muda de campos enquanto a requisição anterior ainda está em voo, sem cancelá-la).
**LOADING**: Não aplicável ao clique em si.
**TRIGGER**: Clique esquerdo em qualquer uma das duas abas.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `switchMode(nextMode)`: `setMode(nextMode)` e `setError('')` (limpa qualquer mensagem de erro da tentativa anterior).
**RESULTADO VISUAL**: Campos do formulário mudam: modo "Criar conta" revela três campos extras (Código de convite, Cor do perfil) que não existem no modo "Entrar"; o campo de senha muda `autoComplete` (`current-password` vs `new-password`), `minLength` (nenhum vs 8) e `placeholder` ("Sua senha" vs "Pelo menos 8 caracteres"); o botão de envio muda de texto ("Entrar" vs "Criar conta e entrar").
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma transição documentada entre os dois layouts de formulário (troca instantânea, sem fade/slide).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário preenche o formulário correspondente ao novo modo.
**RESULTADO FINAL**: Formulário no modo escolhido, pronto para preenchimento.
**EFEITO LOCAL**: **`username` e `password` já digitados não são limpos ao trocar de aba** (só `error` é limpo) — se o usuário digitar no modo "Entrar" e trocar para "Criar conta", o que já tinha escrito continua lá. `inviteToken`/`accentColor` só existem visualmente no modo registro, mas o estado React deles também não é resetado ao voltar para "Entrar" e trocar de novo (fica retido em memória, sem efeito visível até reaparecer).
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável (pré-autenticação, sem WebSocket ainda).
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Modo escolhido não persiste — um F5 sempre volta para a aba "Entrar" (estado inicial do `useState`).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar na outra aba.
**ATALHO**: Nenhum atalho de teclado dedicado; navegável via Tab por serem `<button>`s normais, mas **não implementa o padrão ARIA completo de `tablist`** (setas esquerda/direita para trocar de aba não estão implementadas — só clique/Tab+Enter).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="tablist"` no container, `role="tab"` + `aria-selected` em cada botão — estrutura ARIA básica correta, mas sem a navegação por seta esperada do padrão completo de abas.

---

## 1.3 — LOGIN_USERNAME_FIELD

**ID**: `LOGIN_USERNAME_FIELD`
**NOME**: Campo de nome de usuário (login e cadastro)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > formulário > primeiro campo, logo abaixo das abas`
**POSIÇÃO NA INTERFACE**: Topo do formulário, com `<label htmlFor="username">Usuário</label>` acima.
**APARÊNCIA**: `<input id="username">` padrão, `placeholder="Seu nome de usuário"`, `autoComplete="username"`.
**ESTADO NORMAL**: Vazio, com placeholder visível.
**HOVER**: Estilo de borda em hover conforme CSS de input padrão do app (não detalhado nesta passagem).
**ACTIVE/PRESSED**: Foco muda a borda/outline (estilo padrão de `:focus`).
**SELECTED**: Não aplicável (não é um item de lista).
**DISABLED**: **Não fica desabilitado durante `loading`** — o campo continua editável mesmo enquanto uma submissão está em andamento (só o botão de envio é desabilitado, ver `LOGIN_SUBMIT`). Usuário pode editar o texto enquanto a requisição anterior ainda está em voo.
**LOADING**: Não aplicável ao campo em si.
**TRIGGER**: Clique para focar, digitação para preencher.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `onChange` atualiza o estado `username` a cada tecla.
**RESULTADO VISUAL**: Texto digitado aparece no campo.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Tab avança para o campo de senha.
**RESULTADO FINAL**: Valor pronto para `handleSubmit`.
**EFEITO LOCAL**: Validação client-side só via atributos HTML nativos: `required`, `minLength={2}`, `maxLength={24}` — **nenhuma validação de formato/caracteres permitidos no cliente** (a regex `^[\p{L}\p{N} _.-]+$` só é checada no backend, no `usernameSchema`; um usuário pode digitar um caractere inválido, o campo aceita, e só ao submeter recebe o erro genérico do backend).
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada por tecla (só no submit).
**BANCO**: Não aplicável.
**REFRESH**: Valor perdido em F5 (não é salvo em nenhum lugar).
**RECONEXÃO**: Não aplicável.
**ERRO**: Validação nativa do HTML (`required`/`minLength`/`maxLength`) bloqueia o submit do navegador antes mesmo de chegar no `handleSubmit` React se vazio ou fora do tamanho — mensagem de erro é a padrão do navegador (não estilizada pelo NexPlay).
**CANCELAMENTO**: Apagar o texto digitado (Ctrl+A + Delete, ou Backspace).
**REVERSÃO**: Não aplicável (não há "desfazer" dedicado, só o Ctrl+Z nativo do campo de texto do navegador).
**ATALHO**: Ctrl+Z/Ctrl+Y nativos do campo de texto (não customizados pelo NexPlay).
**MENU DE CONTEXTO**: Menu de contexto nativo do navegador/SO para campos de texto (recortar/copiar/colar) — não customizado.
**ACESSIBILIDADE**: `<label htmlFor="username">` associado corretamente — leitor de tela anuncia "Usuário" ao focar o campo.

---

## 1.4 — LOGIN_PASSWORD_FIELD

**ID**: `LOGIN_PASSWORD_FIELD`
**NOME**: Campo de senha (login e cadastro)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > formulário > segundo campo`
**POSIÇÃO NA INTERFACE**: Abaixo do campo de usuário.
**APARÊNCIA**: `<input type="password" id="password">` — caracteres mascarados (pontos/asteriscos, nativo do navegador). Placeholder muda conforme o modo: "Sua senha" (login) ou "Pelo menos 8 caracteres" (cadastro).
**ESTADO NORMAL**: Vazio, mascarado.
**HOVER**: Mesmo padrão de input do app.
**ACTIVE/PRESSED**: Foco muda borda/outline.
**SELECTED**: Não aplicável.
**DISABLED**: Mesma observação de `LOGIN_USERNAME_FIELD` — não desabilita durante loading.
**LOADING**: Não aplicável ao campo.
**TRIGGER**: Clique para focar, digitação para preencher.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `onChange` atualiza `password`.
**RESULTADO VISUAL**: Pontos/asteriscos aparecem conforme digita. **`MISSING`: nenhum botão de "mostrar senha" (ícone de olho)** — não existe no código, a senha é sempre mascarada sem alternativa de revelar.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Modo cadastro: Tab avança para o campo de convite. Modo login: Tab avança para o botão de envio (não há mais campos).
**RESULTADO FINAL**: Valor pronto para `handleSubmit`.
**EFEITO LOCAL**: `required` sempre; `minLength={8}` só no modo cadastro (`mode === 'register' ? 8 : undefined`) — no modo login, **qualquer tamanho é aceito no cliente** (a validação real de "senha existe e bate" só acontece no backend via `verifyPassword`). Nenhum indicador de força de senha.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada por tecla.
**BANCO**: Não aplicável.
**REFRESH**: Valor perdido em F5. **Navegadores podem oferecer preencher automaticamente via gerenciador de senha salvo** (`autoComplete` correto: `current-password` no login, `new-password` no cadastro, o que ativa sugestão de gerar senha forte em alguns navegadores).
**RECONEXÃO**: Não aplicável.
**ERRO**: Validação nativa do HTML bloqueia submit se vazio ou (no cadastro) menor que 8 caracteres — mensagem padrão do navegador. Erro de senha incorreta só aparece depois do submit (ver `LOGIN_ERROR_INVALID_CREDENTIALS`).
**CANCELAMENTO**: Apagar o texto digitado.
**REVERSÃO**: Não aplicável.
**ATALHO**: Nativos do campo de texto.
**MENU DE CONTEXTO**: Nativo do navegador/SO (campos `type="password"` tipicamente restringem "copiar" em alguns navegadores — comportamento do próprio Chromium/Electron, não do NexPlay).
**ACESSIBILIDADE**: `<label htmlFor="password">` associado corretamente.

---

## 1.5 — REGISTER_INVITE_TOKEN_FIELD

**ID**: `REGISTER_INVITE_TOKEN_FIELD`
**NOME**: Campo de código de convite (só no cadastro)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > aba "Criar conta" > formulário > terceiro campo`
**POSIÇÃO NA INTERFACE**: Só visível quando `mode === 'register'`, entre o campo de senha e o seletor de cor.
**APARÊNCIA**: `<input type="password" id="inviteToken">` — **também mascarado como senha** (escolha deliberada de não expor o token em texto claro na tela), `placeholder="Código do convite do servidor"`.
**ESTADO NORMAL**: Vazio, mascarado.
**HOVER**: Padrão de input do app.
**ACTIVE/PRESSED**: Foco muda borda/outline.
**SELECTED**: Não aplicável.
**DISABLED**: Não desabilita durante loading.
**LOADING**: Não aplicável.
**TRIGGER**: Clique para focar, digitação ou colar (Ctrl+V) para preencher.
**PRÉ-CONDIÇÕES**: `mode === 'register'`.
**RESULTADO IMEDIATO**: `onChange` atualiza `inviteToken`.
**RESULTADO VISUAL**: Caracteres mascarados aparecem.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: O campo inteiro (junto com "Cor do perfil") aparece/desaparece instantaneamente ao trocar de aba (sem transição, ver `ENTRY_MODE_TOGGLE`).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Tab avança para o seletor de cor.
**RESULTADO FINAL**: Valor pronto para `handleSubmit`, comparado no backend contra `config.INVITE_TOKEN` via `timingSafeEqual` (`inviteMatches`, `apps/api/src/session.ts`) — **um único token de convite compartilhado por toda a instância**, não um convite por servidor específico e não expira nem tem contagem de uso.
**EFEITO LOCAL**: Só `required` no cliente — nenhuma validação de formato.
**EFEITO REMOTO**: Nenhum até o submit.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada por tecla.
**BANCO**: Não aplicável (o token em si não é uma tabela — é uma env var comparada em memória).
**REFRESH**: Valor perdido em F5.
**RECONEXÃO**: Não aplicável.
**ERRO**: Ver `REGISTER_ERROR_INVALID_INVITE`.
**CANCELAMENTO**: Apagar o texto digitado.
**REVERSÃO**: Não aplicável.
**ATALHO**: Nativos do campo de texto.
**MENU DE CONTEXTO**: Nativo.
**ACESSIBILIDADE**: `<label htmlFor="inviteToken">` associado.

---

## 1.6 — REGISTER_ACCENT_COLOR_SELECT

**ID**: `REGISTER_ACCENT_COLOR_SELECT`
**NOME**: Selecionar a cor de perfil inicial no cadastro
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > aba "Criar conta" > formulário > "Cor do perfil"`
**POSIÇÃO NA INTERFACE**: Último campo do formulário de cadastro, antes do botão de envio.
**APARÊNCIA**: `role="radiogroup"`, uma fileira de botões circulares/quadrados pequenos (`.accent-swatch`), um por cor em `ACCENT_COLORS` (mesma paleta usada em todo o app — perfil de usuário e perfil de servidor, já documentada nas sessões anteriores desta auditoria de código), cada um com `data-color` definindo a cor de fundo via CSS.
**ESTADO NORMAL**: Primeira cor da lista (`ACCENT_COLORS[0]`) pré-selecionada por padrão (`useState(ACCENT_COLORS[0])`), com `aria-checked="true"` e classe `selected`.
**HOVER**: A confirmar detalhe exato de CSS (mesma classe `.accent-swatch` reaproveitada em `ServerSettings.tsx`, já documentada como tendo tratamento de hover nas fichas de perfil de servidor auditadas informalmente na sessão anterior).
**ACTIVE/PRESSED**: Clique aplica `selected` imediatamente (sem etapa de confirmação).
**SELECTED**: Anel/borda de destaque na cor escolhida (`selected` class), `aria-checked="true"` só nessa opção.
**DISABLED**: Não desabilita durante loading.
**LOADING**: Não aplicável.
**TRIGGER**: Clique esquerdo em qualquer swatch.
**PRÉ-CONDIÇÕES**: `mode === 'register'`.
**RESULTADO IMEDIATO**: `setAccentColor(color)`.
**RESULTADO VISUAL**: Swatch clicado ganha o anel de seleção; o anterior perde.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada nesta passagem (provavelmente uma transição simples de `box-shadow`/`border`, reaproveitando o mesmo CSS do seletor de cor de perfil de servidor).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário segue para o botão de envio.
**RESULTADO FINAL**: Cor escolhida vai no corpo de `POST /api/auth/register` como `accentColor`, validada no backend por `z.enum(ACCENT_COLORS)` — só um valor da paleta fixa é aceito, sem cor livre/hex nesta etapa (diferente da cor de "Faixa" de servidor, que já foi documentada em sessões anteriores como aceitando a mesma paleta fixa também, não hex livre).
**EFEITO LOCAL**: Nenhuma pré-visualização em outro lugar da tela de entrada (a cor não aparece refletida em nenhum outro elemento da própria tela de cadastro — só será visível depois, no perfil, pós-login).
**EFEITO REMOTO**: Nenhum até o cadastro ser concluído.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada por clique (só no submit).
**BANCO**: Gravado em `users.accent_color` só na criação da conta (`createUser`).
**REFRESH**: Volta pra primeira cor da paleta em F5 (estado não persiste antes do cadastro concluir).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável (sempre um valor válido, já que só botões pré-definidos existem — não há campo de texto livre para errar o formato).
**CANCELAMENTO**: Escolher outra cor substitui a anterior.
**REVERSÃO**: Trocável a qualquer momento antes do submit; depois do cadastro, só editável em Configurações > Meu perfil (fora do escopo desta ficha).
**ATALHO**: Navegável via Tab; **não confirmado se implementa navegação por seta dentro do `radiogroup`** (padrão ARIA completo de radiogroup usaria setas para mover a seleção) — mesma lacuna de `ENTRY_MODE_TOGGLE`.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="radiogroup"` + `aria-label="Cor do perfil"` no container; cada botão com `role="radio"`, `aria-checked`, `aria-label="Cor {valor}"` (anuncia o nome/valor da cor, não uma amostra visual, então funciona para leitor de tela apesar de não haver nome amigável tipo "Verde"/"Roxo" — só o valor bruto da paleta).

---

## 1.7 — LOGIN_SUBMIT

**ID**: `LOGIN_SUBMIT`
**NOME**: Enviar formulário de login
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > aba "Entrar" > formulário > botão principal no rodapé`
**POSIÇÃO NA INTERFACE**: Base do formulário, largura total (`.primary-button.entry-submit`).
**APARÊNCIA**: Botão de destaque (cor de acento do app), texto "Entrar" em estado normal.
**ESTADO NORMAL**: Texto "Entrar", habilitado.
**HOVER**: Estilo padrão de `.primary-button:hover` do app (não detalhado nesta passagem).
**ACTIVE/PRESSED**: Estilo padrão de `:active`.
**SELECTED**: Não aplicável.
**DISABLED**: `disabled={loading}` — desabilita assim que a submissão começa, até resolver (sucesso ou erro).
**LOADING**: Texto muda para um `<span className="button-spinner-row">` com um spinner (`<span className="spinner" aria-hidden="true" />`) e o texto "Entrando…".
**TRIGGER**: Clique esquerdo, ou Enter com qualquer campo do formulário focado (comportamento nativo de `<form onSubmit>`).
**PRÉ-CONDIÇÕES**: Campos `username`/`password` preenchidos o suficiente para passar a validação nativa do HTML (`required`).
**RESULTADO IMEDIATO**: `handleSubmit`: `event.preventDefault()`, `setLoading(true)`, `setError('')`, depois `api.login(username, password)` → `POST /api/auth/login`.
**RESULTADO VISUAL**: Botão vira spinner + "Entrando…"; campos continuam visíveis e editáveis (não travados).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Spinner girando (CSS, a confirmar detalhe exato de keyframes).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Backend valida `loginSchema`, busca usuário por `username` (`getUserByUsername`), compara senha (`verifyPassword`), checa banimento (`isBanned`) — nessa ordem exata. Se tudo passar: `createSession` + `setSessionCookie` + `200` com `{ user }`.
**RESULTADO FINAL — sucesso**: `onAuthenticated(user)` chamado (prop vinda de `App.tsx`, é `loadAuthenticatedApp`) → busca config → `state = 'ready'` → `Workspace` monta.
**EFEITO LOCAL**: Cookie de sessão `nexplay_session` setado no navegador/WebContents (12h de validade, `httpOnly`, não acessível via JS).
**EFEITO REMOTO**: Nenhum ainda (outros usuários não são notificados de "fulano entrou" — não existe indicador de presença geral, conforme já registrado em `DISCORD_PARITY_PLAN.md` §8: "Presença (online/ausente/dnd/invisível/offline) | MISSING").
**REALTIME**: WebSocket ainda não conectado nesta etapa (só quando `Workspace` monta).
**BACKEND**: `POST /api/auth/login`, sujeito a `authLimiter` (20 tentativas por 15 minutos, por IP, `express-rate-limit`).
**BANCO**: Nenhuma escrita (login não atualiza um "último acesso" nem qualquer outro campo — só leitura de `users`).
**REFRESH**: Não aplicável a esta etapa.
**RECONEXÃO**: Não aplicável.
**ERRO**: Ver `LOGIN_ERROR_INVALID_CREDENTIALS` e `LOGIN_ERROR_BANNED`. Erro de rede genérico (backend fora do ar): `requestError instanceof Error ? requestError.message : 'Não foi possível entrar.'` exibido no mesmo `<div className="form-error" role="alert">`.
**CANCELAMENTO**: **`MISSING`** — não há como cancelar uma submissão em andamento (nenhum `AbortController` visível, o botão só fica desabilitado até a Promise resolver).
**REVERSÃO**: Não aplicável.
**ATALHO**: Enter em qualquer campo do formulário (comportamento nativo de HTML `<form>`).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="alert"` na mensagem de erro (anunciada automaticamente por leitores de tela assim que aparece). Spinner tem `aria-hidden="true"` (decorativo, o texto "Entrando…" ao lado já comunica o estado).

---

## 1.8 — REGISTER_SUBMIT

**ID**: `REGISTER_SUBMIT`
**NOME**: Enviar formulário de cadastro
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > aba "Criar conta" > formulário > botão principal no rodapé`
**POSIÇÃO NA INTERFACE**: Idêntica a `LOGIN_SUBMIT` — mesmo elemento, texto diferente.
**APARÊNCIA**: Texto "Criar conta e entrar" em vez de "Entrar".
**ESTADO NORMAL**: Habilitado, texto "Criar conta e entrar".
**HOVER**: Idêntico a `LOGIN_SUBMIT`.
**ACTIVE/PRESSED**: Idêntico.
**SELECTED**: Não aplicável.
**DISABLED**: `disabled={loading}`, idêntico.
**LOADING**: Spinner + texto "Criando conta…" (mensagem diferente de `LOGIN_SUBMIT`).
**TRIGGER**: Clique esquerdo, ou Enter em qualquer campo.
**PRÉ-CONDIÇÕES**: `username`, `password` (≥8 caracteres), `inviteToken` e uma cor selecionada (sempre há uma, por padrão).
**RESULTADO IMEDIATO**: `api.register(username, password, inviteToken, accentColor)` → `POST /api/auth/register`.
**RESULTADO VISUAL**: Idêntico padrão de `LOGIN_SUBMIT` (spinner substitui o texto).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Idêntica.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Backend, na ordem exata do código: (1) valida `registerSchema`; (2) checa `inviteMatches(inviteToken)`; (3) normaliza espaços do username (`replace(/\s+/g, ' ')`); (4) checa duplicidade (`getUserByUsername`); (5) `createUser` (hash de senha); (6) `addServerMember` + `assignDefaultRole` no **servidor mais antigo da instância** (`getDefaultServerId()`) — cadastro com o token global sempre entra automaticamente nesse servidor, não em um escolhido pelo usuário; (7) `createSession` + `setSessionCookie`; (8) `201` com `{ user }`.
**RESULTADO FINAL — sucesso**: Mesma cascata de `LOGIN_SUBMIT` (`onAuthenticated` → config → `Workspace`), mas com a conta nova já como membro do servidor padrão, pronta para aparecer na rail de servidores imediatamente.
**EFEITO LOCAL**: Cookie de sessão setado; conta nova persistida.
**EFEITO REMOTO — achado real**: **Nenhum evento de tempo real (`MEMBER_JOIN`) é emitido para os outros membros do servidor padrão quando alguém se cadastra** — checando o código da rota `POST /api/auth/register`, não há chamada a `sendToServerMembers`. Membros já conectados só veriam o novo usuário na lista depois de um refresh/reconexão que refaça o fetch de membros. **Isso é uma lacuna real, distinta de `MEMBER_JOIN` via convite de servidor específico** (que já é documentado como funcionando em sessões anteriores — a confirmar se o evento existe nesse outro fluxo quando a auditoria chegar em Servidores/Convites).
**REALTIME**: Ver `EFEITO REMOTO` — nenhum evento emitido nesta rota especificamente.
**BACKEND**: `POST /api/auth/register`, sujeito ao mesmo `authLimiter` de `LOGIN_SUBMIT` (20/15min, mesmo balde compartilhado por IP entre login e registro).
**BANCO**: Escreve em `users`, `server_members`, `user_roles` (atribuição do cargo `@everyone` do servidor padrão).
**REFRESH**: Não aplicável a esta etapa.
**RECONEXÃO**: Não aplicável.
**ERRO**: Ver `REGISTER_ERROR_INVALID_INVITE` e `REGISTER_ERROR_DUPLICATE_USERNAME`. Erro de validação de schema (senha curta, username com caracteres inválidos) retorna a mensagem genérica "Informe um nome de usuário e senha válidos." — **não diferencia qual campo especificamente falhou** (username inválido e senha curta geram a mesma mensagem).
**CANCELAMENTO**: `MISSING`, mesma lacuna de `LOGIN_SUBMIT`.
**REVERSÃO**: Não aplicável — não há "desfazer cadastro" (a conta já existe; só um admin excluindo o usuário diretamente no banco reverteria, fora do escopo de qualquer UI).
**ATALHO**: Enter em qualquer campo.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Idêntica a `LOGIN_SUBMIT`.

---

## 1.9 — LOGIN_ERROR_INVALID_CREDENTIALS

**ID**: `LOGIN_ERROR_INVALID_CREDENTIALS`
**NOME**: Erro de usuário/senha inválidos
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela de entrada > aba "Entrar" > abaixo dos campos, acima do botão de envio`
**POSIÇÃO NA INTERFACE**: `<div className="form-error" role="alert">`, entre os campos e o botão de envio.
**APARÊNCIA**: Texto de erro em destaque (cor de perigo, presumivelmente vermelha — padrão `.form-error` reaproveitado em outros formulários já documentados nesta auditoria, como o de exclusão de servidor).
**ESTADO NORMAL**: Ausente — só aparece após uma tentativa falha.
**HOVER**: Não aplicável (texto estático, não interativo).
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Resposta `401` de `POST /api/auth/login` com corpo `{ error: 'Usuário ou senha inválidos.' }` — disparado quando `getUserByUsername` não encontra o usuário **ou** `verifyPassword` falha. **Mensagem deliberadamente idêntica nos dois casos** (usuário inexistente vs. senha errada) — boa prática de segurança (não revela se o username existe), confirmada como intencional lendo o código (`if (!user || !verifyPassword(user, body.data.password))`, uma única branch para os dois casos).
**PRÉ-CONDIÇÕES**: Tentativa de login com credenciais que não batem.
**RESULTADO IMEDIATO**: `catch` em `handleSubmit` seta `error` com a mensagem vinda do backend.
**RESULTADO VISUAL**: Mensagem aparece; `loading` volta a `false` (bloco `finally`), botão volta ao estado normal ("Entrar").
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma transição de entrada documentada (aparece instantaneamente).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário corrige e tenta de novo, ou troca de aba.
**RESULTADO FINAL**: Nenhuma sessão criada; usuário continua na tela de entrada.
**EFEITO LOCAL**: Nenhum cookie setado.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: A tentativa em si já conta para o limite de `authLimiter` (20/15min) — **múltiplas tentativas erradas consecutivas eventualmente bloqueiam até tentativas corretas**, com a mensagem genérica "Muitas tentativas. Aguarde alguns minutos." (ver ficha própria a seguir, se aplicável em auditoria futura de rate-limit).
**BANCO**: Nenhuma escrita — nenhum registro de "tentativa falha" persistido (sem auditoria de tentativas de login no banco).
**REFRESH**: Erro desaparece em F5 (estado React perdido).
**RECONEXÃO**: Não aplicável.
**ERRO**: É a própria ficha de erro.
**CANCELAMENTO**: Trocar de aba ou editar os campos já limpa implicitamente (o erro só é limpo explicitamente por `switchMode`, **não por editar os campos e tentar de novo** — na real o próximo `handleSubmit` já faz `setError('')` no início, então o erro anterior desaparece assim que uma nova tentativa começa, não enquanto o usuário só está digitando).
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="alert"` — leitores de tela anunciam automaticamente assim que a mensagem aparece no DOM.

---

## 1.10 — LOGIN_ERROR_BANNED

**ID**: `LOGIN_ERROR_BANNED`
**NOME**: Erro de conta banida ao tentar entrar
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Idêntico a `LOGIN_ERROR_INVALID_CREDENTIALS` — mesmo elemento de UI.
**POSIÇÃO NA INTERFACE**: Idêntica.
**APARÊNCIA**: Idêntica (`.form-error`).
**ESTADO NORMAL**: Ausente.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Resposta `403` de `POST /api/auth/login` com `{ error: 'Sua conta foi banida deste servidor.' }` — disparado quando `isBanned(user.id)` retorna verdadeiro, **checado depois** de confirmar que usuário/senha estão corretos (então um usuário banido descobre que a senha está certa antes de saber que está banido — a ordem exata do código é login válido → checagem de ban, não o contrário).
**PRÉ-CONDIÇÕES**: Credenciais corretas, mas conta banida.
**RESULTADO IMEDIATO**: Mesmo fluxo de `catch`/`setError` de `LOGIN_ERROR_INVALID_CREDENTIALS`.
**RESULTADO VISUAL**: Mensagem específica de banimento exibida.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — usuário banido não tem caminho de recurso na própria UI (**`MISSING`: nenhum link/instrução de "entre em contato com um administrador"**, nenhuma informação de quem baniu ou por quê).
**RESULTADO FINAL**: Sessão nunca criada para essa conta enquanto o ban estiver ativo.
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Mesma sujeição a `authLimiter`.
**BANCO**: Nenhuma escrita nesta tentativa (só leitura de `bans`).
**REFRESH**: Erro some em F5.
**RECONEXÃO**: Não aplicável.
**ERRO**: É a própria ficha.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Só um administrador desbanindo a conta (fora do escopo desta tela — ação feita em Configurações do servidor > Membros, área ainda não auditada em detalhe neste documento).
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Idêntica a `LOGIN_ERROR_INVALID_CREDENTIALS`.

**Nota de auditoria**: `isBanned` — a confirmar em auditoria futura se o banimento é por instância inteira ou por servidor (o `DISCORD_PARITY_PLAN.md` §1 registra "Timeout por servidor" como `DONE` mas trata banimento (`bans`) como ainda de instância inteira via `broadcast()` global em `MEMBER_BANNED`/`MEMBER_UNBANNED` — ou seja, ser banido de um servidor único **impede login na instância inteira**, não só naquele servidor. Isso é coerente com o texto exato da mensagem de erro aqui documentada ("banida deste servidor") ser tecnicamente enganosa, já que o efeito real bloqueia a conta inteira, não só aquele servidor — **achado a confirmar/registrar como possível inconsistência de copy quando a auditoria de moderação for feita**.

---

## 1.11 — REGISTER_ERROR_INVALID_INVITE

**ID**: `REGISTER_ERROR_INVALID_INVITE`
**NOME**: Erro de código de convite inválido
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Idêntico a `LOGIN_ERROR_INVALID_CREDENTIALS`, na aba "Criar conta".
**POSIÇÃO NA INTERFACE**: Idêntica.
**APARÊNCIA**: Idêntica (`.form-error`).
**ESTADO NORMAL**: Ausente.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Resposta `401` de `POST /api/auth/register` com `{ error: 'Convite inválido.' }`, disparada quando `inviteMatches(inviteToken)` retorna falso — comparação de tempo constante (`timingSafeEqual`) contra `config.INVITE_TOKEN`, resistente a ataque de temporização.
**PRÉ-CONDIÇÕES**: Tentativa de cadastro com token errado.
**RESULTADO IMEDIATO**: Mesmo fluxo `catch`/`setError`.
**RESULTADO VISUAL**: Mensagem "Convite inválido." exibida.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário corrige o token e tenta de novo.
**RESULTADO FINAL**: Nenhuma conta criada.
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Sujeito a `authLimiter` — **compartilha o mesmo balde de 20/15min que login e registro juntos**, então várias tentativas de convite errado consecutivas também podem bloquear tentativas de login legítimas do mesmo IP.
**BANCO**: Nenhuma escrita.
**REFRESH**: Erro some em F5.
**RECONEXÃO**: Não aplicável.
**ERRO**: É a própria ficha.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Idêntica.

---

## 1.12 — REGISTER_ERROR_DUPLICATE_USERNAME

**ID**: `REGISTER_ERROR_DUPLICATE_USERNAME`
**NOME**: Erro de nome de usuário já existente
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Idêntico às fichas de erro anteriores, na aba "Criar conta".
**POSIÇÃO NA INTERFACE**: Idêntica.
**APARÊNCIA**: Idêntica.
**ESTADO NORMAL**: Ausente.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Resposta `409` de `POST /api/auth/register` com `{ error: 'Esse nome de usuário já existe.' }`, disparada quando `getUserByUsername(username)` já retorna um registro — checagem feita **depois** de normalizar espaços (`username.replace(/\s+/g, ' ')`) e **depois** de validar o convite (então um convite errado é sempre reportado primeiro, mesmo que o username também já exista).
**PRÉ-CONDIÇÕES**: Convite válido, username já cadastrado por outra conta.
**RESULTADO IMEDIATO**: Mesmo fluxo `catch`/`setError`.
**RESULTADO VISUAL**: Mensagem exibida.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário escolhe outro nome.
**RESULTADO FINAL**: Nenhuma conta criada.
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Sujeito a `authLimiter`.
**BANCO**: Nenhuma escrita (só a leitura que constata a colisão).
**REFRESH**: Erro some em F5.
**RECONEXÃO**: Não aplicável.
**ERRO**: É a própria ficha.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Idêntica.

**Nota de auditoria**: comparação de duplicidade não é explicitamente case-insensitive nem confirmada como tal nesta passagem — a checar em auditoria futura de `apps/api/src/users.ts` (`getUserByUsername`) se "Fulano" e "fulano" são tratados como o mesmo nome ou como dois usuários distintos.

---

## 1.13 — APP_BOOT_ERROR

**ID**: `APP_BOOT_ERROR`
**NOME**: Erro ao carregar o app após autenticação (config indisponível)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > após SESSION_RESTORE_ON_BOOT ou LOGIN_SUBMIT/REGISTER_SUBMIT bem-sucedidos > falha ao buscar api.getConfig()`
**POSIÇÃO NA INTERFACE**: Tela cheia, substitui toda a UI (`<main className="splash error-page">`).
**APARÊNCIA**: Título "Não foi possível iniciar", parágrafo com a mensagem de erro específica, botão `.primary-button` "Tentar novamente".
**ESTADO NORMAL**: Não aplicável (só existe em erro).
**HOVER**: Padrão de `.primary-button:hover`.
**ACTIVE/PRESSED**: Padrão de `:active`.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável a esta tela (a tela de loading já passou).
**TRIGGER**: `api.getConfig()` rejeitar dentro de `loadAuthenticatedApp`.
**PRÉ-CONDIÇÕES**: Sessão já autenticada (cookie válido ou login/registro recém bem-sucedido), mas `GET /api/config` falha (backend fora do ar, erro de rede, etc.).
**RESULTADO IMEDIATO**: `catch` seta `state = { status: 'error', message }`.
**RESULTADO VISUAL**: Tela de erro substitui a de loading/formulário.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Clique em "Tentar novamente" → `window.location.reload()` — **recarrega a página/app inteiro do zero** (não uma nova tentativa isolada de só `getConfig()`; é um reload completo, equivalente a `APP_RELOAD` documentado no Roteiro 0 quando em desktop).
**RESULTADO FINAL**: Se o backend voltar: reload leva de volta a `SESSION_RESTORE_ON_BOOT`, que desta vez deve completar normalmente. Se continuar fora do ar: mesma tela de erro reaparece.
**EFEITO LOCAL**: Nenhuma mudança de dado.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável — WebSocket nunca chegou a conectar, já que isso só acontece dentro do `Workspace`, que nunca chegou a montar.
**BACKEND**: A chamada que falhou (`GET /api/config`); "Tentar novamente" refaz tudo do zero via reload.
**BANCO**: Não aplicável.
**REFRESH**: É a própria ação de recuperação.
**RECONEXÃO**: Nenhuma lógica de retry automático — o erro fica parado na tela até o usuário clicar manualmente.
**ERRO**: É a própria ficha.
**CANCELAMENTO**: Não aplicável (não há como "descartar" o erro sem recarregar).
**REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum atalho de teclado dedicado para "Tentar novamente" além de Tab+Enter no botão.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Sem `role="alert"` nesta tela especificamente (diferente das mensagens de erro de formulário) — **achado**: uma falha desta magnitude (app inteiro não carrega) não é anunciada ativamente a um leitor de tela, só fica disponível se o usuário navegar até o conteúdo.

---

## 1.14 — LOGOUT

**ID**: `LOGOUT`
**NOME**: Sair da conta
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > Configurações (engrenagem) > barra lateral de navegação > abaixo do divisor, último item > "Sair da conta"`
**POSIÇÃO NA INTERFACE**: Rodapé da navegação lateral do modal de Configurações, separado dos itens normais por um `<span className="settings-nav-divider" />`.
**APARÊNCIA**: Botão com ícone (`LeaveIcon`, 15px) + texto "Sair da conta", classe própria `.settings-nav-signout` (presumivelmente com cor de destaque/perigo, distinta dos outros itens de navegação — a confirmar tom exato no CSS).
**ESTADO NORMAL**: Sempre visível e habilitado para qualquer usuário autenticado (não há condição de permissão).
**HOVER**: A confirmar estilo exato (herdado de `.settings-nav-signout:hover`).
**ACTIVE/PRESSED**: Não confirmado detalhe visual distinto.
**SELECTED**: Não aplicável (não é uma seção de configurações — não fica "ativo" como as outras abas, já que clicar nele não troca de seção, dispara a ação direto).
**DISABLED**: Nunca desabilitado.
**LOADING**: **`MISSING`: nenhum estado de loading visual no próprio botão** enquanto `onSignOut` está em andamento (a chamada `api.deleteSession()` é assíncrona, mas o botão não mostra spinner nem fica desabilitado durante isso — clique duplo acidental dispararia a chamada duas vezes, ainda que o efeito final seja idempotente).
**TRIGGER**: Clique esquerdo — **direto, sem diálogo de confirmação**.
**PRÉ-CONDIÇÕES**: Modal de Configurações aberto.
**RESULTADO IMEDIATO**: `onClick={onSignOut}` chama a prop vinda de `Workspace`, que é `() => void voice.disconnect().finally(onSignOut)` — **primeiro desconecta de qualquer canal de voz ativo, só depois chama o `onSignOut` real** (vindo de `App.tsx`): `await api.deleteSession().catch(() => undefined); setState({ status: 'signed-out' })`.
**RESULTADO VISUAL**: Modal de Configurações fecha junto (a tela inteira troca para `EntryScreen`); nenhuma animação de transição documentada entre os dois estados.
**RESULTADO SONORO**: Nenhum (mas se estava em voz, o som de desconexão de voz — já documentado como existente em `DISCORD_PARITY_PLAN.md` §5 — deveria tocar como parte do `voice.disconnect()`, a confirmar quando a auditoria de voz for feita).
**ANIMAÇÃO**: Nenhuma transição própria de logout documentada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: **`MISSING`: nenhuma confirmação "Tem certeza que quer sair?"** — clique único e imediato encerra a sessão, mesmo que o usuário estivesse no meio de digitar uma mensagem ou conectado a uma call (a call é desconectada de propósito, como parte do fluxo, não por acidente, mas sem aviso prévio nenhum).
**SEGUNDA ETAPA**: `App.tsx` re-renderiza para `EntryScreen`.
**RESULTADO FINAL**: `DELETE /api/session` limpa o cookie (`clearSessionCookie`) no backend; cliente esquece toda a sessão local (estado React resetado, `Workspace` desmonta por completo).
**EFEITO LOCAL**: Cookie removido; se estava em call de voz, desconecta primeiro (efeito colateral do `.finally` encadeado); WebSocket fecha junto (desmontagem do `Workspace` limpa os listeners, mas **a conexão em si — `connectRealtime()` é "idempotente" e global via variável de módulo `started` em `realtime.ts` — não é explicitamente fechada por um `socket.close()` no logout**, o que é uma lacuna sutil: o WebSocket físico pode continuar aberto no navegador mesmo depois do logout, até a página ser recarregada ou fechada. A confirmar em auditoria futura da camada de realtime.
**EFEITO REMOTO**: Se estava em call: outros participantes veem a desconexão de voz normalmente (mesmo efeito de um "sair da call" comum). Não há indicador de presença geral para outros verem "ficou offline" (mesma lacuna já registrada em `DISCORD_PARITY_PLAN.md` §8).
**REALTIME**: Ver `EFEITO LOCAL` — potencial lacuna de o socket não fechar explicitamente.
**BACKEND**: `DELETE /api/session` — **não exige `requireSession`** (rota registrada sem esse middleware), então chamar logout sem estar logado não dá erro, só limpa um cookie que talvez já nem existisse.
**BANCO**: Nenhuma escrita (sessão é stateless — não existe uma linha de "sessão ativa" pra apagar).
**REFRESH**: Não aplicável a esta etapa.
**RECONEXÃO**: Não aplicável.
**ERRO**: `api.deleteSession().catch(() => undefined)` — **qualquer erro na chamada de logout é silenciosamente ignorado**; o cliente sempre volta pra tela de entrada independente da API responder com sucesso ou falha (comportamento correto do ponto de vista de UX: o usuário sempre "sai" localmente, mesmo que a limpeza do cookie no servidor falhe por algum motivo transitório).
**CANCELAMENTO**: **`MISSING`** — sem confirmação, não há nada a cancelar; a ação é imediata e não tem um "desfazer" (única forma de reverter é logar de novo).
**REVERSÃO**: Fazer login de novo (`LOGIN_SUBMIT`).
**ATALHO**: Nenhum atalho de teclado dedicado para logout.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Alcançável via Tab dentro do modal de Configurações, ativável via Enter/Espaço.

---

## 1.15 — SESSION_FORCE_LOGOUT_BAN

**ID**: `SESSION_FORCE_LOGOUT_BAN`
**NOME**: Logout forçado ao ser banido enquanto a sessão está ativa
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > qualquer tela dentro do Workspace > evento de tempo real MEMBER_BANNED recebido para o próprio usuário`
**POSIÇÃO NA INTERFACE**: Não aplicável (reação automática, sem elemento de UI próprio disparando).
**APARÊNCIA**: Não aplicável ao gatilho em si; resultado visual é a própria `EntryScreen` reaparecendo.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Evento WebSocket `{ type: 'MEMBER_BANNED', userId }` chega com `userId === session.id` — um `useEffect` em `Workspace.tsx` está sempre escutando via `onRealtimeEvent`.
**PRÉ-CONDIÇÕES**: Usuário logado, com WebSocket conectado, sendo banido **por um administrador em qualquer servidor** enquanto ainda está com o app aberto (banimento é de instância inteira, conforme já registrado na nota de auditoria de `LOGIN_ERROR_BANNED`).
**RESULTADO IMEDIATO**: `void onSignOut()` chamado diretamente — **mesma função de `LOGOUT`, sem passar pelo botão** — mas **note a diferença**: aqui é `onSignOut` puro (a prop recebida diretamente pelo `Workspace`), **não** o wrapper `() => void voice.disconnect().finally(onSignOut)` que o botão de Configurações usa. Ou seja, **se o usuário banido estava em call de voz no momento do ban, a conexão de voz não é explicitamente desconectada antes do logout forçado** — mesma lacuna a confirmar quando a auditoria de voz cobrir o comportamento exato de desmontagem do `Workspace`.
**RESULTADO VISUAL**: Sem nenhum aviso ("você foi banido") — a tela simplesmente volta para `EntryScreen` como se fosse um logout normal, **sem nenhuma mensagem explicando o motivo**. Se o usuário tentar logar de novo imediatamente, só então veria `LOGIN_ERROR_BANNED`.
**RESULTADO SONORO**: Nenhum aviso sonoro específico de "você foi banido".
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: **`MISSING`: nenhuma explicação na hora** — comparado ao Discord real, que mostra uma tela específica de "Você foi banido deste servidor", o NexPlay hoje só desloga silenciosamente sem contexto.
**SEGUNDA ETAPA**: Usuário vê `EntryScreen` sem explicação; só descobre o motivo se tentar logar de novo.
**RESULTADO FINAL**: Sessão encerrada no cliente (mesmo efeito de `LOGOUT`).
**EFEITO LOCAL**: Mesmo de `LOGOUT`, sem o passo de desconexão de voz explícita.
**EFEITO REMOTO**: O ban em si já teria efeitos remotos documentados em auditoria futura de moderação (remoção de `server_members`, etc.) — fora do escopo desta ficha específica de sessão.
**REALTIME**: O evento que dispara tudo isso.
**BACKEND**: Nenhuma chamada nova além do `DELETE /api/session` que `onSignOut` já faz internamente.
**BANCO**: Nenhuma escrita nesta camada (a escrita do ban em si acontece na rota de moderação, não aqui).
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável — a sessão é encerrada, não reconectada.
**ERRO**: Nenhum tratamento de erro específico além do já existente em `onSignOut`.
**CANCELAMENTO**: Não aplicável — não há como o usuário evitar isso uma vez que o evento chega.
**REVERSÃO**: Não aplicável enquanto o ban estiver ativo.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Nenhuma anunciação especial (mesma lacuna de "sem aviso" documentada acima se estende à acessibilidade — um leitor de tela também não seria informado do motivo).

---

## 1.16 — SESSION_EXPIRE_NATURAL

**ID**: `SESSION_EXPIRE_NATURAL`
**NOME**: Expiração natural da sessão após 12 horas
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > qualquer tela > cookie nexplay_session ultrapassa 12h desde o login/cadastro`
**POSIÇÃO NA INTERFACE**: Não aplicável (não é uma ação de UI — é passagem de tempo).
**APARÊNCIA**: Não aplicável até o momento em que uma chamada à API falhar.
**ESTADO NORMAL**: Cookie válido, contando regressivamente (`maxAge: SESSION_DURATION_SECONDS * 1000` = 12h, tanto no cookie do navegador quanto no `expiresAt` embutido no payload assinado — **dupla validação**: o navegador já para de enviar o cookie após o `maxAge`, e mesmo que o enviasse, `getSessionFromCookieHeader` rejeitaria por `payload.expiresAt <= Date.now() / 1000`).
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Passagem do tempo — nenhuma ação do usuário.
**PRÉ-CONDIÇÕES**: App aberto (ou reaberto) depois de 12h de sessão.
**RESULTADO IMEDIATO**: **`MISSING`: nenhum aviso proativo antes de expirar** (sem "sua sessão vai expirar em 5 minutos") e **nenhuma detecção ativa em tempo real do lado do cliente** — o app só descobre que a sessão expirou na próxima vez que uma chamada HTTP autenticada falhar com `401`, ou no próximo F5/reabrir (que refaz `SESSION_RESTORE_ON_BOOT` do zero).
**RESULTADO VISUAL — se via F5/reabrir**: Mesmo fluxo de `SESSION_RESTORE_ON_BOOT` com cookie inválido → `EntryScreen` aparece diretamente, sem explicação de "sua sessão expirou" (visualmente indistinguível de nunca ter logado).
**RESULTADO VISUAL — se a sessão expira com o app já aberto, sem F5**: **`MISSING`/achado real**: como não há nenhum timer no cliente vigiando `expiresAt`, e como o WebSocket usa seu próprio ciclo de vida (não checa o cookie HTTP a cada mensagem), **o app pode continuar parecendo "logado" na tela por tempo indefinido além das 12h, até a próxima chamada HTTP que exija `requireSession` falhar** — nesse momento, o comportamento exato depende de cada chamada individual tratar ou não um 401 chamando `onSignOut` (a maioria das chamadas em `api.ts`, a confirmar em auditoria futura, provavelmente só propaga o erro pro componente que a fez, sem uma reação global centralizada de "401 em qualquer lugar → desloga").
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Login de novo.
**RESULTADO FINAL**: Nova sessão de 12h.
**EFEITO LOCAL**: Nenhuma perda de dado não salvo é avisada — se o usuário estava digitando uma mensagem longa no momento em que a sessão expirasse silenciosamente, só descobriria ao tentar enviar e receber um erro.
**EFEITO REMOTO**: Se estava em call de voz no momento da expiração: **a conexão LiveKit não depende do cookie HTTP pra continuar funcionando** (é uma sessão WebRTC separada, com seu próprio token de curta duração emitido no momento de entrar na sala) — então a call plausivelmente continua funcionando mesmo com a sessão HTTP/cookie já expirada, até a próxima ação que dependa da API REST falhar. **Comportamento exato a confirmar quando a auditoria de voz for feita.**
**REALTIME**: WebSocket não é automaticamente derrubado pela expiração do cookie HTTP (protocolos diferentes) — a confirmar se o handshake do WebSocket também valida `expiresAt` só no momento de conectar (usando `getSessionFromCookieHeader` do lado do servidor) e nunca mais depois, o que significaria que uma conexão WebSocket já aberta **sobrevive indefinidamente à expiração da sessão HTTP**, sem nenhuma verificação periódica.
**BACKEND**: Qualquer rota com `requireSession` retorna `401` a partir do momento em que `expiresAt` é ultrapassado.
**BANCO**: Não aplicável (nada persiste o momento de expiração — é calculado on-the-fly a cada request).
**REFRESH**: F5 força a redescoberta do estado real (sessão morta → `EntryScreen`).
**RECONEXÃO**: **`MISSING`: nenhuma tentativa de renovar a sessão automaticamente** (sem refresh token, sem "renovar sessão silenciosamente em segundo plano" antes de expirar) — a única forma de continuar usando o app é logar de novo manualmente depois que expira.
**ERRO**: `401 Unauthorized` em qualquer rota protegida.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Login de novo.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável — mesma lacuna de "sem aviso" se estende à ausência de qualquer anúncio para leitor de tela.

---

## 1.17 — REALTIME_RECONNECT

**ID**: `REALTIME_RECONNECT`
**NOME**: Reconexão automática do WebSocket após queda
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > apps/web/src/realtime.ts > módulo global, ativo durante toda a vida do Workspace`
**POSIÇÃO NA INTERFACE**: Não aplicável — não existe um indicador visual de "reconectando" documentado em nenhum componente encontrado até agora nesta auditoria (a confirmar contra `Workspace.tsx` em detalhe quando a auditoria de navegação/topbar for feita — pode haver um indicador que não foi identificado ainda nesta passagem específica sobre login/sessão).
**APARÊNCIA**: Não aplicável (sem UI própria confirmada).
**ESTADO NORMAL**: `WebSocket` aberto, `reconnectDelayMs` resetado para `1000` (1s) a cada conexão bem-sucedida (`ws.onopen`).
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável (sem UI).
**TRIGGER**: `ws.onclose` (conexão caiu, por qualquer motivo: rede instável, backend reiniciado, timeout) ou `ws.onerror` (que por sua vez chama `ws.close()`, convergindo para o mesmo caminho de `onclose`).
**PRÉ-CONDIÇÕES**: `connectRealtime()` já ter sido chamado uma vez (dentro do `Workspace`, então só existe pós-login).
**RESULTADO IMEDIATO**: `scheduleReconnect()`: se já há um `reconnectTimer` pendente, não faz nada (evita múltiplos timers concorrentes); senão, agenda uma nova tentativa de `open()` após `reconnectDelayMs`.
**RESULTADO VISUAL**: Nenhum indicador confirmado nesta auditoria — usuário **não tem como saber visualmente que o WebSocket caiu e está tentando reconectar**, exceto pela ausência de atualizações em tempo real (mensagens não chegam, mudanças de outros usuários não aparecem) até a reconexão suceder.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Backoff exponencial: `reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15_000)` a cada tentativa que falha — 1s, 2s, 4s, 8s, 15s (teto), 15s, 15s... indefinidamente, sem limite máximo de tentativas (tenta para sempre até suceder ou a aba/app fechar).
**RESULTADO FINAL — sucesso**: `ws.onopen` dispara `reconnectDelayMs` de volta para `1000`, e todos os `connectHandlers` registrados via `onRealtimeConnect` são chamados — **esse é o mecanismo real de recuperação de estado perdido**: cada consumidor (ex.: `useServersState`, `useActiveServerMember`, listas de canais) reage a esse evento refazendo o fetch HTTP inicial correspondente, sincronizando qualquer coisa que mudou enquanto a conexão estava caída. Não há um mecanismo de "replay" de eventos perdidos — é sempre um refetch completo, não incremental.
**EFEITO LOCAL**: Enquanto desconectado: nenhuma mensagem/atualização em tempo real chega; envio de novas mensagens **continuaria funcionando via HTTP normal** (o envio de mensagem é uma chamada REST, não depende do WebSocket estar aberto — só o *recebimento* em tempo real depende dele), então o usuário pode continuar enviando mensagens "às cegas" sem saber se outros estão vendo atualizações ao vivo.
**EFEITO REMOTO**: Do ponto de vista de outros usuários, nada muda (a queda é só do lado do cliente que perdeu conexão).
**REALTIME**: É o próprio mecanismo documentado.
**BACKEND**: Cada tentativa de reconexão é um novo handshake de WebSocket em `/api/realtime`, que revalida o cookie de sessão via `getSessionFromCookieHeader` no momento do upgrade.
**BANCO**: Não aplicável.
**REFRESH**: F5 força uma reconexão imediata (`connectRealtime()` roda de novo do zero, `started` reseta com o reload da página inteira).
**RECONEXÃO**: É a própria ficha.
**ERRO**: Se a sessão HTTP tiver expirado entre a queda e a tentativa de reconexão (ver `SESSION_EXPIRE_NATURAL`), o handshake do WebSocket seria rejeitado — **comportamento exato de rejeição (fecha imediatamente? erro específico?) não confirmado nesta auditoria**, mas o loop de `scheduleReconnect()` continuaria tentando de qualquer forma, já que não há lógica que diferencie "falhou por rede" de "falhou por sessão expirada" — os dois casos caem no mesmo `onclose`/retry infinito, potencialmente tentando reconectar para sempre com uma sessão que nunca mais vai ser válida até o usuário logar de novo manualmente.
**CANCELAMENTO**: Não aplicável — não há como o usuário pausar/cancelar as tentativas de reconexão automática.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável (sem UI própria).

**Status geral do Roteiro 1**: fluxo de login/cadastro é sólido e bem tratado (mensagens de erro claras, rate limiting, comparações resistentes a timing attack), mas a auditoria achou lacunas reais de UX em torno da própria sessão: nenhum aviso de expiração, nenhum indicador de reconexão do WebSocket, nenhuma explicação visível ao ser banido em tempo real, nenhuma confirmação ao sair da conta, e nenhum evento em tempo real de "novo membro" quando alguém se cadastra pelo convite global.

---

# ROTEIRO 2 — NAVEGAÇÃO

Arquitetura real (verificada em `apps/web/src/components/Workspace.tsx` e `Servers.tsx`): navegação de topo é um `useState<'server' | 'friends'>` binário — **só existem esses dois "modos"**, sem conceito de rota/URL própria (não há router; trocar de servidor/canal não muda a URL do navegador, então **não é possível copiar/colar um link direto pra um servidor específico, nem usar Voltar/Avançar do navegador pra navegar entre servidores/canais** — isso está fora do escopo desta ficha individual e é registrado à parte como achado transversal no fim deste roteiro). Todos os botões da rail usam `title="..."` nativo do HTML como tooltip — **nenhum tooltip customizado/estilizado** (diferente do balão rico do Discord real, que mostra nome + indicador de status).

---

## 2.1 — HOME_SELECT

**ID**: `HOME_SELECT`
**NOME**: Ir para a tela Início (contexto pessoal — amigos/DMs)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > rail de servidores (extrema esquerda) > primeiro botão, topo`
**POSIÇÃO NA INTERFACE**: Topo da `<aside className="server-rail">`, antes do divisor (`.rail-divider`) que separa do primeiro servidor.
**APARÊNCIA**: Botão com a marca do app (`<span className="brand-mark compact"><i /><i /></span>` — duas barras/traços formando o logo compacto, não um ícone importado), classes `server-button home`.
**ESTADO NORMAL**: Sem destaque quando `view !== 'friends'`.
**HOVER**: Estilo padrão de `.server-button:hover` (mudança de `border-radius`/cor de fundo, já documentado no CSS de outras auditorias desta sessão como indo de quadrado arredondado pra mais arredondado ainda no hover).
**ACTIVE/PRESSED**: Sem regra CSS distinta de `:active` documentada.
**SELECTED**: Classe `active` aplicada quando `view === 'friends'` — mesmo tratamento visual da barra lateral de destaque (`::before`) que um servidor selecionado tem, reaproveitando a mesma classe `.server-button.home`.
**DISABLED**: Nunca desabilitado.
**LOADING**: Não aplicável.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `setView('friends')`.
**RESULTADO VISUAL**: Coluna de contexto (`.sidebar`) troca de "canais do servidor ativo" para a lista de amigos/DMs; painel central troca do canal de texto/voz para a tela de amigos ou DM selecionada.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma transição documentada — troca instantânea (`View Transitions API` do navegador só é usada especificamente pra entrar em canal de voz, ver auditoria futura de Voz — não para troca de contexto Início/Servidor).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário navega dentro da tela de Amigos/DMs (auditoria detalhada pendente, Roteiro 30/31).
**RESULTADO FINAL**: `view === 'friends'`, `activeServerId` continua retido no estado (não é resetado — voltar para um servidor depois volta pro mesmo servidor de antes, sem precisar escolher de novo).
**EFEITO LOCAL**: Nenhuma chamada de API disparada só pela troca de view em si (a tela de Amigos já teria seus próprios dados carregados via `useFriendsState`, que roda em paralelo o tempo todo, independente da view ativa — não é um fetch sob demanda ao clicar).
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado — WebSocket continua conectado e recebendo eventos de servidor mesmo com `view === 'friends'` (confirmado: os hooks de estado de servidor, como `useServersState`, não são condicionados à view ativa).
**BACKEND**: Nenhuma chamada nova.
**BANCO**: Não aplicável.
**REFRESH**: `view` **não persiste em F5** — sempre volta para `'server'` (valor inicial do `useState`), mesmo que o usuário estivesse em "Início" antes de recarregar.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar em qualquer ícone de servidor na rail volta para `view === 'server'`.
**ATALHO**: **`MISSING`** — nenhum atalho de teclado dedicado (Discord real não tem um atalho universal pra isso either, então não é necessariamente uma lacuna de paridade).
**MENU DE CONTEXTO**: **`MISSING`** — botão direito não abre nada.
**ACESSIBILIDADE**: `aria-label="Início"`. Alcançável via Tab, ativável via Enter/Espaço.

---

## 2.2 — FRIEND_REQUEST_BADGE

**ID**: `FRIEND_REQUEST_BADGE`
**NOME**: Indicador de pedidos de amizade pendentes no botão Início
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > rail de servidores > botão Início > canto do badge`
**POSIÇÃO NA INTERFACE**: Sobreposto ao botão Início (`<span className="dm-pending-badge rail-badge">`).
**APARÊNCIA**: Badge numérico pequeno — mostra a contagem exata (`friendsState.incoming.length`), não um simples ponto.
**ESTADO NORMAL**: Ausente quando `friendsState.incoming.length === 0`.
**HOVER**: Não é um elemento interativo próprio (clicar nele clica no botão por baixo, já que é um `<span>` sem seu próprio handler) — não tem tooltip próprio explicando "N pedidos de amizade pendentes", só o número visível.
**ACTIVE/PRESSED**: Não aplicável (não é clicável isoladamente).
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Renderização condicional — não é uma interação, é um indicador reativo.
**PRÉ-CONDIÇÕES**: `friendsState.incoming.length > 0` (isto é, alguém enviou um pedido de amizade que o usuário ainda não respondeu).
**RESULTADO IMEDIATO**: Badge aparece/atualiza o número automaticamente conforme `friendsState` muda (o hook por trás já reage a eventos de tempo real de amizade, `FRIENDSHIP_UPDATE`, documentado em `DISCORD_PARITY_PLAN.md` §1).
**RESULTADO VISUAL**: Número visível sobre o ícone Início.
**RESULTADO SONORO**: **`MISSING`**: nenhum som toca quando um novo pedido de amizade chega enquanto o app está aberto (diferente de uma notificação sonora esperada).
**ANIMAÇÃO**: Não confirmada (pode ou não ter uma entrada suave — não verificado nesta passagem).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Clicar no botão Início (por baixo do badge) navega para a tela de Amigos, onde presumivelmente a aba "Pendentes" mostraria os pedidos em si (auditoria detalhada de Amigos pendente, Roteiro 30).
**RESULTADO FINAL**: Badge some assim que `friendsState.incoming.length` volta a zero (pedido aceito/recusado).
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Atualizado via evento `FRIENDSHIP_UPDATE`.
**BACKEND**: Nenhuma chamada nova disparada pelo badge em si (dado já vem do `useFriendsState` compartilhado).
**BANCO**: Não aplicável a esta ficha.
**REFRESH**: Recalculado do zero a cada F5 (fetch inicial de amizades).
**RECONEXÃO**: Recalculado via `onRealtimeConnect` (mesmo padrão de refetch-ao-reconectar já documentado no Roteiro 1).
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: **Achado**: o `<span>` do badge não tem `aria-label` próprio nem está associado via `aria-describedby` ao botão — um leitor de tela focando o botão "Início" provavelmente só anuncia "Início", sem mencionar a contagem de pedidos pendentes.

---

## 2.3 — SERVER_RAIL_TOOLTIP

**ID**: `SERVER_RAIL_TOOLTIP`
**NOME**: Dica de nome do servidor ao passar o mouse na rail
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > rail de servidores > qualquer ícone de servidor`
**POSIÇÃO NA INTERFACE**: Tooltip nativo do navegador/SO, posicionado automaticamente pelo motor de renderização (não controlado por CSS/JS do NexPlay).
**APARÊNCIA**: **Tooltip nativo do sistema** (`title="{server.name}"`) — caixa cinza simples do SO, sem estilização do NexPlay, sem indicador de status/atividade dentro do tooltip (diferente do balão rico que o Discord real mostra, com nome do servidor formatado e às vezes badges extras).
**ESTADO NORMAL**: Invisível até o hover.
**HOVER**: Aparece após o delay padrão do SO/navegador para `title` (tipicamente ~500ms-1s, não configurável pelo NexPlay).
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Hover (mouse parado sobre o ícone por tempo suficiente).
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: Navegador/SO renderiza o tooltip nativo.
**RESULTADO VISUAL**: Caixa de texto simples aparece próxima ao cursor.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: A do próprio SO/navegador (geralmente nenhuma ou um fade rápido).
**POPOVER**: Não aplicável (tecnicamente É um popover nativo, mas não controlado pelo NexPlay).
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Tirar o mouse esconde o tooltip.
**RESULTADO FINAL**: Nenhum efeito colateral — é só informativo.
**EFEITO LOCAL**: Nenhum.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Tirar o mouse do elemento.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável (tooltip nativo não é acionável por teclado da mesma forma — foco via Tab também dispara `title` em alguns navegadores, mas o comportamento exato varia e não é controlado pelo NexPlay).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` **duplicado com o `title`** em todos os botões da rail (`aria-label={server.name}` e `title={server.name}` com o mesmo valor) — redundante mas não incorreto; leitores de tela usam o `aria-label`, o `title` é só o tooltip visual.

**Nota de auditoria**: todo tooltip do app (não só na rail) usa `title` nativo — nenhum componente de tooltip customizado (posicionamento `fixed` com delay configurável, como o `ProfilePopover`/`EmojiPicker` já documentados em `DISCORD_PARITY_PLAN.md`) foi encontrado nesta auditoria de navegação. Isso é consistente em toda a rail, mas é uma lacuna de polish visual comparado ao Discord real.

---

## 2.4 — SERVER_SELECT

**ID**: `SERVER_SELECT`
**NOME**: Selecionar um servidor na rail
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > rail de servidores > ícone de um servidor específico`
**POSIÇÃO NA INTERFACE**: Entre o divisor pós-Início e o botão "+" de adicionar servidor, um botão por servidor do qual o usuário é membro, na ordem retornada por `GET /api/servers` (**achado**: essa ordem vem de `listServersForUser`, cuja ordenação exata — por data de entrada? por nome? — não foi confirmada nesta auditoria específica; **não há reordenação manual da rail pelo usuário, arrastando ícones**, diferente do Discord real, que permite isso).
**APARÊNCIA**: Ícone do servidor (`server.iconDataUrl`, já documentado com o recorte quadrado central real desde a correção desta sessão) ou, na ausência de ícone, a primeira letra maiúscula do nome como texto.
**ESTADO NORMAL**: Sem destaque.
**HOVER**: Padrão de `.server-button:hover`.
**ACTIVE/PRESSED**: Sem regra distinta documentada.
**SELECTED**: Classe `active` quando `view === 'server' && activeServerId === server.id` — barra de destaque lateral (`::before`) visível, mesma técnica do botão Início.
**DISABLED**: Nunca desabilitado (qualquer servidor do qual o usuário é membro é sempre selecionável).
**LOADING**: **`MISSING`**: nenhum indicador de carregamento visível no próprio ícone enquanto os canais do novo servidor carregam — a troca parece instantânea na rail mesmo que o conteúdo da sidebar/painel central ainda esteja buscando dados.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Ser membro do servidor (a lista já só contém servidores dos quais o usuário faz parte).
**RESULTADO IMEDIATO**: `setActiveServerId(server.id)` + `setView('server')`.
**RESULTADO VISUAL**: Sidebar troca para a lista de categorias/canais do novo servidor; cabeçalho (`sidebar-header`) muda para o nome do novo servidor; painel central troca para o primeiro canal de texto da lista nova (ver `CHANNEL_LIST_DEFAULT_SELECT` — **nunca o último canal visitado**, sempre o primeiro).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma transição (troca instantânea de conteúdo).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: `useEffect`s dependentes de `activeServerId` disparam: busca de canais (`GET /api/servers/:id/channels`), categorias, membro ativo (`useActiveServerMember`), salas de voz (`GET /api/servers/:id/rooms`).
**RESULTADO FINAL**: Servidor novo totalmente carregado e ativo, com o primeiro canal de texto selecionado.
**EFEITO LOCAL**: Múltiplas chamadas HTTP disparadas em paralelo (uma por `useEffect` dependente de `activeServerId`) — **não há um único endpoint agregado "tudo que preciso pra este servidor"**, são requests separadas.
**EFEITO REMOTO**: Nenhum — outros usuários não são notificados de que alguém está "vendo" o servidor (não há indicador de presença dentro de servidor específico).
**REALTIME**: A assinatura de eventos do WebSocket já é global (não por servidor) do lado do cliente — trocar de servidor não reabre a conexão, só muda quais dados o React local mantém sincronizados visualmente.
**BACKEND**: `GET /api/servers/:id/channels`, `/categories`, `/members/me`, `/rooms` — quatro chamadas HTTP mínimas por troca de servidor (a confirmar contagem exata em auditoria futura mais profunda).
**BANCO**: Nenhuma escrita — troca de servidor é só leitura.
**REFRESH**: **`activeServerId` não persiste em F5** — o `useEffect` de "servidor ativo por padrão" (já documentado no código-fonte com o comentário "cai pro primeiro disponível") sempre volta para `serversState.servers[0]`, o primeiro da lista, não necessariamente o que estava selecionado antes de recarregar.
**RECONEXÃO**: Se o servidor selecionado deixar de existir na lista (ex.: o usuário foi removido dele em outra aba, ou o servidor foi excluído por outro membro), o mesmo `useEffect` detecta e recua automaticamente para o primeiro servidor disponível (ou `null` se não sobrar nenhum) — mecanismo já usado e confirmado funcionando durante a implementação da exclusão de servidor, numa sessão anterior desta auditoria de código mais ampla.
**ERRO**: Se as chamadas de canais/categorias/membro falharem (backend indisponível), não há uma tela de erro específica por servidor — o comportamento exato (tela em branco? loading infinito?) não foi confirmado nesta passagem, marcado como lacuna de verificação para auditoria futura.
**CANCELAMENTO**: Não aplicável — não há como cancelar a troca uma vez clicada (é instantânea do ponto de vista da rail, mesmo que o carregamento de dados continue em segundo plano).
**REVERSÃO**: Clicar em outro servidor, ou no botão Início.
**ATALHO**: **`MISSING`** — nenhum atalho de teclado (Ctrl+Alt+Seta como no Discord real) para navegar entre servidores sem usar o mouse.
**MENU DE CONTEXTO**: Ver `SERVER_CONTEXT_MENU` — **`MISSING`**.
**ACESSIBILIDADE**: `aria-label={server.name}`, alcançável via Tab, ativável via Enter/Espaço.

---

## 2.5 — SERVER_ADD_OPEN

**ID**: `SERVER_ADD_OPEN`
**NOME**: Abrir o modal de adicionar/criar/entrar em servidor
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > rail de servidores > último botão, abaixo de todos os servidores`
**POSIÇÃO NA INTERFACE**: Fim da rail, depois do último ícone de servidor.
**APARÊNCIA**: Botão com ícone de "+" (`PlusIcon`, 18px), classe `server-button add` (tratamento visual próprio — borda tracejada, cor diferenciada, já documentado no CSS lido nesta sessão em auditorias anteriores).
**ESTADO NORMAL**: Sempre visível para qualquer usuário autenticado.
**HOVER**: Estilo próprio de `.server-button.add:hover` (cor de destaque diferente dos ícones de servidor normais).
**ACTIVE/PRESSED**: Sem regra distinta documentada.
**SELECTED**: Não aplicável (abre um modal, não "seleciona" um estado persistente).
**DISABLED**: Nunca desabilitado — **não há limite de quantidade de servidores que um usuário pode criar/entrar**, confirmado por ausência de qualquer checagem desse tipo no código de criação de servidor já auditado em sessões anteriores.
**LOADING**: Não aplicável ao botão em si.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `setAddServerOpen(true)`.
**RESULTADO VISUAL**: `AddServerModal` aparece como overlay (`.dialog-overlay`), com duas abas: "Criar servidor" e "Entrar com convite" (auditoria detalhada do conteúdo do modal em si — campos, submissão — cabe no Roteiro 3, Servidores/Canais, para não duplicar aqui).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada nesta passagem (padrão de `.dialog-overlay` reaproveitado em vários outros modais já auditados — provavelmente sem transição de entrada elaborada).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É o próprio `AddServerModal`.
**SEGUNDA ETAPA**: Preencher e submeter um dos dois formulários (Roteiro 3).
**RESULTADO FINAL**: Modal aberto, foco movido para o campo de nome (`nameInputRef.current?.focus()` via `requestAnimationFrame`, confirmado no código de `Servers.tsx`).
**EFEITO LOCAL**: Nenhuma chamada de API só por abrir o modal.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável a esta etapa.
**CANCELAMENTO**: Ver ficha de fechar modal (botão X, Esc, clique fora — todos implementados: `onClose` + `window.addEventListener('keydown', ...)` para Esc + `onMouseDown` no overlay checando `event.target === event.currentTarget`).
**REVERSÃO**: Fechar sem submeter.
**ATALHO**: Nenhum atalho de teclado dedicado para *abrir* o modal (diferente de fechá-lo, que tem Esc).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Adicionar servidor"` no botão; o modal em si usa `role="dialog"`/`aria-modal="true"`/`aria-labelledby` (confirmado no código de `AddServerModal`) — foco é movido programaticamente para dentro do modal ao abrir, e devolvido ao botão que abriu (`returnFocusRef`) ao fechar — **gerenciamento de foco correto e completo**, um dos poucos modais desta auditoria com esse cuidado explicitamente confirmado no código.

---

## 2.6 — SERVER_CONTEXT_MENU *(MISSING)*

**ID**: `SERVER_CONTEXT_MENU`
**NOME**: Menu de contexto ao clicar com o botão direito num servidor da rail
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhum `onContextMenu` nos botões de servidor da rail (`grep` não encontrou nenhuma ocorrência em `Workspace.tsx` associando `onContextMenu` a `.server-button.server-current`) — comparado a canais e categorias, que **já têm** menu de contexto funcional (`onContextMenu={(event) => openMoveChannelMenu(...)}` em canais, `onContextMenu={(event) => openCategoryMenu(event, category)}` em categorias, ambos usando o mesmo `useContextMenu()`/`<ContextMenu>` genérico já construído e reaproveitável em `ContextMenu.tsx`).
**CAMINHO EXATO ESPERADO** (não implementado): `Rail de servidores > botão direito num ícone de servidor`
**O que isso bloqueia**: o pedido do usuário lista explicitamente, para este menu: "Marcar como lido. Notificações. Silenciar. Configurações de privacidade. Editar perfil do servidor. Criar convite. Sair. Copiar ID." — nenhuma dessas ações está disponível via clique direito hoje. Ações equivalentes que **já existem em outro lugar** da UI (não recriar, só reorganizar se algum dia isso for implementado): "Editar perfil do servidor" já existe dentro de Configurações do Servidor (auditado como funcional em sessão anterior); "Sair do servidor" existe como rota de API (`DELETE /api/servers/:serverId/members/me`, confirmado em `apps/api/src/index.ts`) mas **não confirmado se tem um botão na UI atual** (a verificar em auditoria futura do Roteiro 3); "Criar convite"/"Copiar ID" — convite já existe na aba Convites das configurações do servidor; "Copiar ID" não confirmado em lugar nenhum ainda.
**Pré-requisito de implementação, caso venha a ser feito**: reaproveitar exatamente o `useContextMenu()`/`<ContextMenu>` já existente (usado em canais/categorias) — é o mesmo padrão, só falta o `onContextMenu` no botão de servidor e a lista de itens do menu.

---

## 2.7 — SERVER_HEADER_OPEN_SETTINGS

**ID**: `SERVER_HEADER_OPEN_SETTINGS`
**NOME**: Abrir configurações do servidor pelo cabeçalho da sidebar
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > servidor ativo > sidebar > cabeçalho (topo, mostrando o nome do servidor)`
**POSIÇÃO NA INTERFACE**: `<header className="sidebar-header">`, topo da coluna de canais.
**APARÊNCIA**: Nome do servidor em destaque (`<strong>{activeServer?.name}</strong>`) + ícone de chevron (`ChevronIcon`, 16px) à direita, sugerindo um dropdown — **mas não é um dropdown**.
**ESTADO NORMAL**: Nome do servidor ativo, ou "Carregando…" enquanto `activeServer` ainda é `null`/não resolvido.
**HOVER**: Estilo de hover de botão padrão do app (a confirmar tom exato).
**ACTIVE/PRESSED**: Sem regra distinta documentada.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca desabilitado enquanto há um servidor ativo.
**LOADING**: O próprio texto "Carregando…" serve como indicador enquanto `activeServer` é `null` (ex.: no instante entre trocar de servidor e os dados chegarem).
**TRIGGER**: Clique esquerdo em qualquer parte do cabeçalho (é um único `<button>` que envolve nome + chevron, não dois elementos separados).
**PRÉ-CONDIÇÕES**: `view === 'server'` (só existe nesse contexto).
**RESULTADO IMEDIATO**: `setServerSettingsOpen(true)`.
**RESULTADO VISUAL**: `ServerSettings` abre como tela cheia sobreposta (`.server-settings-shell`), **direto na seção "Perfil do servidor"** — não existe uma etapa intermediária de menu suspenso com múltiplas opções (Impulsionar, Convidar Pessoas, Configurações do Servidor, Criar Canal, Criar Categoria, Notificações, Sair — todas essas opções que o Discord real mostra num dropdown ao clicar no nome do servidor) — **achado real, distinto do `SERVER_CONTEXT_MENU`**: aqui o clique *funciona*, só que pula direto pras configurações completas em vez de abrir um menu curto com atalhos.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada (mesma lacuna de verificação de outros modais/overlays desta auditoria).
**POPOVER**: **`MISSING`**: o pedido do usuário esperava um dropdown leve aqui (ver `DISCORD_UI_ATLAS.md` Roteiro 3 do pedido original: "Clique: abre menu do servidor. Documentar cada entrada: Boost. Convidar pessoas. Configurações. Criar canal. Criar categoria. Criar evento..."), mas o que existe é um salto direto pra tela cheia de configurações.
**MENU**: Não existe (ver acima).
**MODAL**: `ServerSettings` em si é o resultado (tela cheia, não um modal pequeno).
**SEGUNDA ETAPA**: Usuário navega dentro de Configurações do Servidor (já auditado em detalhe em sessões anteriores: Perfil, Cargos, Membros, Convites, Integrações, Excluir servidor).
**RESULTADO FINAL**: Tela de Configurações do Servidor aberta.
**EFEITO LOCAL**: Nenhuma chamada nova de API (os dados do servidor já estão carregados via `activeServer`/`member`, que `ServerSettings` recebe como props, não busca de novo).
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não afetado.
**BACKEND**: Nenhuma chamada nova ao abrir (chamadas específicas de cada aba, como Membros/Convites, acontecem só quando aquela aba é selecionada — auditado em sessão anterior).
**BANCO**: Não aplicável.
**REFRESH**: Estado `serverSettingsOpen` não persiste em F5 (sempre fecha).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável a esta etapa.
**CANCELAMENTO**: Botão de fechar (`.server-settings-close`, com indicação "ESC" visível) ou tecla Esc.
**REVERSÃO**: Fechar e reabrir.
**ATALHO**: Nenhum atalho de teclado dedicado para *abrir*; Esc fecha (confirmado em `useEffect` de `ServerSettings`, já auditado em sessão anterior desta mesma auditoria de código mais ampla).
**MENU DE CONTEXTO**: Não aplicável ao cabeçalho em si.
**ACESSIBILIDADE**: `aria-label="Abrir configurações do servidor"` no botão — nome explícito, apesar do chevron visualmente sugerir "expandir menu" em vez de "abrir configurações" (pequena incoerência entre a affordance visual e o rótulo de acessibilidade real).

**Nota de auditoria — lacuna estrutural**: como não existe o menu-dropdown intermediário, ações rápidas como "Criar canal"/"Criar categoria" (que na UI atual moram dentro da própria lista de canais, via botões "+" — já auditados como funcionais em sessão anterior) e "Convidar pessoas"/"Sair do servidor" (que exigiriam entrar em Configurações primeiro) não têm um atalho de um clique só a partir do cabeçalho, diferente do Discord real.

---

## 2.8 — CHANNEL_LIST_DEFAULT_SELECT

**ID**: `CHANNEL_LIST_DEFAULT_SELECT`
**NOME**: Seleção automática de canal ao entrar/trocar de servidor
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > SERVER_SELECT > sidebar de canais > primeiro canal de texto da lista`
**POSIÇÃO NA INTERFACE**: Não aplicável (é uma seleção automática, não um clique do usuário).
**APARÊNCIA**: O primeiro canal de texto da lista (`channels[0]`) aparece com o destaque visual de "selecionado" (mesmo tratamento de `.text-channel-button.active`/`.channel-button.active` já documentado em auditorias anteriores desta sessão de trabalho no código).
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável a esta ficha (é sobre a seleção automática, não sobre interação manual com a lista).
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: É o próprio resultado.
**DISABLED**: Não aplicável.
**LOADING**: Entre trocar de servidor e os canais carregarem, a sidebar mostra o estado anterior por um instante (não há skeleton/placeholder de lista de canais confirmado nesta auditoria — a verificar).
**TRIGGER**: Automático — dispara sempre que `activeServerId` muda e é a **primeira vez** que os canais daquele servidor são carregados nesta sessão do app (controlado por `textChannelsInitializedRef`, um `useRef` que reseta a cada troca de `activeServerId`).
**PRÉ-CONDIÇÕES**: Servidor ter pelo menos um canal de texto (se não tiver nenhum, `channels[0]?.id ?? null` resulta em `null` — nenhum canal selecionado, painel central mostra estado vazio, auditoria pendente).
**RESULTADO IMEDIATO**: `setSelectedTextChannelId(channels[0]?.id ?? null)`.
**RESULTADO VISUAL**: Painel central passa a mostrar o histórico do primeiro canal de texto.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Usuário pode clicar em outro canal manualmente (ver ficha própria de seleção manual de canal, a auditar em detalhe no Roteiro 3/5 — Servidores e Canais/Mensagens).
**RESULTADO FINAL — LACUNA REAL DE PARIDADE**: **o app nunca lembra qual foi o último canal que o usuário estava vendo naquele servidor** — nem entre sessões (F5/reabrir), nem dentro da mesma sessão ao trocar de servidor e voltar (`textChannelsInitializedRef` é resetado a cada troca de `activeServerId`, então voltar a um servidor já visitado nesta mesma sessão **também** reseta pro primeiro canal, não pro que o usuário tinha aberto por último). Isso contraria diretamente o comportamento esperado descrito no próprio pedido do usuário: "Troca a coluna de canais. Troca painel central para último canal acessado."
**EFEITO LOCAL**: Nenhum efeito colateral além da seleção em si.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada nova (é decidido inteiramente a partir dos dados já buscados por `SERVER_SELECT`).
**BANCO**: Não aplicável — **não existe nenhuma tabela/coluna de "último canal visitado por usuário por servidor"** no schema (confirmado por ausência ao longo de toda a auditoria de `db.ts` feita nesta sessão de trabalho mais ampla).
**REFRESH**: Sempre reseta pro primeiro canal (ver acima).
**RECONEXÃO**: Se o canal atualmente selecionado for excluído por outro membro enquanto o usuário está nele, o mesmo padrão de fallback (`if (current && !channels.some(...)) return channels[0]?.id ?? null;`) recua automaticamente pro primeiro canal disponível — isso é o comportamento correto e desejável para esse caso específico (canal sumiu), só não é desejável como comportamento padrão de troca de servidor.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável a esta ficha especificamente.

---

## 2.9 — RAIL_UNREAD_MENTION_INDICATOR *(MISSING)*

**ID**: `RAIL_UNREAD_MENTION_INDICATOR`
**NOME**: Indicador de mensagem não lida / menção num ícone de servidor
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo**, já registrado em `DISCORD_PARITY_PLAN.md` §3-5 ("Indicador de não lida/menção na rail | MISSING — hoje não há sequer rastreio de 'última mensagem lida'") — confirmado nesta auditoria de navegação por ausência total: nenhuma classe CSS, nenhum badge, nenhum pingo branco (o indicador clássico do Discord de "servidor com atividade não vista") em nenhum botão de servidor da rail.
**CAMINHO EXATO ESPERADO** (não implementado): `Rail de servidores > ícone do servidor > pingo branco (não lido) ou badge numérico (menções) sobreposto`
**Pré-requisito de arquitetura para implementar**: exigiria uma tabela nova de "último timestamp lido por usuário por canal" (não existe hoje — nem em `text_channels` nem em nenhuma tabela de junção), comparada contra o `created_at` da mensagem mais recente de cada canal daquele servidor, agregada por servidor pra decidir se mostra o indicador na rail. Bloqueia também `CHANNEL_UNREAD_INDICATOR` (indicador por canal individual na sidebar, roteiro futuro) e a funcionalidade "Marcar como lido" já documentada como só-visual em categorias (`DISCORD_PARITY_PLAN.md` §1: "'marcar como lida' é só visual — o app não tem nenhum rastreio de mensagem lida/não lida em lugar nenhum ainda").

---

## 2.10 — QUICK_SWITCHER *(MISSING)*

**ID**: `QUICK_SWITCHER`
**NOME**: Busca rápida de servidor/canal/DM/usuário via atalho de teclado
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhum listener de `Ctrl+K`/`Cmd+K` em `Workspace.tsx` nem em nenhum outro componente (`grep` por combinações de teclado relacionadas não encontrou nada). Ficha completa (36 campos) fica para quando a auditoria chegar no Roteiro 37 (Quick Switcher, dedicado) do pedido original, pra não duplicar — registrado aqui só como achado de navegação, já que é o mecanismo de navegação mais rápido que falta.

---

## 2.11 — KEYBOARD_SERVER_NAVIGATION *(MISSING)*

**ID**: `KEYBOARD_SERVER_NAVIGATION`
**NOME**: Trocar de servidor via teclado (sem usar o mouse na rail)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhum listener de `Ctrl+Alt+Seta`/`Alt+Seta` (os atalhos reais do Discord para isso) em `Workspace.tsx`. A única forma de trocar de servidor hoje é clicar diretamente num ícone da rail com o mouse, ou usar Tab pra alcançar os botões um por um (funcional, mas lento — sem um atalho dedicado de "próximo/servidor anterior").
**CAMINHO EXATO ESPERADO** (não implementado): Atalho global, qualquer tela.
---

# ROTEIRO 13 — LISTA DE MEMBROS, MINI-PERFIL E PAINEL DO PRÓPRIO USUÁRIO

Cobre os roteiros 18 (Member List), 19 (Mini Profile) e 20 (Painel do próprio usuário) do pedido original. Método: leitura de `Workspace.tsx`, `ProfilePopover.tsx`, `ServerSettings.tsx`, `styles.css` e da rota `GET /api/users/:id/profile`, **mais medição num Chromium real** (Playwright, janela 1280×720, ambiente local com banco descartável). Toda medida citada abaixo foi tirada assim, não estimada.

**Resumo dos achados deste roteiro**:

1. **Não existe lista de membros do servidor.** O painel "MEMBROS" só aparece na tela de voz, só enquanto se está conectada a uma call, e só lista quem está nela (`MEMBER_LIST_VOICE_ROSTER`, `MEMBER_LIST_SERVER_WIDE`).
2. **Dois botões do cabeçalho da tela de voz não têm nenhuma função** (`MEMBER_LIST_TOGGLE_BUTTON`, `VOICE_HEADER_PINS_BUTTON`). Clicar não altera o DOM. São exatamente o tipo de controle decorativo que a instrução "nada sem função" manda eliminar, e a caça anterior não os tinha achado.
3. **Cor do cargo e "exibir separadamente" são configurações sem efeito visível** em qualquer lugar do app fora do próprio editor (`ROLE_COLOR_ON_NAMES`, `ROLE_HOIST_MEMBER_GROUPING`).
4. **O mini-perfil vaza da janela** quando aberto perto da borda inferior: a posição usa uma altura estimada de 260 px e a real mede 330 px (`MINI_PROFILE_POSITIONING`). O cache do perfil nunca invalida e uma falha de rede fica gravada para sempre (`MINI_PROFILE_LOADING_ERROR_CACHE`).
5. **O painel do usuário diz "Desconectado" com o app aberto e funcionando**, porque mostra o estado da chamada de voz, não da pessoa (`USER_PANEL_IDENTITY`).
6. **Hipótese descartada pela medição:** o `presence-dot` de todo avatar parecia um indicador falso de "online", mas o `overflow: hidden` do avatar o corta e sobra só uma lasca de poucos pixels (`PRESENCE_DOT_CLIPPED`). É código morto, não um falso positivo visível.

**Atualização — correções publicadas (commit `73e40f8`, em produção)**: os dois botões sem função foram **removidos** (achado 2), o mini-perfil passou a usar a **altura real** e acompanha o redimensionamento (parte do achado 4), o cache de perfil **rebusca a cada abertura, não grava falha e tem "Tentar de novo"** (resto do achado 4) e o painel do usuário mostra **"Online"** fora de call (achado 5). **Continuam abertos**: não existe lista de membros do servidor (1), cor e agrupamento por cargo sem efeito (3), foco do popover, "Remover amigo" sem confirmação no popover, e o painel do usuário segue sem ser clicável.

---

## 13.1 — MEMBER_LIST_VOICE_ROSTER *(CORE, com escopo menor que o nome sugere)*

**ID**: `MEMBER_LIST_VOICE_ROSTER`
**NOME**: Painel lateral "MEMBROS" da tela da call
**STATUS ATUAL — SUBSTITUÍDO (commits `e1027d3` e `8460085`, em produção)**: a pedido do usuário, o painel **deixou de listar quem está na call** (isso já aparece na lista de canais de voz à esquerda) e **os sliders de volume saíram dele**. Ele agora lista os **membros do servidor**, ver `MEMBER_LIST_SERVER_WIDE`. O texto abaixo descreve o painel antigo.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > clicar num canal de voz (conecta) > tela da call (sem canal de texto selecionado) > coluna direita "MEMBROS"`
**POSIÇÃO NA INTERFACE**: `<aside className="member-list" aria-label="Membros do canal">`, coluna à direita da tela de voz, com borda esquerda. Fica dentro do ramo `!activeTextChannel` de `Workspace.tsx`.
**APARÊNCIA**: Cabeçalho "MEMBROS" com contador (`voice.participants.length`), um único grupo "Conectado — N" e uma linha por participante (`ParticipantRow`): avatar compacto, nome com " (você)" para a própria pessoa, selo `BOT` para bots, linha de atividade (jogo ou mídia) e, para os outros, um slider "Vol." de 0 a 100.
**ESTADO NORMAL**: Ordem estável, sem reagir a quem está falando (isso mora na lista de canais de voz à esquerda, segundo o comentário do próprio código).
**HOVER**: O nome de uma linha clicável fica sublinhado (`.participant-main:not(:disabled):hover .participant-copy strong`); tooltip nativo "Ver perfil de {nome}".
**ACTIVE/PRESSED**: Padrão de botão.
**SELECTED**: Não aplicável.
**DISABLED**: A linha de um bot fica `disabled` (cursor padrão, sem tooltip e sem abrir perfil).
**LOADING**: Nenhum. A lista vem do estado do LiveKit já sincronizado.
**TRIGGER**: Conectar a um canal de voz e estar olhando a tela da call.
**PRÉ-CONDIÇÕES**: `voice.connected === true` **e** nenhum canal de texto selecionado.
**RESULTADO IMEDIATO**: O painel monta com os participantes atuais do `Room`.
**RESULTADO VISUAL**: Painel à direita com a contagem. Medido: sem call, na tela de voz, `.member-list` não existe (contagem 0). Com um canal de texto aberto, também não existe.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma confirmada.
**POPOVER**: Clicar no nome abre o mini-perfil (ver `MEMBER_ROW_OPEN_PROFILE`).
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Roster de quem está na call, e só isso.
**EFEITO LOCAL**: Nenhum além da exibição.
**EFEITO REMOTO**: Não aplicável (só leitura).
**REALTIME**: Eventos nativos do LiveKit (`ParticipantConnected`/`Disconnected`) via `syncRoom`, não pelo WebSocket do NexPlay.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: O painel some junto com a call (F5 derruba a call, ver `VOICE_CHANNEL_JOIN`).
**RECONEXÃO**: Acompanha o estado do LiveKit.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Sair da call ou abrir um canal de texto esconde o painel.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Nenhum.
**ACESSIBILIDADE**: `aria-label="Membros do canal"` no `<aside>`; linhas são `<button>` reais; slider com `aria-label="Volume de {nome}"`.

**Achado — o texto "Ocioso" de um bot é fixo**: `ParticipantRow` renderiza `<span>Ocioso</span>` para qualquer bot, sem olhar o estado real. Um bot de música tocando continua aparecendo como "Ocioso" nesta linha.
**Achado — os dois contadores são o mesmo número**: o cabeçalho usa `voice.participants.length` e o grupo usa `typedParticipants.length`, que é o mesmo array com outro tipo. Nunca divergem, e nenhum dos dois conta quem não está na call.

---

## 13.2 — MEMBER_LIST_SERVER_WIDE *(MISSING)*

**ID**: `MEMBER_LIST_SERVER_WIDE`
**NOME**: Lista de membros do servidor ao lado de um canal de texto
**STATUS ATUAL — ENTREGUE NA TELA DE VOZ (commits `e1027d3` e `8460085`, em produção)**: o painel da direita da tela de voz lista os membros do servidor, **Online em cima e uma categoria Offline embaixo**, ordem alfabética, com avatar, bolinha de status (verde ou cinza), texto de status e "(você)". Quem abre ou fecha o app muda de categoria ao vivo, sem recarregar; entrada, saída e banimento de membros também atualizam a lista. Aparece **com ou sem call**. Clicar num membro abre o mini-perfil. **Continua faltando**: mostrar o mesmo painel ao ler um **canal de texto**, agrupar por cargo e cor de cargo. O texto abaixo descreve o estado anterior (inexistente).
**STATUS**: **`MISSING` por completo.** A ficha documenta o comportamento *esperado*.
**Esperado (Discord)**: coluna direita no canal de texto, com todos os membros do servidor agrupados por cargo "exibido separadamente" e, dentro de cada grupo, por presença; botão no cabeçalho para mostrar e esconder.
**Real**: ao abrir um canal de texto **não existe nenhum painel de membros** (medido: `.member-list` = 0). O único painel com esse nome é `MEMBER_LIST_VOICE_ROSTER`.
**Onde o dado existe**: a API já tem `getMembers(serverId)` (`GET /api/servers/:serverId/members`, tipo `MemberSummary`), usada só por `ServerSettings > Membros` (`MembersPane`), que é uma superfície de moderação dentro do modal de configurações do servidor. Não reauditei nesta passagem se um membro comum consegue abrir essa aba.
**Consequência**: não há como ver "quem está neste servidor" sem abrir as configurações. Depende de três lacunas já conhecidas para ficar completa: presença (`PRESENCE_STATUS`, `MISSING`), cor de cargo (`ROLE_COLOR_ON_NAMES`) e agrupamento por cargo (`ROLE_HOIST_MEMBER_GROUPING`).
**Dependência de infraestrutura**: nenhuma nova para uma versão sem presença. Bastaria consumir `getMembers`, que já existe.

---

## 13.3 — MEMBER_LIST_TOGGLE_BUTTON *(BROKEN — controle decorativo)*

**ID**: `MEMBER_LIST_TOGGLE_BUTTON`
**NOME**: Botão "Mostrar membros" no cabeçalho da tela de voz
**STATUS ATUAL**: **corrigido — botão removido** (commit `73e40f8`, em produção). O texto abaixo registra o que a auditoria encontrou antes.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > canal de voz (conectada ou não) > cabeçalho da sala > ícone de pessoa entre "Mensagens fixadas" e o indicador de conexão`
**POSIÇÃO NA INTERFACE**: `Workspace.tsx`, dentro de `.room-header-actions`, que só renderiza quando `!activeTextChannel`.
**APARÊNCIA**: `icon-button` com `UserIcon`, `title="Mostrar membros"`, `aria-label="Mostrar membros"`.
**ESTADO NORMAL**: Idêntico a um botão funcional.
**HOVER**: Tooltip "Mostrar membros" e o realce padrão de `icon-button`. Promete uma ação.
**ACTIVE/PRESSED**: Realce padrão.
**SELECTED**: Nunca. Não existe estado para refletir.
**DISABLED**: Nunca, mesmo sem nada a mostrar.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Estar na tela de voz.
**RESULTADO IMEDIATO**: **Nenhum.** O elemento não tem `onClick`. Medido: o tamanho do HTML de `.main-panel` e a contagem de `.member-list`, `.profile-popover` e `[role=dialog]` ficaram idênticos antes e depois do clique.
**RESULTADO VISUAL**: Nenhum.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER / MENU / MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Nada acontece.
**EFEITO LOCAL / REMOTO**: Nenhum.
**REALTIME / BACKEND / BANCO**: Nenhum.
**REFRESH / RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO / REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Nenhum.
**ACESSIBILIDADE**: Anuncia "Mostrar membros" a um leitor de tela e não faz nada, o pior caso para quem depende dele.

**Nota de auditoria — viola a instrução "nada sem função"**: o painel que o botão sugere já fica sempre visível na call e não existe fora dela, então o botão nem tem um estado útil para alternar. **Correção proposta, sem executar**: remover o botão, ou, junto com `MEMBER_LIST_SERVER_WIDE`, fazê-lo mostrar e esconder o painel de verdade.

---

## 13.4 — VOICE_HEADER_PINS_BUTTON *(BROKEN — controle decorativo)*

**ID**: `VOICE_HEADER_PINS_BUTTON`
**NOME**: Botão "Mensagens fixadas" no cabeçalho da tela de voz
**STATUS ATUAL**: **corrigido — botão removido** (commit `73e40f8`, em produção), junto com a regra de CSS `.header-glyph` que só ele usava. O painel de fixadas real do canal de texto não foi tocado (confirmado no navegador). O texto abaixo registra o que a auditoria encontrou antes.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > canal de voz > cabeçalho da sala > primeiro ícone da direita (glifo ⌖)`
**POSIÇÃO NA INTERFACE**: Mesmo `.room-header-actions` de `MEMBER_LIST_TOGGLE_BUTTON`.
**APARÊNCIA**: `icon-button` com `<span className="header-glyph">⌖</span>` (um caractere de mira, **não** o ícone de alfinete usado no canal de texto), `title="Mensagens fixadas"`.
**ESTADO NORMAL / HOVER / ACTIVE / SELECTED / DISABLED**: Como um botão funcional. Nunca fica selecionado nem desabilitado.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Estar na tela de voz.
**RESULTADO IMEDIATO**: **Nenhum**, sem `onClick`. Medido: DOM idêntico antes e depois do clique.
**RESULTADO VISUAL / SONORO / ANIMAÇÃO**: Nenhum.
**POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Nada acontece.
**EFEITO LOCAL / REMOTO / REALTIME / BACKEND / BANCO**: Nenhum.
**REFRESH / RECONEXÃO / ERRO / CANCELAMENTO / REVERSÃO**: Não aplicável.
**ATALHO / MENU DE CONTEXTO**: Nenhum.
**ACESSIBILIDADE**: Anuncia "Mensagens fixadas" sem fazer nada.

**Nota de auditoria**: a tela de voz não tem mensagens de texto para fixar. O painel de fixadas **real** existe no canal de texto (`TextChannels.tsx`, botão com o mesmo `title`, ver `PINNED_MESSAGES_PANEL_TOGGLE`, Roteiro 4). Este botão é um resto de layout de uma versão anterior. **Correção proposta, sem executar**: remover.

---

## 13.5 — ROLE_COLOR_ON_NAMES *(MISSING — a configuração não tem efeito visível)*

**ID**: `ROLE_COLOR_ON_NAMES`
**NOME**: Cor do cargo aplicada ao nome de quem o tem
**STATUS**: **`MISSING` o efeito; a configuração em si é `CORE`.** O editor de cargo (`ROLE_EDIT_DISPLAY`, Roteiro 9) salva a cor, e `ROLE_UPDATE` a propaga em tempo real.
**Esperado (Discord)**: o nome do membro aparece na cor do seu cargo mais alto que tenha cor, nas mensagens, na lista de membros e no mini-perfil.
**Real**: a busca por `role.color`, `roleColor`, `topRole` e `nameColor` em todo o `apps/web/src`, fora de `ServerSettings.tsx`, **não encontrou nenhum uso**. O tipo `TextMessage` também não carrega nenhum campo de cor de cargo (`senderId`, `senderName`, `senderType`, `senderAvatarUrl`). Resultado: mudar a cor de um cargo não altera a aparência de nenhuma pessoa em lugar nenhum.
**Consequência**: a opção existe, salva, sincroniza, e não tem consequência observável. É uma configuração decorativa de fato, mesmo com a UI e o backend corretos.
**Dependência**: precisaria da cor do cargo mais alto de cada autor. O servidor já sabe (`user_roles` + `roles`).

---

## 13.6 — ROLE_HOIST_MEMBER_GROUPING *(MISSING — a configuração não tem efeito visível)*

**STATUS ATUAL — ENTREGUE (commit `4c50cd5`, em produção)**: o switch "Exibir membros do cargo separadamente" agora **tem efeito**: o painel de membros da tela de voz cria uma categoria por cargo separado (do mais alto ao mais baixo; só quem está online; cada pessoa só no cargo separado mais alto), seguida de "Online" e "Offline". Liga, desliga, atribuição e exclusão de cargo atualizam o painel ao vivo. Continua faltando a cor do cargo nos nomes (`ROLE_COLOR_ON_NAMES`) e o painel em canal de texto. O texto abaixo é o estado anterior.

**ID**: `ROLE_HOIST_MEMBER_GROUPING`
**NOME**: "Exibir membros do cargo separadamente"
**STATUS**: **`MISSING` o efeito.** O campo `hoist` é salvo (`api.createRole`/`updateRole`) e há um switch no editor (`ServerSettings.tsx`, `static-switch`), mas o texto `hoist` não aparece em nenhum outro arquivo do cliente além de `api.ts`, que só o repassa ao servidor.
**Esperado**: membros de cargos "separados" aparecem agrupados sob o nome do cargo, acima dos demais.
**Real**: o único painel de membros é o roster da call, que tem **um grupo só** ("Conectado — N"). Não há onde o agrupamento se aplicar.
**Consequência**: mesmo caso de `ROLE_COLOR_ON_NAMES`. Depende de `MEMBER_LIST_SERVER_WIDE` existir.

---

## 13.7 — MEMBER_ROW_OPEN_PROFILE *(CORE)*

**ID**: `MEMBER_ROW_OPEN_PROFILE`
**NOME**: Abrir o mini-perfil clicando numa pessoa da call
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela da call > painel MEMBROS > linha do participante > clique no nome/avatar` **e** `Sidebar > lista de canais de voz > participante embaixo do canal > clique`
**POSIÇÃO NA INTERFACE**: `ParticipantRow` (roster) e as linhas de canal da sidebar (`Workspace.tsx`).
**APARÊNCIA / ESTADO NORMAL / HOVER**: Ver `MEMBER_LIST_VOICE_ROSTER`.
**ACTIVE/PRESSED / SELECTED**: Padrão / não aplicável.
**DISABLED**: Bots (`disabled={isBot}` no roster; `if (!isBot)` na sidebar).
**LOADING**: "Carregando perfil…" dentro do popover (ver `MINI_PROFILE_LOADING_ERROR_CACHE`).
**TRIGGER**: Clique esquerdo. Na sidebar, o mesmo clique.
**PRÉ-CONDIÇÕES**: Ser um usuário humano; para participantes remotos, o `identity` do LiveKit é o id do usuário.
**RESULTADO IMEDIATO**: `openUserProfile(participant.identity, event)` guarda `{ userId, rect: currentTarget.getBoundingClientRect() }` em `profileTarget`.
**RESULTADO VISUAL**: O popover abre ancorado no elemento clicado.
**RESULTADO SONORO / ANIMAÇÃO**: Nenhum som; o popover entra com `message-in` de 160 ms.
**POPOVER**: Sim. Ver `MINI_PROFILE_*`.
**MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Mini-perfil aberto.
**EFEITO LOCAL**: Apenas UI. **EFEITO REMOTO**: Nenhum (a outra pessoa não é avisada).
**REALTIME**: Nenhum. **BACKEND**: `GET /api/users/:id/profile` (ver `MINI_PROFILE_LOADING_ERROR_CACHE`). **BANCO**: Leitura de `users`.
**REFRESH / RECONEXÃO**: O popover fecha ao recarregar; o cache de perfis também é zerado.
**ERRO**: Ver `MINI_PROFILE_LOADING_ERROR_CACHE`.
**CANCELAMENTO / REVERSÃO**: Ver `MINI_PROFILE_CLOSE`.
**ATALHO**: Nenhum além de Tab e Enter no botão.
**MENU DE CONTEXTO**: Não existe botão direito na linha (`MESSAGE_CONTEXT_MENU` e afins seguem `MISSING`).
**ACESSIBILIDADE**: Botão real com tooltip; o foco **não** vai para o popover depois (ver `MINI_PROFILE_CLOSE`).

---

## 13.8 — MINI_PROFILE_OPEN *(CORE — todos os pontos de entrada)*

**ID**: `MINI_PROFILE_OPEN`
**NOME**: Abrir o mini-perfil de qualquer pessoa
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: qualquer um dos pontos de entrada abaixo.
**POSIÇÃO NA INTERFACE**: `openUserProfile` é definido uma vez em `Workspace.tsx` e repassado como `onOpenProfile`.
**Pontos de entrada confirmados no código**:
- avatar e nome do autor de uma mensagem de **canal** (`TextChannels.tsx`);
- avatar e nome do autor de uma mensagem de **DM** e o cabeçalho de identidade da DM (`DmChannelView.tsx`);
- linhas de **Amigos**: Todos, Pendentes (recebidos e enviados) e Adicionar amigo (`Friends.tsx`);
- avatar e nome em mensagens do **chat da call** (`Workspace.tsx`);
- participantes na sidebar de canais de voz e no roster (`MEMBER_ROW_OPEN_PROFILE`).
**Não são pontos de entrada**: o avatar e o nome do painel do próprio usuário (ver `USER_PANEL_IDENTITY`), a aba Membros das configurações do servidor, e menções no texto (não há sistema de menção).
**APARÊNCIA / ESTADO NORMAL / HOVER / ACTIVE / SELECTED / DISABLED**: Dependem do ponto de entrada; nomes de autor são `message-name-trigger`, avatares são `message-avatar-trigger`.
**LOADING**: Ver `MINI_PROFILE_LOADING_ERROR_CACHE`.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Nenhuma além de ter o id do usuário.
**RESULTADO IMEDIATO / VISUAL**: `setProfileTarget({ userId, rect })`, popover renderizado no topo de `Workspace` com `position: fixed; z-index: 60`.
**RESULTADO SONORO / ANIMAÇÃO**: Nenhum / `message-in` 160 ms.
**POPOVER**: Sim (`role="dialog"`, `aria-label="Perfil do usuário"`).
**MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Um único popover aberto por vez (um novo clique substitui o alvo).
**EFEITO LOCAL / REMOTO**: Só UI / nenhum.
**REALTIME**: Nenhum. **BACKEND**: `GET /api/users/:id/profile`, exceto o perfil próprio, que vem da sessão. **BANCO**: Leitura.
**REFRESH / RECONEXÃO**: Fecha.
**ERRO**: Ver `MINI_PROFILE_LOADING_ERROR_CACHE`.
**CANCELAMENTO / REVERSÃO**: `MINI_PROFILE_CLOSE`.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Nenhum.
**ACESSIBILIDADE**: Todos os gatilhos são `<button>`.

**Nota de auditoria — troca de alvo**: clicar em outra pessoa com o popover aberto dispara `mousedown` (fecha) e depois `click` (abre o novo), então a troca funciona sem piscar visivelmente. Não testei frame a frame.

---

## 13.9 — MINI_PROFILE_POSITIONING *(PARTIAL — defeito medido)*

**ID**: `MINI_PROFILE_POSITIONING`
**NOME**: Onde o mini-perfil aparece na tela
**STATUS ATUAL**: **corrigido** (commit `73e40f8`, em produção). A posição vem de `computePopoverPosition` (função pura, 7 testes) com a **altura medida** depois de montar, e reposiciona ao redimensionar a janela. Verificado no navegador: na faixa que vazava 30 px (janela de 492 px) o cartão agora termina em 480 px (margem de 12 px), e numa janela de 380 px o topo continua visível. O texto abaixo registra o defeito original.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: automático ao abrir qualquer mini-perfil.
**POSIÇÃO NA INTERFACE**: `clampPosition(rect)` em `ProfilePopover.tsx`. Largura fixa de 300 px, margem de 12 px.
**Regra do código**: `left = rect.left`, limitado a `viewport − 300 − 12`. `top = rect.bottom + 8`; se `top + 260 > altura da janela`, tenta abrir **acima** (`rect.top − 260 − 8`, mínimo 12 px).
**Defeito medido**: a altura de **260 px é uma constante estimada**, e o popover real mede **330 px** mesmo no perfil mais curto (o próprio, sem botões de ação e sem bio). Com o nome da mensagem em `bottom = 184` e a janela com 492 px de altura, o código concluiu que cabe (`192 + 260 = 452 < 492`), mas o popover terminou em `bottom = 522`: **30 px cortados abaixo da janela**. Perfis de outras pessoas têm botões de ação e, muitas vezes, bio, então passam disso. Não medi essas alturas.
**Também**: a posição é calculada uma vez a partir de um retângulo guardado no clique. Se a janela é redimensionada ou a lista rola com o popover aberto, ele **não acompanha** o elemento de origem.
**APARÊNCIA / ESTADO NORMAL**: 300 px de largura, cantos `--radius-lg`, sombra, `overflow: hidden`.
**HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Não aplicável a posicionamento.
**TRIGGER**: Abertura do popover.
**PRÉ-CONDIÇÕES**: `target` não nulo.
**RESULTADO IMEDIATO**: `style={{ top, left }}`.
**RESULTADO VISUAL**: Correto em janelas altas; cortado por baixo na faixa entre a estimativa e a altura real.
**RESULTADO SONORO / ANIMAÇÃO / POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Popover às vezes parcialmente fora da janela, sem rolagem para alcançá-lo (`position: fixed`).
**EFEITO LOCAL / REMOTO / REALTIME / BACKEND / BANCO**: Não aplicável.
**REFRESH / RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO / REVERSÃO**: Fechar e reabrir não corrige.
**ATALHO / MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Botões cortados ficam inalcançáveis com o mouse.
**Correção proposta, sem executar**: medir a altura real depois de montar (`getBoundingClientRect` no `ref`) e reposicionar, em vez de estimar.

---

## 13.10 — MINI_PROFILE_CONTENT *(PARTIAL)*

**ID**: `MINI_PROFILE_CONTENT`
**NOME**: O que o mini-perfil mostra
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: dentro do popover aberto.
**POSIÇÃO NA INTERFACE**: `.profile-preview` reaproveitado da tela Meu perfil.
**Conteúdo real**, na ordem: banner (imagem, ou fundo com a cor do perfil `avatar-color-N`), avatar, nome de exibição em destaque, pronomes (`<em>`), texto de status, bio, atividade e, se não for o próprio perfil, os botões de ação.
**Atividade**: só aparece se a pessoa está **no mesmo canal de voz que você agora**. O comentário no código explica: o LiveKit só entrega metadados de quem divide sala. Fora disso o popover simplesmente omite a seção.
**Ausente frente ao Discord**: cargos, "membro desde", servidores e amigos em comum, selos, nota pessoal e indicador de presença.
**ESTADO NORMAL / HOVER / ACTIVE / SELECTED / DISABLED**: Conteúdo estático; só os botões reagem.
**LOADING / ERRO**: `MINI_PROFILE_LOADING_ERROR_CACHE`.
**TRIGGER / PRÉ-CONDIÇÕES**: Abrir o popover.
**RESULTADO IMEDIATO / VISUAL**: Cartão de 300 px com os campos acima.
**RESULTADO SONORO / ANIMAÇÃO**: Nenhum / entrada de 160 ms.
**POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Perfil público resumido.
**EFEITO LOCAL / REMOTO / REALTIME**: Nenhum.
**BACKEND**: `GET /api/users/:id/profile` devolve `toUserSession(user)`. Qualquer usuário autenticado pode consultar qualquer id existente (404 para inexistente); não há checagem de servidor em comum.
**BANCO**: Leitura de `users`.
**REFRESH / RECONEXÃO**: Ver cache.
**CANCELAMENTO / REVERSÃO / ATALHO / MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="dialog"`, `aria-label="Perfil do usuário"`; imagem do banner com `alt=""`.

**Nota de auditoria**: como cor de cargo e cargos não aparecem em nenhum lugar (`ROLE_COLOR_ON_NAMES`), o mini-perfil também não diz que papel a pessoa tem no servidor.

---

## 13.11 — MINI_PROFILE_LOADING_ERROR_CACHE *(PARTIAL — dois defeitos de cache)*

**ID**: `MINI_PROFILE_LOADING_ERROR_CACHE`
**NOME**: Carregamento, erro e cache do perfil de outra pessoa
**STATUS ATUAL**: **os dois defeitos foram corrigidos** (commit `73e40f8`, em produção). Cada abertura rebusca o perfil e mostra na hora a cópia guardada, então avatar, status e bio novos aparecem sem F5. Falha de rede não é mais gravada, o estado de erro tem `role="alert"` e o botão "Tentar de novo". Verificado no navegador contra o código antigo: lá reabrir continuava mostrando o perfil velho e não havia estado de erro com nova tentativa. O texto abaixo registra o defeito original.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: abrir o mini-perfil de alguém que não seja você.
**POSIÇÃO NA INTERFACE**: `useUserProfile` e `remoteProfileCache` (um `Map` de módulo) em `ProfilePopover.tsx`.
**Estados**: `undefined` mostra "Carregando perfil…"; `null` mostra "Não foi possível carregar esse perfil."; objeto mostra o cartão. O perfil **próprio** nunca passa pelo cache, vem da sessão, e por isso as edições aparecem na hora.
**Defeito 1 — o cache nunca invalida**: depois da primeira carga bem-sucedida, o perfil daquela pessoa é reutilizado até recarregar a página. Se ela trocar avatar, status ou bio, o popover mostra a versão antiga. O comentário do próprio código admite que o cache "nunca invalida". Não existe evento de tempo real de atualização de perfil no `RealtimeEvent` (busca por `USER_UPDATE`, `PROFILE_UPDATE` e `USER_PROFILE` em `packages/shared` não achou nada).
**Defeito 2 — uma falha fica gravada para sempre**: se a primeira carga der erro de rede, o código grava `null` no cache. Como o efeito começa com `remoteProfileCache.has(userId)`, **nunca mais tenta** para aquela pessoa até recarregar, e o popover não tem botão de tentar de novo.
**Ressalva**: se o popover fecha antes da resposta chegar (`active === false`), nada é gravado e a próxima abertura tenta de novo.
**APARÊNCIA / ESTADO NORMAL**: Texto centralizado `.profile-popover-loading`.
**HOVER / ACTIVE / SELECTED / DISABLED**: Não aplicável.
**LOADING**: Sim, o texto acima.
**TRIGGER**: Abrir o popover de uma pessoa ainda não vista.
**PRÉ-CONDIÇÕES**: Sessão válida.
**RESULTADO IMEDIATO**: `api.getUserProfile(userId)` e `forceRender`.
**RESULTADO VISUAL**: Carregando, depois cartão ou mensagem de erro.
**RESULTADO SONORO / ANIMAÇÃO / POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Perfil (possivelmente desatualizado) ou erro permanente.
**EFEITO LOCAL**: Preenche o cache. **EFEITO REMOTO**: Nenhum.
**REALTIME**: Nenhum. **BACKEND**: `GET /api/users/:id/profile` (`requireSession`; 404 se o usuário não existe). **BANCO**: Leitura.
**REFRESH**: Zera o cache (módulo recarrega). **RECONEXÃO**: Não zera; o cache sobrevive a quedas de rede.
**ERRO**: Mensagem fixa, sem detalhe da causa.
**CANCELAMENTO**: Fechar o popover durante o carregamento descarta o resultado.
**REVERSÃO**: Só recarregar a página.
**ATALHO / MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Texto de carregamento sem `aria-live`.
**Correção proposta, sem executar**: não gravar `null` no cache, e invalidar quando o app receber um evento de perfil atualizado (o servidor precisaria emiti-lo em `PATCH /api/profile`).

---

## 13.12 — MINI_PROFILE_FRIEND_BLOCK_ACTIONS *(CORE)*

**ID**: `MINI_PROFILE_FRIEND_BLOCK_ACTIONS`
**NOME**: Ações de amizade e bloqueio dentro do mini-perfil
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mini-perfil de outra pessoa > área de botões abaixo da bio`
**POSIÇÃO NA INTERFACE**: `.profile-popover-actions`, com borda superior e `flex-wrap`.
**APARÊNCIA**: `secondary-pill` de 30 px; "Bloquear" usa também `danger-pill`.
**Botões por relação** (`relationshipStatus`, calculada ao vivo a partir das listas já mantidas em tempo real): sem relação, "Adicionar amigo"; pedido enviado, "Cancelar pedido"; pedido recebido, "Aceitar pedido" e "Recusar"; amigos, "Enviar mensagem" e "Remover amigo". **Sempre**, "Bloquear" ou "Desbloquear".
**ESTADO NORMAL / HOVER / ACTIVE / SELECTED**: Padrão de pílula; nenhum estado selecionado.
**DISABLED**: Nunca. Não há estado de "enviando": nada no código impede um segundo clique enquanto a primeira chamada está em curso.
**LOADING**: Nenhum indicador.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Não ser o próprio perfil (as ações somem no próprio).
**RESULTADO IMEDIATO**: `runFriendAction(api.sendFriendRequest | removeFriendship | blockUser | unblockUser)`. "Enviar mensagem" chama `openDmWith`.
**RESULTADO VISUAL**: Sucesso não mostra aviso. Os botões **trocam sozinhos** quando a relação muda, via tempo real (`FRIENDSHIP_UPDATE`, `BLOCK_UPDATE`), e o popover continua aberto. "Enviar mensagem" leva à tela de Amigos com a DM aberta e fecha o popover.
**RESULTADO SONORO / ANIMAÇÃO**: Nenhum.
**POPOVER / MENU / MODAL**: Nenhum. **Sem confirmação** em nenhuma das ações.
**SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Relação alterada.
**EFEITO LOCAL**: Botões mudam. **EFEITO REMOTO**: A outra pessoa recebe `FRIENDSHIP_UPDATE` (as regras de escopo estão em `REALTIME_EVENT_SCOPING`).
**REALTIME**: `FRIENDSHIP_UPDATE`, `BLOCK_UPDATE`. **BACKEND**: As mesmas rotas de `FRIEND_REQUEST_SEND` e `DM_UNBLOCK`. **BANCO**: `friendships` e `blocks`.
**REFRESH / RECONEXÃO**: O estado de amigos refaz o fetch ao reconectar (`onRealtimeConnect` em `Friends.tsx`).
**ERRO**: `friendActionError` aparece em `.friend-action-toast` (`role="alert"`, topo central, vermelho, `z-index: 200`) com "×" para fechar. **Nenhum fechamento automático** no código.
**CANCELAMENTO**: Não aplicável. **REVERSÃO**: O botão oposto, no próprio popover.
**ATALHO / MENU DE CONTEXTO**: Nenhum.
**ACESSIBILIDADE**: Botões reais; o toast é anunciado por `role="alert"`.

**Achado — inconsistência de confirmação**: "Remover amigo" aqui age **sem confirmar**, enquanto o mesmo ato na aba Todos de Amigos usa `window.confirm('Remover esse amigo?')` (`FRIEND_REMOVE`, Roteiro 11). O mesmo vale para "Recusar" e "Cancelar pedido", que já eram imediatos lá.

---

## 13.13 — MINI_PROFILE_CLOSE *(CORE, com lacuna de teclado)*

**ID**: `MINI_PROFILE_CLOSE`
**NOME**: Fechar o mini-perfil
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: botão X do popover, clique fora, ou Esc.
**POSIÇÃO NA INTERFACE**: `.profile-popover-close`, canto do cartão.
**APARÊNCIA**: Ícone `CloseIcon` de 13 px, com realce no hover.
**ESTADO NORMAL / ACTIVE / SELECTED / DISABLED / LOADING**: Padrão / não aplicável.
**HOVER**: Fundo escuro translúcido.
**TRIGGER**: Clique no X; `mousedown` fora do popover; tecla `Escape`.
**PRÉ-CONDIÇÕES**: Popover aberto. Os dois listeners globais (`window`) só existem enquanto `target` não é nulo.
**RESULTADO IMEDIATO**: `onClose()` limpa `profileTarget`.
**RESULTADO VISUAL**: Popover some. **Medido**: Esc fecha (contagem de `.profile-popover` cai a 0).
**RESULTADO SONORO / ANIMAÇÃO**: Nenhum / sem animação de saída.
**POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Sem popover.
**EFEITO LOCAL / REMOTO / REALTIME / BACKEND / BANCO**: Nenhum.
**REFRESH / RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: É o próprio cancelar. **REVERSÃO**: Reabrir.
**ATALHO**: `Esc`. O handler é global e **não chama `stopPropagation`**, então outros tratadores de Esc (configurações, tela cheia) reagem ao mesmo toque. A ordem de prioridade entre eles é o assunto do roteiro 39 do pedido, ainda não auditado.
**MENU DE CONTEXTO**: Nenhum.
**ACESSIBILIDADE — lacuna medida**: o popover é `role="dialog"` sem `aria-modal`, e **o foco não vai para dentro dele ao abrir** (medido: `document.activeElement` continua no botão de origem, `message-name-trigger`) nem **volta ao gatilho ao fechar**. Como o popover é renderizado no início do `Workspace`, antes da rail e da sidebar, quem navega por Tab a partir do gatilho segue a ordem do DOM e **não chega aos botões do popover**. Isso é inferido pela ordem do DOM, não testado com leitor de tela.

---

## 13.14 — MINI_PROFILE_OWN *(PARTIAL)*

**ID**: `MINI_PROFILE_OWN`
**NOME**: Abrir o próprio mini-perfil
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: clicar no próprio nome ou avatar numa mensagem, ou na própria linha "(você)" da call.
**Comportamento real**: abre o mesmo cartão, com dados da **sessão** (sem chamada de rede, por isso edições recentes já aparecem) e **sem nenhum botão de ação**. Medido: `.profile-popover-actions` = 0.
**Ausente**: não há "Editar perfil" que leve às configurações; para editar é preciso abrir Configurações > Meu perfil por outro caminho.
**Campos restantes (36)**: iguais a `MINI_PROFILE_OPEN`, `MINI_PROFILE_POSITIONING` e `MINI_PROFILE_CLOSE`. Sem loading, sem erro possível e sem backend.

---

## 13.15 — USER_PANEL_IDENTITY *(PARTIAL — texto enganoso, sem interação)*

**ID**: `USER_PANEL_IDENTITY`
**NOME**: Avatar, nome e linha de estado do painel do próprio usuário
**STATUS ATUAL**: **texto corrigido** (commit `73e40f8`, em produção): fora de uma call a linha mostra **"Online"**, e o estado da voz (Conectado, Conectando, Reconectando) só aparece enquanto há call. O cabeçalho da sala segue mostrando o estado puro da voz, onde "Desconectado" é correto. **Continua aberto**: o avatar e o nome não são clicáveis (sem menu de status nem atalho ao próprio perfil).
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Rodapé da sidebar esquerda (.sidebar-user) > avatar e duas linhas de texto`
**POSIÇÃO NA INTERFACE**: `<footer className="sidebar-user">`, altura de 58 px (68 px na regra final do CSS, que vale), grade `34px | 1fr | auto`.
**APARÊNCIA**: Avatar de 34 px, nome de exibição em negrito (ellipsis se longo), segunda linha pequena e apagada com `connectionLabel`.
**ESTADO NORMAL**: **Medido, logada e sem nenhuma call: "auditor13 / Desconectado".**
**Achado — a linha mistura duas coisas**: `connectionLabel` traduz `voice.connectionState` (`Conectado`, `Conectando`, `Reconectando`, `Desconectado`). É o estado da **chamada de voz**, não da pessoa. Quem acabou de abrir o app e está conversando num canal de texto lê "Desconectado" embaixo do próprio nome. No Discord essa linha é o **status de presença** (Online, Ausente, etc.).
**HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Nenhum. **Medido**: o avatar é um `<span>` fora de qualquer `<button>` ou `<a>`, e o nome também não é interativo.
**TRIGGER**: Não existe.
**PRÉ-CONDIÇÕES**: Não aplicável.
**RESULTADO IMEDIATO / VISUAL / SONORO / ANIMAÇÃO**: Clicar não faz nada.
**POPOVER / MENU / MODAL**: **Nenhum.** Falta o menu de status e o atalho para o próprio perfil que o Discord abre ao clicar aqui (`MISSING`).
**SEGUNDA ETAPA / RESULTADO FINAL**: Não aplicável.
**EFEITO LOCAL / REMOTO / REALTIME**: Nenhum.
**BACKEND / BANCO**: Nenhum.
**REFRESH / RECONEXÃO**: A linha acompanha `ConnectionState` do LiveKit.
**ERRO / CANCELAMENTO / REVERSÃO**: Não aplicável.
**ATALHO / MENU DE CONTEXTO**: Nenhum. Copiar o próprio nome de usuário não é possível por aqui.
**ACESSIBILIDADE**: Texto legível por leitor de tela; sem foco e sem ação.
**Correção proposta, sem executar**: mostrar "Online" fora de call e o estado da call só quando estiver em uma; tornar o bloco clicável para abrir o próprio mini-perfil.

---

## 13.16 — USER_PANEL_CONTROLS *(referência — já auditado em outras fichas)*

**ID**: `USER_PANEL_CONTROLS`
**NOME**: Microfone, ensurdecer, seletores de dispositivo e Configurações do painel do usuário
**CAMINHO EXATO**: `.sidebar-actions`, à direita do nome: microfone, chevron de microfone, fone, chevron de saída, engrenagem.
**STATUS**: `CORE` para o conjunto; o comportamento de cada controle já tem ficha própria: `VOICE_SELF_MUTE` (6.3), `VOICE_SELF_DEAFEN` (6.4) e `VOICE_DEVICE_SELECT` (7.6).
**Achados novos desta passagem**:
- **Fora de uma call, o microfone e o fone ficam desabilitados** (`disabled={!voice.connected || ...}`; medido: microfone `disabled = true`). Não existe "pré-mutar" antes de entrar, algo que o Discord permite. O ícone do microfone já aparece riscado mesmo sem call (`micEnabled` falso).
- **Tooltips** dizem "Desligar microfone/Ligar microfone" e "Desativar áudio/Ativar áudio". Os textos do pedido original são "Silenciar/Ativar microfone", só uma diferença de redação.
- **`DeviceMenu` fecha só com clique fora** (`mousedown` na `window`). Não há tratamento de Esc, nem navegação por setas na lista, no código lido.
- **Engrenagem**: abre `SettingsModal` (`setSettingsOpen(true)`), fica com a classe `selected` enquanto aberto e devolve o foco ao botão ao fechar (`returnFocusRef`). `aria-label="Configurações"`.
**Campos (36) restantes**: cada botão é `<button type="button">` com `title` e `aria-label`; nenhum atalho de teclado (`MISSING`, ver 6.3 e 6.4); efeito remoto só via `TrackMuted`/`Unmuted` do LiveKit.

---

## 13.17 — PRESENCE_DOT_CLIPPED *(código morto — hipótese de "presença falsa" descartada)*

**ID**: `PRESENCE_DOT_CLIPPED`
**NOME**: Ponto de presença renderizado dentro de todo avatar
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: componente `Avatar` (`Workspace.tsx`), presente em todo lugar que mostra uma pessoa.
**STATUS**: **`PARTIAL`: elemento existe e está quase invisível.** Registro do que aconteceu, porque a primeira leitura do código estava errada.
**O que o código diz**: `Avatar` sempre renderiza `<span className="presence-dot" />`. O CSS o pinta com `--accent-hover` (medido: `rgb(100, 212, 187)`, `display: block`, 8×8 px) na posição `right: -3px; bottom: -3px`. Só é escondido dentro de mensagens (`.message .presence-dot { display: none }`). Lendo só isso, parecia um **indicador de "online" falso** em listas de amigos, DMs, popover e no painel do usuário, já que o app **não tem presença** (`PRESENCE_STATUS`, `MISSING`).
**O que a medição mostrou**: o `.avatar` tem `overflow: hidden` e `border-radius: 50%`. O ponto de 8 px, deslocado −3 px para fora, é **cortado pelo círculo**. Medido: ele ultrapassa a borda do avatar em 1 px à direita e 1 px embaixo, e na captura ampliada 3× do avatar do painel do usuário só aparece **uma lasca de poucos pixels** na borda direita, nada que se leia como um ponto de status.
**Conclusão**: não há falsa indicação de "online" visível. É marcação e CSS mortos, e provavelmente sobraram de uma versão que tinha presença. Fica como pendência de limpeza e como ponto de partida quando a presença existir: o elemento está lá, mas precisaria sair do `overflow: hidden` para funcionar.
**Campos (36)**: sem interação, sem estado e sem efeito. HOVER, ACTIVE, SELECTED, DISABLED, LOADING, TRIGGER, RESULTADO SONORO, ANIMAÇÃO, POPOVER, MENU, MODAL, SEGUNDA ETAPA, EFEITO REMOTO, REALTIME, BACKEND, BANCO, REFRESH, RECONEXÃO, ERRO, CANCELAMENTO, REVERSÃO, ATALHO e MENU DE CONTEXTO: **não aplicáveis**. ACESSIBILIDADE: o `<span>` vazio não tem texto nem papel, então não polui a leitura de tela.

---

**Achados mais importantes do Roteiro 13** (por ordem de impacto):

1. **Dois botões do cabeçalho de voz sem nenhuma função** (`MEMBER_LIST_TOGGLE_BUTTON`, `VOICE_HEADER_PINS_BUTTON`), confirmados por clique e comparação de DOM. Correção trivial: remover.
2. **Não existe lista de membros do servidor** (`MEMBER_LIST_SERVER_WIDE`). Os dados já estão na API.
3. **Cor do cargo e agrupamento por cargo são configurações sem consequência visível** (`ROLE_COLOR_ON_NAMES`, `ROLE_HOIST_MEMBER_GROUPING`).
4. **Mini-perfil cortado pela borda inferior**, medido em 30 px, por uma altura estimada errada (`MINI_PROFILE_POSITIONING`).
5. **Cache de perfil que nunca invalida e grava falhas para sempre** (`MINI_PROFILE_LOADING_ERROR_CACHE`).
6. **Painel do usuário mostra "Desconectado" com o app aberto** e o avatar e o nome não são clicáveis (`USER_PANEL_IDENTITY`).
7. **Acessibilidade do popover**: sem foco de entrada, sem devolução de foco e provavelmente inalcançável por Tab (`MINI_PROFILE_CLOSE`).
8. **Inconsistência**: "Remover amigo" sem confirmação no popover, com confirmação em Amigos (`MINI_PROFILE_FRIEND_BLOCK_ACTIONS`).
---

# ROTEIRO 14 — NOTIFICAÇÕES, NÃO LIDAS, BADGES E AVISOS DO DESKTOP

Cobre os roteiros 32 (Receber call), 34 (Inbox), 35 (Notificações), 36 (Badges e unread), 52 (Desktop notifications) e 53 (Taskbar flash/badge) do pedido original. Método: busca por todo o código de cliente, API e desktop (`Notification`, `flashFrame`, `setBadgeCount`, `setOverlayIcon`, `unread`, `lastRead`, `mention`, `document.title`), leitura de `Workspace.tsx`, `categories.ts`, `sounds.ts`, `useVoiceRoom.ts`, `apps/desktop/src/main.ts`, e **medição num Chromium real** do único trecho interativo (o menu de notificação da categoria).

**Resumo dos achados deste roteiro**:

1. **Quase tudo aqui é `MISSING`, e por três causas só**: não existe rastreio de leitura (nenhum `lastRead` em lugar nenhum), não existe sistema de menções (nenhum `@usuário` é reconhecido) e o desktop não tem nenhuma ponte de aviso (nenhum `Notification`, `flashFrame`, `setOverlayIcon` nem `setBadgeCount`).
2. **Há uma configuração salva e sincronizada que não tem nenhum efeito**: o modo de notificação por categoria (`all`, `mentions`, `none`). É gravada no banco por usuário, mas **nenhum trecho do cliente a lê** além do próprio menu, e não existe notificação para filtrar. "Silenciar categoria" silencia o nada. É o mesmo padrão da cor de cargo (`ROLE_COLOR_ON_NAMES`, Roteiro 13).
3. **"Config. de notificação" muda o modo em silêncio.** Medido: cada clique envia `PATCH` com o próximo modo (`mentions`, `none`, `all`) e o menu fecha sem mostrar nada; só o modo `none` aparece, como um "✓" em outro item. Não há como saber que se está em `mentions`.
4. **O Electron nega a permissão `notifications` de propósito.** As listas de permissões permitidas (`setPermissionCheckHandler` e `setPermissionRequestHandler`) só aceitam mídia, tela cheia, captura de tela e seleção de alto-falante. Mesmo que o cliente passasse a chamar `new Notification`, o desktop recusaria.
5. **O título da janela é fixo em "NexPlay"** e o único badge do app é o de pedidos de amizade pendentes (`FRIEND_REQUEST_BADGE`, já auditado).
6. **A única notificação sonora de mensagem é a do chat da call.** Mensagem de canal de texto e de DM chega em silêncio.

**Atualização (commit `6aea3a4`, em produção)**: os três itens do menu de contexto da categoria que não tinham efeito ("Marcar como lida", "Silenciar categoria" e "Config. de notificação") foram **escondidos**. O modo de notificação continua gravado em `category_prefs` e a API não mudou, então os itens voltam junto com o rastreio de leitura e as notificações. Verificado no navegador: o menu ficou com Recolher categoria, Recolher todas, Editar, Excluir e Copiar ID, e "Recolher categoria" continua gravando a preferência.

---

## 14.1 — CATEGORY_NOTIFICATION_MODE *(PARTIAL — salva, sincroniza, sem efeito e sem feedback)*

**ID**: `CATEGORY_NOTIFICATION_MODE`
**NOME**: "Config. de notificação" no menu de contexto de uma categoria
**STATUS ATUAL**: **item escondido do menu** (commit `6aea3a4`, em produção). A ficha abaixo descreve o comportamento que a auditoria mediu antes disso; o modo segue gravado no banco.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > botão direito no cabeçalho de uma categoria > "Config. de notificação"`
**POSIÇÃO NA INTERFACE**: `openCategoryMenu` em `Workspace.tsx`, terceira seção do `ContextMenu` (junto de "Silenciar categoria").
**APARÊNCIA**: Item de texto simples. **Não mostra o modo atual**, não tem "✓", não tem seta de submenu. O comentário do código registra a simplificação como deliberada ("sem submenu flutuante").
**ESTADO NORMAL**: Igual nos três modos. Medido: depois de um clique (modo `mentions`) nenhum item do menu tem marca.
**HOVER**: Realce padrão de `context-menu-item`.
**ACTIVE/PRESSED**: Padrão de botão.
**SELECTED**: Nunca aparece como selecionado.
**DISABLED**: Nunca.
**LOADING**: Nenhum.
**TRIGGER**: Clique no item.
**PRÉ-CONDIÇÕES**: Ter um servidor ativo (`activeServerId`). Qualquer membro pode, é preferência pessoal.
**RESULTADO IMEDIATO**: `cycleCategoryNotificationMode` percorre `all → mentions → none → all`. Atualiza o estado local na hora (otimista) e faz `PATCH` para `/api/servers/:serverId/categories/:categoryId/prefs` com `{ notificationMode }`. **Medido em três cliques seguidos**: os corpos enviados foram `mentions`, `none` e `all`, nessa ordem.
**RESULTADO VISUAL**: **Nenhum.** O menu fecha (`onClose` depois de `onSelect`) e a categoria não muda de aparência. O único sinal indireto é o "✓" de "Silenciar categoria", que aparece apenas no modo `none` (medido no segundo clique).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER / MODAL / SEGUNDA ETAPA**: Não aplicável.
**MENU**: O próprio menu de contexto, que fecha ao escolher.
**RESULTADO FINAL**: O modo fica gravado, mas **nada no app o consulta**. A busca por `notificationMode` no cliente só encontra o `Workspace.tsx` (as duas funções do menu e o "✓"), o `api.ts` (o `PATCH`) e o tipo compartilhado. Como não existe notificação, badge, som por canal nem "não lida" para filtrar, escolher `none` não silencia nada, e `mentions` não tem significado porque não há sistema de menções.
**EFEITO LOCAL**: Só a preferência. **EFEITO REMOTO**: Nenhum sobre os outros. Não confirmei se outra aba do mesmo usuário recebe evento de mudança.
**REALTIME**: Nenhum evento dedicado encontrado. **BACKEND**: `PATCH .../categories/:categoryId/prefs`, validado por `notificationMode: z.enum(['all','mentions','none'])`. **BANCO**: Tabela `category_prefs (user_id, category_id, collapsed, notification_mode)`, **por usuário**, gravada com `INSERT ... ON CONFLICT`.
**REFRESH**: O valor volta do servidor (`getCategoryPrefs`) e sobrevive a F5 e a trocar de dispositivo, diferente das preferências de aparência e voz, que são `localStorage`.
**RECONEXÃO**: Sem tratamento específico.
**ERRO**: A chamada é `void api.setCategoryPrefs(...)`, **sem `catch`**. Se falhar, o estado local já mudou e o servidor não, e nada avisa. Diverge até recarregar.
**CANCELAMENTO**: Fechar o menu antes de clicar cancela. **REVERSÃO**: Continuar clicando (o ciclo tem três passos) ou usar "Silenciar categoria".
**ATALHO**: Nenhum. **MENU DE CONTEXTO**: É o próprio.
**ACESSIBILIDADE**: `role="menuitem"`. Nada anuncia o modo escolhido.

**Nota de auditoria — configuração sem consequência**: o item está na lista do que a regra "nada sem função" manda tratar. **Correção proposta, sem executar**: enquanto não houver notificação, esconder os dois itens (este e "Silenciar categoria"); quando houver, mostrar o modo atual no rótulo (por exemplo "Notificações: só menções").

---

## 14.2 — CATEGORY_MUTE_TOGGLE *(PARTIAL — marca "✓", mas não há o que silenciar)*

**ID**: `CATEGORY_MUTE_TOGGLE`
**NOME**: "Silenciar categoria"
**STATUS ATUAL**: **item escondido do menu** (commit `6aea3a4`, em produção). A ficha abaixo descreve o comportamento medido antes disso.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > botão direito no cabeçalho de uma categoria > "Silenciar categoria"`
**POSIÇÃO NA INTERFACE**: Mesma seção de `CATEGORY_NOTIFICATION_MODE`, um item acima.
**APARÊNCIA**: Texto, com um "✓" à direita (`.context-menu-check`) quando o modo é `none`.
**ESTADO NORMAL**: Sem marca nos modos `all` e `mentions`.
**HOVER / ACTIVE / SELECTED**: Padrão. O "✓" faz o papel de selecionado.
**DISABLED**: Nunca.
**LOADING**: Nenhum.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Servidor ativo.
**RESULTADO IMEDIATO**: `toggleCategoryMuted` alterna `none ↔ all` e faz o mesmo `PATCH` de `CATEGORY_NOTIFICATION_MODE`. **Detalhe**: se o modo era `mentions`, silenciar e depois "dessilenciar" volta para `all`, não para `mentions`. A escolha anterior se perde.
**RESULTADO VISUAL**: Ao silenciar, o "✓" aparece na próxima abertura do menu (medido). **A categoria em si não muda**: nenhum ícone de sino cortado, nenhum texto apagado no cabeçalho ou nos canais.
**RESULTADO SONORO / ANIMAÇÃO / POPOVER / MODAL / SEGUNDA ETAPA**: Nenhum.
**MENU**: Fecha ao escolher.
**RESULTADO FINAL**: Preferência `none` gravada. Nada é silenciado.
**EFEITO LOCAL / REMOTO**: Só a preferência / nenhum.
**REALTIME**: Nenhum. **BACKEND / BANCO / REFRESH / RECONEXÃO / ERRO**: Idênticos a `CATEGORY_NOTIFICATION_MODE`, inclusive o `PATCH` sem `catch`.
**CANCELAMENTO**: Fechar o menu. **REVERSÃO**: Clicar de novo.
**ATALHO / MENU DE CONTEXTO**: Nenhum / é o próprio.
**ACESSIBILIDADE**: `role="menuitem"`; o "✓" é `aria-hidden`, então um leitor de tela **não anuncia** se a categoria está silenciada.

**Nota**: não existe "Silenciar servidor", "Silenciar canal" nem "Silenciar DM" (ver `NOTIFICATION_SETTINGS_SERVER_AND_CHANNEL`). A categoria é o único nível.

---

## 14.3 — NOTIFICATION_SETTINGS_SERVER_AND_CHANNEL *(MISSING)*

**ID**: `NOTIFICATION_SETTINGS_SERVER_AND_CHANNEL`
**NOME**: Configuração de notificação por servidor, por canal e por conversa
**STATUS**: **`MISSING` por completo.** A ficha documenta o esperado.
**Esperado (Discord)**: no menu do servidor e no botão direito de um canal ou DM: silenciar por tempo (15 min, 1 h, 8 h, 24 h, até reativar), nível (todas, só menções, nenhuma) e supressão de `@everyone`.
**Real**: a busca por "Silenciar" em `apps/web/src` só encontra o item de categoria. O botão direito num canal abre só "mover canal" (Roteiro 3) e o botão direito num servidor da rail não existe (`SERVER_CONTEXT_MENU`, `MISSING`).
**Dependência**: só faz sentido depois de existir alguma notificação (`UNREAD_TRACKING_AND_BADGES`, `DESKTOP_NOTIFICATION`).

---

## 14.4 — NOTIFICATION_SETTINGS_SECTION *(MISSING)*

**ID**: `NOTIFICATION_SETTINGS_SECTION`
**NOME**: Seção "Notificações" em Configurações
**STATUS**: **`MISSING` por completo.**
**Esperado**: ligar e desligar notificações do desktop, sons de mensagem, sons de call, flash da barra de tarefas e o nível padrão do servidor.
**Real**: as configurações têm **cinco seções**: Meu perfil, Conta e segurança, Privacidade, Voz e vídeo e Aparência (medido na barra lateral do modal). Não há Notificações, Atalhos, Idioma nem Sobre. O `DISCORD_PARITY_PLAN.md` já registra que as seções mortas foram removidas de propósito, na caça a controles decorativos.
**Consequência**: não existe hoje nenhum lugar para desligar o som de mensagem da call (`MESSAGE_RECEIVED_SOUND`), que só se controla pelo volume geral de saída.

---

## 14.5 — MENTION_SYSTEM *(MISSING)*

**ID**: `MENTION_SYSTEM`
**NOME**: Menções (`@pessoa`, `@cargo`, `@everyone`, `#canal`)
**STATUS**: **`MISSING` por completo.**
**Esperado**: digitar `@` abre autocomplete; a menção fica destacada na mensagem e notifica quem foi citado.
**Real**: a busca por `mention` e `menção` em cliente, API e tipos compartilhados só encontra o valor `'mentions'` do `NotificationMode`. **Nenhum trecho reconhece `@usuário` em texto**, nem no composer nem no renderizador de markdown. O modo `mentions` da categoria, portanto, não tem como significar nada.
**Dependência**: base de todo o resto deste roteiro. Sem menções, "só menções" e o contador vermelho de menção não existem.

---

## 14.6 — UNREAD_TRACKING_AND_BADGES *(MISSING)*

**ID**: `UNREAD_TRACKING_AND_BADGES`
**NOME**: Rastreio de mensagens não lidas e os indicadores que dependem dele
**STATUS**: **`MISSING` por completo.** Consolida e amplia `RAIL_UNREAD_MENTION_INDICATOR` (2.9), já registrado.
**Esperado**: ponto branco ou contador na rail por servidor, nome de canal em negrito quando há mensagem nova, faixa "Novas mensagens", contador vermelho por menção, indicador de DM não lida, e o marcador de "última mensagem lida" por pessoa e canal.
**Real**: não existe `lastRead`, `last_read` nem `unread` em cliente ou API. O servidor não guarda até onde cada pessoa leu. Uma mensagem que chega em outro canal, servidor ou DM **não muda nada na tela**.
**Onde o dado teria de morar**: uma tabela por usuário e canal (`last_read_message_id`), atualizada ao abrir o canal, mais um evento de tempo real para sincronizar entre abas.
**Consequência**: qualquer conversa fora da tela aberta é invisível até alguém abri-la. Nas DMs isso é mais grave, porque a lista de conversas só reordena pela última mensagem (`DM_SIDEBAR_LIST`, Roteiro 11), sem nada que diga que há algo novo.

---

## 14.7 — MARK_AS_READ *(BROKEN — item de menu sem função)*

**ID**: `MARK_AS_READ`
**NOME**: "Marcar como lida" no menu de contexto da categoria
**STATUS ATUAL**: **item removido do menu** (commit `6aea3a4`, em produção). Volta quando existir `UNREAD_TRACKING_AND_BADGES`.
**STATUS**: **`BROKEN`.** Já registrado em `CATEGORY_CONTEXT_MENU` (Roteiro 3); mantido aqui porque é a peça que depende do rastreio de leitura.
**Real**: `{ key: 'mark-read', label: 'Marcar como lida', onSelect: () => {} }`, uma função vazia. Aparece como a primeira ação do menu e, ao clicar, o menu apenas fecha. Medido: o item está na lista (`ITENS_DO_MENU`).
**Correção proposta, sem executar**: remover o item até existir `UNREAD_TRACKING_AND_BADGES`.

---

## 14.8 — INBOX *(MISSING)*

**ID**: `INBOX`
**NOME**: Caixa de entrada (menções, respostas e convites recentes)
**STATUS**: **`MISSING` por completo.** A busca por `inbox` e `caixa de entrada` no cliente não acha nada. Não há ícone no cabeçalho nem painel.
**Dependência**: `MENTION_SYSTEM` e `UNREAD_TRACKING_AND_BADGES`. Respostas (`MESSAGE_REPLY`, Roteiro 4) existem, mas quem foi respondido não é avisado de nenhuma forma.

---

## 14.9 — DESKTOP_NOTIFICATION *(MISSING — e o Electron a bloqueia)*

**ID**: `DESKTOP_NOTIFICATION`
**NOME**: Notificação nativa do sistema para mensagem, menção, pedido de amizade ou call
**PLATAFORMA**: `DESKTOP_WINDOWS` (e `WEB`, pela API `Notification` do navegador)
**STATUS**: **`MISSING` por completo, com um bloqueio ativo no desktop.**
**Real, no cliente**: nenhum `new Notification(...)` nem `Notification.requestPermission()`. Medido no navegador: durante uma sessão inteira o app **não chamou** a API de notificação nenhuma vez nem pediu permissão.
**Real, no Electron**: em `apps/desktop/src/main.ts`, `setPermissionCheckHandler` e `setPermissionRequestHandler` só concedem `media`, `fullscreen`, `automatic-fullscreen`, `display-capture` e `speaker-selection`. **`notifications` não está na lista**, então qualquer tentativa do cliente seria negada. O desktop não tem código próprio de notificação (`Tray`, `Notification` do processo principal): a busca por `Notification` em `apps/desktop/src` não encontra nada.
**Consequência**: com o app minimizado, ou noutra janela, nada avisa que chegou mensagem, DM, pedido de amizade ou menção. Somado a `SYSTEM_TRAY` (`MISSING`, e fechar a janela encerra o app), o desktop hoje só funciona enquanto a pessoa está olhando para ele.
**Dependência**: liberar `notifications` na lista de permissões (ou usar a `Notification` do processo principal), e ter algo que valha notificar (`UNREAD_TRACKING_AND_BADGES`, `MENTION_SYSTEM`).

---

## 14.10 — TASKBAR_FLASH_BADGE *(MISSING)*

**ID**: `TASKBAR_FLASH_BADGE`
**NOME**: Piscar o botão da barra de tarefas e mostrar contador (overlay) no ícone
**PLATAFORMA**: `DESKTOP_WINDOWS`
**STATUS**: **`MISSING` por completo.** A busca por `flashFrame`, `setBadgeCount` e `setOverlayIcon` em `apps/desktop/src` não encontra nada.
**Esperado**: o botão pisca quando chega mensagem com a janela sem foco, e o ícone mostra um contador vermelho de menções.
**Relação com foco**: `WINDOW_FOCUS_BLUR` (0.12) já é `MISSING`; sem saber quando a janela perde e ganha foco, não há quando parar de piscar.

---

## 14.11 — DOCUMENT_TITLE_UNREAD *(MISSING)*

**ID**: `DOCUMENT_TITLE_UNREAD`
**NOME**: Título da janela e da aba com contador de não lidas
**STATUS**: **`MISSING`.** O título é `NexPlay` no `index.html` e nenhum código o altera (`document.title` não aparece no cliente). Medido: `page.title()` = "NexPlay".
**Esperado**: `(3) NexPlay` ou similar, o que também alimentaria a barra de tarefas do Windows e as abas do navegador.

---

## 14.12 — MESSAGE_RECEIVED_SOUND *(PARTIAL — só no chat da call)*

**ID**: `MESSAGE_RECEIVED_SOUND`
**NOME**: Som ao receber mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: automático ao chegar uma mensagem no **chat da call** (canal de dados do LiveKit).
**APARÊNCIA / ESTADO NORMAL / HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Não aplicável (evento automático).
**TRIGGER**: `RoomEvent.DataReceived` (canal de dados do LiveKit) com uma mensagem de chat válida (id e texto em texto, com até `CHAT_MESSAGE_MAX_LENGTH`).
**PRÉ-CONDIÇÕES**: Estar conectada à call.
**RESULTADO IMEDIATO**: A mensagem entra em `messages` (as últimas 100) e `playMessageSound(getOutputVolume())` toca.
**RESULTADO VISUAL**: A mensagem aparece se o painel do chat estiver aberto.
**RESULTADO SONORO**: Um tom único de 740 Hz por 90 ms (`sounds.ts`), no volume de saída escolhido. Toca **mesmo com o painel do chat fechado**, então é o único sinal de que chegou algo.
**ANIMAÇÃO / POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Mensagem no histórico efêmero da call e um bipe.
**EFEITO LOCAL**: Bipe. **EFEITO REMOTO**: Nenhum.
**REALTIME**: Canal de dados do LiveKit, não o WebSocket do NexPlay. **BACKEND / BANCO**: Nenhum (o chat da call não persiste).
**REFRESH / RECONEXÃO**: O histórico some com a call.
**ERRO**: Pacotes de dados que não são do chat são ignorados por um `catch` vazio.
**CANCELAMENTO / REVERSÃO**: Não existe como desligar só este som. Não há opção em Configurações (`NOTIFICATION_SETTINGS_SECTION`).
**ATALHO / MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Um bipe sem equivalente visual quando o painel está fechado.

**Achado — o que NÃO tem som**: mensagens de **canal de texto** e de **DM** chegam em silêncio total (a busca por `playMessageSound` só encontra `useVoiceRoom.ts`). A auditoria do sistema de sons inteiro é o roteiro 50 do pedido, ainda pendente.
**Não confirmado**: se este som respeita o estado de ensurdecer.

---

## 14.13 — INCOMING_CALL_RING *(MISSING)*

**ID**: `INCOMING_CALL_RING`
**NOME**: Receber uma chamada (toque, tela de aceitar ou recusar)
**STATUS**: **`MISSING` por completo, por dependência.** Não existe chamada direta: `DM_VOICE_VIDEO_CALL` (11.11) já é `MISSING`, e a voz do app é sempre um canal de servidor. Não há evento de "alguém está te chamando" no `RealtimeEvent`, nem tela de aceitar, recusar ou ignorar, nem toque.
**Dependência**: um modelo de chamada efêmera entre duas pessoas, e `DESKTOP_NOTIFICATION` para tocar com o app em segundo plano.

---

## 14.14 — FRIEND_REQUEST_BADGE *(referência — o único badge do app)*

**ID**: `FRIEND_REQUEST_BADGE`
**STATUS**: `CORE`, auditado em detalhe em 2.2. Aqui só o que interessa a este roteiro: é o **único** contador de "algo para ver" em todo o app. Mostra a contagem exata de pedidos recebidos (`friendsState.incoming.length`) no botão Início da rail e atualiza em tempo real por `FRIENDSHIP_UPDATE`.
**O que não acompanha o badge**: nenhum som ao chegar o pedido, nenhuma notificação do desktop, nenhuma mudança no título da janela e nenhum item numa caixa de entrada. Quem está noutra tela vê o número mudar sozinho e mais nada.

---

**Achados mais importantes do Roteiro 14** (por ordem de impacto):

1. **Sem nenhum aviso fora da tela aberta.** Não há não lida, menção, notificação do desktop, flash da barra de tarefas nem título com contador. Somado ao fechar-encerra do desktop (`SYSTEM_TRAY`, `MISSING`), o app só serve enquanto está sendo olhado.
2. **"Silenciar categoria" e "Config. de notificação" gravam uma preferência que nada lê** (`CATEGORY_MUTE_TOGGLE`, `CATEGORY_NOTIFICATION_MODE`), com o segundo mudando de modo em silêncio.
3. **O Electron nega `notifications` de propósito** (`DESKTOP_NOTIFICATION`): não basta o cliente chamar a API.
4. **"Marcar como lida" continua sendo uma função vazia** (`MARK_AS_READ`).
5. **Só o chat da call faz barulho ao receber mensagem** (`MESSAGE_RECEIVED_SOUND`); canal de texto e DM não.
6. **Não há sistema de menções** (`MENTION_SYSTEM`), então o modo `mentions` nunca teve significado.

**Ordem de dependência sugerida, sem executar**: (a) rastreio de leitura no servidor, que destrava não lida, badge, título, "Marcar como lida" e faixa "Novas mensagens"; (b) menções, que destravam contador vermelho, inbox e o modo `mentions`; (c) a ponte do desktop (liberar `notifications`, `flashFrame`, `setOverlayIcon`), que precisa de (a) e (b) para ter o que notificar. Antes de (a), a correção mínima e honesta é esconder os dois itens de notificação da categoria e o "Marcar como lida".
---

# ROTEIRO 15 — TECLADO, ESC, DUPLO CLIQUE, HISTÓRICO, SCROLL, COPIAR, LINKS E MODO DESENVOLVEDOR

Cobre os roteiros 38 (Keyboard navigation), 39 (Esc), 40 (Hover, só o que é tecla e foco), 54 (Links), 55 (Copy), 56 (Developer mode), 57 (Double click), 58 (Back / Forward), 59 (Scroll) e 60 (Links de mensagem) do pedido original. Método: busca no código de cliente e desktop por `keydown`, `Escape`, `onDoubleClick`, `dblclick`, `pushState`, `popstate`, `clipboard`, `setWindowOpenHandler`, `openExternal` e `setAsDefaultProtocolClient`, mais **medição num Chromium real e num Electron real** (o `dist/main.js` do desktop, lançado com `--user-data-dir` isolado e `NEXPLAY_APP_URL` apontando para o servidor local, sem tocar em produção nem no NexPlay aberto do usuário).

**Resumo dos achados deste roteiro**:

1. **Copiar não funciona no app desktop.** Medido no Electron real com a janela focada (`document.hasFocus() = true`): a permissão `clipboard-write` está `denied` e `navigator.clipboard.writeText` falha com `NotAllowedError: Write permission denied`. O clique em "Copiar texto" deixou a área de transferência intacta. A causa é a lista de permissões do processo principal, que só concede cinco (mídia, tela cheia, tela cheia automática, captura de tela e alto-falante). Os botões engolem o erro (`void ...writeText`), então não há nenhum aviso (`CLIPBOARD_COPY_DESKTOP`).
2. **Clicar num link de mensagem não faz nada no app desktop.** Medido: nenhuma janela nova, nenhuma chamada a `shell.openExternal`, URL da janela igual. No navegador comum o mesmo link abre uma nova aba (`MESSAGE_LINK_OPEN`).
3. **Apertar Esc para cancelar a captura da tecla do "apertar para falar" grava `Escape` como a tecla e ainda fecha as configurações.** Medido na web e no desktop (`PTT_KEY_CAPTURE_ESCAPE`).
4. **Um Esc fecha várias camadas de uma vez.** Há **dez** ouvintes de Esc independentes no `window`, sem pilha de prioridade. Medido: com o diálogo de excluir servidor aberto por cima das configurações do servidor, um Esc fecha o diálogo **e** as configurações inteiras (`ESCAPE_LAYER_PRIORITY`).
5. **Não existe histórico de navegação.** A URL fica sempre `/`, o botão Voltar do navegador sai do app, e **F5 perde o canal**: medido, estando em `#segundo`, o app volta a `#geral` (`BACK_FORWARD_HISTORY`, `STATE_RESTORE_ON_RELOAD`).
6. **Não existe nenhum atalho global além do PTT**, nenhum duplo clique em lugar nenhum, nenhum link de mensagem copiável, nenhum link do tipo `nexplay://` e nenhum modo desenvolvedor.

**Atualização — correções publicadas**: (a) copiar no desktop, a captura do PTT e o Esc do diálogo de excluir servidor foram corrigidos só no `web` (commit `624b8a5`, em produção); a cópia ganhou plano B por `execCommand` e "Copiado!", e conserta também as versões do desktop já instaladas; (b) o desktop `0.2.11` (release `v0.2.11`, commit `6a6752f`) abre links `http(s)` no navegador do sistema e libera a escrita na área de transferência. **Continuam abertos**: Esc sem pilha de camadas (só o diálogo de excluir servidor foi tratado), atalhos, duplo clique, histórico/URL por canal, restaurar canal após F5, deep links, permalink, modo desenvolvedor. Verificado num Chromium real e num Electron real, inclusive no **executável empacotado** `0.2.11`.

---

## 15.1 — CLIPBOARD_COPY_DESKTOP *(BROKEN — copiar não funciona no desktop)*

**ID**: `CLIPBOARD_COPY_DESKTOP`
**NOME**: Copiar para a área de transferência (texto da mensagem, ID da categoria, código de convite)
**STATUS ATUAL**: **corrigido** (commit `624b8a5`, em produção; e desktop `0.2.11`, release `v0.2.11` (commit `6a6752f`)). A função `copyText` tenta `navigator.clipboard.writeText` e, se a permissão for negada, cai para `document.execCommand('copy')`, que não depende dela. Por isso a correção do `web` vale também para o desktop já instalado. Message e DM mostram "Copiado!" ou "Não foi possível copiar"; o convite só diz "Copiado!" quando a cópia realmente aconteceu. Verificado no Electron real com a permissão ainda negada (mensagem e código de convite copiaram) e, depois, no desktop `0.2.11`, onde a API nativa passou a funcionar (permissão `clipboard-write` = `granted`; `clipboard-read` e notificações continuam `denied`). O texto abaixo registra o defeito original.
**PLATAFORMA**: `DESKTOP_WINDOWS` (quebrado), `WEB` (não medido nesta rodada)
**CAMINHO EXATO**: `Mensagem > barra de ações no hover > "Copiar texto"` (canal e DM), `Categoria > botão direito > "Copiar ID da Categoria"`, `Configurações do servidor > Convites > "Copiar"`.
**POSIÇÃO NA INTERFACE**: `TextChannels.tsx` (mensagem de canal), `DmChannelView.tsx` (mensagem de DM), `Workspace.tsx` (menu da categoria), `ServerSettings.tsx` (convite).
**APARÊNCIA**: Ícone de cópia nas mensagens; item de texto no menu da categoria; botão "Copiar" no convite.
**ESTADO NORMAL / HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Botão comum, nunca desabilitado.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Nenhuma no código. **No Electron**, o Chromium exige a permissão de escrita na área de transferência para `navigator.clipboard.writeText`.
**RESULTADO IMEDIATO**: Todos os quatro pontos chamam `navigator.clipboard.writeText(...)`. **Medido no Electron real**: a janela estava focada, `navigator.permissions.query({ name: 'clipboard-write' })` devolveu **`denied`**, `writeText` rejeitou com `NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied.`, e depois de clicar em "Copiar texto" a área de transferência do sistema **continuou com o valor anterior**.
**Causa**: `setPermissionCheckHandler` e `setPermissionRequestHandler` em `apps/desktop/src/main.ts` só concedem `media`, `fullscreen`, `automatic-fullscreen`, `display-capture` e `speaker-selection`. Qualquer outra permissão, inclusive a de escrita na área de transferência, é negada.
**RESULTADO VISUAL**: **Nenhum.** Três dos quatro pontos chamam `void navigator.clipboard.writeText(...)`, sem `.then` nem `.catch`. O convite usa `.then(() => setCopied(true))`, então **também não mostra "Copiado!"** quando a escrita falha, e a rejeição fica sem tratamento.
**RESULTADO SONORO / ANIMAÇÃO / POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Nenhum / não aplicável.
**RESULTADO FINAL**: No desktop, copiar simplesmente não copia, e a pessoa não é avisada.
**EFEITO LOCAL**: Nenhum. **EFEITO REMOTO**: Nenhum.
**REALTIME / BACKEND / BANCO**: Não aplicável.
**REFRESH / RECONEXÃO**: Não aplicável.
**ERRO**: A rejeição da API é descartada em silêncio.
**CANCELAMENTO / REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum. Selecionar o texto e usar Ctrl+C do sistema continua funcionando, pois não passa pela API assíncrona (não medido).
**MENU DE CONTEXTO**: Não existe botão direito em mensagem (`MESSAGE_CONTEXT_MENU`, `MISSING`).
**ACESSIBILIDADE**: Botões com `title` e `aria-label`, mas sem nenhum retorno de sucesso ou falha.
**Registro de estado anterior**: o Atlas já apontava "sem feedback" em `MESSAGE_COPY_TEXT` (4.8), mas partia do princípio de que a cópia funcionava. **Isso estava errado no desktop.**
**Correção proposta, sem executar**: (a) função `copyText` com **plano B via `document.execCommand('copy')`**, que não depende dessa permissão e por isso pode ser publicada só com um deploy do `web` (o desktop carrega o site); (b) de quebra, mostrar "Copiado!" em todos os pontos e tratar a falha. Alternativa no processo principal: conceder `clipboard-sanitized-write`, o que exige uma nova versão do desktop.

---

## 15.2 — MESSAGE_LINK_OPEN *(BROKEN no desktop; CORE na web)*

**ID**: `MESSAGE_LINK_OPEN`
**NOME**: Clicar num link `http(s)` dentro de uma mensagem
**STATUS ATUAL**: **corrigido no desktop `0.2.11`, release `v0.2.11` (commit `6a6752f`).** O tratador de `window.open` passou a abrir só `http` e `https` no navegador do sistema (sem usuário e senha embutidos, sem outros esquemas) e continua negando a janela. Verificado no Electron real e no executável empacotado: `https` vai a `shell.openExternal`; `file:`, `ms-settings:`, `javascript:`, `vscode:`, `mailto:` e link com senha não são abertos. **Chega às máquinas por auto-update**, na próxima vez que o app for aberto; até lá, nas versões anteriores o link continua morto. O texto abaixo registra o defeito original.
**PLATAFORMA**: `DESKTOP_WINDOWS` (quebrado), `WEB` (funciona)
**CAMINHO EXATO**: `Mensagem com URL > clicar no link`
**POSIÇÃO NA INTERFACE**: `<a target="_blank" rel="noopener noreferrer">` gerado por `Markdown.tsx` (`URL_PATTERN` só reconhece `http://` e `https://`).
**APARÊNCIA / ESTADO NORMAL / HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Link sublinhado padrão do renderizador.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: URL válida reconhecida pelo padrão.
**RESULTADO IMEDIATO — WEB**: **Medido**: abre uma nova aba com a URL.
**RESULTADO IMEDIATO — DESKTOP**: **Medido no Electron real**: janelas antes 1, depois 1; a URL da janela principal não mudou; `shell.openExternal` (substituído por um gravador antes do clique) **não foi chamado**. O clique é engolido.
**Causa**: `window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))` nega o `target="_blank"`, e `will-navigate` cancela qualquer navegação para fora da origem do app. **Nenhum código chama `shell.openExternal` para links** (a única chamada é a de `ms-settings:` para permissão de câmera e microfone) e o `preload` expõe `window.desktop.*` sem nenhuma função de abrir link externo.
**RESULTADO VISUAL / SONORO / ANIMAÇÃO**: Nenhum no desktop.
**POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável. (O Discord pergunta antes de abrir domínio desconhecido; aqui não há nem a abertura.)
**RESULTADO FINAL**: Link morto no desktop, comportamento correto no navegador.
**EFEITO LOCAL / REMOTO / REALTIME / BACKEND / BANCO**: Não aplicável.
**REFRESH / RECONEXÃO**: Não aplicável.
**ERRO**: Silêncio total.
**CANCELAMENTO / REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum. Não há "Copiar endereço do link" nem menu de botão direito no link.
**MENU DE CONTEXTO**: Não existe.
**ACESSIBILIDADE**: Link real (`<a href>`), alcançável por Tab.
**Nota de segurança que já funciona**: o link usa `rel="noopener noreferrer"` e o autolink **não** reconhece `javascript:` (testado, ver `MARKDOWN_RENDERING`). Abrir externamente exigiria filtrar para `http` e `https` e nunca repassar outro esquema a `openExternal`.
**Correção proposta, sem executar**: no processo principal, trocar o `deny` por uma função que abra `http(s)` no navegador do sistema (`shell.openExternal`) e negue a janela. **Isso muda o processo principal, então precisa de uma nova versão do desktop** publicada para o auto-update.

---

## 15.3 — PTT_KEY_CAPTURE_ESCAPE *(BROKEN — não há como cancelar a captura)*

**ID**: `PTT_KEY_CAPTURE_ESCAPE`
**NOME**: Apertar Esc durante a captura da tecla de "apertar para falar"
**STATUS ATUAL**: **corrigido** (commit `624b8a5`, em produção). Durante a captura, Esc cancela sem gravar tecla e sem fechar as Configurações (o ouvinte de captura roda na fase de captura e consome o toque). Uma tecla normal continua sendo gravada, e fora da captura o Esc fecha o modal como antes. Verificado no Chromium e no Electron reais. O texto abaixo registra o defeito original.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações > Voz e vídeo > modo "Push to talk" > botão da tecla (`.ptt-key-button`) > "Pressione uma tecla…" > Esc`
**POSIÇÃO NA INTERFACE**: Efeito em `Workspace.tsx` (`listeningForKey`), que registra um `keydown` no `window`.
**APARÊNCIA**: O botão passa a mostrar "Pressione uma tecla…".
**ESTADO NORMAL**: Mostra a tecla atual (padrão `ControlRight`; medido: `np:ptt-key` ausente no início).
**HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Padrão.
**TRIGGER**: Qualquer tecla, inclusive Esc.
**PRÉ-CONDIÇÕES**: Modo "Push to talk" escolhido e captura ativa.
**RESULTADO IMEDIATO**: O tratador faz `event.preventDefault(); setPttKeyBinding(event.code); setListeningForKey(false)` para **qualquer** tecla, sem exceção para Esc.
**RESULTADO VISUAL**: O botão volta a mostrar o nome da tecla. **Medido**: depois de Esc, `localStorage['np:ptt-key']` = **`"Escape"`**, e as configurações **fecharam**, porque o tratador de Esc do próprio modal (também no `window`) reage ao mesmo toque. `preventDefault` não impede o outro ouvinte. **Medido igual no Electron.**
**RESULTADO SONORO / ANIMAÇÃO / POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: **A tecla de falar passa a ser o Esc.** Daí em diante, segurar Esc (o que se faz o tempo todo para fechar popovers e diálogos) abre o microfone na call. Para se recuperar é preciso reabrir as configurações e escolher outra tecla.
**EFEITO LOCAL**: Preferência salva; a reação do PTT em `useVoiceRoom` (`keydown`/`keyup` por `event.code`) passa a valer para o Esc. **EFEITO REMOTO**: Outros passam a ouvir a pessoa quando ela aperta Esc.
**REALTIME / BACKEND / BANCO**: Não aplicável (`localStorage`, por dispositivo).
**REFRESH**: Persiste. **RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: **Não existe.** Não há como sair da captura sem gravar uma tecla, e Esc, o gesto universal de cancelar, grava.
**REVERSÃO**: Capturar outra tecla.
**ATALHO**: Ver `KEYBOARD_SHORTCUTS_GLOBAL`. **MENU DE CONTEXTO**: Não existe.
**ACESSIBILIDADE**: Não anuncia que a captura começou nem qual tecla foi gravada.
**Correção proposta, sem executar**: durante a captura, Esc cancela sem gravar e sem fechar o modal (o tratador de captura precisa rodar antes, em fase de captura, e parar a propagação).

---

## 15.4 — ESCAPE_LAYER_PRIORITY *(PARTIAL — sem pilha de camadas)*

**ID**: `ESCAPE_LAYER_PRIORITY`
**NOME**: O que o Esc fecha quando há mais de uma camada aberta
**STATUS ATUAL**: **corrigido só o caso medido** (commit `624b8a5`, em produção): o diálogo de excluir servidor agora trata o próprio Esc, e um toque fecha só o diálogo, deixando as Configurações do servidor abertas. **Continua `PARTIAL`**: os dez ouvintes seguem independentes, sem pilha de camadas. O texto abaixo registra o estado medido antes da correção.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: qualquer tela com diálogo, menu ou painel aberto, tecla `Escape`.
**Situação real**: cada camada registra o **seu próprio** ouvinte de Esc no `window`, sem coordenação. Ouvintes globais confirmados no código: menu de contexto (`ContextMenu.tsx`), encaminhar mensagem (`ForwardMessage.tsx`), mini-perfil (`ProfilePopover.tsx`), tela cheia da transmissão no desktop (`ScreenStage.tsx`), adicionar servidor (`Servers.tsx`), configurações do servidor (`ServerSettings.tsx`), soundboard (`Soundboard.tsx`), criar canal (`TextChannels.tsx`), criar categoria e configurações do app (`Workspace.tsx`). **Dez ao todo.** Fora esses, os campos de mensagem tratam Esc no próprio `textarea` (cancelar resposta ou edição, `TextChannels.tsx` e `DmChannelView.tsx`). Nenhum chama `stopPropagation`, nenhum consulta se existe outra camada por cima.
**Medido — diálogo dentro das configurações do servidor**: com "Excluir servidor" aberto por cima de `Configurações do servidor` (o diálogo tem campo para digitar o nome), **um único Esc fechou o diálogo e as configurações inteiras**, e a pessoa caiu no canal de texto. O `DeleteServerDialog` não tem tratador de Esc próprio, então quem responde é o do `ServerSettings`, que fecha tudo. O Discord fecharia só a camada de cima.
**Também**: no desktop, o Esc da tela cheia é tratado **duas vezes**, no processo principal (`before-input-event`) e no React (`ScreenStage.tsx`), como já notado em `SCREEN_SHARE_FULLSCREEN_EXIT_ESC`. E a captura da tecla do PTT engole o Esc (`PTT_KEY_CAPTURE_ESCAPE`).
**Situações em que o problema não aparece na prática**: o mini-perfil e o menu de contexto fecham também por clique fora, o que os torna exclusivos na maioria dos usos.
**HOVER / ACTIVE / SELECTED / DISABLED / LOADING**: Não aplicável.
**TRIGGER**: Tecla Esc. **PRÉ-CONDIÇÕES**: Duas ou mais camadas abertas.
**RESULTADO IMEDIATO / VISUAL**: Todas as camadas com ouvinte fecham no mesmo toque.
**RESULTADO SONORO / ANIMAÇÃO / POPOVER / MENU / MODAL / SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Perda de contexto ao cancelar um diálogo aninhado.
**EFEITO LOCAL / REMOTO / REALTIME / BACKEND / BANCO / REFRESH / RECONEXÃO / ERRO**: Não aplicável.
**CANCELAMENTO / REVERSÃO**: Reabrir o que fechou.
**ATALHO**: `Esc`. **MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Só o modal de Configurações do app prende o Tab e deixa o resto `inert`; o padrão não é aplicado de forma uniforme (ver `KEYBOARD_NAVIGATION_FOCUS`).
**Correção proposta, sem executar**: uma pilha de camadas (um único ouvinte que fecha só a de cima), ou no mínimo o diálogo de excluir servidor tratar o próprio Esc e parar a propagação.

---

## 15.5 — KEYBOARD_SHORTCUTS_GLOBAL *(MISSING)*

**ID**: `KEYBOARD_SHORTCUTS_GLOBAL`
**NOME**: Atalhos de teclado do aplicativo
**STATUS**: **`MISSING`, exceto o PTT.**
**Esperado (Discord)**: Ctrl+K (troca rápida), Ctrl+/ (lista de atalhos), Alt+setas (canais e servidores), Ctrl+Shift+M e Ctrl+Shift+D (mutar e ensurdecer), Alt+Shift+setas (não lidas) e afins, com uma tela de atalhos configuráveis.
**Real**: a busca por `keydown` no cliente só encontra: a tecla do PTT (`useVoiceRoom.ts`), Enter para enviar e Shift+Enter para nova linha nos campos de mensagem, Esc para cancelar resposta ou edição, Enter e Espaço no spoiler do markdown, Enter no campo de nome de cargo, e os Esc dos diálogos. No desktop, `before-input-event` trata só Ctrl/Cmd+R, F5, F11 e Esc em tela cheia. **Não existe** tela de atalhos, nem atalho para mutar, ensurdecer, trocar de canal ou de servidor (`VOICE_SELF_MUTE`, `QUICK_SWITCHER` e `KEYBOARD_SERVER_NAVIGATION` já são `MISSING`).

---

## 15.6 — KEYBOARD_NAVIGATION_FOCUS *(PARTIAL)*

**ID**: `KEYBOARD_NAVIGATION_FOCUS`
**NOME**: Navegação por Tab e gerenciamento de foco em camadas
**STATUS**: `PARTIAL`.
**O que existe**: o modal de **Configurações do app** prende o Tab (volta ao primeiro e ao último item), marca o resto da tela como `inert` e `aria-hidden`, e devolve o foco ao botão da engrenagem ao fechar. O diálogo de **criar canal** aplica o mesmo `inert` nos irmãos do overlay. O de **criar categoria** trata Esc, mas **não** aplica `inert` (a busca por `inert` só encontra `TextChannels.tsx` e `Workspace.tsx`, este último no modal de Configurações).
**O que falta (medido ou lido)**: o **mini-perfil** não move o foco para dentro nem o devolve (medido, ver `MINI_PROFILE_CLOSE`); o menu de dispositivos fecha só com clique fora, sem Esc nem setas (ver `USER_PANEL_CONTROLS`); os menus de contexto não têm navegação por setas nos itens no código lido. Não auditei nesta passagem o foco de `ForwardMessage`, adicionar servidor, configurações do servidor e soundboard.
**Consequência**: a experiência de teclado é consistente só dentro das Configurações do app.

---

## 15.7 — DOUBLE_CLICK *(MISSING — e uma linha antiga a confirmar)*

**ID**: `DOUBLE_CLICK`
**NOME**: Duplo clique em qualquer elemento
**STATUS**: **`MISSING` por completo.** A busca por `onDoubleClick` e `dblclick` em `apps/web/src` e `apps/desktop/src` não encontra nada. **Medido**: duplo clique numa mensagem não abre edição nem resposta.
**Esperado (Discord)**: duplo clique na mensagem para responder ou editar; no ícone do servidor para configurações; e na barra de título para maximizar ou restaurar.
**A confirmar — barra de título**: o Atlas (`WINDOW_MAXIMIZE`, 0.4) e o plano registravam "duplo clique na barra de título: `MISSING`" porque `.app-chrome-drag` **não tem listener**. Mas essa região usa `-webkit-app-region: drag`, e numa janela sem moldura do Windows a área arrastável costuma ser tratada como barra de título nativa, que **maximiza no duplo clique sem código nenhum**. Eventos sintéticos do Playwright não passam por esse caminho nativo, e eu não movi o mouse do usuário com cliques reais do sistema, então **não consegui confirmar nem negar**. Fica como "a confirmar com um clique real".

---

## 15.8 — BACK_FORWARD_HISTORY *(MISSING)*

**ID**: `BACK_FORWARD_HISTORY`
**NOME**: Voltar e avançar (botões do mouse, Alt+setas, botão do navegador)
**STATUS**: **`MISSING` por completo.**
**Real**: nenhuma ocorrência de `pushState`, `replaceState`, `popstate`, `location.hash` ou `hashchange` no cliente, e nenhum tratamento de `app-command` ou `goBack` no desktop. **Medido**: a URL permanece `http://localhost:5173/` e `history.length` não muda ao trocar de canal. No navegador, **Voltar sai do app** (vai para a página anterior à do NexPlay). No desktop não há histórico para voltar.
**Esperado**: cada canal, servidor ou DM aberto vira uma entrada de histórico; Alt+←/→ e os botões laterais do mouse navegam entre elas.

---

## 15.9 — STATE_RESTORE_ON_RELOAD *(MISSING)*

**ID**: `STATE_RESTORE_ON_RELOAD`
**NOME**: Voltar ao canal e ao servidor em que a pessoa estava depois de recarregar
**STATUS**: **`MISSING`.** Fecha uma pendência do Atlas: `APP_RELOAD` (0.16) dizia que o app "volta ao mesmo servidor e canal, assumindo que isso é persistido em `localStorage` — a confirmar". **Não é.**
**Medido**: estando no canal `#segundo`, um F5 devolveu o app ao canal **`#geral`**. A seleção fica só em estado do React. O servidor ativo não foi medido nesta rodada.
**Consequência**: junto com F5 derrubando a call (`VOICE_CHANNEL_JOIN`), recarregar zera onde a pessoa estava. Sem URL por canal (`BACK_FORWARD_HISTORY`) também não há como reabrir uma conversa por endereço.

---

## 15.10 — DEEP_LINKS_PROTOCOL *(MISSING)*

**ID**: `DEEP_LINKS_PROTOCOL`
**NOME**: Links que abrem o app (`nexplay://`) e convites clicáveis
**STATUS**: **`MISSING` por completo.** Não há `setAsDefaultProtocolClient`, tratamento de `open-url` nem leitura de argumentos de protocolo na segunda instância (o `second-instance` só restaura e foca a janela, ver `APP_SECOND_INSTANCE`). Convites são **códigos**, sem link clicável (`INVITE_CODE_VIEW_COPY_REGENERATE`, Roteiro 9).
**Esperado**: `nexplay://invite/CODIGO` abre o app e entra no servidor; links de canal e de mensagem levam ao lugar certo.

---

## 15.11 — MESSAGE_PERMALINK_COPY_LINK *(MISSING)*

**ID**: `MESSAGE_PERMALINK_COPY_LINK`
**NOME**: "Copiar link da mensagem"
**STATUS**: **`MISSING` por completo.** A busca por `copiar link` e `permalink` não encontra nada. Só se chega a uma mensagem específica pelo resultado da busca do canal ou pelo clique numa resposta (`MESSAGE_SEARCH_RESULT_JUMP`, `MESSAGE_JUMP_TO_ORIGINAL`, Roteiro 4). Depende de `DEEP_LINKS_PROTOCOL` e `BACK_FORWARD_HISTORY` para ter um destino, e de `CLIPBOARD_COPY_DESKTOP` funcionar.

---

## 15.12 — DEVELOPER_MODE_COPY_ID *(MISSING)*

**ID**: `DEVELOPER_MODE_COPY_ID`
**NOME**: Modo desenvolvedor e "Copiar ID"
**STATUS**: **`MISSING`.** Não há configuração de modo desenvolvedor. **"Copiar ID" só existe para categorias** (`Workspace.tsx`, "Copiar ID da Categoria"); não há para servidor, canal, cargo, usuário nem mensagem. E mesmo esse único item **não funciona no desktop** (`CLIPBOARD_COPY_DESKTOP`).
**Esperado**: opção em Configurações > Avançado que liga "Copiar ID" em todos os menus de contexto.

---

## 15.13 — SCROLL_BEHAVIOR *(referência — já auditado em pedaços)*

**ID**: `SCROLL_BEHAVIOR`
**STATUS**: referência. O cliente do chat **não tem nenhum `onScroll`**: a rolagem é guiada só por `scrollIntoView` no fim da lista. Isso confirma e explica achados já registrados: rolagem forçada para o fim a cada mensagem nova mesmo lendo histórico antigo (`MESSAGE_SCROLL_AUTOSTICK`, 4.3), nenhuma faixa "Novas mensagens" nem botão "ir para o fim" (`UNREAD_TRACKING_AND_BADGES`, Roteiro 14) e nenhuma leitura de histórico por rolagem para cima (`TEXT_CHANNEL_HISTORY_LOAD`, 4.1). Rolagem suave com `behavior: 'smooth'` ao chegar mensagem e ao pular para uma mensagem.

---

**Achados mais importantes do Roteiro 15** (por ordem de impacto):

1. **Copiar não funciona no desktop** (`CLIPBOARD_COPY_DESKTOP`), sem nenhum aviso. Correção só no `web`, com plano B por `execCommand`.
2. **Links de mensagem não abrem no desktop** (`MESSAGE_LINK_OPEN`). Correção no processo principal, exige nova versão do desktop.
3. **Esc na captura do PTT grava o Esc como tecla de falar e fecha as configurações** (`PTT_KEY_CAPTURE_ESCAPE`).
4. **Esc fecha várias camadas de uma vez** (`ESCAPE_LAYER_PRIORITY`), medido com o diálogo de excluir servidor.
5. **F5 perde o canal, a URL nunca muda e Voltar sai do app** (`STATE_RESTORE_ON_RELOAD`, `BACK_FORWARD_HISTORY`).
6. **Sem atalhos, sem duplo clique, sem deep links, sem link de mensagem, sem modo desenvolvedor.**
7. **A confirmar**: o duplo clique na barra de título pode já funcionar pelo Windows (`DOUBLE_CLICK`), o que corrigiria uma linha antiga do plano.

**Ordem sugerida, sem executar**: (a) pacote só de `web`: função de copiar com plano B, Esc do PTT cancelando sem gravar, Esc do diálogo de excluir servidor fechando só o diálogo; (b) versão nova do desktop: abrir links `http(s)` no navegador do sistema e, de preferência junto, conceder a permissão de escrita na área de transferência; (c) só depois, histórico e restauração de estado (URL por canal).

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente resumido de status para fichas inteiramente `MISSING`, conforme a própria convenção definida no topo deste arquivo), as **24 interações do Roteiro 0** (processo desktop), as **18 interações do Roteiro 1** (login e sessão) e as **11 interações do Roteiro 2** (navegação) — 53 fichas no total, cada uma verificada contra o código real, nunca assumida de memória ou copiada do comportamento genérico do Discord sem checar primeiro. Toda lacuna encontrada foi marcada `MISSING`/`PARTIAL` explicitamente, nunca simulada como se existisse — e tudo que já funciona (seleção de servidor, badge de pedidos de amizade, foco/retorno de foco do modal de adicionar servidor) foi documentado como `CORE`/funcional, não redescrito como se fosse novo trabalho a fazer.

**Achado transversal deste roteiro**: a navegação inteira do NexPlay não tem URL própria (sem router) — trocar de servidor/canal/DM nunca muda o endereço na barra do navegador nem gera um estado de histórico navegável via Voltar/Avançar do navegador, e não é possível compartilhar um link direto pra um servidor ou canal específico de fora do app (diferente de `discord.com/channels/...`). Isso afeta potencialmente várias fichas futuras (links de mensagem/deep link, Roteiro 60) e fica registrado aqui como o achado estrutural mais amplo desta seção.

---

# ROTEIRO 3 — SERVIDORES E CANAIS

Arquitetura real (verificada em `AddServerModal`/`Servers.tsx`, `CreateCategoryDialog`/`CreateTextChannelDialog`/`CategorySettingsModal`/`TextChannelSettingsModal`/`VoiceChannelSettingsModal`, e os handlers de drag-and-drop/menu de contexto em `Workspace.tsx`): categorias, canais de texto/voz, configurações de canal e mover canal entre categorias **já são funcionalidades reais e completas**, construídas e testadas em sessões anteriores desta mesma linha de trabalho — esta auditoria documenta o que existe (`CORE`), não reconstrói nada. Cargos/Membros/Convites/Integrações (abas de Configurações do Servidor) já foram auditadas em detalhe informal nas sessões anteriores desta mesma linha de trabalho e ficam para um roteiro dedicado à parte (permissões é um sistema grande o bastante pra merecer sua própria passagem, não espremido aqui), com uma ficha-resumo neste roteiro só marcando que existem e funcionam.

---

## 3.1 — SERVER_CREATE_SUBMIT

**ID**: `SERVER_CREATE_SUBMIT`
**NOME**: Criar um servidor novo
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Rail de servidores > "+" > AddServerModal > aba "Criar servidor" > formulário`
**POSIÇÃO NA INTERFACE**: Dentro do `AddServerModal`, aba padrão (ativa por default ao abrir).
**APARÊNCIA**: Campo "Nome do servidor" (`required`, até `SERVER_NAME_MAX_LENGTH`), campo "Descrição (opcional)" (até `SERVER_DESCRIPTION_MAX_LENGTH`), botão `.primary-button` "Criar servidor".
**ESTADO NORMAL**: Campos vazios, foco automático no nome ao abrir o modal.
**HOVER**: Padrão de `.primary-button:hover`.
**ACTIVE/PRESSED**: Padrão de `:active`.
**SELECTED**: Não aplicável.
**DISABLED**: `disabled={saving || !name.trim()}` — desabilitado até ter algum nome digitado.
**LOADING**: Texto muda para "Criando…" durante a chamada.
**TRIGGER**: Clique no botão, ou Enter em qualquer campo do formulário.
**PRÉ-CONDIÇÕES**: Nenhuma — **qualquer usuário autenticado pode criar um servidor, sem permissão especial**, exatamente como o Discord real (confirmado no comentário do próprio código da rota: "Qualquer usuário autenticado pode criar um servidor... quem cria vira dono e Administrador dele"). **Sem limite de quantos servidores um usuário pode criar.**
**RESULTADO IMEDIATO**: `api.createServer(name, description)` → `POST /api/servers`.
**RESULTADO VISUAL**: Modal fecha; novo servidor aparece na rail (via `onServerReady` → `serversState.refresh()` + `setActiveServerId` + `setView('server')`, confirmado em `Workspace.tsx`).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma transição própria.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Fecha ao concluir.
**SEGUNDA ETAPA**: Servidor novo já nasce com 1 canal de texto + 1 canal de voz padrão (confirmado em `DISCORD_PARITY_PLAN.md` §1) e o usuário vira automaticamente dono (`ownerId`) e Administrador (cargo com bitfield de permissão total).
**RESULTADO FINAL**: Novo servidor ativo, selecionado, com seus dois canais padrão prontos pra usar.
**EFEITO LOCAL**: `serversState.refresh()` — refetch completo da lista de servidores (não é só um append otimista local).
**EFEITO REMOTO**: Nenhum — servidor novo é privado ao criador até ele gerar um convite (ver Roteiro de Convites, já coberto informalmente em sessão anterior).
**REALTIME**: `sendToServerMembers` não se aplica ainda (só o criador é membro no momento da criação) — mas o evento `SERVER_CREATE` é emitido (confirmado em `apps/api/src/index.ts`), relevante se o mesmo usuário tiver o app aberto em duas abas/dispositivos.
**BACKEND**: `POST /api/servers`, sujeito a `channelCreateLimiter` (rate limit compartilhado com criação de canal — a confirmar limite exato em auditoria futura).
**BANCO**: Insere em `servers`, `server_members` (o próprio criador), `roles` (o cargo Administrador + `@everyone`), `user_roles`, e os dois canais padrão em `text_channels`/`voice_channels`.
**REFRESH**: Servidor persiste normalmente (não é um estado de sessão — é dado real no banco).
**RECONEXÃO**: Não aplicável.
**ERRO**: Erro de rede/validação exibido em `.form-error` dentro do modal (`requestError.message`).
**CANCELAMENTO**: Botão "Cancelar", X, Esc, ou clique fora do modal.
**REVERSÃO**: Ver `SERVER_DELETE` (já implementado e documentado em sessão anterior — só o dono pode excluir, com confirmação por nome digitado) ou `SERVER_LEAVE` (**`MISSING` na UI**, ver ficha própria adiante).
**ATALHO**: Nenhum atalho de teclado dedicado para abrir a aba de criação especificamente (é a aba padrão do modal, então `SERVER_ADD_OPEN` já leva direto pra cá).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Labels associados corretamente (`htmlFor`), foco automático no campo de nome, `role="tablist"` no seletor de aba.

---

## 3.2 — SERVER_JOIN_INVITE_SUBMIT

**ID**: `SERVER_JOIN_INVITE_SUBMIT`
**NOME**: Entrar em um servidor via código de convite
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Rail de servidores > "+" > AddServerModal > aba "Entrar com convite"`
**POSIÇÃO NA INTERFACE**: Segunda aba do mesmo modal.
**APARÊNCIA**: Campo único "Código de convite" (`required`), botão "Entrar no servidor".
**ESTADO NORMAL**: Campo vazio.
**HOVER**: Padrão de `.primary-button:hover`.
**ACTIVE/PRESSED**: Padrão de `:active`.
**SELECTED**: Não aplicável.
**DISABLED**: `disabled={saving || !inviteCode.trim()}`.
**LOADING**: Texto muda para "Entrando…".
**TRIGGER**: Clique ou Enter.
**PRÉ-CONDIÇÕES**: Código de convite válido (não expirado/esgotado — embora, conforme já registrado em `DISCORD_PARITY_PLAN.md` §1, o schema suporte expiração/limite de usos mas isso **nunca é configurado na prática**, já que não existe UI pra isso — todo convite hoje é efetivamente permanente e ilimitado).
**RESULTADO IMEDIATO**: `api.redeemInvite(code)` → `POST /api/invites/:code/redeem`.
**RESULTADO VISUAL**: Modal fecha; servidor novo aparece na rail e é selecionado.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Fecha ao concluir.
**SEGUNDA ETAPA**: Usuário vira membro com o cargo `@everyone` daquele servidor.
**RESULTADO FINAL**: Servidor ativo, selecionado, canal padrão carregado.
**EFEITO LOCAL**: `serversState.refresh()`.
**EFEITO REMOTO**: **Achado a confirmar**: diferente do cadastro via convite global (documentado no Roteiro 1 como **não emitindo `MEMBER_JOIN`**), esta rota específica de resgate de convite de servidor **não foi confirmada nesta passagem** se emite `MEMBER_JOIN` pros outros membros — marcado como pendente de verificação em auditoria futura mais profunda desta rota específica.
**REALTIME**: Ver acima.
**BACKEND**: `POST /api/invites/:code/redeem`, sujeito a `dmChannelLimiter` (reaproveitado — nome do limiter sugere que foi originalmente pensado pra outra coisa, mas está sendo usado aqui também, confirmado lendo a rota).
**BANCO**: Insere em `server_members`, `user_roles` (cargo padrão).
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Não aplicável.
**ERRO**: Convite inexistente/inválido retorna `404` com mensagem "Convite não encontrado." exibida no `.form-error`.
**CANCELAMENTO**: Mesmo padrão do modal.
**REVERSÃO**: `SERVER_LEAVE` (`MISSING` na UI, ver adiante) ou ser removido/banido por um admin.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Mesma estrutura de `SERVER_CREATE_SUBMIT`.

---

## 3.3 — CATEGORY_CREATE

**ID**: `CATEGORY_CREATE`
**NOME**: Criar uma categoria de canais
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor ativo > sidebar de canais > botão "+ Criar categoria" (rodapé da lista)`
**POSIÇÃO NA INTERFACE**: Abaixo da lista de canais/categorias existentes.
**APARÊNCIA**: `CreateCategoryDialog`: campo "Nome da categoria" (até 32 caracteres, placeholder "NOVA CATEGORIA" — sugere convenção de maiúsculas, mas **não força maiúsculas automaticamente**, é só um placeholder ilustrativo), toggle "Categoria restrita à staff" (`.toggle-row` com checkbox real, não decorativo).
**ESTADO NORMAL**: Campos vazios, toggle desligado (categoria pública por padrão).
**HOVER**: Padrão de campos/checkbox do app.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Botão de envio desabilitado sem nome preenchido.
**LOADING**: "Criando…".
**TRIGGER**: Clique ou Enter.
**PRÉ-CONDIÇÕES**: `canManageChannels` (permissão `MANAGE_CHANNELS`) — **achado**: o próprio botão "+ Criar categoria" só é renderizado condicionalmente a essa permissão (confirmado no padrão de outros botões "+"já auditados nesta sessão de trabalho mais ampla), então quem não tem permissão nem vê a opção.
**RESULTADO IMEDIATO**: `api.createCategory(serverId, name, staffOnly)` → `POST /api/servers/:id/categories`.
**RESULTADO VISUAL**: Nova categoria aparece na sidebar, vazia (sem canais), expandida por padrão.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Fecha ao concluir.
**SEGUNDA ETAPA**: Usuário pode criar canais direto dentro dela (botão "+" próprio da categoria) ou arrastar canais existentes pra ela.
**RESULTADO FINAL**: Categoria criada, pronta para receber canais.
**EFEITO LOCAL**: `onCreated(category)` insere direto no estado local (otimista, sem esperar um refetch completo) — deduplica contra eco de WebSocket com o mesmo padrão `current.some(...) ? current : [...]` já usado em outras partes do app auditadas nesta sessão de trabalho mais ampla.
**EFEITO REMOTO**: Evento `CATEGORY_CREATE` via `sendToServerMembers` — outros membros veem a categoria nova aparecer ao vivo, sem F5.
**REALTIME**: `CATEGORY_CREATE` (confirmado em `packages/shared/src/index.ts`).
**BACKEND**: `POST /api/servers/:serverId/categories`.
**BANCO**: Insere em `categories`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Recarregada via fetch normal de categorias.
**ERRO**: Nome duplicado ou vazio → mensagem no `.form-error`.
**CANCELAMENTO**: Padrão do modal.
**REVERSÃO**: `CATEGORY_DELETE` (ver ficha adiante).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável a este botão.
**ACESSIBILIDADE**: Checkbox real (`type="checkbox"`, não decorativo), label associado via `.toggle-row`.

---

## 3.4 — CATEGORY_COLLAPSE_TOGGLE

**ID**: `CATEGORY_COLLAPSE_TOGGLE`
**NOME**: Recolher/expandir uma categoria
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Sidebar de canais > cabeçalho da categoria > botão de toggle (seta/nome)`
**POSIÇÃO NA INTERFACE**: `.category-header-toggle`, dentro de `.category-header` (que é uma `<div>`, não um `<button>` — corrigido em sessão anterior desta linha de trabalho especificamente pra evitar `<button>` aninhado dentro de `<button>`, já que a categoria também tem botões de ação ao lado do toggle).
**APARÊNCIA**: Nome da categoria + seta indicando estado (aberta/fechada) — ícone exato não confirmado nesta passagem específica (herdado de auditoria visual anterior desta sessão de trabalho).
**ESTADO NORMAL**: Expandida por padrão (`collapsed: false`) pra uma categoria nova.
**HOVER**: Padrão de `.category-header-toggle:hover`.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Estado recolhido/expandido persiste por preferência do usuário (ver `BANCO`).
**DISABLED**: Nunca desabilitado.
**LOADING**: Não aplicável — mudança é otimista (aplica local antes da resposta do servidor confirmar).
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Nenhuma — qualquer membro pode recolher/expandir (é uma preferência pessoal, não uma ação de moderação).
**RESULTADO IMEDIATO**: `toggleCategoryCollapsed(categoryId)`: inverte o valor local imediatamente (`setCategoryPrefs`), depois `api.setCategoryPrefs(...)` persiste em segundo plano.
**RESULTADO VISUAL**: Canais dentro da categoria somem/aparecem; seta gira/muda de direção.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada (pode ou não ter uma transição de altura suave — não verificado nesta passagem).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Estado de colapso refletido na sidebar.
**EFEITO LOCAL**: Aplicado otimisticamente antes da API confirmar.
**EFEITO REMOTO**: **Nenhum** — é uma preferência **por usuário**, não global do servidor (confirmado: `category_prefs` é por usuário+categoria, não uma propriedade da categoria em si) — outros membros não veem/são afetados por alguém recolher uma categoria.
**REALTIME**: Não aplicável (preferência pessoal, sem broadcast).
**BACKEND**: `PATCH` de preferências de categoria (rota exata a confirmar nome — `api.setCategoryPrefs`).
**BANCO**: Tabela `category_prefs` (`server_id`/categoria + usuário + `collapsed`/`notification_mode`) — **persiste de verdade entre sessões**, diferente de vários outros estados de UI já documentados nesta auditoria como "voltam ao padrão em F5" (troca de servidor, tamanho de janela, etc.) — este é um caso de persistência real.
**REFRESH**: Estado recolhido/expandido **sobrevive a F5** (é lido do backend, não de `localStorage` nem de estado React efêmero).
**RECONEXÃO**: Recarregado via fetch normal ao reconectar.
**ERRO**: Falha na chamada ao backend não reverte o estado local otimista — fica dessincronizado até um próximo refresh/evento reconciliar (comportamento aceito como simplificação deliberada, não um bug ativamente escondido — mas vale registrar como comportamento real).
**CANCELAMENTO**: Clicar de novo reverte.
**REVERSÃO**: Clicar de novo.
**ATALHO**: Nenhum atalho de teclado dedicado.
**MENU DE CONTEXTO**: Ver `CATEGORY_CONTEXT_MENU` — "Recolher categoria" também está disponível lá como item com checkbox, refletindo o mesmo estado.
**ACESSIBILIDADE**: É um `<button>` real dentro de uma `<div>` container (não bloco aninhado inválido), alcançável via Tab.

---

## 3.5 — CATEGORY_CONTEXT_MENU

**ID**: `CATEGORY_CONTEXT_MENU`
**NOME**: Menu de contexto da categoria (botão direito)
**STATUS ATUAL**: o menu tem hoje **três seções** (recolher; editar e excluir; copiar ID). "Marcar como lida", "Silenciar categoria" e "Config. de notificação" foram escondidos (commit `6aea3a4`, em produção, ver Roteiro 14); as descrições desses itens abaixo são o registro do estado anterior.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Sidebar de canais > cabeçalho de qualquer categoria > botão direito`
**POSIÇÃO NA INTERFACE**: Menu flutuante posicionado nas coordenadas do clique (`categoryMenu.open(event, ...)`, componente genérico `ContextMenu.tsx` reaproveitado em todo o app).
**APARÊNCIA**: Lista de itens agrupados em 5 seções (separadas visualmente por divisores, uma seção por array `{ items: [...] }` passado): (1) "Marcar como lida"; (2) "Recolher categoria" (com checkbox refletindo estado atual) + "Recolher todas as categorias"; (3) "Silenciar categoria" (com checkbox) + "Config. de notificação"; (4) "Editar categoria" + "Excluir categoria" (só se `canManageChannels`, estilizado como `danger`); (5) "Copiar ID da Categoria".
**ESTADO NORMAL**: Fechado.
**HOVER**: Cada item reage a hover (padrão do `ContextMenu.tsx` genérico).
**ACTIVE/PRESSED**: Padrão do componente genérico.
**SELECTED**: Itens com `checked` (Recolher, Silenciar) mostram indicador visual de marcado quando o estado correspondente já está ativo.
**DISABLED**: "Excluir categoria" só aparece (não é "desabilitado visível", é condicionalmente ausente) se `canManageChannels`.
**LOADING**: Não aplicável ao menu em si.
**TRIGGER**: Clique com o botão direito no cabeçalho da categoria.
**PRÉ-CONDIÇÕES**: Nenhuma para abrir o menu (mas alguns itens dentro dele são condicionados a permissão).
**RESULTADO IMEDIATO**: Menu abre nas coordenadas do cursor.
**RESULTADO VISUAL**: Overlay com os itens listados.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada (padrão genérico do `ContextMenu.tsx`).
**POPOVER**: É o próprio popover.
**MENU**: É o próprio menu.
**MODAL**: Não é modal (fecha ao clicar fora, diferente de modal que bloqueia interação).
**SEGUNDA ETAPA**: Clicar em qualquer item executa a ação correspondente e fecha o menu.
**RESULTADO FINAL — item "Marcar como lida"**: **`onSelect: () => {}` — literalmente não faz nada.** Confirmado lendo o código: é um item vazio, presente só porque o Discord real tem essa opção, mas sem nenhuma função por trás (consistente com `DISCORD_PARITY_PLAN.md`: "'marcar como lida' é só visual — o app não tem nenhum rastreio de mensagem lida/não lida em lugar nenhum ainda"). **Isso é exatamente o tipo de controle decorativo que o pedido do usuário em sessões anteriores desta linha de trabalho pediu pra eliminar** ("LEMBRANDO, NÃO QUERO NADA QUEBRADO, SEM FUNÇÃO E SEM REAÇÃO") — mas sobreviveu aqui especificamente porque a funcionalidade de "não lida" inteira ainda não existe em lugar nenhum do app (não é uma omissão isolada consertável só neste menu, é uma feature ausente maior — ver `RAIL_UNREAD_MENTION_INDICATOR` no Roteiro 2).
**RESULTADO FINAL — outros itens**: Cada um chama a função correspondente já documentada em fichas próprias (`CATEGORY_COLLAPSE_TOGGLE`, `CATEGORY_EDIT`, `CATEGORY_DELETE`) ou "Copiar ID da Categoria" → `navigator.clipboard.writeText(category.id)` (**sem feedback visual de "copiado!"** — nenhum toast/tooltip confirmando que o clipboard foi escrito, diferente do padrão "Copiado" que o pedido do usuário espera pra toda ação de copiar, Roteiro 55).
**EFEITO LOCAL**: Depende do item (ver fichas individuais).
**EFEITO REMOTO**: Depende do item — "Recolher"/"Silenciar" são só locais (ver `CATEGORY_COLLAPSE_TOGGLE`); "Editar"/"Excluir" afetam todo mundo.
**REALTIME**: Depende do item.
**BACKEND**: Depende do item.
**BANCO**: Depende do item.
**REFRESH**: O menu em si nunca persiste aberto (sempre fecha em F5, como qualquer overlay).
**RECONEXÃO**: Não aplicável ao menu.
**ERRO**: Depende do item.
**CANCELAMENTO**: Clicar fora do menu, ou Esc (confirmado como padrão do `ContextMenu.tsx` genérico, reaproveitado em toda a auditoria desta sessão de trabalho mais ampla).
**REVERSÃO**: Não aplicável ao menu em si.
**ATALHO**: Nenhum atalho pra abrir via teclado (só botão direito do mouse — sem uma tecla equivalente tipo "Menu"/Shift+F10 confirmada).
**MENU DE CONTEXTO**: É a própria ficha.
**ACESSIBILIDADE**: A confirmar em auditoria futura mais profunda do `ContextMenu.tsx` genérico (navegação por seta entre itens, `role="menu"`/`role="menuitem"` — não lido em detalhe nesta passagem específica sobre categorias).

**Nota de auditoria**: comparado ao pedido original, faltam itens que o Discord real tem no menu de categoria: "Criar canal" (existe, mas como botão "+" separado no cabeçalho, não dentro deste menu) e "Duplicar categoria" (`MISSING` por completo, não existe em lugar nenhum).

---

## 3.6 — CATEGORY_EDIT

**ID**: `CATEGORY_EDIT`
**NOME**: Editar nome/restrição de uma categoria existente
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Categoria > menu de contexto > "Editar categoria"` (único caminho — **não há um ícone de engrenagem direto no cabeçalho da categoria**, diferente de canais individuais, que têm o gear sempre visível; editar categoria exige passar pelo botão direito).
**POSIÇÃO NA INTERFACE**: `CategorySettingsModal`, acessado via `ref` imperativo (`categoryEditRefs.current[category.id]?.open()`) — um componente por categoria, cada um mantendo seu próprio estado de aberto/fechado internamente, controlado de fora só por essa chamada imperativa.
**APARÊNCIA**: Modal com campo de nome e o toggle de restrição à staff (mesmos campos de `CATEGORY_CREATE`, agora pré-preenchidos com os valores atuais).
**ESTADO NORMAL**: Fechado.
**HOVER**: Padrão de modal.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Botão salvar desabilitado sem nome.
**LOADING**: "Salvando…" (a confirmar texto exato).
**TRIGGER**: Item "Editar categoria" no menu de contexto.
**PRÉ-CONDIÇÕES**: Nenhuma explícita pra *ver* o item no menu (diferente de "Excluir", que só aparece com `canManageChannels`) — **achado a confirmar**: se "Editar categoria" também deveria estar condicionado à mesma permissão e não está, seria uma inconsistência de autorização client-side (o backend certamente valida `MANAGE_CHANNELS` na rota de update, então não é um risco de segurança real, só uma UI que mostra uma opção que vai falhar com 403 pra quem não tem permissão — a confirmar em auditoria futura mais profunda).
**RESULTADO IMEDIATO**: Modal abre pré-preenchido.
**RESULTADO VISUAL**: Campos com os valores atuais da categoria.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável (já fechou o menu de contexto que abriu isto).
**MODAL**: É o próprio modal.
**SEGUNDA ETAPA**: Editar campos e salvar.
**RESULTADO FINAL**: `PATCH` na categoria — nome/`staffOnly` atualizados.
**EFEITO LOCAL**: Estado local atualizado (via `onUpdated`, padrão consistente com outros modais de configuração já auditados).
**EFEITO REMOTO**: `CATEGORY_UPDATE` via WebSocket — outros membros veem a mudança ao vivo, inclusive a **mudança de visibilidade** se `staffOnly` for alternado (canais dentro dela passam a aparecer/desaparecer para membros sem cargo de staff, imediatamente, sem F5 — mecanismo de `isStaffTier`/`filterChannelsByCategoryAccess` já auditado em sessão anterior desta linha de trabalho).
**REALTIME**: `CATEGORY_UPDATE`.
**BACKEND**: `PATCH /api/servers/:serverId/categories/:categoryId` (nome exato a confirmar).
**BANCO**: Atualiza `categories`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Recarregado via fetch normal.
**ERRO**: Nome duplicado/vazio → erro no modal.
**CANCELAMENTO**: Fechar sem salvar.
**REVERSÃO**: Editar de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável ao modal em si.
**ACESSIBILIDADE**: Mesma estrutura de modal já documentada em outras fichas.

---

## 3.7 — CATEGORY_DELETE

**ID**: `CATEGORY_DELETE`
**NOME**: Excluir uma categoria
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Categoria > menu de contexto > "Excluir categoria"`
**POSIÇÃO NA INTERFACE**: Item de destaque (`danger`) no menu de contexto.
**APARÊNCIA**: Texto vermelho/destaque de perigo dentro do menu (classe `danger` no item).
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Destaque de perigo mais forte no hover (padrão de item `danger` do `ContextMenu.tsx`).
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Item só existe no menu se `canManageChannels` (não aparece pra quem não tem permissão, não é "visível mas desabilitado").
**LOADING**: Não aplicável (a confirmação é feita via `window.confirm()` nativo do navegador, que é síncrono e bloqueante — não há um "excluindo…" intermediário porque a chamada só começa depois que o `confirm()` já resolveu).
**TRIGGER**: Clique no item do menu.
**PRÉ-CONDIÇÕES**: `canManageChannels`.
**RESULTADO IMEDIATO**: `window.confirm('Excluir esta categoria? Os canais dentro dela ficam sem categoria.')` — **diálogo nativo do navegador, não um modal customizado do NexPlay** (diferente da exclusão de servidor, que já usa um modal próprio bem construído com confirmação por nome digitado, auditada/construída em sessão anterior desta linha de trabalho — **inconsistência de padrão de confirmação entre as duas ações destrutivas**: excluir servidor exige digitar o nome exato; excluir categoria só exige um clique em "OK" num `confirm()` nativo, sem nenhuma fricção adicional apesar de também ser irreversível).
**RESULTADO VISUAL**: Se confirmado: categoria some da sidebar; canais que estavam dentro dela reaparecem na zona "sem categoria", sem perder nenhum dado (mensagens, configurações do canal em si continuam intactas).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Já fechado antes desta etapa.
**MODAL**: O `window.confirm()` nativo é o único "modal" desta ação.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Categoria excluída; canais preservados, sem categoria.
**EFEITO LOCAL**: Estado local atualizado otimisticamente: `setCategories` remove, `setTextChannels`/`setRooms` fazem `categoryId: null` nos canais afetados — **tudo isso acontece antes mesmo de esperar a resposta do backend** (otimista).
**EFEITO REMOTO**: `CATEGORY_DELETE` via WebSocket, outros membros veem em tempo real.
**REALTIME**: `CATEGORY_DELETE`.
**BACKEND**: `DELETE /api/servers/:serverId/categories/:categoryId` — a função `deleteCategory` no backend "uncategoriza" os canais em vez de apagá-los (confirmado em `apps/api/src/categories.ts`, documentado desde a implementação original desta feature em sessão anterior).
**BANCO**: Remove a linha de `categories`; faz `UPDATE` em `text_channels`/`voice_channels` pra `category_id = NULL`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Não aplicável.
**ERRO**: `catch { /* Falha silenciosa: WS/refresh seguinte reconcilia o estado real. */ }` — **achado real**: se a chamada falhar (rede caiu, 403 inesperado, etc.), **o usuário não vê nenhum erro** — o comentário no próprio código confirma que essa é uma escolha deliberada ("falha silenciosa"), contando com o próximo refresh/evento de WebSocket pra reconciliar qualquer inconsistência, em vez de mostrar uma mensagem de erro explícita.
**CANCELAMENTO**: Clicar "Cancelar" no `window.confirm()` nativo.
**REVERSÃO**: **`MISSING`** — não existe "desfazer exclusão de categoria" (a categoria em si não pode ser recriada com o mesmo id; só recriar uma nova com o mesmo nome e mover os canais de volta manualmente).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: É a própria ficha.
**ACESSIBILIDADE**: O `window.confirm()` nativo herda acessibilidade do sistema operacional/navegador (focável, navegável por teclado, anunciado por leitor de tela) — mais acessível "de graça" que um modal customizado mal feito, mas menos consistente visualmente com o resto do app.

---

## 3.8 — CATEGORY_STAFF_ONLY_VISIBILITY

**ID**: `CATEGORY_STAFF_ONLY_VISIBILITY`
**NOME**: Mecanismo de visibilidade restrita à staff de uma categoria
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Não é uma interação de clique único — é um estado persistente da categoria (`staffOnly: boolean`), definido em `CATEGORY_CREATE`/`CATEGORY_EDIT`, com efeito contínuo sobre quem vê a categoria e os canais dentro dela.
**POSIÇÃO NA INTERFACE**: Cadeado (`🔒`, emoji literal, não um ícone SVG customizado — confirmado no código: `<span className="category-lock" aria-hidden="true">🔒</span>`) ao lado do nome da categoria, visível só pra quem já pode ver a categoria (obviamente — quem não pode nem sabe que ela existe).
**APARÊNCIA**: Emoji de cadeado antes do nome da categoria.
**ESTADO NORMAL**: Presente quando `staffOnly === true`.
**HOVER**: Não confirmado se o cadeado tem tooltip próprio explicando o que significa (`aria-hidden="true"` sugere que é puramente decorativo pra quem já vê, sem anunciação própria pra leitor de tela — o contexto teria que vir de outro lugar).
**ACTIVE/PRESSED**: Não aplicável (não é clicável).
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Não é uma interação — é um estado.
**PRÉ-CONDIÇÕES**: Não aplicável.
**RESULTADO IMEDIATO**: No backend, `isStaffTier()` (reaproveitando o bitfield de cargos já existente, **sem criar um segundo sistema de permissão por canal** — decisão arquitetural deliberada e documentada desde a implementação original: "reaproveita o bitfield de cargos existente em vez de um segundo sistema de visibilidade por canal") decide se o usuário atual tem "qualquer permissão além do `@everyone` padrão" — se sim, é tratado como staff e vê a categoria; se não, a categoria inteira (e todos os canais dentro dela) é **omitida da resposta da API**, não só escondida visualmente no cliente (`filterChannelsByCategoryAccess`/`visibleCategories`, `apps/api/src/index.ts`) — **enforcement real no backend, não confiança cega no cliente**.
**RESULTADO VISUAL**: Membros comuns nunca veem a categoria nem os canais dentro dela em lugar nenhum da UI — não é um cadeado "visível mas bloqueado" tipo Discord real (que mostra canais restritos acinzentados pra quem não tem acesso); aqui é **invisibilidade total**.
**RESULTADO SONORO**: Não aplicável.
**ANIMAÇÃO**: Não aplicável.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Se um canal for movido pra dentro/fora de uma categoria `staffOnly`, ver `CHANNEL_MOVE_VISIBILITY_CONFIRM` (ficha adiante) — só nesse caso específico o app pede confirmação extra, porque a ação tem uma consequência de visibilidade não-óbvia.
**RESULTADO FINAL**: Modelo de visibilidade binário — visível pra staff (qualquer permissão extra) ou invisível pra todo o resto, sem granularidade de "esta categoria só pro cargo X especificamente" (isso exigiria o sistema de overwrite por canal/categoria que o app deliberadamente não tem, ver `DISCORD_PARITY_PLAN.md` §1 e §15).
**EFEITO LOCAL**: Determina o que a lista de canais local sequer recebe da API.
**EFEITO REMOTO**: Se um admin muda o cargo de um usuário (dando ou tirando uma permissão), a visibilidade dessas categorias muda instantaneamente pra esse usuário no próximo fetch/evento — **sem precisar de nenhum código específico de categoria pra isso acontecer**, já que é só o mesmo bitfield sendo reavaliado.
**REALTIME**: Mudança de cargo do próprio usuário (`MEMBER_ROLES_UPDATE`) já dispara resincronização (confirmado em `useActiveServerMember`, Roteiro 1) — mas **não confirmado nesta passagem** se isso também dispara um refetch específico da lista de canais/categorias (só do `member` em si) — possível lacuna: um usuário promovido a staff *ao vivo* pode não ver a categoria nova aparecer até um F5/reconexão, mesmo que seu cargo já tenha atualizado. Marcado como achado a confirmar em auditoria futura mais profunda.
**BACKEND**: Filtro aplicado em toda rota que lista canais/categorias.
**BANCO**: Coluna `categories.staff_only`.
**REFRESH**: Reavaliado a cada fetch.
**RECONEXÃO**: Reavaliado a cada reconexão.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Editar a categoria e desmarcar o toggle.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-hidden="true"` no emoji de cadeado — **achado**: como é puramente decorativo pra leitor de tela, um usuário cego navegando por teclado não teria nenhuma pista sonora de que aquela categoria é restrita, a menos que o nome da categoria em si já deixe isso claro por convenção (ex.: "🔒 Staff").

---

## 3.9 — CHANNEL_CREATE_FROM_CATEGORY

**ID**: `CHANNEL_CREATE_FROM_CATEGORY`
**NOME**: Criar um canal (texto ou voz) dentro de uma categoria específica
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Categoria > botão "+" no cabeçalho da categoria` (ou, pra canal sem categoria, o mesmo botão "+" na zona "sem categoria"/rótulos "CANAIS DE TEXTO"/"CANAIS DE VOZ" quando nenhuma categoria real existe ainda).
**POSIÇÃO NA INTERFACE**: `.category-header-actions`, ao lado do toggle de recolher.
**APARÊNCIA**: Ícone "+" pequeno, um botão unificado por categoria (não dois botões separados pra texto/voz — o tipo é escolhido *dentro* do modal, ver `CHANNEL_TYPE_SELECT`).
**ESTADO NORMAL**: Visível só pra quem tem `canManageChannels`.
**HOVER**: Padrão de botão de ação pequeno.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca desabilitado (sempre visível quando tem permissão).
**LOADING**: Não aplicável ao botão em si.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: `canManageChannels`.
**RESULTADO IMEDIATO**: `openCreateChannel('text', category, event.currentTarget)` — abre `CreateTextChannelDialog` com `initialType: 'text'` e a categoria já pré-selecionada como destino (`createChannelTargetCategoryRef`).
**RESULTADO VISUAL**: Modal abre mostrando "em {🔒 se staffOnly}**{Nome da categoria}**" no subtítulo, confirmando visualmente o destino antes mesmo de preencher o nome.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: `CreateTextChannelDialog` (documentada em detalhe na ficha seguinte).
**SEGUNDA ETAPA**: Ver `CHANNEL_TYPE_SELECT` e criação em si.
**RESULTADO FINAL**: Canal novo já nasce dentro da categoria certa — depois de criado, um `PATCH` de acompanhamento aplica `categoryId` (confirmado em `Workspace.tsx`: `handleTextChannelCreated`/`handleVoiceChannelCreated` "aplicam `createChannelTargetCategoryRef` via uma PATCH de acompanhamento" — ou seja, **são duas chamadas de rede em sequência** — criar, depois mover pra categoria — não uma única chamada atômica "criar já dentro da categoria X").
**EFEITO LOCAL**: Canal aparece na categoria certa assim que as duas chamadas resolvem.
**EFEITO REMOTO**: `TEXT_CHANNEL_CREATE`/`VOICE_CHANNEL_CREATE` e depois `TEXT_CHANNEL_UPDATE`/`VOICE_CHANNEL_UPDATE` (dois eventos, refletindo as duas chamadas) — **achado**: outros membros conectados podem ver, por uma fração de segundo, o canal aparecer fora de categoria antes de "pular" pra dentro dela, já que são dois eventos WebSocket separados em sequência, não um só.
**REALTIME**: Dois eventos, conforme acima.
**BACKEND**: `POST /api/servers/:id/text-channels` (ou `/voice-channels`) seguido de `PATCH .../settings` com `categoryId`.
**BANCO**: Insere o canal, depois `UPDATE category_id`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Não aplicável.
**ERRO**: Se a criação inicial falhar, o modal mostra o erro normalmente (ver ficha seguinte); **se especificamente o segundo passo (mover pra categoria) falhar depois da criação já ter sucedido, não há tratamento de erro visível confirmado nesta auditoria** — o canal simplesmente ficaria criado fora da categoria pretendida, sem aviso.
**CANCELAMENTO**: Fechar o modal antes de submeter.
**REVERSÃO**: Mover o canal manualmente depois (drag ou menu de contexto).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável a este botão.
**ACESSIBILIDADE**: Botão com título/label a confirmar (padrão de botão de ícone pequeno já visto em outras fichas).

---

## 3.10 — CHANNEL_TYPE_SELECT

**ID**: `CHANNEL_TYPE_SELECT`
**NOME**: Escolher Texto ou Voz ao criar um canal
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `CreateTextChannelDialog > "Tipo de canal" > dois cartões (Texto/Voz)`
**POSIÇÃO NA INTERFACE**: Logo abaixo do cabeçalho do modal, antes do campo de nome.
**APARÊNCIA**: Dois cartões (`.channel-type-card`) lado a lado (grid de 2 colunas — **achado histórico**: nesta mesma linha de trabalho, esta grade já teve um terceiro cartão "Fórum" removido por decisão explícita do usuário, que só quis Texto/Voz por enquanto). Cada cartão: ícone (`MessageIcon`/`VoiceIcon`, 21px), título em negrito, descrição pequena, e um "✓" que aparece só no cartão selecionado.
**ESTADO NORMAL**: O tipo vem de `initialType` (herdado de qual botão "+" foi clicado — texto ou voz), já vindo pré-selecionado.
**HOVER**: Estilo de cartão clicável (`.channel-type-card:hover`).
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `selected` + ícone "✓" visível no cartão ativo.
**DISABLED**: Nunca desabilitado — **os dois tipos são sempre trocáveis livremente dentro do modal**, mesmo que o usuário tenha chegado ali clicando especificamente no "+" de voz (é só um valor inicial, não uma restrição).
**LOADING**: Não aplicável.
**TRIGGER**: Clique em qualquer um dos dois cartões.
**PRÉ-CONDIÇÕES**: Modal aberto.
**RESULTADO IMEDIATO**: `setChannelType('text' | 'voice')`.
**RESULTADO VISUAL**: Cartão clicado ganha destaque; o campo de nome logo abaixo muda o ícone prefixado (`#` para texto, ícone de voz para canal de voz) instantaneamente, refletindo a escolha em tempo real antes mesmo de submeter.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada (provavelmente só troca de classe CSS, sem transição elaborada).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É o próprio modal.
**SEGUNDA ETAPA**: Preencher nome/descrição e submeter.
**RESULTADO FINAL**: `channelType` decide qual endpoint é chamado no submit (`api.createTextChannel` vs `api.createVoiceChannel`).
**EFEITO LOCAL**: Nenhum efeito colateral além da própria seleção.
**EFEITO REMOTO**: Nenhum até submeter.
**REALTIME**: Não aplicável a esta etapa.
**BACKEND**: Nenhuma chamada por clique no cartão (só no submit final).
**BANCO**: Não aplicável a esta etapa.
**REFRESH**: Reseta pra `initialType` toda vez que o modal reabre (`useEffect` que roda em `[open, initialType]`).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável a esta etapa.
**CANCELAMENTO**: Escolher o outro cartão substitui a escolha.
**REVERSÃO**: Clicar no outro cartão.
**ATALHO**: Nenhuma navegação por seta confirmada entre os dois cartões (não é um `radiogroup` ARIA formal — `aria-label="Tipo de canal"` está no container, mas os cartões são `<button>` normais, não `role="radio"`).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Tipo de canal"` no grid; cada cartão é um `<button>` alcançável via Tab — **achado**: não usa o padrão `role="radiogroup"`/`role="radio"` que o seletor de cor de perfil (Roteiro 1) já usa, então a semântica ARIA é mais fraca aqui (um leitor de tela não anuncia "1 de 2, selecionado" automaticamente, só o texto visível do botão).

**Nota de auditoria histórica**: esta é a mesma tela que, antes de uma correção nesta linha de trabalho, tinha um bug real onde clicar em "Voz" não fazia nada — sempre criava canal de texto independente da escolha. Já corrigido e testado; documentado aqui como `CORE`/funcional, não como pendência.

---

## 3.11 — CHANNEL_DRAG_MOVE

**ID**: `CHANNEL_DRAG_MOVE`
**NOME**: Arrastar um canal para outra categoria
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB` (drag-and-drop nativo HTML5 — **não funciona em touch/mobile**, já que a API `dataTransfer`/`draggable` não tem equivalente touch nativo sem polyfill, e nenhum polyfill foi encontrado nesta auditoria)
**CAMINHO EXATO**: `Sidebar de canais > linha de um canal de texto ou voz > arrastar para o cabeçalho/corpo de outra categoria (ou pra "sem categoria")`
**POSIÇÃO NA INTERFACE**: Toda a linha do canal é arrastável (`draggable={canManageChannels}`), todo o corpo de cada categoria (incluindo a zona "sem categoria") é uma área de soltar válida.
**APARÊNCIA**: Durante o arraste: cursor nativo de "movendo" do SO; categoria sob o cursor ganha classe `drag-over` (destaque visual de alvo válido) — **fantasma de arraste (ghost image) é o padrão do navegador**, sem uma prévia customizada desenhada em canvas (diferente do Discord real, que também usa o padrão do navegador nesse caso, então não é uma lacuna de paridade real).
**ESTADO NORMAL**: Canais e categorias em repouso, sem destaque.
**HOVER (durante o drag)**: Categoria sob o cursor recebe `.drag-over` — feedback visual claro de "aqui é um alvo válido".
**ACTIVE/PRESSED**: O clique inicial que começa o arraste.
**SELECTED**: Não aplicável.
**DISABLED**: `draggable={canManageChannels}` — **quem não tem permissão de gerenciar canais nem consegue começar a arrastar** (o atributo `draggable` fica `false`, então o navegador nem inicia o gesto).
**LOADING**: Não aplicável durante o arraste em si (a chamada de API só acontece depois de soltar).
**TRIGGER**: `dragstart` (clique e mover o mouse) → `dragover` (contínuo enquanto sobre um alvo) → `drop` (soltar).
**PRÉ-CONDIÇÕES**: `canManageChannels`; o canal precisa estar numa categoria diferente da de destino (`if (dragged.currentCategoryId === targetCategoryId) return;` — soltar na própria categoria atual não faz nada, nem dispara chamada nenhuma).
**RESULTADO IMEDIATO**: No `dragstart`, os dados do canal (`kind`, `channelId`, `channelLabel`, `currentCategoryId`) são serializados em JSON e colocados no `dataTransfer` com um MIME type próprio (`application/x-nexplay-channel`) — **escopado especificamente pro NexPlay**, então arrastar algo de fora do app (um arquivo, texto de outra janela) nunca é aceito como drop válido aqui (`event.dataTransfer.types.includes(DRAG_MIME)` filtra isso no `dragover`).
**RESULTADO VISUAL**: Categoria(s) sob o cursor destacam durante o arraste; ao soltar, se a mudança de visibilidade for relevante, abre `CHANNEL_MOVE_VISIBILITY_CONFIRM` (ficha adiante); senão, aplica direto.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma além do padrão nativo do navegador para o próprio gesto de arrastar.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Condicional — ver `CHANNEL_MOVE_VISIBILITY_CONFIRM`.
**SEGUNDA ETAPA**: `applyChannelMove` (chamada direta se não precisar confirmação, ou depois de confirmar).
**RESULTADO FINAL**: Canal passa a pertencer à nova categoria.
**EFEITO LOCAL**: Estado local atualizado com a resposta da API (não é totalmente otimista — espera a resposta do `PATCH` antes de mover visualmente, confirmado lendo `applyChannelMove`).
**EFEITO REMOTO**: `TEXT_CHANNEL_UPDATE`/`VOICE_CHANNEL_UPDATE` via WebSocket.
**REALTIME**: Conforme acima.
**BACKEND**: `PATCH .../text-channels/:id/settings` ou `.../voice-channels/:id/settings` com `{ categoryId }`.
**BANCO**: `UPDATE category_id`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Não aplicável.
**ERRO**: `setMoveError(err.message)` — exibido dentro do diálogo de confirmação se essa etapa estiver envolvida; **se não precisar de confirmação (movimento direto sem mudança de visibilidade) e a chamada falhar, o erro não tem um lugar visível pra aparecer** (não há um toast/notificação global confirmado nesta auditoria) — achado a verificar em auditoria futura mais ampla do padrão de erro do app.
**CANCELAMENTO**: Soltar fora de qualquer área válida (ex.: em outra parte da tela) — o navegador cancela o `drop` nativamente, nenhuma mudança acontece.
**REVERSÃO**: Arrastar de volta pra categoria original.
**ATALHO**: **`MISSING`**: nenhuma forma de reordenar/mover canais só com teclado (sem mouse) — quem não consegue usar drag-and-drop (ex.: por limitação motora) depende inteiramente do `CHANNEL_MOVE_VIA_CONTEXT_MENU` como alternativa (ver ficha seguinte) — **que felizmente já existe** como caminho 100% funcional sem precisar de drag.
**MENU DE CONTEXTO**: Ver ficha seguinte — a alternativa sem drag.
**ACESSIBILIDADE**: Drag-and-drop nativo do HTML5 é notoriamente pouco acessível por padrão (sem anúncio de leitor de tela do que está sendo arrastado nem de alvos válidos) — o app **mitiga isso oferecendo `CHANNEL_MOVE_VIA_CONTEXT_MENU` como alternativa funcionalmente equivalente**, o que é a abordagem correta em vez de depender só do drag.

---

## 3.12 — CHANNEL_MOVE_VIA_CONTEXT_MENU

**ID**: `CHANNEL_MOVE_VIA_CONTEXT_MENU`
**NOME**: Mover um canal de categoria sem arrastar (botão direito > "Mover para")
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Sidebar de canais > linha de um canal > botão direito`
**POSIÇÃO NA INTERFACE**: Menu de contexto (`ContextMenu.tsx` genérico), aberto nas coordenadas do clique.
**APARÊNCIA**: Cabeçalho fixo "Mover para" (item desabilitado, só um rótulo — `disabled: true`), seguido de uma lista: "Sem categoria" + uma entrada por categoria existente no servidor, cada uma com checkbox marcando a categoria atual do canal.
**ESTADO NORMAL**: Fechado.
**HOVER**: Padrão de itens de menu.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: A categoria atual do canal aparece marcada (`checked: currentCategoryId === category.id`).
**DISABLED**: O menu inteiro só abre (`openMoveChannelMenu` retorna cedo) se `canManageChannels` — sem permissão, o botão direito num canal **não abre nada** (comportamento a diferenciar de simplesmente "menu vazio": literalmente nenhum menu aparece).
**LOADING**: Não aplicável ao menu.
**TRIGGER**: Clique com o botão direito na linha do canal (texto ou voz).
**PRÉ-CONDIÇÕES**: `canManageChannels`.
**RESULTADO IMEDIATO**: Menu abre com a lista de categorias de destino possíveis.
**RESULTADO VISUAL**: Overlay com as opções.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Padrão genérico do `ContextMenu.tsx`.
**POPOVER**: É o próprio popover.
**MENU**: É o próprio menu.
**MODAL**: Não é modal.
**SEGUNDA ETAPA**: Clicar numa categoria da lista chama `requestMoveChannel` — **mesmíssima função usada pelo drag-and-drop**, então o comportamento de confirmação condicional (`CHANNEL_MOVE_VISIBILITY_CONFIRM`) se aplica igual aqui, é o mesmo caminho de código, só o gatilho inicial é diferente (clique de menu em vez de soltar um drag).
**RESULTADO FINAL**: Idêntico a `CHANNEL_DRAG_MOVE` a partir deste ponto.
**EFEITO LOCAL**: Idêntico.
**EFEITO REMOTO**: Idêntico.
**REALTIME**: Idêntico.
**BACKEND**: Idêntico.
**BANCO**: Idêntico.
**REFRESH**: Idêntico.
**RECONEXÃO**: Idêntico.
**ERRO**: Idêntico.
**CANCELAMENTO**: Clicar fora do menu, ou Esc.
**REVERSÃO**: Abrir o menu de novo e escolher a categoria anterior.
**ATALHO**: Nenhum atalho pra abrir via teclado (só botão direito).
**MENU DE CONTEXTO**: É a própria ficha.
**ACESSIBILIDADE**: Melhor que o drag puro (navegável via teclado depois de aberto, presumindo que o `ContextMenu.tsx` genérico suporte seta+Enter — a confirmar em auditoria futura dedicada a esse componente).

**Nota de auditoria**: este menu **não tem nenhuma outra ação além de mover** — sem "Editar canal"/"Excluir canal"/"Duplicar canal"/"Criar convite"/"Copiar ID" aqui (essas ações moram dentro do modal de configurações do canal, atrás do ícone de engrenagem — ver `TEXT_CHANNEL_SETTINGS_OPEN`/`CHANNEL_RENAME`/`CHANNEL_DELETE` adiante). Isso é uma divisão de responsabilidade válida, mas distinta do Discord real, que costuma ter essas ações também disponíveis direto no menu de contexto do canal, sem precisar abrir configurações completas.

---

## 3.13 — CHANNEL_MOVE_VISIBILITY_CONFIRM

**ID**: `CHANNEL_MOVE_VISIBILITY_CONFIRM`
**NOME**: Confirmação ao mover canal quando a visibilidade muda
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Disparado por `CHANNEL_DRAG_MOVE` ou `CHANNEL_MOVE_VIA_CONTEXT_MENU`, só quando `categoryStaffOnly(origem) !== categoryStaffOnly(destino)`.
**POSIÇÃO NA INTERFACE**: `.dialog-overlay` > `.channel-dialog.move-channel-confirm`, centralizado.
**APARÊNCIA**: Título "Mover canal?", corpo explicando o efeito exato (texto muda conforme a direção: entrando numa categoria staff-only vs. saindo de uma), botões "Cancelar" e "Mover canal" (`.danger-button`, mesmo tratamento visual de outras ações que mudam algo relevante, mesmo não sendo tecnicamente "destrutivo" no sentido de apagar dado).
**ESTADO NORMAL**: Fechado — só existe quando `moveConfirm !== null`.
**HOVER**: Padrão de botões de diálogo.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável (sempre os dois botões disponíveis).
**LOADING**: Não confirmado se o botão "Mover canal" mostra estado de carregamento durante a chamada (a confirmar em auditoria futura mais detalhada deste componente específico).
**TRIGGER**: Automático, condicional (ver `CAMINHO EXATO`) — **não é algo que o usuário aciona diretamente, é uma consequência de outra ação**.
**PRÉ-CONDIÇÕES**: A mudança de categoria precisa alterar `staffOnly` de fato.
**RESULTADO IMEDIATO**: Diálogo aparece com o texto exato da mudança de visibilidade: "Ao mover **{canal}** para 🔒 **{categoria}**, ele passa a ficar visível só pra membros com algum cargo de staff." (entrando) ou "...ele deixa de ser restrito e passa a ficar visível pra todo mundo." (saindo) — seguido de uma nota fixa explicando a arquitetura: "A visibilidade neste app é sempre herdada da categoria — não existe permissão própria de canal." (**transparência deliberada sobre a limitação arquitetural, direto na UI**, não escondida).
**RESULTADO VISUAL**: Overlay bloqueando o resto da tela até decidir.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É o próprio modal.
**SEGUNDA ETAPA**: Confirmar ou cancelar.
**RESULTADO FINAL — confirmar**: `applyChannelMove` executa, modal fecha.
**RESULTADO FINAL — cancelar**: `setMoveConfirm(null)`, nenhuma mudança acontece — canal permanece na categoria original (mesmo que já tenha sido "solto" visualmente durante um drag).
**EFEITO LOCAL**: Só se confirmado.
**EFEITO REMOTO**: Só se confirmado.
**REALTIME**: Só se confirmado.
**BACKEND**: Só se confirmado.
**BANCO**: Só se confirmado.
**REFRESH**: Não aplicável ao diálogo em si.
**RECONEXÃO**: Não aplicável.
**ERRO**: `moveError` exibido dentro do próprio diálogo (`<p className="form-error" role="alert">`) se a chamada falhar depois de confirmado — diálogo **permanece aberto** nesse caso (não fecha e perde o contexto do erro).
**CANCELAMENTO**: Botão "Cancelar", X, ou clicar fora do overlay.
**REVERSÃO**: Não aplicável (cancelar já é a reversão).
**ATALHO**: Não confirmado se Esc fecha este diálogo especificamente (padrão visto em outros diálogos do app sugere que sim, mas não verificado diretamente no código deste componente nesta passagem).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="dialog"`, `aria-modal="true"`.

**Nota de auditoria**: este é um exemplo de UX bem pensada — a confirmação só aparece quando é **realmente relevante** (mudança de visibilidade), não em todo movimento de canal, evitando fadiga de confirmação desnecessária. Documentado como `CORE`, não uma lacuna.

---

## 3.14 — TEXT_CHANNEL_SELECT

**ID**: `TEXT_CHANNEL_SELECT`
**NOME**: Selecionar manualmente um canal de texto na lista
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Sidebar de canais > qualquer canal de texto listado`
**POSIÇÃO NA INTERFACE**: `.text-channel-button`, dentro de `.text-channel-row`.
**APARÊNCIA**: `#` (`.channel-hash`) + nome do canal.
**ESTADO NORMAL**: Sem destaque.
**HOVER**: Estilo de hover padrão de item de lista clicável.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `active` + `aria-current="page"` no canal atualmente selecionado.
**DISABLED**: Nunca desabilitado — **qualquer membro que consegue ver o canal (ver `CATEGORY_STAFF_ONLY_VISIBILITY`) pode selecioná-lo**, mesmo sem permissão de enviar mensagem (a restrição de envio, se existisse, seria aplicada no composer, não na seleção — auditoria de mensagens/composer ainda pendente, Roteiro 4).
**LOADING**: Não confirmado se há algum indicador de "carregando histórico" no próprio botão ou só no painel central (a confirmar em auditoria futura do Roteiro 4 — Mensagens).
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Canal visível para o usuário.
**RESULTADO IMEDIATO**: `setSelectedTextChannelId(channel.id)`.
**RESULTADO VISUAL**: Painel central troca para o histórico do canal escolhido.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma transição confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Histórico carrega, composer fica disponível (Roteiro 4/5).
**RESULTADO FINAL**: Canal ativo trocado.
**EFEITO LOCAL**: Dispara o fetch de mensagens daquele canal (auditoria detalhada em Roteiro 4).
**EFEITO REMOTO**: Nenhum — outros usuários não são notificados de que alguém está "olhando" um canal específico (sem indicador de presença por canal).
**REALTIME**: Assinatura de eventos daquele canal específico passa a ser relevante pro componente de mensagens montado.
**BACKEND**: `GET` do histórico de mensagens daquele canal (Roteiro 4).
**BANCO**: Não aplicável a esta ficha (só leitura).
**REFRESH**: **Não persiste** (mesma lacuna já documentada em `CHANNEL_LIST_DEFAULT_SELECT`, Roteiro 2 — F5 sempre volta pro primeiro canal do servidor).
**RECONEXÃO**: Se o canal selecionado for excluído enquanto o usuário está nele, cai pro primeiro disponível (mesmo mecanismo de fallback já documentado).
**ERRO**: Não aplicável à seleção em si.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar em outro canal.
**ATALHO**: **`MISSING`**: sem `Alt+Seta`/`Ctrl+Seta` pra navegar entre canais só com teclado (mesma lacuna categórica de `KEYBOARD_SERVER_NAVIGATION`, Roteiro 2).
**MENU DE CONTEXTO**: Ver `CHANNEL_MOVE_VIA_CONTEXT_MENU` (é o mesmo botão direito).
**ACESSIBILIDADE**: `aria-current="page"` no selecionado, `title={channel.description}` (tooltip nativo mostrando a descrição do canal no hover — um uso funcional do `title`, diferente do tooltip meramente redundante já documentado na rail de servidores).

---

## 3.15 — TEXT_CHANNEL_SETTINGS_OPEN

**ID**: `TEXT_CHANNEL_SETTINGS_OPEN`
**NOME**: Abrir configurações de um canal de texto
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Sidebar de canais > linha do canal de texto > ícone de engrenagem` (renderizado pelo próprio `TextChannelSettingsModal`, visível só se `canManageChannels`)
**POSIÇÃO NA INTERFACE**: Extremidade direita da linha do canal, aparece ao lado do nome.
**APARÊNCIA**: Ícone de engrenagem pequeno (a confirmar se aparece sempre ou só no hover da linha — comportamento de "aparece só ao passar o mouse" é comum nesse tipo de UI mas não confirmado explicitamente lendo só a estrutura JSX nesta passagem).
**ESTADO NORMAL**: Presente só para quem tem `canManageChannels` — **membros comuns não veem o ícone em lugar nenhum**, não é "visível mas desabilitado".
**HOVER**: Padrão de ícone de ação pequeno.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável (ausência condicional, não desabilitação visível).
**LOADING**: Não aplicável ao botão.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: `canManageChannels`.
**RESULTADO IMEDIATO**: `TextChannelSettingsModal` abre.
**RESULTADO VISUAL**: Modal com abas — já auditadas informalmente em sessão anterior desta linha de trabalho: Geral (nome/tópico/descrição/modo lento/anúncio), Visibilidade, Convites (`InvitesPane` real, reaproveitado das Configurações do Servidor — não um stub), Permissões (stub deliberado, sem overwrite por canal neste app).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É o próprio modal.
**SEGUNDA ETAPA**: Editar e salvar (ver `CHANNEL_RENAME`/outras configurações — auditoria detalhada de cada aba fica para uma passagem futura dedicada especificamente a configurações de canal, pra não inflar demais este roteiro já extenso).
**RESULTADO FINAL**: Configurações do canal abertas e editáveis.
**EFEITO LOCAL**: Nenhuma chamada nova ao abrir (dados já vêm via prop `channel`).
**EFEITO REMOTO**: Nenhum ao só abrir.
**REALTIME**: Não aplicável ao abrir.
**BACKEND**: Nenhuma chamada ao abrir (só ao salvar cada aba).
**BANCO**: Não aplicável ao abrir.
**REFRESH**: Fecha em F5.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável a esta etapa.
**CANCELAMENTO**: Fechar sem salvar.
**REVERSÃO**: Reabrir e corrigir.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável a este ícone.
**ACESSIBILIDADE**: A confirmar label exato do botão (não lido em detalhe nesta passagem específica — o componente inteiro já existe e foi testado em sessão anterior, mas o `aria-label` exato do botão de abrir não foi reconferido agora).

**Nota de auditoria**: `VOICE_CHANNEL_SETTINGS_OPEN` segue exatamente o mesmo padrão (`VoiceChannelSettingsModal`, mesma condição de permissão, mesmo ícone), só que com abas relevantes a canal de voz (bitrate, qualidade de vídeo, limite de usuários) em vez de tópico/modo lento — não repetido aqui como ficha separada pra não duplicar uma estrutura idêntica, mas é igualmente `CORE`/funcional.

---

## 3.16 — CHANNEL_RENAME

**ID**: `CHANNEL_RENAME`
**NOME**: Renomear um canal existente
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `TextChannelSettingsModal/VoiceChannelSettingsModal > aba Geral > campo de nome`
**POSIÇÃO NA INTERFACE**: Dentro da aba padrão do modal de configurações.
**APARÊNCIA**: Campo de texto simples, pré-preenchido com o nome atual.
**ESTADO NORMAL**: Nome atual visível.
**HOVER**: Padrão de campo de input.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Editável só por quem já abriu o modal (`canManageChannels`, checado na própria visibilidade do modal).
**LOADING**: Botão salvar mostra estado de carregamento (padrão já confirmado em outros formulários desta auditoria).
**TRIGGER**: Digitar novo valor + salvar.
**PRÉ-CONDIÇÕES**: `MANAGE_CHANNELS`.
**RESULTADO IMEDIATO**: `PATCH` de rename.
**RESULTADO VISUAL**: Nome atualizado na sidebar assim que salvo.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: É o mesmo modal de configurações.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Canal com novo nome — **id, descrição e data de criação preservados** (confirmado por teste automatizado real já existente no backend, `channelRename.test.ts`, cobrindo especificamente essa imutabilidade).
**EFEITO LOCAL**: Estado local atualizado via `onUpdated`.
**EFEITO REMOTO**: `TEXT_CHANNEL_UPDATE`/`VOICE_CHANNEL_UPDATE` — outros membros veem o novo nome sem F5 (confirmado, essa é a motivação original documentada desses dois eventos quando foram criados).
**REALTIME**: Conforme acima.
**BACKEND**: Checagem real de nome duplicado por servidor (retorna `409` se já existir outro canal com esse nome no mesmo servidor).
**BANCO**: `UPDATE` no nome.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Não aplicável.
**ERRO**: `401` sem sessão, `403` sem permissão, `404` servidor errado, `400` nome vazio, `409` nome duplicado — **todos os cinco casos já cobertos por teste automatizado real**, confirmado como parte da suíte que passa antes de qualquer commit nesta linha de trabalho.
**CANCELAMENTO**: Fechar sem salvar.
**REVERSÃO**: Renomear de volta manualmente (sem histórico de nomes anteriores).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável (rename só existe dentro do modal, não como "renomear rápido" via duplo clique ou F2 no nome do canal na sidebar — `MISSING` esse atalho mais rápido, se o Discord real tiver algo assim; a confirmar).
**ACESSIBILIDADE**: Label associado ao campo.

---

## 3.17 — CHANNEL_DELETE

**ID**: `CHANNEL_DELETE`
**NOME**: Excluir um canal de texto
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `TextChannelSettingsModal > (aba a confirmar, provavelmente Geral ou uma zona de perigo dedicada) > "Excluir canal"`
**POSIÇÃO NA INTERFACE**: Dentro do modal de configurações do canal.
**APARÊNCIA**: Botão de perigo (`.danger-button` ou equivalente).
**ESTADO NORMAL**: Visível só a quem tem permissão.
**HOVER**: Padrão de botão de perigo.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente pra quem não tem `MANAGE_CHANNELS` (mesma condicional do modal inteiro).
**LOADING**: A confirmar texto exato de carregamento.
**TRIGGER**: Clique, presumivelmente com alguma confirmação (a confirmar se usa `window.confirm()` nativo, como `CATEGORY_DELETE`, ou um passo próprio — não lido em detalhe nesta passagem específica do modal de canal).
**PRÉ-CONDIÇÕES**: `MANAGE_CHANNELS`.
**RESULTADO IMEDIATO**: `deleteTextChannel` no backend (confirmado existir em `apps/api/src/textChannels.ts`, já mencionado em auditorias anteriores desta linha de trabalho).
**RESULTADO VISUAL**: Canal some da sidebar; se era o canal selecionado no momento, o app recua pra outro (mesmo padrão de fallback já documentado, `CHANNEL_LIST_DEFAULT_SELECT`).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: O próprio modal fecha ao concluir.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL — IRREVERSÍVEL**: Canal e **todas as suas mensagens são apagados em cascata** (`ON DELETE CASCADE` de `text_messages.channel_id`, confirmado no schema) — diferente de excluir categoria, que preserva os canais; aqui, excluir o canal apaga o conteúdo dele de vez, sem recuperação.
**EFEITO LOCAL**: `onDeleted()` remove do estado local.
**EFEITO REMOTO**: Evento de tempo real correspondente (`TEXT_CHANNEL_DELETE`, confirmado existir no union de tipos do WebSocket, `packages/shared/src/index.ts`) — outros membros no canal excluído são realocados automaticamente (mesmo mecanismo de fallback).
**REALTIME**: `TEXT_CHANNEL_DELETE`.
**BACKEND**: `DELETE /api/servers/:id/text-channels/:channelId` (nome exato a confirmar).
**BANCO**: `DELETE` em cascata (mensagens, reações, anexos, pins — tudo que referencia aquele canal).
**REFRESH**: Não aplicável (já apagado).
**RECONEXÃO**: Não aplicável.
**ERRO**: A confirmar mensagens de erro específicas (não lidas em detalhe nesta passagem).
**CANCELAMENTO**: A confirmar exato mecanismo de confirmação usado.
**REVERSÃO**: **`MISSING` por completo** — não existe lixeira/desfazer, mensagens apagadas em cascata não são recuperáveis.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável (só dentro do modal).
**ACESSIBILIDADE**: A confirmar em auditoria futura mais detalhada deste modal específico.

**Nota de auditoria**: dado o tamanho já considerável deste roteiro, a auditoria campo-a-campo detalhada de **todas** as abas dos modais de configuração de canal (Geral completo, Visibilidade, Modo lento, Convites, Permissões-stub para texto; Bitrate/Qualidade de vídeo/Limite de usuários para voz) fica registrada como pendência específica para uma passagem futura dedicada — o que já existe e funciona está confirmado como `CORE` em `DISCORD_PARITY_PLAN.md` §4, não precisa ser redescoberto, só detalhado campo-a-campo quando a auditoria voltar a esta área com mais profundidade.

---

## 3.18 — SERVER_LEAVE *(MISSING na UI)*

**ID**: `SERVER_LEAVE`
**NOME**: Sair de um servidor (sem excluí-lo)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **Achado real — meio caminho andado**: o endpoint já existe e funciona (`DELETE /api/servers/:serverId/members/me`, confirmado em `apps/api/src/index.ts`; método de cliente já existe em `apps/web/src/api.ts`: `leaveServer: (serverId) => request<void>(...)`), mas **nenhum botão em lugar nenhum da UI chama essa função** — confirmado por busca no código inteiro de `apps/web/src`, `api.leaveServer` não aparece referenciado em nenhum componente. **A única forma de sair de um servidor hoje é um administrador remover o próprio usuário pela aba Membros, ou o usuário mexer direto no banco.**
**CAMINHO EXATO ESPERADO** (não implementado): Provavelmente dentro de `ServerSettings` (perto de `SERVER_DELETE`, já implementado) ou no `SERVER_CONTEXT_MENU` (também `MISSING`, Roteiro 2) — ambos os lugares naturais já têm a "vizinhança" certa mas não o item específico.
**Por que isso importa**: é literalmente o par oposto de `SERVER_CREATE_SUBMIT`/`SERVER_JOIN_INVITE_SUBMIT` — dá pra criar e entrar em quantos servidores quiser, mas não tem como sair de nenhum pela interface, mesmo o backend já suportando isso de forma completa e testada (o endpoint provavelmente já foi coberto por algum teste automatizado em sessão anterior, a confirmar).

---

## 3.19 — SERVER_DELETE (referência — já auditado em profundidade)

**ID**: `SERVER_DELETE`
**NOME**: Excluir um servidor permanentemente
**STATUS**: `CORE` — implementado, testado ponta a ponta (local + smoke test) e em produção nesta mesma linha de trabalho, imediatamente antes desta fase de auditoria começar. Resumo (ficha completa de 36 campos fica registrada informalmente no histórico desta sessão de trabalho, não repetida aqui por já ter sido construída e verificada nesse nível de detalhe na prática, incluindo screenshots reais confirmando cada etapa):
- **Caminho**: `Configurações do Servidor > item "Excluir servidor" (rodapé, vermelho) > só visível pro dono` (ou quem tem `MANAGE_SERVER` se o servidor estiver órfão, sem dono).
- **Confirmação**: modal dedicado exigindo digitar o **nome exato do servidor** — fricção proporcional à gravidade (mais rígido que `CATEGORY_DELETE`, que só usa `window.confirm()`; consistente com ser uma ação irreversível de maior escala).
- **Efeito**: cascata real via `ON DELETE CASCADE` (canais, categorias, mensagens, cargos, convites, membros — tudo).
- **Realtime**: `SERVER_DELETE` broadcast pra todos os membros antes da exclusão de fato acontecer (ordem necessária, já que apagar o servidor apagaria também a lista de membros a notificar).
- **Efeito local no cliente que exclui**: fecha o modal de configurações, servidor some da rail, `activeServerId` recua pro próximo disponível (mesmo mecanismo de fallback já documentado em `SERVER_SELECT`).

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência, conforme a convenção do topo deste arquivo), as **24 interações do Roteiro 0**, as **18 do Roteiro 1**, as **11 do Roteiro 2** e as **19 do Roteiro 3** — **72 fichas no total**, cada uma verificada contra o código real. Categorias, canais de texto/voz, criação/entrada em servidor, mover canal (drag e via menu), e exclusão de servidor já são funcionalidades **reais, testadas e em produção** — documentadas aqui como `CORE`, não redescobertas nem reconstruídas. As lacunas genuinamente novas encontradas neste roteiro: `SERVER_LEAVE` tem backend pronto mas nenhum botão na UI; "Marcar como lida" de categoria é um item de menu que não faz nada (porque a feature de não-lida inteira ainda não existe em lugar nenhum); excluir categoria usa `window.confirm()` nativo em vez do padrão de confirmação por nome já estabelecido para excluir servidor (inconsistência de fricção entre duas ações igualmente destrutivas); mover canal pode falhar silenciosamente sem confirmação de visibilidade envolvida.

---

# ROTEIRO 4 — MENSAGENS

Arquitetura real (verificada em `apps/web/src/components/TextChannels.tsx`, ~1265 linhas): histórico, composer, reações, edição/exclusão, reply, pins, busca, upload de anexo e markdown já são funcionalidades **reais, testadas e em produção** (auditadas informalmente em sessões anteriores desta linha de trabalho, confirmadas em `DISCORD_PARITY_PLAN.md` §8) — esta passagem documenta o que existe (`CORE`) e, principalmente, **achou lacunas reais e concretas de UX que nenhuma auditoria anterior tinha registrado explicitamente**, a mais séria sendo um scroll que puxa o usuário pra baixo à força mesmo lendo histórico antigo.

---

## 4.1 — TEXT_CHANNEL_HISTORY_LOAD

**ID**: `TEXT_CHANNEL_HISTORY_LOAD`
**NOME**: Carregar o histórico de mensagens ao abrir um canal
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `TEXT_CHANNEL_SELECT (Roteiro 3) > painel central > histórico`
**POSIÇÃO NA INTERFACE**: `.messages.text-channel-messages`, área rolável central.
**APARÊNCIA**: Lista de mensagens; sem skeleton/placeholder confirmado nesta passagem para o estado de carregamento inicial (a confirmar).
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável a esta ficha.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: `loading` state controla o `useEffect` de scroll inicial (ver `RESULTADO FINAL`) — indicador visual exato do estado de carregamento não confirmado em detalhe nesta passagem.
**TRIGGER**: Automático, ao trocar de canal (`channel.id` muda).
**PRÉ-CONDIÇÕES**: Canal selecionado e visível ao usuário.
**RESULTADO IMEDIATO**: `GET` do histórico de mensagens do canal (via `api`, endpoint exato já coberto em auditorias anteriores desta linha de trabalho — busca as mensagens mais recentes, sem paginação infinita confirmada por scroll-up nesta passagem específica, ver nota de auditoria abaixo).
**RESULTADO VISUAL**: Mensagens aparecem na ordem cronológica.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: `useEffect` separado assina eventos de tempo real (`TEXT_MESSAGE_CREATE`/`UPSERT`/`DELETE`/reações) escopados a `channel.id` (ver Roteiro 5 para a auditoria de tempo real em si).
**RESULTADO FINAL**: `useEffect([channel.id, loading])`: `if (!loading) endRef.current?.scrollIntoView({ block: 'end' })` — **sempre** pula direto pro final do histórico carregado ao entrar num canal (comportamento correto/esperado para entrada inicial, diferente do problema documentado em `MESSAGE_SCROLL_AUTOSTICK` adiante, que é sobre mensagens chegando *depois* já estando na tela).
**EFEITO LOCAL**: Estado `messages` populado.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Assinatura ativa a partir daqui.
**BACKEND**: `GET` de histórico.
**BANCO**: Leitura de `text_messages`.
**REFRESH**: Recarrega do zero (não há cache local entre sessões).
**RECONEXÃO**: Ver Roteiro 5.
**ERRO**: Não confirmado nesta passagem o comportamento exato se o fetch inicial falhar (tela vazia? mensagem de erro? — a verificar em auditoria futura).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável a esta ficha.

**Nota de auditoria — paginação**: não foi confirmado nesta passagem específica se rolar até o topo da lista carrega mensagens mais antigas automaticamente (infinite scroll pra trás, conforme `ROTEIRO 59` do pedido original: "Carregamento para cima: buscar histórico anterior. Manter posição do viewport.") — marcado como lacuna de verificação para auditoria futura mais profunda deste componente especificamente; a busca (`MESSAGE_SEARCH_RESULT_JUMP`, adiante) já confirma que mensagens fora da "janela carregada" existem e não são automaticamente buscáveis por scroll simples, o que sugere que a paginação pra trás pode não existir ou ser limitada.

---

## 4.2 — MESSAGE_SEND

**ID**: `MESSAGE_SEND`
**NOME**: Enviar uma mensagem de texto
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de texto > rodapé > composer`
**POSIÇÃO NA INTERFACE**: `.text-channel-form`, rodapé fixo do painel central.
**APARÊNCIA**: `<textarea rows={1}>` que expande conforme o texto (comportamento de auto-resize a confirmar via CSS, não lido em detalhe), botão "Enviar" à direita, contador `{draft.length}/{CHAT_MESSAGE_MAX_LENGTH}`.
**ESTADO NORMAL**: Vazio, placeholder "Conversar em #{canal}".
**HOVER**: Padrão de campo/botão.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: `textarea` desabilitada se `isTimedOut`; botão "Enviar" desabilitado se `isTimedOut || sending || uploading || (sem texto E sem anexo)`.
**LOADING**: Botão mostra "Enviando…" durante o envio.
**TRIGGER**: Enter (sem Shift) — intercepta e chama `form.requestSubmit()`; Shift+Enter insere nova linha (`textarea` normal); ou clique no botão "Enviar".
**PRÉ-CONDIÇÕES**: Não estar em timeout; texto não vazio OU pelo menos um anexo pendente.
**RESULTADO IMEDIATO**: `routeTextChannelInput` decide se é um comando de música (`/play`, `!play`, etc. — roteado pro NexMusic, Roteiro 12 do pedido original, auditoria própria pendente) ou uma mensagem normal (`api.sendTextMessage(serverId, channelId, text, replyingTo?.id, attachmentIds, postAsSystem)`).
**RESULTADO VISUAL**: Mensagem aparece no final do histórico; composer limpa (`draft` resetado, `replyingTo`/`pendingAttachments` limpos).
**RESULTADO SONORO**: Nenhum confirmado ao enviar (diferente de outras ações do app que já têm som próprio, como voz).
**ANIMAÇÃO**: Nenhuma própria além do scroll suave até o final.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: `window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }))` — sempre rola até o final (correto aqui, já que é a *própria* mensagem do usuário sendo enviada, diferente da mensagem de outra pessoa chegando enquanto se lê histórico antigo).
**RESULTADO FINAL**: Mensagem persistida, visível para todos os membros do canal em tempo real.
**EFEITO LOCAL**: `applyIncomingMessage` (dedupe contra eco de WebSocket, mesmo padrão já visto em outras partes do app auditadas nesta sessão de trabalho mais ampla).
**EFEITO REMOTO**: `TEXT_MESSAGE_CREATE` via WebSocket pra outros membros conectados.
**REALTIME**: `TEXT_MESSAGE_CREATE`.
**BACKEND**: `POST` de mensagem, sujeito a `textMessageLimiter` (rate limit — 20 mensagens por 10 segundos, confirmado em `apps/api/src/index.ts` nesta mesma linha de auditoria).
**BANCO**: Insere em `text_messages`.
**REFRESH**: A mensagem persiste normalmente (não é estado de sessão).
**RECONEXÃO**: Se enviada com o WebSocket caído, a mensagem **ainda é enviada com sucesso via HTTP normal** (o envio não depende do WebSocket estar aberto, só o *recebimento* em tempo real depende — já documentado no Roteiro 1, `REALTIME_RECONNECT`), mas o remetente não veria confirmação de que outros já a receberam ao vivo.
**ERRO**: `setError(...)` exibido — posição exata na UI não confirmada nesta passagem (a verificar se aparece perto do composer).
**CANCELAMENTO**: Apagar o texto digitado antes de enviar.
**REVERSÃO**: `MESSAGE_DELETE` depois de enviada.
**ATALHO**: Enter para enviar, Shift+Enter para nova linha (documentado acima). **`MISSING`: seta para cima (↑) com o campo vazio para editar a última mensagem própria** — recurso explicitamente esperado pelo pedido original (Roteiro 8: "Seta para cima: editar mensagem anterior quando aplicável"), confirmado ausente por busca no código (nenhum handler de `ArrowUp` no `textarea`).
**MENU DE CONTEXTO**: Menu de contexto nativo do navegador para o campo de texto (recortar/copiar/colar) — não customizado.
**ACESSIBILIDADE**: `<label className="sr-only" htmlFor="text-channel-message">` — label acessível presente mas visualmente oculto (padrão correto para um campo cujo propósito já é claro visualmente pelo placeholder/contexto).

**Nota de auditoria — autocomplete**: confirmado por ausência: **nenhum autocomplete de `@` (menções), `#` (referência a canal), `:` (atalho de emoji por nome) ou `/` (comandos slash formais)** — o único "comando" reconhecido é o roteamento de texto puro pro NexMusic (`/play`, `!play`), que não tem nenhuma UI de autocomplete/picker, é só texto interpretado depois de enviado. Todos os quatro tipos de autocomplete que o pedido original espera (Roteiro 8) estão `MISSING`.

---

## 4.3 — MESSAGE_SCROLL_AUTOSTICK *(achado — comportamento incorreto)*

**ID**: `MESSAGE_SCROLL_AUTOSTICK`
**NOME**: Scroll automático ao chegar mensagem nova de outra pessoa
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de texto > histórico > qualquer mensagem nova chegando via WebSocket enquanto o usuário está lendo`
**POSIÇÃO NA INTERFACE**: Área de histórico (`.messages`).
**APARÊNCIA**: Não aplicável (é um comportamento de scroll, não um elemento visual próprio).
**ESTADO NORMAL**: Usuário pode estar em qualquer posição de scroll do histórico (no final, ou rolado pra cima lendo mensagens antigas).
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Qualquer evento `TEXT_MESSAGE_CREATE`/`TEXT_MESSAGE_UPSERT` recebido via WebSocket para o canal atualmente aberto — **de qualquer remetente**, não só o próprio usuário.
**PRÉ-CONDIÇÕES**: Canal de texto aberto, WebSocket conectado.
**RESULTADO IMEDIATO**: `window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }))` — **incondicional**, confirmado lendo o código exato: não há nenhuma checagem de "o usuário está perto do final?" antes de decidir rolar.
**RESULTADO VISUAL — ACHADO REAL, CONTRÁRIO AO PEDIDO ORIGINAL**: se o usuário estiver rolado pra cima lendo mensagens antigas (histórico, não o final da conversa) e **qualquer pessoa** mandar uma mensagem nova no canal, a tela **é puxada à força até o final**, interrompendo a leitura, mesmo que o usuário não tenha pedido isso. Isso contraria diretamente o comportamento especificado no pedido original (Roteiro 59): "Usuário distante do final: não jogar scroll para baixo automaticamente. Mostrar botão: 'Novas mensagens'." — **confirmado por ausência total**: nenhuma string "Novas mensagens" existe em todo `TextChannels.tsx`, e nenhuma lógica de distância-do-final (`scrollHeight - scrollTop - clientHeight` ou equivalente) foi encontrada condicionando o `scrollIntoView`.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: `behavior: 'smooth'` — pelo menos é uma rolagem suave, não um salto abrupto, mas ainda assim indesejada quando o usuário está ativamente lendo outra parte da conversa.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — o usuário precisa rolar manualmente de volta pra onde estava lendo, perdendo o lugar.
**RESULTADO FINAL**: Comportamento consistentemente "sempre gruda no final", que é adequado só quando o usuário já está acompanhando a conversa ao vivo — inadequado quando está revisitando histórico.
**EFEITO LOCAL**: Interrupção de leitura.
**EFEITO REMOTO**: Não aplicável (é um comportamento inteiramente local ao cliente que recebe a mensagem).
**REALTIME**: É o próprio evento que dispara o problema.
**BACKEND**: Não aplicável.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não é tecnicamente um erro/crash — é um comportamento de UX incorreto frente à especificação.
**CANCELAMENTO**: Não há como desativar esse comportamento (sem configuração de "não rolar automaticamente").
**REVERSÃO**: Rolar manualmente de volta pra posição anterior depois do salto indesejado.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Movimento de scroll não solicitado também é uma questão de acessibilidade (usuários com sensibilidade a movimento, ou usando leitor de tela navegando pelo histórico, teriam o contexto de leitura interrompido sem aviso).

**Prioridade de correção sugerida**: alta — este é o tipo de achado que o pedido original pede explicitamente pra não resumir/ignorar ("Se muda algum dado, documente"), e é uma causa raiz plausível de frustração real em uso normal do chat (qualquer conversa ativa enquanto alguém revisita mensagens antigas).

---

## 4.4 — MESSAGE_HOVER_TOOLBAR

**ID**: `MESSAGE_HOVER_TOOLBAR`
**NOME**: Barra de ações ao passar o mouse sobre uma mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de texto > histórico > qualquer mensagem de um usuário humano (não bot, não sistema) > hover`
**POSIÇÃO NA INTERFACE**: `.message-hover-actions`, `role="toolbar"`, sobreposta no canto da mensagem.
**APARÊNCIA**: Fileira de botões-ícone: Responder, Encaminhar, Copiar texto, Adicionar reação, (Fixar/Desafixar — só com permissão), (Editar — só mensagem própria), (Apagar — mensagem própria ou com permissão).
**ESTADO NORMAL**: Invisível até o hover (`!isEditing` — some durante edição).
**HOVER**: Toolbar inteira aparece; cada botão individual também reage a hover (título/tooltip nativo).
**ACTIVE/PRESSED**: Padrão de botão-ícone.
**SELECTED**: Não aplicável.
**DISABLED**: Botões condicionalmente **ausentes** (não desabilitados-visíveis) conforme permissão: Fixar só com `canManageMessages`; Editar só se `isOwn`; Apagar só se `isOwn || canManageMessages`.
**LOADING**: Não aplicável à toolbar em si.
**TRIGGER**: Hover do mouse sobre a mensagem (`:hover` em CSS, provavelmente na `<article>` pai).
**PRÉ-CONDIÇÕES**: Mensagem de um usuário humano (bots e mensagens de sistema têm suas próprias fichas de renderização sem essa toolbar completa — a confirmar quais ações, se alguma, mensagens de bot/sistema mantêm).
**RESULTADO IMEDIATO**: Toolbar visível.
**RESULTADO VISUAL**: Ícones aparecem sobrepostos, sem empurrar o layout da mensagem.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada (fade-in provável, não verificado em detalhe).
**POPOVER**: Não aplicável (a toolbar em si; o picker de reação dentro dela é seu próprio popover, ver `MESSAGE_REACT_ADD`).
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Clicar em qualquer ícone (fichas próprias adiante).
**RESULTADO FINAL**: Toolbar some ao tirar o mouse.
**EFEITO LOCAL**: Nenhum só por aparecer.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada só por hover.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Tirar o mouse.
**REVERSÃO**: Não aplicável.
**ATALHO**: **`MISSING`**: nenhuma forma de acessar essas ações via teclado sem mouse — não há `tabindex` confirmado que traga a toolbar ao foco via Tab quando a mensagem em si recebe foco (mensagens não são naturalmente focáveis como elementos de lista), e não existe `MESSAGE_CONTEXT_MENU` (botão direito) como alternativa — ver ficha própria adiante confirmando essa ausência.
**MENU DE CONTEXTO**: Ver `MESSAGE_CONTEXT_MENU` — `MISSING` por completo.
**ACESSIBILIDADE**: `role="toolbar"` + `aria-label="Ações da mensagem"` no container — estrutura ARIA correta para quem já está com foco lá, mas **o caminho pra chegar lá via teclado sem mouse não foi confirmado como funcional** (dependendo só de hover, um usuário de teclado puro pode não conseguir revelar a toolbar de forma alguma).

---

## 4.5 — MESSAGE_REPLY

**ID**: `MESSAGE_REPLY`
**NOME**: Responder a uma mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem > toolbar de hover > ícone Responder`
**POSIÇÃO NA INTERFACE**: Primeiro ícone da toolbar.
**APARÊNCIA**: `ReplyIcon`, 14px.
**ESTADO NORMAL**: Disponível pra qualquer mensagem de usuário humano.
**HOVER**: Título "Responder".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca (qualquer membro pode responder a qualquer mensagem visível).
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Mensagem visível.
**RESULTADO IMEDIATO**: `setReplyingTo(message)`.
**RESULTADO VISUAL**: Banner acima do composer (`.reply-composer-banner`): "Respondendo a **{nome}**" + botão de cancelar (X).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Foco presumivelmente move pro composer (a confirmar se há `.focus()` explícito) — usuário digita a resposta e envia.
**RESULTADO FINAL**: Mensagem enviada com `replyToMessageId` referenciando a original — **só o id é guardado, não um snapshot congelado do conteúdo** (comentário explícito no código: resolve contra o que já está carregado na conversa atual). Se a mensagem original não estiver mais na janela carregada (fora do histórico recente, ou apagada), o `ReplyPreview` mostra honestamente "Mensagem original não encontrada" em vez de fingir ter o conteúdo.
**EFEITO LOCAL**: Banner de contexto de resposta.
**EFEITO REMOTO**: Outros membros veem a mensagem nova com a prévia da respondida (se ainda estiver na janela carregada deles também — cada cliente resolve independentemente contra o que já tem).
**REALTIME**: Mensagem normal (`TEXT_MESSAGE_CREATE`) com o campo extra.
**BACKEND**: Mesmo endpoint de `MESSAGE_SEND`, com `replyingTo?.id` no corpo.
**BANCO**: Coluna `reply_to_message_id` em `text_messages`.
**REFRESH**: `replyingTo` (estado local, não enviado ainda) **não persiste** em F5 — se o usuário recarregar no meio de escrever uma resposta, perde o contexto (mas não o texto já digitado, que também se perde de qualquer forma, já que `draft` é puramente local).
**RECONEXÃO**: Não aplicável.
**ERRO**: Herdado de `MESSAGE_SEND`.
**CANCELAMENTO**: Botão X no banner (`setReplyingTo(null)`), ou **Esc** — a confirmar se implementado (o pedido original espera isso explicitamente no Roteiro 8: "Esc: cancelar reply/edit quando aplicável" — não confirmado nesta passagem se há um listener de Esc especificamente pra isso, ou só os cancelamentos de modal já documentados em outras fichas).
**REVERSÃO**: Cancelar antes de enviar.
**ATALHO**: Nenhum atalho pra *iniciar* uma resposta via teclado (só clique no ícone).
**MENU DE CONTEXTO**: Ausente (ver `MESSAGE_CONTEXT_MENU`).
**ACESSIBILIDADE**: `aria-label="Responder"` no botão; botão de cancelar no banner com `aria-label="Cancelar resposta"`.

---

## 4.6 — MESSAGE_JUMP_TO_ORIGINAL

**ID**: `MESSAGE_JUMP_TO_ORIGINAL`
**NOME**: Clicar na prévia de resposta para pular até a mensagem original
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem com replyToMessageId > prévia de resposta acima do conteúdo`
**POSIÇÃO NA INTERFACE**: `.message-reply-preview`, acima do cabeçalho da mensagem.
**APARÊNCIA**: Ícone de resposta pequeno + nome do autor original + trecho do texto original.
**ESTADO NORMAL**: Visível sempre que a mensagem é uma resposta.
**HOVER**: Padrão de botão clicável.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: `disabled={!replyTarget}` — **se a mensagem original não estiver na janela carregada, o botão fica desabilitado** (não clicável), mostrando só "Mensagem original não encontrada" em itálico, sem fingir que dá pra navegar até algo que não está disponível.
**LOADING**: Não aplicável.
**TRIGGER**: Clique (só quando habilitado).
**PRÉ-CONDIÇÕES**: Mensagem original precisa estar entre as mensagens já carregadas nesta conversa.
**RESULTADO IMEDIATO**: `jumpToMessage(replyToMessageId)`.
**RESULTADO VISUAL**: `element.scrollIntoView({ block: 'center', behavior: 'smooth' })` até a mensagem original, que ganha a classe `message-jump-highlight` por 1.5 segundos (destaque temporário, provavelmente um flash de cor de fundo — CSS exato não lido nesta passagem).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Scroll suave + highlight temporário de 1.5s.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Usuário vê a mensagem original destacada por um instante.
**EFEITO LOCAL**: Só scroll/destaque visual, nenhum dado muda.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada — é busca local no DOM (`document.getElementById(`message-${id}`)`, inferido pelo padrão `id={`message-${message.id}`}` já confirmado no `<article>` de cada mensagem).
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável (o caso de "não encontrado" já é tratado como estado normal, não erro).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: É um `<button>` real mesmo quando desabilitado (não um link/div fake), então o estado desabilitado é anunciado corretamente por leitores de tela.

---

## 4.7 — MESSAGE_FORWARD

**ID**: `MESSAGE_FORWARD`
**NOME**: Encaminhar mensagem para outro canal/servidor/DM
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: `CORE` — já implementado, testado com 17 checagens E2E reais e verificado em produção em sessão anterior desta linha de trabalho (confirmado em `DISCORD_PARITY_PLAN.md` §8/§16, item H). Resumo, não repetido em ficha completa de 36 campos por já ter essa cobertura de teste/verificação real documentada:
- **Caminho**: `Mensagem > toolbar de hover > ícone Encaminhar > ForwardMessageModal`.
- **Destino**: qualquer canal de qualquer servidor do usuário, ou qualquer DM/amigo (abre a DM na hora se não existir ainda).
- **Atribuição**: "Encaminhada de {autor}" congelada no momento do envio — encadeamento de forward-de-forward atribui ao remetente imediato, não ao autor original da cadeia.
- **Limitações deliberadas**: sem anexo (risco de referência compartilhada de objeto no MinIO), sem comentário adicional junto, um destino por vez, sem link de volta pra mensagem original a partir da encaminhada.
- **Achado desta passagem, não documentado antes**: o ícone de encaminhar na toolbar **não é condicionado a nenhuma permissão** — qualquer membro que vê a mensagem pode encaminhá-la (comportamento correto/esperado, só nunca tinha sido confirmado explicitamente lendo o JSX de novo nesta auditoria).

---

## 4.8 — MESSAGE_COPY_TEXT

**ID**: `MESSAGE_COPY_TEXT`
**NOME**: Copiar o texto de uma mensagem
**STATUS ATUAL — CORREÇÃO (Roteiro 15 do Atlas)**: esta ficha partia do princípio de que a cópia funcionava e só apontava a falta de feedback. **No app desktop ela não funciona**: medido num Electron real, a permissão `clipboard-write` está negada e `writeText` falha com `NotAllowedError`. Ver `CLIPBOARD_COPY_DESKTOP` (15.1), onde está registrada a correção. O texto abaixo vale para o estado anterior: sem feedback de cópia.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem > toolbar de hover > ícone Copiar`
**POSIÇÃO NA INTERFACE**: Terceiro ícone da toolbar.
**APARÊNCIA**: `CopyIcon`, 14px.
**ESTADO NORMAL**: Sempre disponível.
**HOVER**: Título "Copiar texto".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `navigator.clipboard.writeText(message.text)`.
**RESULTADO VISUAL — ACHADO**: **nenhum feedback visual de "Copiado!"** — diferente do padrão que o pedido original espera pra toda ação de copiar (Roteiro 55: "Mostrar feedback curto: 'Copiado'"). O usuário clica e não tem nenhuma confirmação de que funcionou, a menos que cole em algum lugar pra verificar.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Texto bruto (markdown não renderizado, texto fonte original) no clipboard.
**EFEITO LOCAL**: Clipboard do SO alterado.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável.
**ERRO**: `navigator.clipboard.writeText` pode rejeitar (ex.: sem permissão de clipboard, contexto não seguro) — **nenhum `.catch()` confirmado nesta chamada específica** (`void navigator.clipboard.writeText(...)`, promise descartada sem tratamento) — se falhar, falha silenciosamente sem nenhum aviso ao usuário.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Ausente (o navegador tem seleção de texto + Ctrl+C nativo como alternativa sempre disponível, já que o texto da mensagem é texto real na página, não uma imagem).
**ACESSIBILIDADE**: `aria-label="Copiar texto"`.

**Nota de auditoria**: mesma lacuna de "sem feedback de copiado" e "sem tratamento de erro" se aplica a `CATEGORY_CONTEXT_MENU`'s "Copiar ID da Categoria" (Roteiro 3) — **padrão consistente em todo o app**: toda ação de copiar usa a mesma técnica simples (`navigator.clipboard.writeText`), sem exceção, e nenhuma tem feedback visual de sucesso. Vale como um achado transversal a corrigir de uma vez em todas as ocorrências, não uma por uma.

---

## 4.9 — MESSAGE_REACT_ADD

**ID**: `MESSAGE_REACT_ADD`
**NOME**: Adicionar uma reação nova a uma mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem > toolbar de hover > ícone de carinha sorridente > EmojiPicker`
**POSIÇÃO NA INTERFACE**: Quarto ícone da toolbar; o picker abre como popover posicionado a partir do retângulo do botão (`getBoundingClientRect()`).
**APARÊNCIA**: `SmileIcon` (14px) no botão; `EmojiPicker` completo ao abrir — busca por nome + 9 categorias sobre o dataset completo do unicode-emoji-json (~1900 emojis), já confirmado como `DONE` em `DISCORD_PARITY_PLAN.md` §8, com posicionamento `fixed` e clamp de viewport (corrigido nesta mesma linha de trabalho depois de um achado real de clipping perto do fim da lista de mensagens).
**ESTADO NORMAL**: Fechado.
**HOVER**: Título "Adicionar reação" no botão.
**ACTIVE/PRESSED**: Clique alterna abrir/fechar (`setReactionPickerAnchor((current) => (current ? null : rect))` — clicar de novo no mesmo botão fecha, não abre um segundo).
**SELECTED**: Não aplicável.
**DISABLED**: Nunca — qualquer membro pode reagir a qualquer mensagem visível.
**LOADING**: Não aplicável (picker é `lazy`-loaded via `React.lazy`/`Suspense`, `fallback={null}` — sem indicador de carregamento visível durante o carregamento do chunk JS, só aparece quando pronto).
**TRIGGER**: Clique no botão.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: Picker abre.
**RESULTADO VISUAL**: Grade/lista de emoji com busca.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada nesta passagem.
**POPOVER**: É o próprio popover.
**MENU**: Não aplicável.
**MODAL**: Não é modal (fecha ao clicar fora, presumidamente — mesmo padrão do resto do app).
**SEGUNDA ETAPA**: Selecionar um emoji → `onToggleReaction(emoji, false)` (o `false` indica "ainda não reagiu com este", então é sempre um "adicionar", nunca remove por essa via específica — remover uma reação já existente é feito clicando na pastilha, ver `MESSAGE_REACTION_TOGGLE`).
**RESULTADO FINAL**: Reação adicionada; picker fecha (`setReactionPickerAnchor(null)`).
**EFEITO LOCAL**: Pastilha de reação aparece/incrementa.
**EFEITO REMOTO**: `TEXT_MESSAGE_REACTION_ADD` via WebSocket — outros veem a reação em tempo real.
**REALTIME**: `TEXT_MESSAGE_REACTION_ADD`.
**BACKEND**: `POST` de reação (validado contra o dataset conhecido de emoji, não uma lista curada pequena — confirmado em `DISCORD_PARITY_PLAN.md` §8).
**BANCO**: Tabela de reações (não lida em detalhe o nome exato nesta passagem, mas já confirmada existente e funcional).
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Recarregada com a mensagem.
**ERRO**: Não confirmado nesta passagem onde um erro de reação apareceria (sem toast global confirmado em todo o app até agora nesta auditoria).
**CANCELAMENTO**: Clicar fora do picker, ou clicar de novo no botão de abrir.
**REVERSÃO**: Remover a reação clicando na pastilha (ver ficha seguinte).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Adicionar reação"` no botão de abrir; acessibilidade interna do `EmojiPicker` (busca, navegação por categoria) não reauditada campo-a-campo nesta passagem específica (já existe e funciona, confirmado em sessão anterior).

---

## 4.10 — MESSAGE_REACTION_TOGGLE

**ID**: `MESSAGE_REACTION_TOGGLE`
**NOME**: Adicionar/remover a própria reação clicando numa pastilha existente
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem > abaixo do texto > pastilha de reação já existente (emoji + contagem)`
**POSIÇÃO NA INTERFACE**: `.message-reactions`, abaixo do corpo da mensagem — só visível se `message.reactions?.length` (**a barra inteira nem renderiza se não há nenhuma reação**, não aparece vazia).
**APARÊNCIA**: Pastilha (`.reaction-pill`) com emoji + número; classe `reacted` se o próprio usuário já reagiu com aquele emoji (destaque visual diferenciado).
**ESTADO NORMAL**: Pastilha visível para qualquer reação existente na mensagem, independente de quem reagiu.
**HOVER**: `title` nativo mostra "Você reagiu — clique para remover" (se já reagiu) ou "{N} reação(ões)" (se não) — **não lista os nomes de quem reagiu**, só a contagem, diferente do balão rico do Discord real que mostra avatares/nomes de quem reagiu.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `reacted` é o próprio indicador de "selecionado" (já reagi com este).
**DISABLED**: Nunca.
**LOADING**: Não aplicável.
**TRIGGER**: Clique na pastilha.
**PRÉ-CONDIÇÕES**: Pelo menos uma reação já existir na mensagem (de qualquer pessoa) para a pastilha aparecer.
**RESULTADO IMEDIATO**: `onToggleReaction(emoji, reacted)` — `reacted` já vem calculado (`group.userIds.includes(ownUserId)`), então a função sabe se deve adicionar ou remover.
**RESULTADO VISUAL**: Contagem incrementa/decrementa; classe `reacted` liga/desliga; **se a contagem chega a zero depois de remover, a pastilha inteira desaparece** (comportamento inferido pela estrutura de dados — `message.reactions` provavelmente filtra grupos vazios, a confirmar exatamente onde isso acontece, cliente ou servidor).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Reação do usuário alternada.
**EFEITO LOCAL**: Pastilha atualizada.
**EFEITO REMOTO**: `TEXT_MESSAGE_REACTION_ADD` ou `TEXT_MESSAGE_REACTION_REMOVE` via WebSocket.
**REALTIME**: Conforme acima.
**BACKEND**: `POST`/`DELETE` de reação.
**BANCO**: `INSERT`/`DELETE` na tabela de reações.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Recarregada com a mensagem.
**ERRO**: Não confirmado onde apareceria.
**CANCELAMENTO**: Clicar de novo reverte.
**REVERSÃO**: Clicar de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Pastilha é um `<button>` real, alcançável via Tab; `title` fornece contexto, mas não é lido automaticamente por todo leitor de tela sem interação extra (limitação conhecida de `title` como mecanismo de acessibilidade, já documentada como padrão do app inteiro no Roteiro 2).

---

## 4.11 — MESSAGE_PIN_TOGGLE

**ID**: `MESSAGE_PIN_TOGGLE`
**NOME**: Fixar/desafixar uma mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem > toolbar de hover > ícone de pin` (só visível com `canManageMessages`)
**POSIÇÃO NA INTERFACE**: Toolbar de hover, posição condicional (depois do picker de reação).
**APARÊNCIA**: `PinIcon`, 14px; `title`/`aria-label` mudam dinamicamente entre "Fixar mensagem"/"Desafixar mensagem" conforme `message.pinnedAt`.
**ESTADO NORMAL**: Ícone presente só pra quem tem `MANAGE_MESSAGES`.
**HOVER**: Tooltip contextual (fixar vs. desafixar).
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável ao ícone; a própria mensagem ganha um indicador visual permanente quando fixada (ver abaixo).
**DISABLED**: Ausente (não desabilitado-visível) sem permissão.
**LOADING**: Não confirmado.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: `MANAGE_MESSAGES`; **teto de 50 mensagens fixadas por canal** (confirmado em `DISCORD_PARITY_PLAN.md` §8, mesmo limite do Discord real) — comportamento exato ao atingir o teto (erro? item mais antigo desafixado automaticamente?) não confirmado nesta passagem específica.
**RESULTADO IMEDIATO**: `onTogglePin()` → `POST`/`DELETE` de pin.
**RESULTADO VISUAL**: Mensagem ganha (ou perde) a classe `pinned` no `<article>`, mais um selo "📌 fixada" (`.message-pinned-mark`) no cabeçalho, ao lado do timestamp/"(editado)".
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Aparece/some do `PinnedMessagesPanel` (ficha própria adiante).
**RESULTADO FINAL**: Estado de fixação persistido.
**EFEITO LOCAL**: Selo visual + entrada no painel de fixadas.
**EFEITO REMOTO**: `TEXT_MESSAGE_UPSERT` via WebSocket (reaproveitado do mesmo evento de edição — fixar não tem um tipo de evento próprio, é tratado como uma atualização de mensagem qualquer).
**REALTIME**: `TEXT_MESSAGE_UPSERT`.
**BACKEND**: `POST /api/text-channels/:id/messages/:id/pin` / `DELETE` equivalente.
**BANCO**: Coluna `pinned_at` em `text_messages`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Recarregado com a mensagem.
**ERRO**: Teto de 50 — comportamento exato não confirmado nesta passagem.
**CANCELAMENTO**: Clicar de novo (mesmo botão faz o inverso).
**REVERSÃO**: Clicar de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Ausente (mesma lacuna geral de `MESSAGE_CONTEXT_MENU`).
**ACESSIBILIDADE**: `aria-label` dinâmico correto (muda conforme o estado).

---

## 4.12 — MESSAGE_EDIT

**ID**: `MESSAGE_EDIT`
**NOME**: Editar uma mensagem própria
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem própria > toolbar de hover > ícone Editar`
**POSIÇÃO NA INTERFACE**: Toolbar de hover, só em mensagens próprias.
**APARÊNCIA**: `EditIcon`, 14px.
**ESTADO NORMAL**: Presente só em mensagens onde `isOwn === true`.
**HOVER**: Título "Editar mensagem".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente em mensagens de outros usuários (mesmo com `canManageMessages` — **achado**: gerenciar mensagens permite apagar mensagem de outro, mas nunca editar mensagem de outro, mesmo padrão do Discord real, confirmado consistente com o comentário já existente em `DISCORD_PARITY_PLAN.md` §8: "quem tem o cargo com MANAGE_MESSAGES também pode apagar mensagem de outro (não editar, igual Discord real)").
**LOADING**: Não aplicável ao botão de iniciar.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: `isOwn`.
**RESULTADO IMEDIATO**: `onStartEdit()` → `isEditing` vira `true` pra esta mensagem específica.
**RESULTADO VISUAL**: Corpo da mensagem substituído por `MessageEditForm` (campo de texto editável, pré-preenchido) — **toolbar de hover inteira some enquanto edita** (`{!isEditing && (...)}`), então não dá pra, por exemplo, reagir a uma mensagem enquanto a edita.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não é modal — é inline, dentro do próprio fluxo da mensagem.
**SEGUNDA ETAPA**: Editar o texto e salvar/cancelar (componente `MessageEditForm` — campos/atalhos internos não relidos em detalhe nesta passagem específica, mas o padrão Enter-salva/Esc-cancela é o esperado pelo pedido original, Roteiro 8, a confirmar).
**RESULTADO FINAL**: `onSaveEdit(text)` → `PATCH` da mensagem.
**EFEITO LOCAL**: Texto atualizado, selo "(editado)" aparece no cabeçalho.
**EFEITO REMOTO**: `TEXT_MESSAGE_UPSERT` — outros veem a edição em tempo real, com o mesmo selo "(editado)".
**REALTIME**: `TEXT_MESSAGE_UPSERT`.
**BACKEND**: `PATCH /api/text-channels/:id/messages/:id`.
**BANCO**: `UPDATE` no texto + `edited_at`.
**REFRESH**: Se o usuário recarregar no meio de uma edição não salva, perde a edição em andamento (estado local, não persistido como rascunho).
**RECONEXÃO**: Não aplicável.
**ERRO**: Erro de validação/rede exibido dentro do próprio `MessageEditForm` (posição exata não relida em detalhe).
**CANCELAMENTO**: `onCancelEdit()` — presumivelmente também via Esc (a confirmar), volta ao texto original sem salvar.
**REVERSÃO**: Editar de novo.
**ATALHO**: **`MISSING`**: seta para cima com o campo do composer vazio para editar a última mensagem própria diretamente (já documentado em `MESSAGE_SEND`) — aqui, uma vez já em modo de edição, o padrão esperado seria Enter salva/Esc cancela, não confirmado neste passe específico se está implementado.
**MENU DE CONTEXTO**: Ausente.
**ACESSIBILIDADE**: `aria-label="Editar mensagem"` no botão de iniciar.

---

## 4.13 — MESSAGE_DELETE

**ID**: `MESSAGE_DELETE`
**NOME**: Apagar uma mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Mensagem > toolbar de hover > ícone de lixeira`
**POSIÇÃO NA INTERFACE**: Último ícone da toolbar.
**APARÊNCIA**: `TrashIcon`, 14px.
**ESTADO NORMAL**: Presente se `isOwn || canManageMessages`.
**HOVER**: Título "Apagar mensagem".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente sem permissão/autoria.
**LOADING**: Não confirmado.
**TRIGGER**: Clique — **`onDelete` é chamado direto do clique, sem confirmação visível no próprio componente de mensagem** (a confirmar se `onDelete`, definido no componente pai `TextChannelView`, injeta algum `window.confirm()` antes de chamar a API — não lido em detalhe nesta passagem específica do handler pai).
**PRÉ-CONDIÇÕES**: `isOwn || canManageMessages`.
**RESULTADO IMEDIATO**: `DELETE` da mensagem.
**RESULTADO VISUAL**: Mensagem some do histórico (todos os clientes, via evento de tempo real).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada (some instantaneamente ou com fade — não verificado).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: A confirmar se existe uma confirmação antes (ver `TRIGGER`).
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL — IRREVERSÍVEL**: Mensagem apagada — junto vão reações, anexos referenciados (a confirmar cascata exata), e o pin se estava fixada.
**EFEITO LOCAL**: Removida do estado local.
**EFEITO REMOTO**: `TEXT_MESSAGE_DELETE` via WebSocket.
**REALTIME**: `TEXT_MESSAGE_DELETE`.
**BACKEND**: `DELETE /api/text-channels/:id/messages/:id`.
**BANCO**: `DELETE` (ou soft-delete — não confirmado qual dos dois nesta passagem; o schema teria uma coluna `deleted_at` num soft-delete, não confirmada como existente).
**REFRESH**: Não aplicável (já apagada).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não confirmado onde apareceria.
**CANCELAMENTO**: Se houver confirmação prévia, cancelar nela; senão, `MISSING` (sem desfazer depois do clique).
**REVERSÃO**: **`MISSING`** — sem lixeira/desfazer, mensagem apagada é definitiva.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Ausente.
**ACESSIBILIDADE**: `aria-label="Apagar mensagem"`.

**Nota de auditoria**: dado que esta é uma ação destrutiva e irreversível, e que o app já estabeleceu (em `SERVER_DELETE`/`CATEGORY_DELETE`, Roteiro 3) o padrão de sempre confirmar antes de excluir algo, **vale confirmar em auditoria futura mais profunda se `MESSAGE_DELETE` realmente pula a confirmação** (o que seria uma inconsistência real frente ao próprio padrão que o app já adota em outros lugares) ou se ela só não foi capturada nesta leitura específica do componente de mensagem (por estar no componente pai, não no filho lido agora).

---

## 4.14 — MESSAGE_CONTEXT_MENU *(MISSING)*

**ID**: `MESSAGE_CONTEXT_MENU`
**NOME**: Menu de contexto ao clicar com o botão direito numa mensagem
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhum `onContextMenu` em `TextChannels.tsx` inteiro — diferente de canais e categorias (Roteiro 3), que já reaproveitam o `ContextMenu.tsx` genérico, mensagens **não têm nenhum menu de botão direito**. Todas as ações (responder, encaminhar, copiar, reagir, fixar, editar, apagar) só existem via a toolbar de hover (`MESSAGE_HOVER_TOOLBAR`).
**CAMINHO EXATO ESPERADO** (não implementado): `Mensagem > botão direito`
**O que isso bloqueia**: além de replicar as ações já disponíveis via hover (redundância útil, não essencial), um menu de contexto normalmente traria ações que **não existem em lugar nenhum hoje**: "Copiar ID da mensagem" (`MISSING`), "Copiar link da mensagem" (`MISSING` — nem faria sentido sem o roteamento por URL documentado como ausente no Roteiro 2), "Marcar não lida a partir daqui" (`MISSING`, mesma dependência de rastreio de leitura ainda inexistente), "Denunciar mensagem" (`MISSING`, sem sistema de denúncia em lugar nenhum do app).
**Pré-requisito de implementação, caso venha a ser feito**: reaproveitar o mesmo `useContextMenu()`/`<ContextMenu>` já usado em canais/categorias — padrão já estabelecido e testado no resto do app, só falta ligar em mensagens.

---

## 4.15 — MESSAGE_ATTACH_FILE_PICKER

**ID**: `MESSAGE_ATTACH_FILE_PICKER`
**NOME**: Anexar arquivo via seletor do sistema
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Composer > ícone de clipe (esquerda do campo de texto)`
**POSIÇÃO NA INTERFACE**: `.text-channel-attach-button`, início da linha do composer.
**APARÊNCIA**: `AttachmentIcon`, 17px — **um único botão**, sem o menu "+" com múltiplas opções (upload de mídia, criar enquete, etc.) que o pedido original espera (Roteiro 9) — aqui é direto: clique abre o seletor de arquivo do SO, sem passo intermediário de menu.
**ESTADO NORMAL**: Habilitado.
**HOVER**: Título "Anexar arquivo".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: `isTimedOut || uploading || pendingAttachments.length >= ATTACHMENT_MAX_PER_MESSAGE`.
**LOADING**: Botão continua clicável durante upload de um arquivo anterior, mas fica desabilitado se `uploading === true` (mutuamente exclusivo — não dá pra iniciar um segundo upload enquanto o primeiro está em andamento).
**TRIGGER**: Clique → `fileInputRef.current?.click()` (dispara o `<input type="file" multiple className="sr-only">` escondido).
**PRÉ-CONDIÇÕES**: Não estar em timeout; menos de `ATTACHMENT_MAX_PER_MESSAGE` anexos já pendentes.
**RESULTADO IMEDIATO**: Seletor de arquivo nativo do SO abre; `multiple` permite selecionar vários de uma vez.
**RESULTADO VISUAL**: Após selecionar: `handleFilesSelected` processa cada arquivo, mostrando uma tira de chips (`.pending-attachment-chip`) acima do composer — miniatura pra imagem, ícone de arquivo genérico pra outros tipos, nome do arquivo, botão de remover (X) por chip.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: **`MISSING`** — ver `APARÊNCIA` (Discord real tem um menu "+" com várias opções; aqui é upload direto).
**MODAL**: Não aplicável (o seletor de arquivo é nativo do SO).
**SEGUNDA ETAPA**: Enviar a mensagem inclui os `attachmentIds` já enviados ao MinIO nesta etapa (upload em duas etapas: sobe o arquivo assim que selecionado, vincula à mensagem só no envio — confirmado em `DISCORD_PARITY_PLAN.md` §0).
**RESULTADO FINAL**: Anexo(s) enviados junto com a próxima mensagem (ou descartados se o usuário nunca enviar, ver `CANCELAMENTO`).
**EFEITO LOCAL**: Upload real pro MinIO self-hosted já acontece nesta etapa (antes mesmo de enviar a mensagem).
**EFEITO REMOTO**: Nenhum até a mensagem em si ser enviada.
**REALTIME**: Não aplicável a esta etapa.
**BACKEND**: `POST` de upload, sujeito a `uploadLimiter` (confirmado em `DISCORD_PARITY_PLAN.md` §14).
**BANCO**: Registro de anexo criado (órfão até ser vinculado a uma mensagem, ou limpo se nunca for usado — mecanismo exato de limpeza de órfãos não confirmado nesta passagem).
**REFRESH**: **Anexos pendentes se perdem em F5** (já foram upados pro MinIO, mas a referência local — o "carrinho" de anexos prontos pra enviar — é só estado React, não sobrevive a reload).
**RECONEXÃO**: Não aplicável.
**ERRO**: `attachmentError` exibido em banner acima do composer (`.timeout-composer-banner`, mesmo estilo visual do aviso de timeout) — com botão de fechar. Limites: até 15MB/arquivo, 5 por mensagem (confirmado em `DISCORD_PARITY_PLAN.md` §0) — mensagem de erro exata pra cada caso (arquivo grande demais, limite de quantidade) a confirmar palavra por palavra em auditoria futura.
**CANCELAMENTO**: Botão X em cada chip remove o anexo pendente **do carrinho local** — **não confirmado se isso também apaga o objeto já upado no MinIO**, ou se fica órfão até alguma limpeza posterior (achado a verificar).
**REVERSÃO**: Selecionar de novo.
**ATALHO**: Nenhum atalho de teclado pra abrir o seletor.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Anexar arquivo"`; input de arquivo real escondido via `sr-only` (não `display:none`, então tecnicamente ainda navegável por alguns leitores de tela via o próprio botão que o aciona).

---

## 4.16 — MESSAGE_ATTACH_DRAGDROP *(MISSING)*

**ID**: `MESSAGE_ATTACH_DRAGDROP`
**NOME**: Arrastar um arquivo do sistema direto pro chat
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhum `onDrop`/`onDragOver` em `TextChannels.tsx` — a área de mensagens/composer não aceita arquivos arrastados do Explorer do Windows (ou de outra janela). O pedido original espera isso explicitamente (Roteiro 9: "Drag-and-drop: fluxo equivalente [ao upload]").
**CAMINHO EXATO ESPERADO** (não implementado): `Arrastar arquivo de fora do app > soltar sobre a área de mensagens ou composer`
**Único caminho real hoje**: `MESSAGE_ATTACH_FILE_PICKER` (seletor de arquivo via clique).

---

## 4.17 — MESSAGE_ATTACH_PASTE *(MISSING)*

**ID**: `MESSAGE_ATTACH_PASTE`
**NOME**: Colar uma imagem da área de transferência direto no composer
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: nenhum `onPaste` no `<textarea>` do composer. Copiar uma imagem (print de tela, imagem de outro app) e colar com Ctrl+V no campo de mensagem **não faz nada** — só cola texto normal se a área de transferência tiver texto.
**CAMINHO EXATO ESPERADO** (não implementado): `Composer > foco no campo de texto > Ctrl+V com uma imagem na área de transferência`

---

## 4.18 — PINNED_MESSAGES_PANEL_TOGGLE

**ID**: `PINNED_MESSAGES_PANEL_TOGGLE`
**NOME**: Abrir/fechar o painel de mensagens fixadas
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de texto > topbar (a confirmar posição exata do botão que aciona `pinsOpen` — provavelmente um ícone de pin no cabeçalho do canal, auditoria detalhada da topbar ainda pendente pra um roteiro futuro)`
**POSIÇÃO NA INTERFACE**: Painel lateral (`.channel-side-panel.pinned-messages-panel`).
**APARÊNCIA**: Cabeçalho "📌 Mensagens fixadas {N}", lista de mensagens fixadas (autor + trecho do texto, clicável), ou estado vazio "Nenhuma mensagem fixada neste canal ainda."
**ESTADO NORMAL**: Fechado por padrão.
**HOVER**: Cada linha de mensagem fixada tem hover (botão clicável).
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: `refreshPinnedMessages()` disparado ao abrir (`useEffect([pinsOpen, channel.id])`) — sem indicador de loading confirmado.
**TRIGGER**: Clique no botão que alterna `pinsOpen` (localização exata do botão pendente de confirmação em auditoria futura da topbar).
**PRÉ-CONDIÇÕES**: Nenhuma — qualquer membro pode ver a lista de fixadas.
**RESULTADO IMEDIATO**: Painel aparece, busca a lista atualizada.
**RESULTADO VISUAL**: Lista lateral com as mensagens fixadas.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não é modal (painel lateral, não bloqueia o resto da tela).
**SEGUNDA ETAPA**: Clicar numa mensagem fixada → `onJump` (mesmo `jumpToMessage` de `MESSAGE_JUMP_TO_ORIGINAL`) — **mas aqui não há a mesma checagem de "está na janela carregada"** confirmada (`PinnedMessagesPanel` não recebe `loadedMessageIds` como prop, diferente de `MessageSearchPanel`) — **achado a confirmar**: se uma mensagem fixada antiga não estiver mais carregada no histórico visível, clicar nela pode simplesmente não fazer nada (já que `jumpToMessage` busca no DOM local, que só tem o que já foi renderizado), sem o mesmo tratamento gracioso de "desabilitado com motivo" que a busca já tem.
**RESULTADO FINAL**: Painel aberto, navegável.
**EFEITO LOCAL**: Nenhuma mudança de dado, só leitura.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Lista de pins reage a `TEXT_MESSAGE_UPSERT`/mudança de `pinnedAt` (confirmado no `useEffect` de eventos de tempo real já lido, linhas 809-813).
**BACKEND**: `GET` de mensagens fixadas do canal.
**BANCO**: Leitura de `text_messages WHERE pinned_at IS NOT NULL`.
**REFRESH**: `pinsOpen` não persiste (fecha em F5).
**RECONEXÃO**: Recarregado ao reabrir.
**ERRO**: Não confirmado.
**CANCELAMENTO**: Clicar de novo no botão que abriu, ou algum X próprio (a confirmar).
**REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="region"`, `aria-label="Mensagens fixadas"`.

---

## 4.19 — MESSAGE_SEARCH_RESULT_JUMP

**ID**: `MESSAGE_SEARCH_RESULT_JUMP`
**NOME**: Buscar mensagens no canal e navegar até um resultado
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de texto > topbar > ícone de busca (posição exata pendente de confirmação em auditoria futura da topbar) > MessageSearchPanel`
**POSIÇÃO NA INTERFACE**: Painel lateral (`.channel-side-panel.message-search-panel`).
**APARÊNCIA**: Campo de busca com ícone (`SearchIcon`) + botão "Buscar"; resultados listados com autor, timestamp, trecho.
**ESTADO NORMAL**: Campo vazio, foco automático (`autoFocus`).
**HOVER**: Cada resultado clicável tem hover.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Botão "Buscar" desabilitado se a busca tiver menos que `MESSAGE_SEARCH_QUERY_MIN_LENGTH` caracteres.
**LOADING**: Texto do botão muda pra "Buscando…".
**TRIGGER**: Enter no campo, ou clique em "Buscar".
**PRÉ-CONDIÇÕES**: Texto de busca com tamanho mínimo.
**RESULTADO IMEDIATO**: `api.searchMessages(serverId, channelId, query)` — busca `LIKE` parametrizada com fuga manual de `%`/`_`/`\` (já confirmado como implementação segura em `DISCORD_PARITY_PLAN.md` §8), **escopada a um único canal, sem busca cross-canal/cross-servidor**.
**RESULTADO VISUAL**: Lista de resultados, ou "Nenhuma mensagem encontrada." se vazio.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não é modal.
**SEGUNDA ETAPA**: Clicar num resultado.
**RESULTADO FINAL — ACHADO REAL, LIMITAÇÃO CONCRETA**: cada resultado só é clicável (`disabled={!loadedMessageIds.has(message.id)}`) **se a mensagem encontrada já estiver entre as mensagens atualmente carregadas na tela** (a "janela" recente de histórico, tipicamente as últimas N mensagens). Se a busca encontrar uma mensagem **antiga**, fora dessa janela, o resultado aparece na lista mas **fica desabilitado**, com `title="Fora da janela carregada de mensagens recentes"` explicando por quê — **a busca encontra a mensagem, mas o usuário não consegue navegar até ela**, porque não existe um mecanismo de "carregar histórico até este ponto específico" (paginação direcionada). Isso é uma lacuna funcional real, não cosmética: a busca é parcialmente inútil pra mensagens antigas.
**EFEITO LOCAL**: Nenhuma mudança de dado.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: `GET /api/text-channels/:id/messages/search?q=`.
**BANCO**: Leitura via `LIKE`.
**REFRESH**: `searchOpen`/resultados não persistem (fecha em F5).
**RECONEXÃO**: Não aplicável.
**ERRO**: `catch { setResults([]); setSearched(true); }` — erro de rede é tratado como "nenhum resultado encontrado", **sem diferenciar visualmente "busca falhou" de "busca não encontrou nada"** (mesma mensagem final pro usuário nos dois casos) — achado real de UX enganosa.
**CANCELAMENTO**: Fechar o painel.
**REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum atalho pra abrir a busca via teclado (Discord real geralmente tem Ctrl+F dentro do canal).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="region"`, `aria-label="Buscar mensagens"`, `autoFocus` no campo ao abrir.

---

## 4.20 — MARKDOWN_RENDERING (referência — já auditado/testado em profundidade)

**ID**: `MARKDOWN_RENDERING`
**NOME**: Formatação de texto nas mensagens
**STATUS**: `CORE` — renderizador próprio (`apps/web/src/components/Markdown.tsx`), monta árvore de elementos React (**nunca `dangerouslySetInnerHTML`** — decisão de segurança deliberada, HTML de usuário é sempre escapado mesmo dentro de formatação), 15 testes unitários reais cobrindo formatação e segurança contra XSS (confirmados passando nesta mesma linha de auditoria, seção de testes). Suporta: **negrito**, *itálico*, negrito+itálico combinado, sublinhado, ~~tachado~~, spoiler (oculto até clicar, com `role`/estado de botão), `código inline`, blocos de código multi-linha, autolink de URL `http`/`https` (**nunca autolinka esquemas perigosos como `javascript:`**, testado explicitamente), formatação aninhada (negrito contendo itálico), e marcação não fechada permanece texto literal (não quebra o parser). `MISSING` confirmado em `DISCORD_PARITY_PLAN.md` §8: escape com barra invertida, citações (`>`), listas.

---

## 4.21 — SLOW_MODE_ENFORCEMENT

**ID**: `SLOW_MODE_ENFORCEMENT`
**NOME**: Aplicação do modo lento (limite de tempo entre mensagens)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: `CORE` — já implementado e aplicado de verdade no backend (não só decorativo), confirmado em `DISCORD_PARITY_PLAN.md` §4: rejeita envio com `429` se o usuário mandou uma mensagem há menos tempo que o configurado (`slowModeRemainingSeconds`), **isento quem tem `MANAGE_MESSAGES`** (mesmo padrão do Discord real). Configuração do valor em segundos fica em `TextChannelSettingsModal` (Roteiro 3, aba já mencionada como `CORE` mas não re-auditada campo-a-campo nesta passagem). **Achado desta passagem**: não foi encontrado nenhum contador visual no composer mostrando "aguarde Xs" quando o modo lento está ativo e o limite foi atingido — o `textarea`/botão de enviar não têm um estado `disabled` condicionado a isso confirmado em `TextChannels.tsx` (só `isTimedOut`, que é uma restrição diferente — timeout de moderação, não modo lento). **Se essa lacuna se confirmar em auditoria mais profunda**, o usuário só descobriria que está no modo lento ao tentar enviar e receber um erro `429`, sem aviso prévio nem contagem regressiva visível.

---

## 4.22 — TIMEOUT_COMPOSER_LOCK

**ID**: `TIMEOUT_COMPOSER_LOCK`
**NOME**: Composer bloqueado enquanto o usuário está em timeout
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de texto > composer > usuário com member.timeoutUntil no futuro`
**POSIÇÃO NA INTERFACE**: Banner acima do composer (`.reply-composer-banner.timeout-composer-banner`).
**APARÊNCIA**: "Você está em timeout e não pode enviar mensagens até {data/hora}."
**ESTADO NORMAL**: Ausente pra quem não está em timeout.
**HOVER**: Não aplicável (texto estático).
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: `textarea` e botão "Enviar"/anexar todos desabilitados via `isTimedOut`.
**LOADING**: Não aplicável.
**TRIGGER**: `member.timeoutUntil` no futuro (calculado a partir do estado de membro já sincronizado em tempo real via `MEMBER_TIMEOUT_UPDATE`, Roteiro 1).
**PRÉ-CONDIÇÕES**: Timeout ativo aplicado por um moderador (Roteiro de moderação, auditoria própria pendente).
**RESULTADO IMEDIATO**: Composer inteiro trava assim que `member.timeoutUntil` é sincronizado — **em tempo real, sem precisar de F5**, já que `useActiveServerMember` já reage a `MEMBER_TIMEOUT_UPDATE` (confirmado no Roteiro 1).
**RESULTADO VISUAL**: Banner + campos desabilitados.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma até o timeout expirar.
**RESULTADO FINAL**: Composer destravado automaticamente quando `timeoutUntil` passa (**a confirmar se há um timer local recalculando isso, ou só reavalia no próximo evento/F5** — se for só reavaliado em eventos, o composer poderia continuar visualmente travado por um tempo depois do timeout já ter expirado de fato, até algo disparar um re-render).
**EFEITO LOCAL**: Impede envio local.
**EFEITO REMOTO**: Nenhum (é uma restrição já aplicada e visível a todos igualmente, não uma ação nova).
**REALTIME**: `MEMBER_TIMEOUT_UPDATE`.
**BACKEND**: O backend também rejeita o envio de qualquer forma (enforcement real, não só client-side — o client-side é só UX antecipada pra não deixar tentar e falhar).
**BANCO**: Leitura de `server_members.timeout_until`.
**REFRESH**: Recalculado no fetch de membro.
**RECONEXÃO**: Recalculado.
**ERRO**: Se de alguma forma o cliente não tivesse essa trava (bug hipotético) e tentasse enviar mesmo assim, o backend rejeitaria — não testado neste passe se a mensagem de erro do backend nesse caso é amigável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Um moderador removendo o timeout manualmente, ou o tempo expirando.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Texto do banner é lido normalmente por leitores de tela (não confirmado `role="alert"` especificamente neste banner — a verificar).

---

## 4.23 — SYSTEM_POST_TOGGLE (referência — já auditado/construído em profundidade)

**ID**: `SYSTEM_POST_TOGGLE`
**NOME**: Publicar mensagem "como o servidor" (cartão estilo bot/APP)
**STATUS**: `CORE` — implementado, testado e em produção, construído na sessão de trabalho imediatamente anterior a esta fase de auditoria. Resumo (ficha completa já coberta em detalhe prático durante a implementação, não repetida aqui):
- **Caminho**: `Composer > .system-post-toggle (só visível com canManageMessages) > alterna postAsSystem`.
- **Efeito**: mensagem enviada com `senderType: 'SYSTEM'`, renderizada como cartão com ícone/nome do servidor + selo verde "✓ APP", reaproveitando o mesmo `MarkdownText` das mensagens normais.
- **Placeholder do composer muda** para "Publicar como o servidor em #{canal}" enquanto ativo.
- **Permissão**: gated por `canManageMessages` tanto na UI (botão só aparece) quanto no backend (checagem real antes de aceitar `postedAsSystem: true` no corpo da requisição).

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3** e **23 do Roteiro 4** — **95 fichas no total**, cada uma verificada contra o código real. Histórico, composer, reações, pins, busca, forward, markdown e "postar como servidor" já são funcionalidades **reais e testadas** — documentadas como `CORE`, não redescobertas.

**Achados mais importantes deste roteiro** (por ordem de impacto prático no uso real do app): (1) **scroll forçado pro final a cada mensagem nova, mesmo lendo histórico antigo** — sem checagem de posição, sem botão "Novas mensagens", contrariando o comportamento esperado explicitamente pelo pedido original; (2) busca de mensagens encontra resultados antigos mas não consegue navegar até eles (fora da "janela carregada"); (3) nenhum autocomplete de `@`/`#`/`:`/`/` no composer; (4) sem drag-and-drop nem paste de imagem pro chat, só seletor de arquivo por clique; (5) nenhum menu de contexto (botão direito) em mensagens — tudo via hover only, o que também é uma lacuna de acessibilidade por teclado; (6) nenhum feedback visual de "Copiado!" em nenhuma ação de copiar do app inteiro (achado transversal, não só desta seção).

---

# ROTEIRO 5 — TEMPO REAL

Arquitetura real (verificada em `apps/api/src/realtime.ts` e `apps/web/src/realtime.ts`, ambos lidos por completo nesta passagem): WebSocket próprio (biblioteca `ws`, sem Socket.IO/terceiros), autenticado pelo mesmo cookie de sessão HTTP no momento do handshake, sem "salas" (`rooms`) — toda a distribuição de eventos é resolvida on-the-fly consultando quem é membro de qual servidor no banco, a cada envio. Este roteiro documenta a **infraestrutura de tempo real em si** — o mecanismo de entrega de cada evento individual (`TEXT_MESSAGE_CREATE`, `CATEGORY_UPDATE`, etc.) já foi documentado dentro da ficha de cada feature nos Roteiros 3 e 4; aqui entram só as peças que ainda não tinham ficha própria: handshake, heartbeat, escopo de entrega, múltiplos dispositivos, e as duas lacunas grandes (presença e "digitando").

---

## 5.1 — WEBSOCKET_HANDSHAKE_AUTH

**ID**: `WEBSOCKET_HANDSHAKE_AUTH`
**NOME**: Autenticação da conexão WebSocket no momento do handshake
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Cliente > connectRealtime() (chamado uma vez dentro de Workspace.tsx, a única tela pós-login de vida longa) > new WebSocket('wss://.../api/realtime')`
**POSIÇÃO NA INTERFACE**: Não aplicável (infraestrutura, sem UI própria).
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Não aplicável.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável (sem indicador visual de "conectando" confirmado em nenhuma tela até agora nesta auditoria).
**TRIGGER**: `Workspace` montar (uma única vez, depois do login — `started` é uma variável de módulo que impede reabrir se já chamado, confirmado no Roteiro 1).
**PRÉ-CONDIÇÕES**: Cookie de sessão válido já presente (o handshake é a primeira e única vez que a validade da sessão é checada pro WebSocket — depois disso, a conexão **nunca mais revalida** o cookie até cair e precisar reconectar).
**RESULTADO IMEDIATO**: No servidor, `server.on('upgrade', ...)` intercepta antes de qualquer coisa: (1) confirma que a URL é exatamente `/api/realtime`; (2) valida `Origin` contra `config.WEB_ORIGIN` (mesma política já aplicada ao CORS HTTP — se vier de origem diferente, `403 Forbidden` e o socket é destruído na hora, sem completar o handshake WebSocket); (3) `getSessionFromCookieHeader(request.headers.cookie)` — reaproveita a **mesma função exata** usada pelas rotas HTTP (Roteiro 1); (4) `getUserById`+`isBanned` — se o usuário não existir ou estiver banido, `401 Unauthorized`, socket destruído.
**RESULTADO VISUAL**: Nenhum diretamente — se falhar, o cliente só veria `ws.onerror`/`ws.onclose` disparar (ver `REALTIME_RECONNECT`, Roteiro 1) e tentar de novo, **sem nenhuma mensagem específica de "autenticação falhou"** distinta de uma falha de rede qualquer.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Se autenticado com sucesso: `wss.handleUpgrade(...)` completa o handshake, `ws.userId = user.id` fica gravado no próprio socket (usado depois por todo o resto do sistema de distribuição de eventos).
**RESULTADO FINAL**: Socket registrado em `clients` (um `Set` simples, sem indexação por servidor/sala).
**EFEITO LOCAL**: `ws.onopen` no cliente dispara todos os `connectHandlers` (já documentado no Roteiro 1 — é o gatilho de refetch de tudo que cada tela precisa resincronizar).
**EFEITO REMOTO**: Nenhum diretamente.
**REALTIME**: É a própria infraestrutura sendo estabelecida.
**BACKEND**: O handshake em si.
**BANCO**: Leitura de usuário + checagem de ban.
**REFRESH**: F5 sempre refaz o handshake do zero.
**RECONEXÃO**: Ver `REALTIME_RECONNECT_SESSION_EXPIRED` adiante — acontece toda vez que `scheduleReconnect()` dispara.
**ERRO**: `403`/`401` fecham o socket bruto antes mesmo dele virar um WebSocket de verdade (resposta HTTP crua escrita direto no `socket`, `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')` — não é uma mensagem de erro no protocolo WebSocket, é uma rejeição no nível do handshake HTTP que precede o upgrade).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

---

## 5.2 — WEBSOCKET_HEARTBEAT

**ID**: `WEBSOCKET_HEARTBEAT`
**NOME**: Ping/pong periódico para detectar conexões mortas
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > setInterval a cada 30 segundos > todos os clientes conectados`
**POSIÇÃO NA INTERFACE**: Não aplicável — inteiramente invisível ao usuário.
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: A cada 30s (`HEARTBEAT_INTERVAL_MS`), o servidor marca cada cliente como `isAlive = false` e envia um `ping()` nativo do protocolo WebSocket.
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável — sempre ativo enquanto o servidor está no ar.
**LOADING**: Não aplicável.
**TRIGGER**: Timer periódico, automático.
**PRÉ-CONDIÇÕES**: Cliente conectado.
**RESULTADO IMEDIATO**: Cliente responde automaticamente com `pong` (comportamento nativo do navegador/protocolo WebSocket, não código JS explícito do NexPlay no lado do cliente — o handshake de ping/pong é tratado pelo motor do navegador por baixo, invisível até ao próprio código React) → `ws.on('pong', () => { ws.isAlive = true; })` no servidor.
**RESULTADO VISUAL**: Nenhum.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nenhuma.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: No próximo ciclo de 30s, se `isAlive` ainda estiver `false` (nenhum pong recebido no intervalo anterior), `client.terminate()` — a conexão é forçadamente encerrada do lado do servidor.
**RESULTADO FINAL**: Conexões "zumbi" (TCP ainda tecnicamente aberto, mas sem resposta — comum depois de o cliente perder rede abruptamente, sem um `close` limpo) são detectadas e limpas em até ~60 segundos (um ciclo de tolerância + um de confirmação).
**EFEITO LOCAL**: Para o cliente cuja conexão foi terminada: dispara `ws.onclose` → `scheduleReconnect()` (mesmo fluxo do Roteiro 1).
**EFEITO REMOTO**: Nenhum diretamente — mas libera o servidor de continuar tentando entregar eventos pra um socket morto, e a lista de `clients` fica mais precisa pra qualquer coisa que dependa de "quem está online" (relevante, já que não existe indicador de presença hoje — ver `PRESENCE_STATUS` adiante — mas se um dia existir, dependeria diretamente da precisão deste heartbeat).
**REALTIME**: É o próprio mecanismo de saúde da conexão.
**BACKEND**: `setInterval` no processo do servidor, `clearInterval` registrado em `wss.on('close', ...)` (limpeza correta ao encerrar o servidor WebSocket).
**BANCO**: Não aplicável.
**REFRESH**: Reinicia o ciclo do zero a cada nova conexão.
**RECONEXÃO**: Detecção de morte → reconexão automática do cliente.
**ERRO**: Não aplicável (é o próprio mecanismo de detecção de erro/desconexão silenciosa).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

**Nota de auditoria**: 30 segundos é um intervalo razoável (nem agressivo demais gerando tráfego desnecessário, nem tão longo que o usuário fique "conectado" pro servidor por minutos depois de já ter perdido a rede de fato) — não é uma lacuna, é uma escolha de engenharia sã, documentada aqui como `CORE`.

---

## 5.3 — REALTIME_EVENT_SCOPING

**ID**: `REALTIME_EVENT_SCOPING`
**NOME**: Arquitetura de escopo de entrega de eventos (quem recebe o quê)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Não é uma interação — é a arquitetura por trás de **toda** entrega de evento em tempo real do app.
**POSIÇÃO NA INTERFACE**: Não aplicável.
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Três funções de envio, cada uma com escopo diferente, todas resolvendo a lista de destinatários **na hora, sem cache**: `broadcast(event)` — todo cliente conectado, reservado só pra `MEMBER_BANNED`/`MEMBER_UNBANNED` (eventos genuinamente de instância inteira, já que banimento continua global, não por servidor — confirmado consistente com `DISCORD_PARITY_PLAN.md` §1); `sendToServerMembers(serverId, event)` — consulta `server_members` na hora e manda só pra quem é membro daquele servidor específico, usado por **todo** evento de canal/categoria/cargo/membro/mensagem/soundboard; `sendToUsers(userIds, event)` — lista explícita (ex.: os dois participantes de uma DM), cobre múltiplas abas/dispositivos do mesmo usuário automaticamente (itera todos os sockets, filtra por `userId`, não por conexão específica).
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: Cada rota de API que muda algo relevante chama a função de envio apropriada depois de persistir a mudança no banco.
**PRÉ-CONDIÇÕES**: Não aplicável.
**RESULTADO IMEDIATO**: Entrega seletiva e correta — **verificado com script real em sessão anterior desta linha de trabalho confirmando que um não-membro de um servidor nunca recebe os eventos daquele servidor** (confirmado em `DISCORD_PARITY_PLAN.md` §1).
**RESULTADO VISUAL**: Depende do evento específico (já documentado feature por feature nos Roteiros 3/4).
**RESULTADO SONORO**: Não aplicável a esta ficha (arquitetura, não uma ação sonora).
**ANIMAÇÃO**: Não aplicável.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Modelo de segurança simples e certo pra escala de um grupo fechado de amigos — **sem "salas" WebSocket** (nenhum `ws.join(room)` como em Socket.IO), a lista de destinatários é sempre recalculada a partir da fonte de verdade real (o banco), nunca de um cache que poderia ficar desatualizado se a filiação mudar com frequência (`sendToServerMembers` resolve isso a cada chamada, não uma vez na conexão).
**EFEITO LOCAL**: Não aplicável a esta ficha.
**EFEITO REMOTO**: É o próprio mecanismo de efeito remoto de tudo no app.
**REALTIME**: É a própria arquitetura.
**BACKEND**: Consulta ao banco (`listMemberUserIdsForServer`) a cada chamada de `sendToServerMembers` — **um custo real de performance por cada evento enviado** (uma query SQL adicional por broadcast), aceitável na escala atual (grupo fechado de amigos, poucas dezenas de membros no máximo por servidor) mas seria um ponto de atenção se o app crescesse muito — **não é uma lacuna funcional, é uma nota de escalabilidade futura**, registrada aqui porque o pedido original pede pra documentar também o que acontece "no banco"/"no backend" de cada coisa.
**BANCO**: `server_members` consultada a cada envio escopado por servidor.
**REFRESH**: Não aplicável.
**RECONEXÃO**: Não aplicável a esta ficha (a lista de destinatários é sempre recalculada, então uma reconexão simplesmente volta a fazer parte do `clients` novamente).
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

---

## 5.4 — REALTIME_RECONNECT_SESSION_EXPIRED *(achado confirmado)*

**ID**: `REALTIME_RECONNECT_SESSION_EXPIRED`
**NOME**: Tentativa de reconexão com uma sessão já expirada
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: Refina e **confirma definitivamente** um achado que o Roteiro 1 (`REALTIME_RECONNECT`) tinha deixado como "pendente de verificação" — agora confirmado lendo `attachRealtime` por completo nesta passagem.
**CAMINHO EXATO**: `Cliente > WebSocket cai (rede, servidor reiniciado, etc.) > scheduleReconnect() tenta de novo > sessão HTTP já expirou nesse meio-tempo (12h, Roteiro 1)`
**RESULTADO IMEDIATO — CONFIRMADO**: `getSessionFromCookieHeader` no handshake rejeita com `401 Unauthorized` (mesma checagem de `expiresAt` documentada no Roteiro 1). O socket é destruído no nível HTTP, nunca chega a virar uma conexão WebSocket de verdade.
**RESULTADO VISUAL — CONFIRMADO, LACUNA REAL**: do lado do cliente, `ws.onerror = () => ws.close()` e `ws.onclose = () => { socket = null; scheduleReconnect(); }` — **o código do cliente não inspeciona o código de fechamento nem a resposta HTTP do handshake rejeitado**, então uma rejeição por sessão expirada é tratada **exatamente igual** a uma queda de rede comum: agenda nova tentativa com o mesmo backoff exponencial (1s → 2s → 4s → 8s → 15s, depois sempre 15s). **Resultado prático: um usuário com a aba/app aberto além das 12h de sessão fica preso num ciclo infinito de reconexão que nunca vai ter sucesso, silenciosamente, pra sempre, sem nenhuma mensagem sugerindo "faça login de novo".** A única forma de sair desse estado é um F5 manual (que dispara `SESSION_RESTORE_ON_BOOT`, Roteiro 1, que aí sim detecta a sessão morta e mostra a tela de login) ou fechar e reabrir o app.
**EFEITO LOCAL**: Reconexões infinitas fracassadas, silenciosas, sem custo de rede alto (só uma tentativa a cada 15s no estado estável) mas sem nunca resolver.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: É o próprio ciclo quebrado.
**BACKEND**: Rejeita corretamente (o backend está certo — a lacuna é inteiramente do lado do cliente, que não reage à rejeição de forma diferente de uma falha de rede).
**BANCO**: Não aplicável.
**REFRESH**: É a única saída funcional hoje (mencionado acima).
**RECONEXÃO**: É o próprio problema documentado.
**ERRO**: Nunca exposto ao usuário.
**CANCELAMENTO**: Não aplicável — não há como o usuário interromper o ciclo a não ser recarregando manualmente.
**REVERSÃO**: F5 ou reabrir o app.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

**Prioridade de correção sugerida**: média-alta — não é catastrófico (o usuário eventualmente percebe que nada atualiza e recarrega manualmente), mas é silencioso e confuso, e a correção é relativamente simples: o cliente poderia inspecionar o código de fechamento do WebSocket (ou fazer uma checagem HTTP leve tipo `GET /api/session` antes de tentar reconectar) e, se detectar 401, parar de tentar reconectar e mostrar a tela de login diretamente, em vez de re-tentar pra sempre.

---

## 5.5 — MULTI_DEVICE_SYNC

**ID**: `MULTI_DEVICE_SYNC`
**NOME**: Mesmo usuário conectado em múltiplas abas/dispositivos simultaneamente
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB` (inclusive misturado — desktop + web ao mesmo tempo, já que os dois usam o mesmo cookie de sessão/mesma conta)
**CAMINHO EXATO**: `Mesmo usuário > login em duas abas do navegador, ou navegador + cliente desktop, simultaneamente`
**POSIÇÃO NA INTERFACE**: Não aplicável — é um comportamento de sistema, não uma tela específica.
**APARÊNCIA**: Não aplicável.
**ESTADO NORMAL**: Cada aba/dispositivo abre sua própria conexão WebSocket independente (`ws.userId` igual nos dois, mas são dois objetos `TrackedSocket` diferentes no `Set` de `clients`).
**HOVER**: Não aplicável.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável — **não há nenhum bloqueio a múltiplas sessões simultâneas** (diferente de, por exemplo, um app bancário que força logout de sessões antigas) — confirmado por ausência: `createSession`/`setSessionCookie` não invalidam sessões anteriores, e o WebSocket não tem nenhuma lógica de "só uma conexão por usuário" (ao contrário do processo desktop, que tem single-instance lock — Roteiro 0 — mas isso é só dentro do mesmo SO/máquina; nada impede logar em outro computador ao mesmo tempo).
**LOADING**: Não aplicável.
**TRIGGER**: Login em um segundo lugar enquanto já logado em outro.
**PRÉ-CONDIÇÕES**: Credenciais válidas (nenhuma outra checagem).
**RESULTADO IMEDIATO**: Duas (ou mais) conexões WebSocket ativas simultaneamente pro mesmo `userId`.
**RESULTADO VISUAL**: Ambas as telas recebem os mesmos eventos em tempo real (`sendToUsers`/`sendToServerMembers` iteram **todos** os sockets que batem o filtro, não um só) — uma mensagem enviada de uma aba aparece em tempo real na outra, sem precisar de refresh.
**RESULTADO SONORO**: Nenhum específico a esta ficha (cada aba tocaria seus próprios sons normalmente, o que pode gerar sons duplicados se as duas estiverem à vista/audíveis ao mesmo tempo — não mitigado, sem "modo silencioso pra abas em segundo plano" confirmado).
**ANIMAÇÃO**: Não aplicável.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — as duas conexões vivem em paralelo, independentes, até uma delas fechar.
**RESULTADO FINAL**: Sincronização "grátis" entre dispositivos, puramente como efeito colateral da arquitetura de distribuição por `userId` já existir (não foi uma feature construída deliberadamente pra isso, é uma consequência direta e correta do design).
**EFEITO LOCAL**: Cada aba mantém seu próprio estado React independente — **não há sincronização de estado de UI entre abas** (ex.: qual canal está selecionado em uma aba não afeta a outra, só os dados que vêm via eventos de tempo real).
**EFEITO REMOTO**: Nenhuma diferença — outros usuários não sabem/não se importam quantos dispositivos alguém tem conectado (sem indicador de "conectado em múltiplos dispositivos" em lugar nenhum, mesmo que o Discord real tenha algo parecido pra status de atividade).
**REALTIME**: Cobertura automática via `sendToUsers`/`sendToServerMembers`.
**BACKEND**: Nenhuma lógica especial — é o comportamento natural de iterar todos os sockets que casam o filtro.
**BANCO**: Não aplicável.
**REFRESH**: Cada aba/dispositivo é totalmente independente pra fins de F5.
**RECONEXÃO**: Cada conexão reconecta independentemente se cair.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Fazer logout numa aba (`LOGOUT`, Roteiro 1) **não desloga as outras abas/dispositivos** — `DELETE /api/session` só limpa o cookie **daquele navegador específico** que fez a chamada; a sessão continua válida (mesmo `SESSION_SECRET`/assinatura) em qualquer outro lugar onde o cookie ainda esteja presente, já que não há lista de sessões revogáveis (confirmado em `DISCORD_PARITY_PLAN.md` §2: "Logout de todos os dispositivos | BLOCKED — impossível sem sessão stateful").
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Não aplicável.

**Nota de auditoria**: isso é o comportamento correto e esperado (Discord real também sincroniza entre dispositivos livremente) — documentado aqui como `CORE`, não uma lacuna. A lacuna real relacionada já está registrada em `DISCORD_PARITY_PLAN.md` §2: sem lista de sessões ativas, sem "sair de todos os dispositivos".

---

## 5.6 — BAN_FORCE_DISCONNECT (referência — mecanismo já documentado em detalhe)

**ID**: `BAN_FORCE_DISCONNECT`
**NOME**: Sequência exata de desconexão forçada ao banir um usuário
**STATUS**: `CORE` — mecanismo já confirmado funcionando, documentado aqui com a sequência exata (complementa `SESSION_FORCE_LOGOUT_BAN`, Roteiro 1, que documentou o lado do cliente — esta ficha documenta o lado do servidor com mais precisão agora que `realtime.ts` foi lido por completo):
1. `banUser(...)` grava o banimento no banco.
2. `forceDisconnectFromVoice(userId)` — se estava numa call de voz, é desconectado da call primeiro (**antes** de qualquer coisa relacionada ao WebSocket de dados).
3. `broadcast({ type: 'MEMBER_BANNED', userId })` — evento vai pra **todo mundo conectado na instância inteira**, não só pro banido (consistente com banimento ser de instância inteira, não por servidor) — é isso que dispara `void onSignOut()` no cliente do próprio banido (Roteiro 1) **e** permite que outros clientes conectados reajam removendo o usuário de listas de membros/online em tempo real (mecanismo de reação nos *outros* clientes não reauditado em detalhe nesta passagem específica — pertence a uma auditoria futura de moderação).
4. `disconnectUser(userId)` — **só depois** do broadcast, fecha à força qualquer socket WebSocket que aquele `userId` ainda tenha aberto — defesa em profundidade: mesmo que o passo 3 não tivesse sido suficiente por algum motivo (ex.: um clique perdido, uma aba com JS travado), a conexão de dados é encerrada de qualquer forma.
**Achado desta passagem**: a ordem exata (voz → evento → fechar socket) é deliberada e correta — mas **o WebSocket sendo fechado por `disconnectUser` não distingue esse motivo de uma queda de rede comum** (mesmo código de fechamento genérico) — o cliente do usuário banido, ao ter o socket fechado nesse passo 4, entraria no mesmo ciclo de `scheduleReconnect()` normal (Roteiro 1) **se** o passo 3 (receber o evento e fazer logout) não tivesse já acontecido primeiro — como o sign-out já limpa a sessão local antes disso ser relevante, na prática não chega a importar, mas é uma dependência de ordem de execução implícita (não documentada em nenhum comentário do código) que vale reforçar aqui.

---

## 5.7 — TYPING_INDICATOR *(MISSING)*

**ID**: `TYPING_INDICATOR`
**NOME**: Indicador de "Fulano está digitando..."
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo, confirmado no nível do protocolo.** Não é só uma peça de UI ausente — **o próprio tipo de evento não existe** no union `RealtimeEvent` (`packages/shared/src/index.ts`, lido por completo em auditorias anteriores desta linha de trabalho e reconfirmado agora): nenhum `TYPING_START`/`USER_TYPING`/equivalente. Confirmado também por ausência total no composer (Roteiro 4, `MESSAGE_SEND`): nenhum handler de `onChange` do `textarea` dispara nada além de atualizar o estado local `draft` — nenhum "throttled emit" de typing, que é o padrão esperado pelo pedido original (Roteiro 8: "Digitação: emite typing indicator com throttling").
**CAMINHO EXATO ESPERADO** (não implementado): `Canal de texto > rodapé, abaixo da lista de mensagens ou acima do composer > "Fulano está digitando..."` (posição exata seria uma decisão de design nova, já que nunca existiu).
**Pré-requisito de implementação, caso venha a ser feito**: exigiria (a) um novo tipo de evento no protocolo compartilhado; (b) emissão throttled no cliente a cada tecla (não a cada tecla individual — precisa de debounce/throttle pra não inundar o WebSocket); (c) um timeout do lado de quem recebe pra "esquecer" automaticamente que alguém está digitando se não receber um novo sinal em alguns segundos (evita ficar preso mostrando "digitando..." pra sempre se o evento de "parou de digitar" se perder).

---

## 5.8 — PRESENCE_STATUS *(MISSING)*

**ID**: `PRESENCE_STATUS`
**NOME**: Status de presença geral (online/ausente/não perturbe/invisível/offline)
**STATUS ATUAL — PARCIALMENTE ENTREGUE (commits `e1027d3` e `8460085`, em produção)**: existe agora **online e offline**, calculado pelas conexões de tempo real abertas (duas abas contam como uma pessoa), avisado por `PRESENCE_UPDATE` só a quem divide servidor, com `GET /api/servers/:id/presence` (só membros). Ficar offline tem **carência de 5 s**, para F5 ou queda rápida não fazerem a pessoa piscar. **Falta**: ausente, não perturbe e invisível, e mostrar presença fora do painel de membros (lista de amigos, DMs, mini-perfil, painel do usuário). O texto abaixo descreve o estado anterior.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` por completo, confirmado no nível do protocolo** — mesma ausência total no union `RealtimeEvent` que `TYPING_INDICATOR`. Já registrado em `DISCORD_PARITY_PLAN.md` §8: "Presença (online/ausente/dnd/invisível/offline) | MISSING — hoje só existe 'conectado à voz' ou não; não há status de presença geral (só atividade de jogo/música)". **Confirmado nesta passagem que a única forma de saber se alguém está "ativo" hoje é indireta**: (a) estar conectado a um canal de voz (visível na lista de participantes daquele canal específico, Roteiro 3); (b) ter uma atividade detectada (jogo/Spotify, via o mecanismo de `ACTIVITY_DETECT` do Roteiro 0, só disponível no cliente desktop). **Não existe nenhum indicador de "esta pessoa está com o app aberto agora", nem em servidores nem na lista de amigos** — mesmo a infraestrutura de `clients`/`ws.userId` já existindo no servidor (que tecnicamente já sabe quem está conectado, `Set<TrackedSocket>` com `userId` em cada um), **essa informação nunca é exposta pra nenhum cliente** — nenhuma rota, nenhum evento a expõe.
**CAMINHO EXATO ESPERADO** (não implementado): Bolinha de status no avatar (verde/amarelo/vermelho/cinza) em toda a UI — rail de servidores (via mini-perfil), lista de membros, lista de amigos, mini-perfil.
**Pré-requisito de implementação, caso venha a ser feito**: o servidor **já tem os dados brutos necessários** (quem está com socket aberto agora, via o `Set<clients>` já existente) — o trabalho real seria: (a) expor isso como um novo tipo de evento (`PRESENCE_UPDATE`) disparado em `ws.on('close')`/na conexão bem-sucedida; (b) decidir o escopo de quem recebe essas atualizações (provavelmente `sendToServerMembers` pra cada servidor em comum, ou um `sendToUsers` pra lista de amigos — a granularidade certa depende de decisão de produto, não só técnica); (c) status "ausente" automático por inatividade exigiria detectar inatividade no cliente (sem mexer o mouse/teclado por N minutos) e emitir separadamente; (d) "não perturbe"/"invisível" seriam escolhas manuais do usuário, persistidas (provavelmente uma coluna nova em `users`).

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4** e **8 do Roteiro 5** — **103 fichas no total**, cada uma verificada contra o código real (`apps/api/src/realtime.ts` e `apps/web/src/realtime.ts` lidos por completo nesta passagem). A infraestrutura de tempo real em si (handshake, heartbeat, escopo de entrega, multi-dispositivo, desconexão forçada por ban) é sólida e correta — documentada como `CORE`. As duas lacunas mais importantes — **typing indicator** e **presença geral** — estão confirmadas ausentes não só na UI mas no próprio protocolo de eventos compartilhado, o que significa que implementá-las exigiria estender o contrato `RealtimeEvent` em `packages/shared`, não só adicionar componentes React. O achado novo de maior impacto prático: reconectar com uma sessão já expirada entra num loop silencioso e infinito de tentativas que nunca vão ter sucesso, sem nunca avisar o usuário pra logar de novo.

---

# ROTEIRO 6 — VOZ: CONECTAR, MUTE, DEAFEN, DESCONECTAR, CÂMERA, COMPARTILHAR TELA

Prioridade especial do pedido original (Roteiros 10-17). Arquitetura real (verificada em `apps/web/src/livekit/useVoiceRoom.ts`, ~1250 linhas lidas por completo — o arquivo mais denso de todo o app — mais os pontos de uso em `Workspace.tsx`): LiveKit self-hosted (SFU), sem TURN/coturn (já registrado como lacuna em `DISCORD_PARITY_PLAN.md` §5), com uma quantidade de refinamento real que **não é óbvia de fora**: supressão de ruído Krisp de verdade (o mesmo motor WASM que o Discord usa, não uma alternativa mais fraca), 3 perfis de microfone, push-to-talk configurável, gate de voz-ativa com auto-calibração, qualidade de compartilhamento de tela com 3 presets, captura de áudio do sistema com `restrictOwnAudio` pra evitar eco, e um chat de texto próprio dentro da chamada de voz via canal de dados do LiveKit (separado do chat de texto do servidor, Roteiro 4).

---

## 6.1 — VOICE_CHANNEL_JOIN

**ID**: `VOICE_CHANNEL_JOIN`
**NOME**: Conectar a um canal de voz
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > sidebar de canais > categoria de voz > canal de voz específico > clique`
**POSIÇÃO NA INTERFACE**: Botão de canal de voz na sidebar (`ChannelButton`, Roteiro 3).
**APARÊNCIA**: Ícone de voz + nome do canal; durante a conexão, o botão entra em estado de carregamento (`loading={joiningId === room.id}`).
**ESTADO NORMAL**: Canal listado, clicável.
**HOVER**: Padrão de botão de canal.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: `active={voice.currentChannel?.id === room.id && voice.connected}`.
**DISABLED**: Nunca desabilitado no cliente por conta de limite de usuários — a rejeição por sala cheia acontece no backend, na emissão do token (ver `ERRO`).
**LOADING**: Overlay dedicado: `<div className="room-loading" aria-label="Entrando na sala"><span>Entrando na sala...</span></div>` — **não é o comportamento ingênuo de "clicou → apareceu"**: é literalmente uma sala de voz persistente, não uma "ligação" com botão de atender, exatamente como o pedido original especifica que deveria ser.
**TRIGGER**: Clique esquerdo no canal de voz.
**PRÉ-CONDIÇÕES**: Permissão `Connect` implícita — qualquer membro que vê o canal pode entrar (sem overwrite de permissão por canal neste app, ver `DISCORD_PARITY_PLAN.md` §1/§15); canal não pode estar com o limite de usuários já atingido.
**RESULTADO IMEDIATO**: `joinChannel(channel)`: (1) `setSelectedTextChannelId(null)` — sair do contexto de canal de texto; (2) ativa a tela de "Entrando na sala..." (via `flushSync`+`startViewTransition` quando `perfMode === 'full'`, ou diretamente senão — **único lugar do app inteiro que usa a View Transitions API do navegador**, confirmado nesta auditoria); (3) `voice.connect(channel)`.
**RESULTADO VISUAL**: Overlay "Entrando na sala..." enquanto conecta; ao concluir, painel de voz aparece no rodapé da sidebar (mute/deafen já habilitados) e o "voice-status-panel" aparece acima do rodapé mostrando canal/servidor atual + câmera/compartilhar/sair.
**RESULTADO SONORO**: Som de entrada (`playJoinSound`) — mas só tocado **depois** que o microfone já foi publicado (ou já se desistiu dele por erro), não no instante da conexão TCP/WebRTC em si — o som acompanha o momento em que a UI realmente já mostra "dentro" da sala.
**ANIMAÇÃO**: View Transition nativa do navegador (quando `perfMode === 'full'`) na troca de estado "fora → entrando".
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: `api.getLiveKitToken(serverId, channelId)` busca um token de curta duração; `room.connect(url, token, { autoSubscribe: true })` abre a conexão WebRTC de verdade; assim que conectado, `setMicrophoneEnabled(true, ...)` publica o microfone automaticamente (**entra com o mic ligado por padrão**, salvo modo PTT, que já entra com o mic desligado à espera da tecla).
**RESULTADO FINAL**: `currentChannel` setado, `connectionState = Connected`, participante aparece na lista de quem está no canal pra todo mundo (via o próprio LiveKit, que já distribui isso nativamente — não é um evento próprio do NexPlay).
**EFEITO LOCAL**: Microfone ativo publicando (a menos que falhe — ver `ERRO`); dispositivos de áudio/vídeo listados (`refreshDevices()`).
**EFEITO REMOTO**: Outros participantes do canal recebem o evento nativo `ParticipantConnected` do LiveKit, tocam `playJoinSound` (**a menos que já estivessem no canal antes de VOCÊ entrar** — `suppressPresenceSoundsRef` fica `true` por 1.5s depois da conexão, evitando um coro de bipes de entrada pra cada participante já presente sendo processado de uma vez pelo SDK ao sincronizar o estado inicial da sala).
**REALTIME**: Estado de sala/participantes vem inteiramente do próprio LiveKit (WebRTC + seu canal de sinalização), não do WebSocket de dados do NexPlay (Roteiro 5) — são duas conexões de tempo real paralelas e independentes.
**BACKEND**: `POST` de emissão de token LiveKit — **valida limite de usuários da sala aqui** (rejeita se já estiver cheia, confirmado em `DISCORD_PARITY_PLAN.md` §4: "limite de usuários é aplicado de verdade (rejeita o token do LiveKit se a sala já estiver cheia)").
**BANCO**: Nenhuma escrita direta (o LiveKit gerencia o estado de sala em memória própria; webhooks do LiveKit atualizam o WebSocket de dados do NexPlay pra refletir entrada/saída na lista de canais — mecanismo já documentado em `DISCORD_PARITY_PLAN.md` §0).
**REFRESH**: Um F5 **desconecta da call** (mesma categoria de comportamento já documentada no Roteiro 0 — `disconnectOnPageLeave: true` configurado explicitamente na criação do `Room`) — diferente de mensagens de texto, que sobrevivem a um reload, uma call de voz não.
**RECONEXÃO**: Ver `VOICE_NETWORK_RECONNECT` (ficha adiante) para quedas de rede durante uma call já ativa — distinto desta ficha, que é sobre a conexão inicial.
**ERRO**: `withTimeout(..., 20_000, ...)` — **timeout próprio de 20s** tanto pra desconectar de um canal anterior quanto pra conectar no novo (o SDK do LiveKit não tem timeout nativo — numa rede ruim sem TURN, a negociação ICE podia ficar "checking" pra sempre, travando a tela de "Entrando..." sem erro nenhum; isso foi um bug real relatado pelo usuário com prints em sessão anterior, já corrigido). **Rede de segurança adicional** em `Workspace.tsx`: mesmo com o timeout interno, a tela de loading é liberada assim que `voice.connected` vira `true` de verdade (reage ao estado real da conexão, não só à promise), com um teto de 15s que libera de qualquer jeito mesmo se a conexão nunca se confirmar — **dupla camada de proteção contra travamento silencioso**, resultado de duas iterações de correção sobre o mesmo bug real.
**CANCELAMENTO**: **`MISSING`**: não há um botão explícito de "cancelar" na tela de "Entrando na sala..." — só esperar o timeout, ou navegar pra outro canal (o que dispara `setSelectedTextChannelId`/nova tentativa de `joinChannel`, mas não cancela ativamente a tentativa em andamento — `connectingRef` só ignora cliques repetidos, não interrompe o que já começou).
**REVERSÃO**: `VOICE_DISCONNECT` depois de já conectado; ou esperar o erro/timeout se ainda conectando.
**ATALHO**: Nenhum atalho de teclado pra entrar num canal de voz específico.
**MENU DE CONTEXTO**: Ver Roteiro 3 (`CHANNEL_MOVE_VIA_CONTEXT_MENU`) — botão direito num canal de voz abre o menu de mover categoria, não tem opção de "entrar" (entrar é só clique esquerdo).
**ACESSIBILIDADE**: `aria-label="Entrando na sala"` no overlay de loading.

---

## 6.2 — VOICE_CHANNEL_JOIN_ERRORS

**ID**: `VOICE_CHANNEL_JOIN_ERRORS`
**NOME**: Estados de erro ao tentar entrar num canal de voz
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: Mesma ficha de `VOICE_CHANNEL_JOIN`, ramos de falha.
**RESULTADO FINAL — canal cheio**: Token rejeitado pelo backend → erro exibido (mensagem exata do backend, a confirmar palavra por palavra em auditoria futura mais profunda da rota de token).
**RESULTADO FINAL — timeout de rede (sem TURN, ICE travado)**: `withTimeout` rejeita após 20s → `"A conexão com o canal de voz demorou demais. Verifique sua rede e tente de novo."` — mensagem específica e acionável (diz o que fazer), não um erro genérico.
**RESULTADO FINAL — falha ao obter o microfone (permissão negada, sem dispositivo)**: **Achado real de UX bem pensada**: o erro **não impede a entrada na call** — `catch (mediaError) { setError(...'Você entrou com o microfone desligado.') }` — o usuário entra normalmente, só sem áudio de saída, com uma mensagem explicando por quê, em vez de bloquear a entrada inteira por causa do microfone (equivalente ao "permitir entrar como ouvinte" que o pedido original sugere como comportamento desejável quando a arquitetura suportar).
**RESULTADO FINAL — erro genérico/desconhecido**: `connectError.message` ou fallback `"Não foi possível entrar no canal de voz."`; `room.disconnect()` chamado de qualquer forma como limpeza, `currentChannel` volta a `null`.
**EFEITO LOCAL**: Em qualquer erro que impeça a conexão (diferente do caso "sem microfone", que ainda conecta), o usuário permanece fora do canal, livre pra tentar de novo.
**BACKEND**: Ver `VOICE_CHANNEL_JOIN`.
**ERRO**: Mensagens diferenciadas por causa, não um erro genérico único — achado positivo de qualidade de UX.
**Demais campos**: idênticos a `VOICE_CHANNEL_JOIN`, este ficha documenta só os ramos de falha em detalhe.

---

## 6.3 — VOICE_SELF_MUTE

**ID**: `VOICE_SELF_MUTE`
**NOME**: Silenciar/ativar o próprio microfone
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Aplicativo > conectado a um canal de voz > rodapé da sidebar (painel do usuário) > ícone de microfone` — **também disponível** dentro do painel de voz expandido/central (`.voice-action`, linha ~3018 de `Workspace.tsx`), um segundo local com o mesmo controle (auditoria detalhada desse painel central pendente de uma passagem futura sobre o layout completo da tela de voz).
**POSIÇÃO NA INTERFACE**: Extremo esquerdo do grupo de ícones no rodapé da sidebar, ao lado do avatar/nome do próprio usuário.
**APARÊNCIA**: `IconSwap` entre `MicIcon` (ligado) e `MicOffIcon` (desligado); classe `danger` no botão quando `!voice.micEnabled` (destaque vermelho quando mutado, consistente com o padrão de "estado de alerta" já visto em outros botões do app).
**ESTADO NORMAL**: Microfone ligado (ícone normal) assim que conectado (salvo modo PTT, que entra desligado à espera da tecla).
**HOVER**: `title`/`aria-label` dinâmicos: "Desligar microfone" (quando ligado) ou "Ligar microfone" (quando desligado) — tooltip nativo.
**ACTIVE/PRESSED**: Padrão de botão-ícone.
**SELECTED**: Classe `danger` quando mutado.
**DISABLED**: `disabled={!voice.connected || voice.deafened}` — **desabilitado quando não conectado a nenhum canal** (o botão continua visível mesmo fora de uma call, só inerte) **e desabilitado enquanto ensurdecido** (não dá pra desmutar manualmente enquanto o áudio de saída também está desligado — precisa desensurdecer primeiro, ver `VOICE_SELF_DEAFEN`).
**LOADING**: Não aplicável (operação local, sem chamada de rede — é só uma track WebRTC sendo pausada/retomada).
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Conectado a um canal de voz; não estar ensurdecido.
**RESULTADO IMEDIATO**: `toggleMicrophone()`: inverte `room.localParticipant.isMicrophoneEnabled` e chama `setMicrophoneEnabled(novoEstado, opções de captura se ligando)`.
**RESULTADO VISUAL**: Ícone troca instantaneamente (`MicIcon` ↔ `MicOffIcon`); botão ganha/perde destaque vermelho.
**RESULTADO SONORO**: `playMicMuteSound`/`playMicUnmuteSound` (sons distintos pra cada direção, tocados no volume de saída configurado pelo usuário) — **local, tocado só pra quem clicou**, não para os outros participantes.
**ANIMAÇÃO**: Troca de ícone instantânea, sem transição elaborada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Se o Krisp/supressão de ruído estava ativo, é reaplicado automaticamente ao republicar o track de microfone (o processor precisa ser reanexado a cada publish, já que reconectar o track cria um `LocalAudioTrack` novo — mecanismo já confirmado no código).
**RESULTADO FINAL**: Estado do microfone alternado; `syncRoom()` atualiza todo o estado derivado (`micEnabled`, lista de participantes, etc.).
**EFEITO LOCAL**: Track de áudio local pausada/retomada; usuário continua ouvindo os outros normalmente (mutar não afeta recepção).
**EFEITO REMOTO**: LiveKit propaga `TrackMuted`/`TrackUnmuted` nativamente pra todos os outros participantes — o ícone de microfone do usuário aparece mutado/normal na lista de participantes de todo mundo, **em tempo real via WebRTC, não via o WebSocket de dados do NexPlay** (mecanismo de transporte diferente do resto do app, mas com o mesmo efeito prático de "tempo real").
**REALTIME**: `RoomEvent.TrackMuted`/`TrackUnmuted` do LiveKit (distinto do `RealtimeEvent` do Roteiro 5).
**BACKEND**: Nenhuma chamada à API REST do NexPlay — é inteiramente uma operação de mídia WebRTC.
**BANCO**: Não aplicável — estado de mute não é persistido (cada nova conexão sempre começa com o mic ligado, salvo PTT).
**REFRESH**: Não aplicável (a call inteira cai num refresh, ver `VOICE_CHANNEL_JOIN`).
**RECONEXÃO**: Se a conexão cair e reconectar automaticamente (`VOICE_NETWORK_RECONNECT`), o estado de mute **não é confirmado como preservado** nesta passagem — a verificar em auditoria futura mais profunda se o LiveKit republica o track no mesmo estado ou sempre volta a ligado.
**ERRO**: `catch (mediaError) { setError(await describeMediaError(mediaError, 'microphone')) }` — se o dispositivo falhar no meio (ex.: desconectado fisicamente), erro descritivo exibido (mecanismo `describeMediaError` compartilhado com outras fichas de mídia).
**CANCELAMENTO**: Não aplicável (ação instantânea, sem etapa intermediária).
**REVERSÃO**: Clicar de novo (segundo clique, exatamente como o exemplo do próprio pedido original descreve: "Segundo clique: remove o mute, restaura transmissão de áudio, atualiza o ícone e envia atualização em tempo real").
**ATALHO**: **`MISSING`**: nenhum atalho de teclado global pra mute rápido (Discord real geralmente tem um configurável) — confirmado por ausência de qualquer `keydown` global ligado a `toggleMicrophone` fora do fluxo de PTT (que é um mecanismo diferente — segurar uma tecla pra falar, não alternar mute).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` dinâmico correto.

**Comparação direta com o exemplo do pedido original**: o fluxo real bate com o script de exemplo quase ponto a ponto — bloqueia envio de áudio local, não sai da call, continua recebendo áudio dos outros, ícone muda, som local toca, atualização em tempo real via LiveKit, segundo clique reverte tudo. A única lacuna real frente ao exemplo é o **atalho de teclado configurável**, que não existe.

---

## 6.4 — VOICE_SELF_DEAFEN

**ID**: `VOICE_SELF_DEAFEN`
**NOME**: Ensurdecer/reativar a própria escuta (e o microfone junto)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Rodapé da sidebar > painel do usuário > ícone de fone de ouvido`
**POSIÇÃO NA INTERFACE**: Ao lado do botão de microfone.
**APARÊNCIA**: `IconSwap` entre `HeadphonesIcon` (normal) e `HeadphonesOffIcon` (ensurdecido); classe `danger` quando ensurdecido.
**ESTADO NORMAL**: Áudio normal.
**HOVER**: `title` dinâmico: "Desativar áudio" / "Ativar áudio".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `danger` quando `voice.deafened`.
**DISABLED**: `disabled={!voice.connected}` — só ativo dentro de uma call.
**LOADING**: Não aplicável.
**TRIGGER**: Clique esquerdo.
**PRÉ-CONDIÇÕES**: Conectado a um canal de voz.
**RESULTADO IMEDIATO**: `toggleDeafen()`: se vai ensurdecer, **guarda o estado atual do microfone** (`wasMicEnabled.current = isMicrophoneEnabled`) antes de desligá-lo — **aplica mute automaticamente junto** (mesmo comportamento do Discord real: ensurdecer sempre muta também, já que não faz sentido falar sem conseguir ouvir a resposta).
**RESULTADO VISUAL**: Ícone de fone muda; **o botão de microfone também reflete mutado e fica desabilitado** (não dá pra desmutar manualmente enquanto ensurdecido — precisa desensurdecer primeiro, que aí sim restaura o microfone **só se ele já estava ligado antes** de ensurdecer, respeitando a intenção original do usuário).
**RESULTADO SONORO**: Não confirmado um som específico de deafen/undeafen distinto do de mute — a auditoria não encontrou `playDeafenSound`/`playUndeafenSound` nem chamadas de som dentro de `toggleDeafen` (diferente de `toggleMicrophone`, que toca sons próprios) — **achado**: `MISSING` feedback sonoro específico pra esta ação, só o feedback visual (troca de ícone) confirma que funcionou.
**ANIMAÇÃO**: Troca de ícone instantânea.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL — desensurdecer**: `if (wasMicEnabled.current) setMicrophoneEnabled(true, ...)` — **lida corretamente com o caso de já estar mutado antes de ensurdecer**: se o usuário já tinha se mutado manualmente e *depois* ensurdeceu, desensurdecer **não reativa o microfone à força** — respeita que a intenção original era ficar mutado. Exatamente o comportamento correto que o pedido original exige explicitamente: "Deve lidar corretamente com estado que já estava muted antes do deafen."
**EFEITO LOCAL**: Áudio de saída de todos os participantes silenciado (o "ouvir" em si é controlado do lado do cliente que recebe — não precisa de nenhuma sinalização pro resto da sala); microfone também desligado.
**EFEITO REMOTO**: Outros participantes veem o ícone de mute do usuário mudar (consequência do mute automático) — **não veem um indicador específico de "ensurdecido"** separado de "mutado" (o LiveKit só propaga estado de track de microfone, não um conceito de "deafen" — isso é inteiramente um estado do lado do cliente que ensurdeceu, invisível pros outros como conceito distinto).
**REALTIME**: `TrackMuted` (consequência do mute automático); o estado de "áudio de saída desligado" em si nunca viaja pela rede — é só a track de reprodução sendo silenciada localmente no navegador de quem ensurdeceu.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: `deafened` reseta pra `false` a cada nova conexão (confirmado em `connect()`: `setDeafened(false)`).
**RECONEXÃO**: Não confirmado se persiste através de uma reconexão automática de rede (mesma lacuna de verificação de `VOICE_SELF_MUTE`).
**ERRO**: Mesmo padrão de `describeMediaError` se a reativação do microfone falhar ao desensurdecer.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar de novo.
**ATALHO**: **`MISSING`**, mesma lacuna categórica de `VOICE_SELF_MUTE`.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` dinâmico correto.

---

## 6.5 — VOICE_DISCONNECT

**ID**: `VOICE_DISCONNECT`
**NOME**: Sair do canal de voz
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Voice-status-panel (acima do rodapé da sidebar, visível só quando conectado) > ícone de sair` — **também disponível** no painel de voz central expandido (`.voice-action.leave`, mesma duplicação de controle já notada em `VOICE_SELF_MUTE`).
**POSIÇÃO NA INTERFACE**: Último ícone do grupo de ações no `.voice-status-panel`.
**APARÊNCIA**: `LeaveIcon`, classe `danger` fixa (sempre em destaque de alerta, já que é sempre uma ação "de saída").
**ESTADO NORMAL**: Visível só quando `voice.connected`.
**HOVER**: `title="Sair do canal"`.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca (sempre pode sair enquanto conectado).
**LOADING**: Não confirmado indicador visual durante a desconexão em si (provavelmente instantâneo o bastante para não precisar).
**TRIGGER**: Clique esquerdo — **sem confirmação**, ação imediata (correto/esperado — sair de uma call não é destrutivo o bastante pra merecer confirmação, mesmo padrão universal de qualquer app de chamada).
**PRÉ-CONDIÇÕES**: Conectado a um canal de voz.
**RESULTADO IMEDIATO**: `disconnect()`: `room.disconnect()` primeiro, **depois** toca o som de saída (`playLeaveSound`) — ordem deliberada, já documentada no comentário do próprio código: "Só depois de desconectar de verdade — soar isso antes fazia o áudio 'confirmar a saída' enquanto você ainda estava tecnicamente na sala."
**RESULTADO VISUAL**: Painel de voz inteiro (status panel + controles de mic/deafen no rodapé) volta ao estado "fora de call"; se estava com câmera/tela compartilhada ligada, tudo para junto (consequência de `room.disconnect()` derrubar todas as tracks publicadas).
**RESULTADO SONORO**: `playLeaveSound`, tocado depois da desconexão confirmada.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável (sem confirmação, ver `TRIGGER`).
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Todo estado de voz resetado: `currentChannel`, `participants`, `messages` (o chat de texto da call, Roteiro a confirmar), `speakers`, `deafened`, `micEnabled`, `screenEnabled`, `cameraEnabled`, `screenTracks` — **reset completo e explícito de cada pedaço de estado**, não só um "esqueça tudo" genérico.
**EFEITO LOCAL**: Todas as tracks locais (mic, câmera, tela) param.
**EFEITO REMOTO**: Outros participantes recebem `ParticipantDisconnected` nativo do LiveKit, tocam `playLeaveSound` do lado deles também (mesma supressão de som em massa não se aplica aqui — sair é sempre um evento "real" a ser anunciado, diferente de entrar numa sala já cheia).
**REALTIME**: `RoomEvent.ParticipantDisconnected`.
**BACKEND**: Nenhuma chamada HTTP explícita — o LiveKit detecta a desconexão e seus webhooks (`participant_joined`/`left`, já documentados em `DISCORD_PARITY_PLAN.md` §0) atualizam a lista de participantes que aparece na sidebar (fora da call) via o WebSocket de dados do NexPlay.
**BANCO**: Não aplicável diretamente.
**REFRESH**: Não aplicável (já é o estado "fora").
**RECONEXÃO**: Não aplicável (desconexão voluntária, não uma queda a recuperar).
**ERRO**: Não confirmado tratamento de erro específico se `room.disconnect()` falhar (raro, já que desconectar é geralmente uma operação que não deveria rejeitar).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Entrar de novo (`VOICE_CHANNEL_JOIN`).
**ATALHO**: Nenhum atalho de teclado dedicado.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Sair do canal"`.

---

## 6.6 — VOICE_CAMERA_TOGGLE

**ID**: `VOICE_CAMERA_TOGGLE`
**NOME**: Ligar/desligar a câmera
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Voice-status-panel > ícone de câmera`
**POSIÇÃO NA INTERFACE**: Primeiro ícone do grupo de ações do status panel.
**APARÊNCIA**: `IconSwap` entre `CameraIcon`/`CameraOffIcon`; classe `selected` quando ligada (destaque neutro/positivo, diferente do `danger` usado em mute/deafen — câmera ligada não é um "estado de alerta").
**ESTADO NORMAL**: Desligada ao entrar na call (câmera nunca liga automaticamente).
**HOVER**: `title` dinâmico "Desligar câmera"/"Ligar câmera".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `selected` quando ativa.
**DISABLED**: Não condicionado a `voice.connected` explicitamente neste botão específico (diferente de mic/deafen) — **mas só aparece dentro do `voice-status-panel`, que só renderiza `if (voice.connected)`**, então a proteção existe, só que por ausência do elemento inteiro, não por um atributo `disabled`.
**LOADING**: Não confirmado indicador visual durante a negociação de mídia (pedir permissão de câmera pode levar um tempo perceptível na primeira vez).
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Conectado a um canal de voz; permissão de câmera do SO/navegador (ver `MEDIA_PERMISSION` no Roteiro 0 para o mecanismo de checagem no desktop).
**RESULTADO IMEDIATO**: `toggleCamera()`: `setCameraEnabled(!atual, { resolution: h1080 }, { videoEncoding: h1080, simulcast: true })` — **sempre pede 1080p com simulcast** (múltiplas camadas de qualidade, apropriado pra vídeo de câmera visto por gente com conexões variadas — contraste deliberado com compartilhamento de tela, que desliga simulcast, já visto na configuração de `shareSettings`).
**RESULTADO VISUAL**: Tile de vídeo aparece pra outros participantes (mecanismo de exibição em si — grid de vídeo — pertence a uma ficha própria de exibição, `ROTEIRO 16` do pedido original, ainda não auditada em detalhe nesta passagem específica de controles).
**RESULTADO SONORO**: Nenhum som específico confirmado pra ligar/desligar câmera (diferente de mic/tela, que têm sons próprios) — mesma lacuna categórica de `VOICE_SELF_DEAFEN`.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: **`MISSING` confirmado nesta ficha especificamente**: o pedido original espera um menu ao lado com "selecionar dispositivo; background; blur; preview" antes de ligar — não existe: o clique liga a câmera direto, sem preview prévio nem seletor de fundo/blur (fundo/blur já registrado como `MISSING` em `DISCORD_PARITY_PLAN.md` §7 — "Fundo/blur/fundo customizado | MISSING"). Seleção de dispositivo de câmera existe, mas em outro lugar (Configurações de Voz e Vídeo, não um menu contextual ao lado deste botão — auditoria detalhada de Configurações ainda pendente).
**MENU**: Ver acima — `MISSING`.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma além do vídeo aparecer.
**RESULTADO FINAL**: Câmera publicada/despublicada.
**EFEITO LOCAL**: Preview do próprio vídeo (localização exata na UI não confirmada nesta passagem).
**EFEITO REMOTO**: `RoomEvent` nativo de track de vídeo publicada — outros veem o tile de câmera em tempo real.
**REALTIME**: Nativo do LiveKit.
**BACKEND**: Nenhuma chamada HTTP.
**BANCO**: Não aplicável.
**REFRESH**: Câmera cai junto com toda a call (mesma categoria de `VOICE_CHANNEL_JOIN`).
**RECONEXÃO**: Não confirmado se a câmera é republicada automaticamente após uma reconexão de rede.
**ERRO**: `describeMediaError(mediaError, 'camera')` — mesma família de tratamento de erro descritivo de `VOICE_SELF_MUTE`.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar de novo.
**ATALHO**: **`MISSING`**.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` dinâmico correto.

---

## 6.7 — VOICE_SCREEN_SHARE_START

**ID**: `VOICE_SCREEN_SHARE_START`
**NOME**: Iniciar compartilhamento de tela (fluxo completo, multi-etapas)
**PLATAFORMA**: `DESKTOP_WINDOWS` (fluxo completo com picker nativo) / `WEB` (fluxo reduzido, sem picker próprio — ver nota de plataforma)
**CAMINHO EXATO**: `Voice-status-panel > ícone de compartilhar tela`
**POSIÇÃO NA INTERFACE**: Segundo ícone do grupo de ações.
**APARÊNCIA**: `ShareIcon`; classe `selected` quando `voice.screenEnabled`.
**ESTADO NORMAL**: Inativo.
**HOVER**: `title` dinâmico "Compartilhar tela"/"Parar transmissão".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: `selected` quando ativo.
**DISABLED**: Só existe dentro do status panel (mesma proteção implícita de `VOICE_CAMERA_TOGGLE`).
**LOADING**: Não confirmado durante a negociação do picker/captura.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Conectado a um canal de voz.
**RESULTADO IMEDIATO — DESKTOP**: `startOrStopScreenShare()` → `window.desktop.chooseShareSource()` → abre o picker nativo do Electron (`SCREEN_SHARE_PICKER_OPEN`, já documentado em detalhe completo no Roteiro 0: seleção de fonte, qualidade 720p30/720p60/1080p60, toggle de áudio do sistema).
**RESULTADO IMEDIATO — WEB (fora do Electron)**: **Sem picker nativo próprio do NexPlay** — `if (!window.desktop) { await voice.toggleScreenShare(quality); return; }`, usando a qualidade já configurada previamente em Configurações; o próprio `setScreenShareEnabled` do LiveKit então dispara o `getDisplayMedia` padrão do navegador, que mostra **o picker nativo do navegador** (Chrome/Edge/Firefox têm o seu próprio, fora do controle visual do NexPlay) — **diferença real de plataforma, não um bug**: web nunca teve escolha de qualidade/áudio no momento do compartilhamento, só o que já estava configurado antes.
**RESULTADO VISUAL**: Se cancelado no picker (`choice === null`): nada acontece, função retorna cedo. Se confirmado: `voice.toggleScreenShare(quality, shareAudio)`.
**RESULTADO SONORO**: `playScreenShareStartSound`, tocado só depois que a track já foi publicada com sucesso (não no clique, não na escolha do picker — só na confirmação real de que a captura começou).
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável (o picker é uma janela nativa separada no desktop, ver Roteiro 0).
**MENU**: Não aplicável.
**MODAL**: O picker do Electron é o "modal" desta etapa (Roteiro 0).
**SEGUNDA ETAPA**: `setScreenShareEnabled(true, { resolução/fps da qualidade escolhida, áudio: SCREEN_SHARE_AUDIO_CAPTURE se `shareAudio` }, { videoEncoding, simulcast: false, ...configuração de áudio de publicação })`.
**RESULTADO FINAL**: Track de vídeo (e opcionalmente áudio) de tela publicada; `contentHint = 'detail'` aplicado no `MediaStreamTrack` (prioriza nitidez espacial sobre suavidade de movimento — correto pra texto/UI, diferente de vídeo de câmera); `setShareAudioActive(audioPublished)` reflete se o áudio realmente entrou.
**EFEITO LOCAL**: **Se compartilhando áudio do sistema, a captura usa `restrictOwnAudio: true`** — uma constraint real do Chromium (Electron 44+, Windows) que filtra do loopback qualquer som que tenha se originado do próprio app NexPlay, especificamente pra evitar que a voz dos outros participantes (que está tocando pelos alto-falantes de quem compartilha) vaze de volta pra dentro da própria transmissão — **um bug real de eco que foi corrigido com uma API de plataforma específica**, documentado em detalhe no comentário do código.
**EFEITO REMOTO**: Outros participantes recebem a track de vídeo (e áudio, se aplicável) via LiveKit; badge "AO VIVO" aparece na lista de canais de voz (não mais na lista de membros — mudança deliberada de posição por pedido do usuário em sessão anterior, confirmado em `DISCORD_PARITY_PLAN.md` §6).
**REALTIME**: Nativo do LiveKit (publicação de track).
**BACKEND**: Nenhuma chamada HTTP — inteiramente mídia WebRTC.
**BANCO**: Não aplicável.
**REFRESH**: Cai junto com a call inteira.
**RECONEXÃO**: Não confirmado se a tela é republicada automaticamente após queda de rede.
**ERRO**: `isScreenShareCancelled(error)` detecta especificamente o erro `"invalid capture constraints"` (cancelamento do usuário no picker do navegador/SO) e **não mostra isso como erro** — só ramos de falha genuína (permissão negada de verdade, sem fonte disponível) chegam em `setError`.
**CANCELAMENTO**: Cancelar no picker (nativo do Electron ou do navegador) — tratado como não-erro, silenciosamente volta ao estado anterior.
**REVERSÃO**: `VOICE_SCREEN_SHARE_STOP` (ficha seguinte).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` dinâmico.

**Comparação direta com a jornada de exemplo do pedido original**: o script de exemplo (Roteiro 17: abrir seletor → escolher fonte → preview → escolher resolução/FPS → escolher áudio → confirmar → iniciar → som → LIVE → assistir → mudar qualidade → parar) bate **quase inteiramente** com o fluxo real no desktop — a única etapa do script de exemplo que **não existe**: "Usuário A abre menu de qualidade [durante a transmissão já ativa]. Muda resolução. Stream renegocia." — trocar de qualidade **sem encerrar** a transmissão já em andamento é `MISSING`, já registrado em `DISCORD_PARITY_PLAN.md` §6 ("Trocar qualidade sem encerrar | MISSING — precisa renegociar track, não implementado"), e reconfirmado nesta auditoria: `toggleScreenShare` não tem nenhum caminho de "trocar qualidade com a track já publicada" — só liga/desliga.

---

## 6.8 — VOICE_SCREEN_SHARE_STOP

**ID**: `VOICE_SCREEN_SHARE_STOP`
**NOME**: Parar o compartilhamento de tela
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Voice-status-panel > mesmo ícone de compartilhar tela, já ativo` **ou** `barra nativa de compartilhamento do Windows/navegador > botão "Parar de compartilhar"`
**POSIÇÃO NA INTERFACE**: Mesmo botão de `VOICE_SCREEN_SHARE_START` (é um toggle).
**APARÊNCIA**: Ícone perde a classe `selected`.
**ESTADO NORMAL**: Não aplicável (só existe partindo do estado ativo).
**HOVER**: `title="Parar transmissão"`.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Perde o destaque ao parar.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: **Dois caminhos equivalentes, ambos cobertos**: (1) clique no próprio botão do NexPlay; (2) clique em "Parar de compartilhar" na barra nativa que o Windows/navegador sobrepõe automaticamente durante qualquer captura de tela — **achado positivo confirmado no código**: `onLocalTrackUnpublished` no `RoomEvent` cobre especificamente esse segundo caminho ("Cobre o caso de parar o compartilhamento pela barra nativa do Windows/navegador em vez do nosso botão — sem isso, o mudo ficava travado"), com um comentário explícito confirmando que já foi um bug real corrigido.
**PRÉ-CONDIÇÕES**: Compartilhamento ativo.
**RESULTADO IMEDIATO**: `setScreenShareEnabled(false)` (via clique no botão) ou o próprio SDK detectando o encerramento da track (via a barra nativa) — **os dois convergem no mesmo evento `LocalTrackUnpublished`**, que é o único lugar que toca o som de parada — **deliberado**: "tanto o botão quanto a barra nativa acabam disparando este mesmo evento, então tocar o som aqui (em vez de no botão também) evita ele tocar em dobro."
**RESULTADO VISUAL**: Badge "AO VIVO" some da lista de canais de voz; ícone volta ao normal.
**RESULTADO SONORO**: `playScreenShareStopSound` — tocado exatamente uma vez, não importa qual dos dois caminhos encerrou a transmissão.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: `setShareAudioActive(false)` também reseta se o áudio do sistema estava junto.
**RESULTADO FINAL**: Transmissão encerrada por completo; outros participantes deixam de receber a track (LiveKit nativo).
**EFEITO LOCAL**: Track de captura de tela parada, recursos do SO liberados.
**EFEITO REMOTO**: Outros veem o tile de tela compartilhada desaparecer; quem estava assistindo em foco/fullscreen volta pro layout normal da call (comportamento exato de "retornar à call" não reauditado em detalhe nesta passagem — pertence ao Roteiro de exibição/grid, ainda pendente).
**REALTIME**: `RoomEvent.LocalTrackUnpublished` nativo.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Não aplicável (cai com a call inteira de qualquer forma).
**RECONEXÃO**: Não aplicável.
**ERRO**: Não aplicável (parar não deveria falhar).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: `VOICE_SCREEN_SHARE_START` de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` dinâmico.

---

## 6.9 — VOICE_NETWORK_RECONNECT *(correção de registro anterior)*

**ID**: `VOICE_NETWORK_RECONNECT`
**NOME**: Reconexão automática de voz após instabilidade de rede
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS — CORREÇÃO**: `DISCORD_PARITY_PLAN.md` §5 registrava isto como `PARTIAL` ("não verificado explicitamente... não há UI de 'reconectando...'"). **Lendo `Workspace.tsx` nesta passagem, isso está desatualizado**: `connectionLabel` (exibido no rodapé da sidebar, ao lado do nome do usuário) já mapeia `ConnectionState.Reconnecting` para o texto **"Reconectando"**, distinto de "Conectado"/"Conectando"/"Desconectado". **A UI de reconectando existe**, corrigindo o registro anterior — atualizado em `DISCORD_PARITY_PLAN.md` junto com esta passagem de auditoria.
**CAMINHO EXATO**: `Rodapé da sidebar > texto abaixo do nome do usuário` (o mesmo lugar que mostra "Conectado"/"Desconectado" em uso normal).
**POSIÇÃO NA INTERFACE**: `.current-user-copy > span`.
**APARÊNCIA**: Texto simples "Reconectando" (sem spinner/ícone animado confirmado especificamente para este estado — só o texto muda).
**TRIGGER**: `RoomEvent.ConnectionStateChanged` do LiveKit reportando `Reconnecting` — automático, o SDK detecta e tenta se recuperar sozinho (mecanismo interno do LiveKit, não código customizado do NexPlay).
**RESULTADO VISUAL**: Label muda para "Reconectando" enquanto dura.
**RESULTADO FINAL — sucesso**: Volta a "Conectado" quando o LiveKit recupera a conexão sozinho — **sem precisar de intervenção do usuário nem re-entrar no canal manualmente**.
**RESULTADO FINAL — falha em recuperar**: Comportamento exato não confirmado nesta passagem (o LiveKit eventualmente desistiria e cairia pra `Disconnected`? Dispara algum erro visível? — marcado como lacuna de verificação para auditoria futura mais profunda especificamente deste cenário, que exigiria simular perda de rede real pra observar).
**Demais campos**: infraestrutura nativa do LiveKit, não código customizado do NexPlay além de exibir o label — a maior parte dos 36 campos não se aplica de forma diferente do já documentado em `VOICE_CHANNEL_JOIN`.

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência/correção), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5** e **9 do Roteiro 6** — **112 fichas no total**. O núcleo da experiência de voz (conectar, mutar, ensurdecer, desconectar, câmera, compartilhar tela) já é **real, sofisticado e testado** — Krisp de verdade, `restrictOwnAudio` corrigindo um bug real de eco, dois timeouts independentes protegendo contra travamento, detecção da barra nativa de "parar compartilhamento" do SO. Documentado como `CORE`, com uma correção de registro (`VOICE_NETWORK_RECONNECT` já tem UI de "Reconectando", ao contrário do que `DISCORD_PARITY_PLAN.md` registrava antes desta auditoria).

**Lacunas reais confirmadas nesta passagem**: sem atalho de teclado configurável pra mute/deafen (o próprio exemplo do pedido original menciona isso como esperado); sem som específico de deafen/undeafen nem de ligar/desligar câmera; sem preview/seletor de fundo-blur antes de ligar a câmera; sem trocar qualidade de compartilhamento de tela sem reconectar; sem cancelamento explícito da tela "Entrando na sala..." além de esperar o timeout.

---

# ROTEIRO 7 — VOZ: PARTICIPANTES, DISPOSITIVOS, CHAT DA CALL, PTT, PERFIS DE MICROFONE

Continuação direta do Roteiro 6. Arquitetura real (verificada em `Workspace.tsx`, componentes `ChannelButton`/`ParticipantRow`/`VoiceAudioSinks`/`DeviceMenu`, e a seção "Voz e vídeo" de Configurações): a lista de participantes é **persistente por canal na sidebar**, não só um painel que aparece quando conectado; volume é controlado em três canais independentes (voz, tela compartilhada, soundboard); e o chat de texto dentro de uma call é um sistema totalmente separado do chat de canal de texto (Roteiro 4) — mensagens efêmeras via canal de dados WebRTC, sem markdown, sem persistência.

---

## 7.1 — VOICE_PARTICIPANT_SIDEBAR_LIST

**ID**: `VOICE_PARTICIPANT_SIDEBAR_LIST`
**NOME**: Lista de participantes exibida abaixo de cada canal de voz na sidebar
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Servidor > sidebar de canais > qualquer canal de voz > abaixo do nome do canal`
**POSIÇÃO NA INTERFACE**: `.channel-block > .channel-user-row`, uma linha por participante, para **qualquer** canal de voz do servidor — não só o canal em que o próprio usuário está conectado.
**APARÊNCIA**: Avatar (com anel de "falando" se aplicável) + nome + selo `BOT` (se aplicável) + selo "AO VIVO" inline (se compartilhando tela) + ícone de microfone cortado (se mutado) + contador de participantes no próprio botão do canal (`<small>{summary?.participants.length}</small>`).
**ESTADO NORMAL**: Uma linha por participante conectado àquele canal específico.
**HOVER**: Linha do participante reage a hover (botão clicável).
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: O botão de abrir perfil (`channel-user`) é `disabled` especificamente para participantes `BOT` (o NexMusic não tem perfil clicável).
**LOADING**: O botão do canal mostra `"..."` no lugar da contagem de participantes enquanto `loading` (conectando àquele canal específico).
**TRIGGER**: Clique no nome/avatar de um participante (que não seja bot).
**PRÉ-CONDIÇÕES**: Canal visível ao usuário (mesma regra de visibilidade de categoria do Roteiro 3).
**RESULTADO IMEDIATO**: `onOpenProfile(identity, event)` — abre o mini-perfil do participante (`ProfilePopover`, auditoria detalhada própria pendente de um roteiro futuro sobre perfis).
**RESULTADO VISUAL**: Popover de perfil aparece.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: O próprio mini-perfil, ao clicar.
**MENU**: Não aplicável a este clique (ver `VOICE_MODERATOR_DISCONNECT_PARTICIPANT` para o botão de desconectar, que é um elemento separado na mesma linha).
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Depende do mini-perfil.
**RESULTADO FINAL**: Lista sempre reflete quem está em cada canal, em tempo real, **para todos os canais de voz do servidor simultaneamente** — um membro navegando pela sidebar vê a ocupação de todas as salas de uma vez, exatamente como o Discord real.
**EFEITO LOCAL**: Nenhuma mudança de dado, só leitura/navegação.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: A lista de participantes por canal vem dos webhooks do LiveKit (`participant_joined`/`left`) repassados pelo WebSocket de dados do NexPlay (Roteiro 5) — **não** é o `RoomEvent` nativo do LiveKit (que só entrega estado detalhado da sala em que você está fisicamente conectado); é por isso que a lista funciona pra canais em que você não está.
**BACKEND**: `GET /api/servers/:id/rooms` no carregamento inicial do servidor; atualizações incrementais via WebSocket depois.
**BANCO**: Não aplicável diretamente (estado de sala vem do LiveKit, não de uma tabela do NexPlay).
**REFRESH**: Recarregado do zero a cada F5/troca de servidor.
**RECONEXÃO**: Recarregado ao reconectar o WebSocket.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não confirmado clique-direito específico num participante da lista da sidebar (distinto do menu do canal em si, Roteiro 3).
**ACESSIBILIDADE**: `title` descritivo em cada linha.

**Nota de auditoria — achado importante**: `speakingIds` (indicador de fala em tempo real) **só é preenchido pro canal em que o próprio usuário está conectado agora** — confirmado explicitamente no comentário do código: "o LiveKit não entrega 'quem está falando' de salas que você não entrou." Isso significa que a lista de participantes de canais **onde você não está** mostra quem está presente, mas nunca quem está falando naquele momento — limitação arquitetural do LiveKit em si, não uma escolha do NexPlay.

---

## 7.2 — VOICE_SPEAKING_INDICATOR

**ID**: `VOICE_SPEAKING_INDICATOR`
**NOME**: Indicador visual de quem está falando agora
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de voz em que você está conectado > avatar de cada participante`
**POSIÇÃO NA INTERFACE**: `ChannelUserAvatar`, prop `speaking`.
**APARÊNCIA**: Anel/destaque ao redor do avatar (detalhe exato de CSS não relido nesta passagem, mas o mecanismo de dados está confirmado).
**ESTADO NORMAL**: Sem destaque.
**HOVER**: Não aplicável ao indicador em si.
**ACTIVE/PRESSED**: Não aplicável.
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Não aplicável.
**TRIGGER**: `RoomEvent.ActiveSpeakersChanged` do LiveKit — o próprio SFU detecta nível de áudio e decide quem está "falando ativamente" (algoritmo nativo do LiveKit, não um VAD customizado do NexPlay).
**PRÉ-CONDIÇÕES**: Conectado ao mesmo canal do participante.
**RESULTADO IMEDIATO**: `setSpeakers(new Set(active.map(p => p.identity)))` — recalculado a cada mudança.
**RESULTADO VISUAL**: Avatar do(s) participante(s) ativo(s) ganha destaque instantaneamente.
**RESULTADO SONORO**: Não aplicável (é só visual).
**ANIMAÇÃO**: Provavelmente uma transição suave de opacidade/escala no anel (não confirmado o detalhe exato).
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Não aplicável.
**RESULTADO FINAL**: Indicador reflete continuamente quem está com o áudio ativo.
**EFEITO LOCAL**: Puramente visual.
**EFEITO REMOTO**: Nenhum (cada cliente calcula/recebe seu próprio estado de "quem está falando", não é uma ação que alguém dispara).
**REALTIME**: `RoomEvent.ActiveSpeakersChanged`, nativo do LiveKit.
**BACKEND**: Nenhuma chamada à API REST.
**BANCO**: Não aplicável.
**REFRESH**: Recalculado do zero a cada nova conexão.
**RECONEXÃO**: Recalculado.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Não aplicável.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: **Achado**: nenhum `aria-label`/anúncio confirmado indicando "fulano está falando" para leitores de tela — o indicador é puramente visual, sem equivalente sonoro/textual pra quem não pode ver o anel de destaque.

---

## 7.3 — VOICE_MODERATOR_DISCONNECT_PARTICIPANT

**ID**: `VOICE_MODERATOR_DISCONNECT_PARTICIPANT`
**NOME**: Desconectar outro participante de uma call de voz (kick de voz)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de voz (em que você está conectado) > linha do participante > botão de desconectar`
**POSIÇÃO NA INTERFACE**: `.channel-user-disconnect`, à direita da linha do participante.
**APARÊNCIA**: `LeaveIcon` pequeno (12px).
**ESTADO NORMAL**: Visível só quando `canDisconnect = active && participant.identity !== ownIdentity` — **só aparece no canal em que você mesmo está conectado** (não dá pra desconectar alguém de um canal que você só está vendo de fora) **e nunca aparece na sua própria linha**.
**HOVER**: `title`/`aria-label` = "Desconectar {nome}".
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: `disabled={disconnectingIdentity === participant.identity}` — trava só o botão daquele participante específico durante a chamada em andamento (outros participantes continuam desconectáveis normalmente nesse meio-tempo).
**LOADING**: Estado de "desconectando" implícito via o próprio `disabled`.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: **Não confirmado nesta passagem se há checagem explícita de permissão de moderação no cliente** antes de mostrar o botão (a condição vista no JSX é só `active && !== ownIdentity`, sem checar `canManageChannels`/permissão de moderação) — **achado a verificar**: se de fato qualquer membro conectado ao canal pode tentar desconectar qualquer outro (o backend certamente valida via `authorizeVoiceDisconnect`, já confirmado existente e testado em `DISCORD_PARITY_PLAN.md`/testes automatizados desta linha de trabalho — "permite que um participante da sala desconecte outro participante" é literalmente um dos testes já existentes), o que sugere que **isso pode ser deliberadamente aberto a qualquer participante da mesma sala**, não uma ação exclusiva de moderador — comportamento a confirmar com mais certeza numa auditoria futura dedicada a moderação.
**RESULTADO IMEDIATO**: `window.confirm('Desconectar {nome} do canal de voz?')` — confirmação nativa do navegador antes de agir.
**RESULTADO VISUAL**: Se confirmado: participante removido da sala (efeito no cliente dele: cai da call, similar a `VOICE_DISCONNECT` mas forçado externamente).
**RESULTADO SONORO**: Não aplicável ao cliente que desconecta; o cliente desconectado tocaria seu próprio som de saída normalmente (mesmo `playLeaveSound` de uma saída voluntária, já que do lado dele é só uma desconexão de sala).
**ANIMAÇÃO**: Não aplicável.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: O `window.confirm()` nativo (mesma técnica simples já vista em `CATEGORY_DELETE`, Roteiro 3 — não um modal customizado do NexPlay).
**SEGUNDA ETAPA**: `api.disconnectVoiceParticipant(serverId, roomId, identity)`, seguido de um refetch da lista de salas (`api.getRooms`).
**RESULTADO FINAL**: Participante removido da call; lista de salas atualizada.
**EFEITO LOCAL**: Nenhuma mudança pro cliente que desconectou (além da lista atualizar).
**EFEITO REMOTO**: O participante desconectado é ejetado da sala LiveKit à força (mecanismo exato — kick via API do LiveKit — já confirmado existente em `apps/api/src/index.ts`/`voiceModeration.ts`, auditado informalmente em sessão anterior).
**REALTIME**: `RoomEvent.ParticipantDisconnected` do lado de quem foi removido; lista de salas atualizada via WebSocket de dados pra todo mundo.
**BACKEND**: `POST /api/servers/:id/rooms/:roomId/participants/:identity/disconnect`.
**BANCO**: Não aplicável diretamente (é uma ação de sala LiveKit, não uma escrita de dado persistente do NexPlay).
**REFRESH**: Não aplicável.
**RECONEXÃO**: Participante desconectado pode entrar de volta imediatamente (não é um ban/timeout — só uma ejeção pontual da sala, sem bloqueio de reentrada).
**ERRO**: `window.alert(error.message ou 'Não foi possível desconectar {nome}.')` — **achado real de bug de encoding**: a mensagem de fallback no código-fonte lido aparece como `"N?o foi poss?vel desconectar..."` em vez de `"Não foi possível desconectar..."` — caracteres acentuados corrompidos (`ã`/`í` viraram `?`), sugerindo um problema de codificação de arquivo nesse trecho específico do código-fonte que se manifestaria literalmente assim na tela pro usuário final.
**CANCELAMENTO**: Clicar "Cancelar" no `window.confirm()`.
**REVERSÃO**: A pessoa desconectada pode simplesmente entrar de volta no canal.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável (é um botão dedicado, não um item de menu).
**ACESSIBILIDADE**: `aria-label` descritivo com o nome do participante.

---

## 7.4 — VOICE_PARTICIPANT_VOLUME_CONTROL

**ID**: `VOICE_PARTICIPANT_VOLUME_CONTROL`
**NOME**: Ajustar o volume individual de um participante
**STATUS ATUAL — MUDOU (commit `1fa99f4`, em produção)**: (1) o volume agora **persiste**: fica em `localStorage` por conta (`np:voice-volumes:<usuário>`), volta igual depois de fechar e abrir o app e já vale desde o primeiro áudio; (2) o controle deslizante **saiu do painel da direita** e passou para o **botão direito na pessoa, na lista de canais de voz à esquerda** (também no bot de música; sem controle para si mesmo), com "Redefinir volume (100%)". O texto abaixo descreve o controle antigo do roster, que foi removido.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Painel de voz expandido (central, não a sidebar) > linha do participante > controle de volume` (componente `ParticipantRow`, distinto da lista compacta da sidebar já documentada em `VOICE_PARTICIPANT_SIDEBAR_LIST`)
**POSIÇÃO NA INTERFACE**: `.volume-control`, à direita de cada linha de participante remoto (**não aparece na própria linha do usuário local** — `{!local && (...)}`, já que não faz sentido ajustar o próprio volume de recepção).
**APARÊNCIA**: `<input type="range" min="0" max="100">` com rótulo "Vol." e valor numérico exibido (`<output>{volume}</output>`).
**ESTADO NORMAL**: 100% por padrão (`volumes[identity] ?? 100`).
**HOVER**: `title="Volume de {nome}: {valor}%"`.
**ACTIVE/PRESSED**: Arrastando o slider, valor atualiza em tempo real.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca (sempre ajustável para qualquer participante remoto).
**LOADING**: Não aplicável.
**TRIGGER**: Arrastar o slider, clicar em um ponto dele, ou navegação por teclado (seta esquerda/direita com foco no slider — comportamento nativo de `<input type="range">`).
**PRÉ-CONDIÇÕES**: Conectado à mesma call que o participante.
**RESULTADO IMEDIATO**: `setVolume(novoValor)` — atualiza o estado local `volumes[identity]`.
**RESULTADO VISUAL**: Número exibido atualiza junto com a posição do slider.
**RESULTADO SONORO**: O volume de reprodução daquele participante específico muda **imediatamente** (aplicado via `RemoteAudioSink`, Roteiro a confirmar mecanismo exato de mixagem de áudio).
**ANIMAÇÃO**: Nativa do `<input type="range">`.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Volume individual daquele participante ajustado só para o ouvinte local — **é um controle inteiramente pessoal, nunca sincronizado com ninguém** (nem com o próprio participante cujo volume foi ajustado, nem com outros ouvintes).
**EFEITO LOCAL**: Mixagem de áudio local ajustada.
**EFEITO REMOTO**: **Nenhum** — o participante cujo volume foi abaixado/aumentado não é notificado nem afetado; é puramente do lado de quem ajusta.
**REALTIME**: Não aplicável (nenhuma sincronização de rede envolvida).
**BACKEND**: Nenhuma chamada.
**BANCO**: **Não persiste** — `volumes` é estado React local (a confirmar exatamente onde vive esse estado — provavelmente em `Workspace.tsx`, resetado a cada nova sessão de call, já que não há chamada de API nem `localStorage` confirmado para isso).
**REFRESH**: Volta a 100% em qualquer reconexão/F5.
**RECONEXÃO**: Volta ao padrão (100%) — **lacuna real de conveniência**: se alguém sempre ajusta o volume de uma pessoa específica pra baixo, precisa refazer isso toda vez que reconecta.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Arrastar de volta.
**ATALHO**: Setas do teclado com foco no slider (nativo do HTML).
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Volume de {nome}"` no input — rotulado corretamente por participante.

**Nota de auditoria**: existem **três canais de volume independentes** no sistema (confirmado em `VoiceAudioSinks`/`useVoiceRoom`): volume de voz por participante (esta ficha), `streamVolume` (volume específico do áudio de tela compartilhada de cada participante, separado do volume de voz dele) e `soundboardVolume` (volume geral do soundboard, Roteiro a confirmar onde é ajustado). Essa granularidade de três volumes distintos por pessoa/fonte é mais refinada do que muitos apps de chamada — documentado aqui como `CORE`, mas nenhum dos três persiste entre sessões.

---

## 7.5 — VOICE_AUDIO_PERSISTS_ACROSS_VIEWS (referência — arquitetura correta confirmada)

**ID**: `VOICE_AUDIO_PERSISTS_ACROSS_VIEWS`
**NOME**: Áudio da call continua tocando ao navegar para outras telas do app
**STATUS**: `CORE` — confirmado lendo o comentário explícito do código (`VoiceAudioSinks` em `Workspace.tsx`): "Sempre montado enquanto conectado à voz, independente de qual canal (texto ou voz) está sendo exibido — antes o áudio ficava preso dentro do painel de membros da chamada, então trocar pra um canal de texto silenciava todo mundo até reconectar. Áudio não pode depender de qual tela está visível." — **um bug real já corrigido**, documentado aqui como confirmação positiva de que a correção está de pé.
**Comportamento verificado**: navegar para um canal de texto, abrir Configurações, trocar de servidor (permanecendo conectado à voz de um servidor enquanto visualiza outro — **a confirmar se trocar de *servidor* ativo desconecta da voz ou não**, distinto de só trocar de canal de texto dentro do mesmo servidor, que claramente não desconecta) — em nenhum desses casos o áudio da call deveria parar, já que `VoiceAudioSinks` é renderizado incondicionalmente sempre que `voice.connected`, fora da árvore condicional de qual conteúdo central está sendo exibido.
**Relevância para `ROTEIRO 51` do pedido original** ("background behavior" — `WINDOW_VISIBLE` ≠ `VOICE_CONNECTED` ≠ `WEBSOCKET_CONNECTED` são estados independentes): esta é exatamente a confirmação de que `VOICE_CONNECTED` não depende de qual tela está visível *dentro* do app — só falta confirmar a extensão disso pra fora do app (janela minimizada/oculta, já auditado no Roteiro 0 como funcionando, já que nada no processo desktop pausa a `WebContents` ao minimizar).

---

## 7.6 — VOICE_DEVICE_SELECT

**ID**: `VOICE_DEVICE_SELECT`
**NOME**: Selecionar dispositivo de entrada/saída de áudio
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Rodapé da sidebar > seta pequena ao lado do ícone de microfone/fone de ouvido` (`DeviceMenu`, dois componentes idênticos — um pra entrada, um pra saída)
**POSIÇÃO NA INTERFACE**: `.device-menu-chevron`, ícone de seta pequena colado a cada botão principal (mic/deafen).
**APARÊNCIA**: `ChevronIcon` (12px); ao abrir, `.device-menu-popover` com "Padrão do sistema" + um item por dispositivo detectado (`device.label`, o nome real do hardware conforme reportado pelo SO/navegador).
**ESTADO NORMAL**: Fechado; "Padrão do sistema" selecionado por padrão (`selectedMicId`/`selectedSpeakerId = 'default'`).
**HOVER**: Padrão de item de menu.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `active` no dispositivo/opção atualmente escolhido.
**DISABLED**: Não aplicável — a lista sempre mostra pelo menos "Padrão do sistema", mesmo sem nenhum dispositivo extra detectado.
**LOADING**: Não aplicável.
**TRIGGER**: Clique na seta abre; clique num item seleciona e fecha; **clique fora fecha sem selecionar** (`mousedown` global com checagem de `contains`, mesma técnica de popover já vista em outros lugares do app).
**PRÉ-CONDIÇÕES**: Nenhuma — funciona mesmo fora de uma call ativa (a troca de dispositivo padrão fica pronta pra próxima vez que conectar, ou aplicada em tempo real se já conectado, via `room.switchActiveDevice`).
**RESULTADO IMEDIATO**: `onSelect(deviceId)` → `setSelectedMicId`/`setSelectedSpeakerId` + `room.switchActiveDevice('audioinput'/'audiooutput', deviceId)`.
**RESULTADO VISUAL**: Popover fecha, item selecionado passa a refletir a nova escolha.
**RESULTADO SONORO**: Nenhum som de confirmação (a troca em si não é anunciada sonoramente).
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: É o próprio popover.
**MENU**: É o próprio menu.
**MODAL**: Não é modal.
**SEGUNDA ETAPA**: Nenhuma — troca é imediata, mesmo com uma call já em andamento (`switchActiveDevice` troca o dispositivo ativo sem precisar reconectar).
**RESULTADO FINAL**: Áudio passa a ser capturado/reproduzido pelo novo dispositivo.
**EFEITO LOCAL**: Troca de hardware de captura/reprodução.
**EFEITO REMOTO**: Nenhum diretamente (mudar de microfone não muda a qualidade percebida pelos outros além do que o hardware novo naturalmente capta).
**REALTIME**: Não aplicável (troca de dispositivo é local).
**BACKEND**: Nenhuma chamada.
**BANCO**: **Não confirmado se `selectedMicId`/`selectedSpeakerId` persistem em `localStorage`** entre sessões — diferente de várias outras preferências de voz (perfil de microfone, modo PTT, tecla PTT, supressão/eco/ganho — todos confirmados com chaves de `localStorage` explícitas no código já lido) — a escolha de dispositivo específico **não tem uma chave de persistência visível** nesta auditoria, sugerindo que sempre volta a "Padrão do sistema" a cada novo lançamento do app.
**REFRESH**: Ver acima — provavelmente reseta.
**RECONEXÃO**: Dispositivo escolhido deveria se manter durante a mesma sessão do app (só o estado React, não recarregado).
**ERRO**: Não aplicável a esta interação específica (erros de dispositivo aparecem nas fichas de `VOICE_SELF_MUTE`/`VOICE_CHANNEL_JOIN`).
**CANCELAMENTO**: Clicar fora do popover.
**REVERSÃO**: Escolher outro dispositivo, ou "Padrão do sistema" de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label`/`title` no botão de abrir (usa o `label` passado como prop, "Escolher microfone"/"Escolher saída de áudio").

**Nota de auditoria**: **não existe o mesmo `DeviceMenu` pra câmera** diretamente no painel rápido — seleção de câmera fica em Configurações > Voz e vídeo (`setCameraDevice`, já confirmado existir no hook, mas exposto só na tela de configurações completa, não como um chevron rápido ao lado do botão de câmera do jeito que mic/fone têm).

---

## 7.7 — VOICE_TEXT_CHAT_TOGGLE

**ID**: `VOICE_TEXT_CHAT_TOGGLE`
**NOME**: Abrir/fechar o chat de texto dentro de uma call de voz
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de voz (conectado) > linha do canal na sidebar > ícone de balão de chat`
**POSIÇÃO NA INTERFACE**: `.channel-chat-toggle`, só visível quando `active` (você está conectado àquele canal específico).
**APARÊNCIA**: `MessageIcon` (13px); classe `active` quando o painel de chat está aberto.
**ESTADO NORMAL**: Fechado por padrão ao entrar num canal.
**HOVER**: `title` dinâmico "Abrir chat"/"Fechar chat".
**ACTIVE/PRESSED**: `event.stopPropagation()` no clique — **impede que o clique também dispare a seleção do canal por baixo** (já que o botão fica dentro da mesma linha clicável do canal).
**SELECTED**: Classe `active` quando aberto.
**DISABLED**: Só existe quando conectado àquele canal.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Conectado ao canal de voz.
**RESULTADO IMEDIATO**: `onToggleChat()` → `setChatOpen(!chatOpen)`.
**RESULTADO VISUAL**: Painel lateral `.chat-panel` aparece/desaparece; `.room-content` ganha classe `with-chat`, redistribuindo o layout.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não é modal (painel lateral persistente).
**SEGUNDA ETAPA**: Ver `VOICE_TEXT_CHAT_SEND`.
**RESULTADO FINAL**: Painel de chat visível/oculto.
**EFEITO LOCAL**: Apenas visual/layout.
**EFEITO REMOTO**: Nenhum — abrir/fechar o painel é uma preferência de visualização inteiramente pessoal, invisível para os outros participantes.
**REALTIME**: Não aplicável ao toggle em si.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: `chatOpen` reseta ao trocar de canal/reconectar (estado local, não persistido).
**RECONEXÃO**: Reseta.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Clicar de novo, ou o X dentro do próprio painel (`.chat-close`).
**REVERSÃO**: Clicar de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label` dinâmico.

---

## 7.8 — VOICE_TEXT_CHAT_SEND

**ID**: `VOICE_TEXT_CHAT_SEND`
**NOME**: Enviar uma mensagem no chat de texto da call
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Painel de chat da call (aberto) > composer próprio, no rodapé do painel`
**POSIÇÃO NA INTERFACE**: `.chat-panel`, rodapé.
**APARÊNCIA**: Campo de texto + botão de enviar (estrutura exata do composer não relida campo-a-campo nesta passagem, mas o comportamento de envio já foi lido em `useVoiceRoom.ts`/`Workspace.tsx`).
**ESTADO NORMAL**: Vazio.
**HOVER**: Padrão de composer.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: `room.state !== ConnectionState.Connected` bloqueia o envio (`sendMessage` retorna cedo).
**LOADING**: Não confirmado indicador de "enviando".
**TRIGGER**: Enter/clique em enviar.
**PRÉ-CONDIÇÕES**: Conectado à call.
**RESULTADO IMEDIATO**: `routeVoiceChatInput` decide entre comando de música (mesmo roteamento de `/play` etc. do chat de texto normal, Roteiro 4) ou mensagem de chat de voz normal.
**RESULTADO VISUAL**: Mensagem aparece no painel, para todos os participantes conectados à mesma call.
**RESULTADO SONORO**: `playMessageSound` — **toca para quem recebe a mensagem** (confirmado no handler `onData` do `RoomEvent.DataReceived`), não confirmado se toca também para quem envia a própria mensagem (o handler de recebimento é só pra mensagens de **outros** participantes, via `RemoteParticipant` — mensagens do próprio remetente são adicionadas diretamente ao estado local em `sendMessage`, sem passar pelo mesmo caminho de som).
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL — ACHADO IMPORTANTE, DISTINTO DO CHAT DE CANAL**: mensagem entregue via `room.localParticipant.publishData(...)` — **canal de dados WebRTC do LiveKit, não o WebSocket do NexPlay nem a API REST**. Isso significa: (1) **nenhuma persistência** — não existe uma tabela de "mensagens de chat de voz" no banco, a mensagem só existe na memória de quem está conectado no momento; (2) **quem entra depois não vê o histórico** — `voice.messages` é resetado a cada `connect()`/`disconnect()` (já confirmado no Roteiro 6); (3) **sem markdown** — o painel renderiza `<p>{message.text}</p>` puro, sem passar por `MarkdownText` (diferente do chat de canal de texto, Roteiro 4, que tem negrito/itálico/etc.) — texto literal, sem formatação nenhuma; (4) **limitado a quem está na mesma sala LiveKit**, não escopado por `sendToServerMembers` como o resto do app.
**EFEITO LOCAL**: Mensagem adicionada ao estado local (`messages`, limitado às últimas 100 — `current.slice(-99)` antes de adicionar a nova).
**EFEITO REMOTO**: Outros participantes da mesma call recebem via `DataReceived`.
**REALTIME**: Canal de dados WebRTC (`VOICE_CHAT_TOPIC`), não `RealtimeEvent` do Roteiro 5.
**BACKEND**: Nenhuma chamada à API REST do NexPlay pra mensagens normais (só comandos de música passam pela API, via `sendMusicCommand`).
**BANCO**: **Nenhuma escrita** — confirmado, não existe persistência.
**REFRESH**: Todo o histórico da call se perde num F5 (cai a call inteira, ver Roteiro 6).
**RECONEXÃO**: Se a call cair e reconectar, o histórico de chat também se perde (não é recuperado do LiveKit, que também não guarda isso — é puramente transiente).
**ERRO**: `setError(commandError.message ou 'Não foi possível encaminhar o comando ao NexMusic.')` — mensagem de erro é específica de comando de música, sugerindo que o caminho de erro mais comum testado é o roteamento de comando, não o envio de texto simples (que dificilmente falharia, já que é só publicar um pacote de dados).
**CANCELAMENTO**: Apagar o texto antes de enviar.
**REVERSÃO**: **`MISSING`** — sem editar/apagar mensagens do chat de voz (diferente do chat de canal, que tem os dois).
**ATALHO**: Enter para enviar (padrão universal do app, não confirmado Shift+Enter para nova linha especificamente aqui).
**MENU DE CONTEXTO**: **`MISSING`** — sem toolbar de hover nem menu de contexto no chat de voz (diferente do chat de canal, que tem reagir/responder/copiar/fixar/editar/apagar) — **este chat é deliberadamente muito mais simples**, praticamente só texto + comandos de música.
**ACESSIBILIDADE**: `aria-live="polite"` no container de mensagens (mesma técnica já vista no chat de canal).

**Nota de auditoria**: esta é uma divergência arquitetural real e deliberada frente ao chat de canal de texto — vale a pena confirmar com o usuário, numa fase de decisão de produto futura, se essa simplicidade (efêmero, sem markdown, sem histórico) é intencional pra sempre ou um "MVP" que deveria eventualmente ganhar as mesmas funcionalidades do chat de canal.

---

## 7.9 — VOICE_INPUT_MODE_SELECT

**ID**: `VOICE_INPUT_MODE_SELECT`
**NOME**: Escolher entre "Voz ativa" e "Push to talk"
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações > Voz e vídeo > seção de modo de entrada > dois cartões`
**POSIÇÃO NA INTERFACE**: `.input-mode-card`, dois cartões lado a lado (mesmo padrão visual de `CHANNEL_TYPE_SELECT`, Roteiro 3).
**APARÊNCIA**: Cartão "Voz ativa" (`MicIcon` + "O microfone é ativado automaticamente quando você fala.") e "Push to talk" (`MicOffIcon` + "O microfone só é ativado quando você pressiona uma tecla.").
**ESTADO NORMAL**: "Voz ativa" é o padrão (`loadInputMode()` cai em `'voice'` se nunca configurado).
**HOVER**: Padrão de cartão clicável.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `active` no cartão escolhido.
**DISABLED**: Nunca.
**LOADING**: Não aplicável.
**TRIGGER**: Clique no cartão.
**PRÉ-CONDIÇÕES**: Nenhuma — configurável mesmo fora de uma call ativa.
**RESULTADO IMEDIATO**: `setInputMode(modo)`: persiste em `localStorage` (`np:input-mode`); **se já conectado a uma call no momento da troca**, aplica na hora: mudar para "Voz ativa" liga o microfone imediatamente; mudar para PTT desliga o microfone imediatamente (até a tecla ser pressionada).
**RESULTADO VISUAL**: Cartão escolhido ganha destaque; se PTT, campo de tecla aparece (ver `VOICE_PTT_KEY_REBIND`).
**RESULTADO SONORO**: Nenhum confirmado especificamente nesta troca (os sons de mute/unmute do `toggleMicrophone` **não** são os mesmos disparados aqui — a troca de modo chama `setMicrophoneEnabled` diretamente, sem passar pelos handlers que tocam som).
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Se PTT: configurar a tecla (ficha seguinte).
**RESULTADO FINAL**: Modo de entrada de voz mudado, efetivo imediatamente e persistido pra futuras sessões.
**EFEITO LOCAL**: Comportamento do microfone muda fundamentalmente (contínuo vs. sob demanda).
**EFEITO REMOTO**: Nenhum diretamente — outros só percebem o efeito indireto (o microfone ficar mais silencioso/intermitente se PTT).
**REALTIME**: Reflexo em `TrackMuted`/`TrackUnmuted` nativo do LiveKit quando aplicável.
**BACKEND**: Nenhuma chamada — preferência 100% local.
**BANCO**: `localStorage` (`np:input-mode`), não banco de dados do servidor — **preferência por dispositivo/navegador, não por conta** (logar em outro computador não traria essa preferência junto).
**REFRESH**: Persiste (é `localStorage`, sobrevive a F5 e a fechar/reabrir o navegador/app).
**RECONEXÃO**: Mantido.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Escolher o outro cartão.
**REVERSÃO**: Escolher o outro cartão.
**ATALHO**: Nenhum atalho pra alternar rapidamente sem entrar em Configurações.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Cartões são `<button>` reais, alcançáveis via Tab — mesma lacuna já notada em `CHANNEL_TYPE_SELECT` (sem semântica `radiogroup` formal).

---

## 7.10 — VOICE_PTT_KEY_REBIND

**ID**: `VOICE_PTT_KEY_REBIND`
**NOME**: Configurar a tecla de push-to-talk
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações > Voz e vídeo > modo PTT selecionado > "Tecla de push-to-talk"`
**POSIÇÃO NA INTERFACE**: `.ptt-key-button`, abaixo dos cartões de modo de entrada, só visível com `inputMode === 'ptt'`.
**APARÊNCIA**: Botão mostrando a tecla atual (ex.: `ControlRight`, o padrão) ou "Pressione uma tecla…" durante a captura.
**ESTADO NORMAL**: Mostra a tecla configurada.
**HOVER**: Padrão de botão.
**ACTIVE/PRESSED**: Clicado, entra em modo de escuta.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca.
**LOADING**: O texto "Pressione uma tecla…" **é** o estado de espera/captura.
**TRIGGER**: Clique no botão inicia a captura (`setListeningForKey(true)`); **a próxima tecla física pressionada em qualquer lugar da janela** é capturada como a nova tecla de PTT (mecanismo exato de captura — provavelmente um `keydown` global temporário — não relido linha a linha nesta passagem, mas o padrão é claro pelo texto "Pressione uma tecla…").
**PRÉ-CONDIÇÕES**: Modo PTT selecionado.
**RESULTADO IMEDIATO**: Botão entra em modo de escuta ativa.
**RESULTADO VISUAL**: Texto muda para "Pressione uma tecla…".
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Pressionar qualquer tecla física.
**RESULTADO FINAL**: `setPttKeyBinding(event.code)` — persiste em `localStorage` (`np:ptt-key`); botão volta a mostrar o nome da nova tecla.
**EFEITO LOCAL**: Doravante, segurar essa tecla (em vez da anterior) ativa o microfone durante uma call.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada.
**BANCO**: `localStorage`, por dispositivo/navegador.
**REFRESH**: Persiste.
**RECONEXÃO**: Mantido.
**ERRO**: **Não confirmado** o que acontece se a tecla capturada já for usada por outro atalho do sistema/navegador, ou se `Escape` durante a captura cancela em vez de virar a nova tecla de PTT (comportamento razoável esperado, mas não confirmado no código lido nesta passagem).
**CANCELAMENTO**: Comportamento de Esc durante a captura não confirmado (ver `ERRO`).
**REVERSÃO**: Reconfigurar de novo.
**ATALHO**: É o próprio mecanismo de configuração de atalho.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: **Achado**: capturar "qualquer tecla" via um listener genérico pode conflitar com navegação normal por teclado (Tab, setas) se o usuário só estiver tentando navegar pela tela de configurações e acidentalmente estiver com o botão de captura ativo — comportamento exato de quais teclas são aceitas/ignoradas durante a captura não confirmado nesta passagem.

---

## 7.11 — VOICE_MIC_PROFILE_SELECT

**ID**: `VOICE_MIC_PROFILE_SELECT`
**NOME**: Escolher o perfil de processamento de microfone
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações > Voz e vídeo > seção de perfil de microfone > três cartões`
**POSIÇÃO NA INTERFACE**: Três `.input-mode-card` (mesmo componente visual reaproveitado de `VOICE_INPUT_MODE_SELECT`/`CHANNEL_TYPE_SELECT`).
**APARÊNCIA**: "Isolamento de Voz" (padrão — Krisp real ou supressão nativa + eco/ganho automáticos), "Estúdio" ("Áudio puro": mic aberto sem nenhum processamento, igual ao Discord), "Personalizado" (expõe supressão/eco/ganho/sensibilidade individualmente).
**ESTADO NORMAL**: "Isolamento de Voz" por padrão pra instalações novas; migração inteligente pra quem já tinha desligado supressão de ruído no toggle antigo (única opção que existia antes desse recurso existir) — cai em "Personalizado" automaticamente pra preservar a preferência antiga em vez de reativar supressão silenciosamente.
**HOVER**: Padrão de cartão.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `active`.
**DISABLED**: Nunca.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `setMicProfile(perfil)`: persiste em `localStorage` (`np:mic-profile`); `applyMicCaptureOptions()` reaplica as constraints no track de microfone **já publicado**, sem precisar reconectar à call; se o Krisp estiver carregado, `krispProcessorRef.current?.setEnabled(...)` liga/desliga o processor conforme o perfil escolhido pedir supressão real ou não.
**RESULTADO VISUAL**: Cartão escolhido em destaque; se "Personalizado", sliders/toggles individuais aparecem (`matchesSearch('supressão de ruído cancelamento de eco ganho automático sensibilidade de entrada')` — a seção só aparece se bater com a busca da própria tela de configurações, ver nota de auditoria).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Se "Personalizado": ajustar supressão de ruído, cancelamento de eco, ganho automático, e sensibilidade de entrada (com opção de calibração automática — `autoSensitivity`, que amostra o nível ambiente por 1.5s e calcula um limiar) individualmente.
**RESULTADO FINAL**: Áudio capturado processado conforme o perfil, aplicado em tempo real mesmo durante uma call já em andamento.
**EFEITO LOCAL**: Qualidade/processamento do áudio capturado muda imediatamente.
**EFEITO REMOTO**: Outros participantes ouvem a diferença (é o áudio que chega até eles que muda).
**REALTIME**: Nenhum evento de protocolo — é reconfiguração de captura local, cujo efeito só é percebido pelos outros através do próprio áudio.
**BACKEND**: Nenhuma chamada.
**BANCO**: `localStorage`, por dispositivo/navegador — mesma característica de não viajar entre contas/dispositivos que `VOICE_INPUT_MODE_SELECT`.
**REFRESH**: Persiste.
**RECONEXÃO**: Reaplicado a cada novo `connect()` (via `audioCaptureDefaults` na criação do `Room` e reforçado no fluxo de conexão).
**ERRO**: Não aplicável diretamente a esta troca (erros de dispositivo aparecem em `applyMicCaptureOptions`, já coberto na ficha de referência do hook).
**CANCELAMENTO**: Escolher outro perfil.
**REVERSÃO**: Escolher outro perfil.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Mesma lacuna de `radiogroup` formal já notada em fichas semelhantes.

**Nota de auditoria — qualidade de engenharia**: o Krisp roda como *processor* sobre o track já publicado, não como *constraint* de captura — o código documenta explicitamente por quê: pedir supressão nativa do navegador **e** Krisp ao mesmo tempo cascatearia dois DSPs de ruído diferentes, "o que soa pior, não melhor." A constraint nativa só entra como alternativa quando o Krisp não pôde carregar. Esse tipo de detalhe (evitar duplo processamento de ruído) é o tipo de coisa que normalmente só se descobre testando de verdade — confirma que esta parte do app já passou por iteração real baseada em qualidade de áudio percebida, não é uma implementação ingênua.

**Nota de auditoria — busca dentro de Configurações**: a seção "Voz e vídeo" tem um campo de busca próprio (`matchesSearch`, `voiceSearch`) que filtra quais subseções aparecem — **achado positivo não documentado antes**: é uma busca real, funcional, específica dessa página (não confirmado se outras seções de Configurações têm o mesmo mecanismo — a verificar numa auditoria futura dedicada a Configurações do app como um todo).

---

## 7.12 — VOICE_SOUNDBOARD_PLAY (referência — já auditado/testado em profundidade)

**ID**: `VOICE_SOUNDBOARD_PLAY`
**NOME**: Tocar um som do soundboard durante uma call
**STATUS**: `CORE` — confirmado em `DISCORD_PARITY_PLAN.md` §12 como implementado com áudio real via LiveKit (não um relay de servidor — quem toca publica a própria track de áudio, distribuída pra sala inteira pelo SFU), com um bug real de CSP no cliente desktop já corrigido em sessão anterior (`fetch('data:...')` bloqueado pela CSP do Electron — corrigido decodificando a `data:` URL manualmente via `atob`, sem depender de `fetch()`, já confirmado lendo `dataUrlToArrayBuffer` em `useVoiceRoom.ts` nesta mesma passagem). Mecanismo: cria um `AudioContext` local, decodifica o som, publica como `Track.Source.Unknown` com nome `"soundboard"`, desconecta automaticamente quando o som termina (`source.onended`), e anuncia "quem tocou o quê" via canal de dados separado (`SOUNDBOARD_ANNOUNCE_TOPIC`) pra gerar o toast/notificação cosmética nos outros clientes. Upload de som novo com validação real de duração (`decodeAudioData`, não só tamanho de arquivo) já auditado como `DONE`. **UI de onde o botão de tocar soundboard vive dentro da tela de voz não foi relida em detalhe nesta passagem específica** (fica para uma auditoria futura, já que o mecanismo por trás já está bem documentado e confirmado funcional).

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5**, **9 do Roteiro 6** e **12 do Roteiro 7** — **124 fichas no total**. Com isso, a auditoria de Voz cobre agora o ciclo completo: entrar, mutar, ensurdecer, sair, câmera, compartilhar tela, participantes (lista, fala, volume, desconectar), dispositivos, chat da call, PTT e perfis de microfone. Achados novos de maior interesse: um provável bug de encoding numa mensagem de erro (`"N?o foi poss?vel..."`); o chat de voz é arquitetural e deliberadamente mais simples que o chat de canal (efêmero, sem markdown, sem histórico, sem toolbar); volumes individuais (voz/tela/soundboard) e escolha de dispositivo não persistem entre sessões, diferente de quase toda outra preferência de voz, que já usa `localStorage` consistentemente.

---

# ROTEIRO 8 — VÍDEO E TELA COMPARTILHADA: EXIBIÇÃO (GRID/FOCO)

Continuação de Voz. Arquitetura real (verificada em `apps/web/src/components/ScreenStage.tsx`, lido por completo): câmera e tela compartilhada usam dois modelos de exibição **deliberadamente diferentes** — câmera é sempre visível em miniatura na galeria (é só uma chamada de vídeo normal, sem "opt-in"); tela compartilhada é **opt-in pra assistir** — aparece como um card pequeno na galeria até alguém clicar pra promovê-la a um tile grande em foco. Suporta múltiplas transmissões simultâneas, cada uma assistível independentemente.

---

## 8.1 — VIDEO_CAMERA_GALLERY_TILE

**ID**: `VIDEO_CAMERA_GALLERY_TILE`
**NOME**: Miniatura de câmera na galeria de vídeo
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de voz conectado > área central de vídeo > galeria (linha inferior) > tile de câmera`
**POSIÇÃO NA INTERFACE**: `.gallery-row`, ao lado de eventuais cards de transmissão não assistida.
**APARÊNCIA**: `<video autoPlay playsInline>` + rótulo com o nome do participante (`.screen-label.small`); skeleton de carregamento (`.stream-skeleton`, três barras) enquanto o vídeo ainda não disparou `onLoadedMetadata`.
**ESTADO NORMAL**: Aparece automaticamente assim que qualquer participante liga a câmera — **sem exigir nenhuma ação de quem assiste** (diferente de tela compartilhada).
**HOVER**: Não confirmado nenhum overlay de ação no hover desta tile específica (diferente do card de transmissão não assistida, que tem "Ver transmissão" no hover).
**ACTIVE/PRESSED**: Não aplicável (não é clicável).
**SELECTED**: Não aplicável.
**DISABLED**: Não aplicável.
**LOADING**: Skeleton de 3 barras até o vídeo carregar o primeiro frame.
**TRIGGER**: Automático — outro participante (ou você mesmo) liga a câmera (`VOICE_CAMERA_TOGGLE`, Roteiro 6).
**PRÉ-CONDIÇÕES**: Participante com câmera ativa e **não mutada** — `cameraTiles` filtra explicitamente `!screen.publication.isMuted`, evitando (comentário confirmado no código) "um tile preto na galeria pra uma câmera que a pessoa já apagou" no caso comum de trocar de dispositivo (que muta a publicação sem desfazê-la por completo).
**RESULTADO IMEDIATO**: `attachVideo` conecta a track de vídeo ao elemento `<video>`.
**RESULTADO VISUAL**: Vídeo ao vivo aparece assim que carrega.
**RESULTADO SONORO**: Não aplicável a esta ficha (o áudio de voz do participante é tratado inteiramente à parte, via `VoiceAudioSinks`, Roteiro 7 — a track de vídeo da câmera não carrega áudio).
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — não há como "promover" uma câmera a um tile grande (diferente de tela compartilhada) — **achado real**: se várias pessoas ligarem a câmera ao mesmo tempo, todas ficam do mesmo tamanho pequeno na galeria, sem um mecanismo de foco/destaque em quem está falando (nenhuma integração confirmada entre `VOICE_SPEAKING_INDICATOR`, Roteiro 7, e o tamanho/destaque do tile de câmera na galeria).
**RESULTADO FINAL**: Vídeo continua tocando enquanto o participante mantiver a câmera ligada.
**EFEITO LOCAL**: Nenhuma mudança de dado.
**EFEITO REMOTO**: Nenhum (é só recepção).
**REALTIME**: Nativo do LiveKit (track de vídeo).
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Recriado do zero a cada nova conexão.
**RECONEXÃO**: Track reanexada quando reconecta.
**ERRO**: Não confirmado tratamento de erro específico se a track falhar ao anexar (`attachVideo` retorna `undefined` silenciosamente se a condição de tipo não bater).
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: O próprio participante desligando a câmera remove o tile.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: **`MISSING`** — nenhuma ação disponível clicando na tile de câmera de alguém (Discord real geralmente permite fixar/expandir via clique ou menu).
**ACESSIBILIDADE**: Rótulo de texto com o nome sempre visível (não depende só do vídeo pra identificar quem é).

**Nota de auditoria — vídeo local mutado**: `muted={view.participant instanceof RemoteParticipant === false}` — a **própria** tile de câmera do usuário (não a dos outros) é renderizada com o elemento `<video muted>` — proteção padrão e correta contra eco/duplicação (mesmo que a track de câmera normalmente não carregue áudio, é uma defesa segura por padrão).

---

## 8.2 — SCREEN_SHARE_WATCH

**ID**: `SCREEN_SHARE_WATCH`
**NOME**: Começar a assistir uma transmissão de tela (promover a tile grande)
**STATUS ATUAL — CORREÇÃO (commit `31597f1`, em produção)**: esta ficha e `VOICE_SCREEN_SHARE_START` só olhavam o vídeo e **não pegaram um defeito de áudio**: a faixa `ScreenShareAudio` de quem transmite chegava a todos na call (a sala usa `autoSubscribe`) e o `RemoteAudioSink` a ligava na hora, então **todo mundo ouvia a transmissão de tela sem clicar em "Ver transmissão"**. Corrigido: o áudio da transmissão só é ligado enquanto a pessoa está assistindo aquela transmissão, e desliga em "Sair da transmissão". Voz e soundboard não mudaram. Verificado num servidor LiveKit real com um transmissor de teste: antes, um `<audio>` tocando existia logo depois de a transmissão começar; depois, nenhum até o clique.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Canal de voz conectado > galeria > card de transmissão não assistida > clique`
**POSIÇÃO NA INTERFACE**: `ShareGalleryTile`, no mesmo `.gallery-row` das câmeras.
**APARÊNCIA**: Card com ícone de compartilhamento (`ShareIcon`), rótulo com nome + ponto "ao vivo" (`.live-dot`); no hover, overlay com "👁 Ver transmissão".
**ESTADO NORMAL**: Card pequeno, não expandido — **é o estado padrão de qualquer transmissão nova**: ninguém assiste automaticamente, nem quem já estava na call quando a transmissão começou.
**HOVER**: Overlay "Ver transmissão" aparece sobre o card.
**ACTIVE/PRESSED**: Padrão de botão.
**SELECTED**: Não aplicável (o card em si nunca fica "selecionado" — ao clicar, ele desaparece da galeria e vira uma `HeroTile` em outra área da tela).
**DISABLED**: Nunca.
**LOADING**: Skeleton de vídeo se ainda carregando ao promover.
**TRIGGER**: Clique no card inteiro (é um `<button>` que envolve tudo).
**PRÉ-CONDIÇÕES**: Alguém estar compartilhando tela na call.
**RESULTADO IMEDIATO**: `onWatch(screen.id)` → `watchingIds` ganha o id daquela transmissão.
**RESULTADO VISUAL**: Transmissão desaparece da galeria pequena e aparece como `HeroTile` grande na `.hero-row`, acima da galeria.
**RESULTADO SONORO**: Nenhum som específico de "começar a assistir" (distinto do som de início de transmissão de quem compartilha, já documentado em `VOICE_SCREEN_SHARE_START`, Roteiro 6 — aquele toca pra quem compartilha, não pra quem assiste).
**ANIMAÇÃO**: Não confirmada transição entre os dois tamanhos de tile.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Ver `SCREEN_SHARE_VOLUME`/`SCREEN_SHARE_FULLSCREEN_TOGGLE`.
**RESULTADO FINAL**: Transmissão em destaque, com controles próprios (parar de assistir, volume, tela cheia se for a única/entre as assistidas).
**EFEITO LOCAL**: Só a experiência de quem clicou muda — **é uma escolha inteiramente pessoal de visualização**.
**EFEITO REMOTO**: **Nenhum** — quem compartilha não é notificado de quantas pessoas estão assistindo nem quem especificamente (diferente de alguns apps de chamada que mostram "N pessoas assistindo").
**REALTIME**: `watchingIds` é estado local puro — não há evento de rede associado a "começar a assistir".
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: `watchingIds` reseta a cada nova conexão à call.
**RECONEXÃO**: Reseta — reconectar depois de uma queda faz qualquer transmissão em andamento voltar ao estado "não assistida" até clicar de novo.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável (clicar já é a ação completa).
**REVERSÃO**: `SCREEN_SHARE_STOP_WATCHING` (ficha seguinte).
**ATALHO**: Nenhum atalho de teclado pra promover uma transmissão.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Card inteiro é um `<button>` real, alcançável via Tab, com o texto "Ver transmissão" visível (não só um ícone).

**Nota de auditoria — comparação com Discord real**: o Discord moderno **também** trata assistir tela compartilhada como algo que exige clique (não força o vídeo pra tela cheia de todo mundo automaticamente), então este comportamento é consistente com a experiência esperada, não uma simplificação — mas o Discord real geralmente destaca visualmente *mais* a transmissão nova (ex.: notificação/toast "Fulano começou a compartilhar a tela") — não confirmado se o NexPlay tem algum aviso proativo além do próprio card aparecer silenciosamente na galeria.

---

## 8.3 — SCREEN_SHARE_STOP_WATCHING

**ID**: `SCREEN_SHARE_STOP_WATCHING`
**NOME**: Parar de assistir uma transmissão (voltar pra galeria pequena)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tile grande em foco (HeroTile) > passar o mouse > "Sair da transmissão"`
**POSIÇÃO NA INTERFACE**: `.hero-tile-overlay`, sobreposto ao vídeo, visível no hover.
**APARÊNCIA**: Botão com `EyeOffIcon` + texto "Sair da transmissão".
**ESTADO NORMAL**: Invisível até o hover (overlay).
**HOVER**: Overlay aparece sobre o vídeo.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Nunca.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Já assistindo aquela transmissão.
**RESULTADO IMEDIATO**: `onStopWatching(screen.id)` → remove o id de `watchingIds`.
**RESULTADO VISUAL**: Tile volta a ser um card pequeno na galeria (com "Ver transmissão" disponível de novo).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — **a transmissão continua ativa pra quem compartilha e pra outros que ainda estejam assistindo**, só quem clicou para de ver.
**RESULTADO FINAL**: Tela recuperada pra outros conteúdos (se essa era a única transmissão em foco, `hasHero` vira falso e o layout volta ao normal sem a `.hero-row`).
**EFEITO LOCAL**: Só a experiência de quem clicou.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável (estado local).
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Reseta com a call.
**RECONEXÃO**: Reseta.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar no card pequeno de novo (`SCREEN_SHARE_WATCH`).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Botão com texto visível, não só ícone.

---

## 8.4 — SCREEN_SHARE_MULTI_HERO

**ID**: `SCREEN_SHARE_MULTI_HERO`
**NOME**: Assistir múltiplas transmissões simultâneas lado a lado
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: `CORE` — confirmado no código: `heroShares.map((screen) => <HeroTile key={screen.id} .../>)` dentro de `.hero-row` — **não há limite de uma única transmissão em foco por vez**, cada uma assistida vira sua própria `HeroTile`, todas exibidas lado a lado na mesma fileira.
**Complementa** `DISCORD_PARITY_PLAN.md` §6 ("Multistream (vários compartilhando ao mesmo tempo) | PARTIAL — LiveKit suporta nativamente múltiplos publishers; UI de grid/foco pra múltiplas transmissões simultâneas não testada/implementada") — **esta auditoria confirma que a UI já existe e já suporta isso**, não é mais `PARTIAL`: cada transmissão tem seu próprio card de "assistir" independente, e várias podem estar em foco ao mesmo tempo, cada uma com seu próprio controle de volume (`SCREEN_SHARE_VOLUME`) e botão de "sair da transmissão" individual. **Atualização de status recomendada em `DISCORD_PARITY_PLAN.md`**: de `PARTIAL` para `DONE`.
**Limitação real observada**: não há um controle de *layout* (grid 2x2, foco automático em quem fala, etc.) além de empilhar todas as heroes numa fileira horizontal — com 3+ transmissões simultâneas assistidas, o espaço de cada uma fica proporcionalmente menor (CSS flexível, a confirmar comportamento exato em telas pequenas).

---

## 8.5 — SCREEN_SHARE_VOLUME

**ID**: `SCREEN_SHARE_VOLUME`
**NOME**: Ajustar o volume do áudio de uma transmissão específica
**STATUS ATUAL (commit `1fa99f4`, em produção)**: o volume da transmissão também **persiste** agora (`np:stream-volumes:<usuário>`, por conta e por dispositivo). O texto abaixo que diz que reseta a 100 % ao reconectar é o estado anterior.
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tile grande (HeroTile) de uma transmissão remota > canto do vídeo > controle de volume`
**POSIÇÃO NA INTERFACE**: `.screen-volume`, sobreposto ao vídeo — **só aparece se `isRemote`** (não existe controle de volume pra sua própria transmissão, obviamente).
**APARÊNCIA**: `SpeakerIcon` + `<input type="range">` + valor numérico.
**ESTADO NORMAL**: 100% por padrão (`streamVolumes[identity] ?? 100`).
**HOVER**: Padrão de slider.
**ACTIVE/PRESSED**: `onClick={(event) => event.stopPropagation()}` no `<label>` que envolve o controle — **impede que clicar no slider também dispare qualquer clique por baixo no tile inteiro** (defesa de propagação de evento, mesma técnica já vista em outros componentes desta auditoria).
**SELECTED**: Não aplicável.
**DISABLED**: Nunca (pra transmissões remotas).
**LOADING**: Não aplicável.
**TRIGGER**: Arrastar o slider.
**PRÉ-CONDIÇÕES**: Assistindo uma transmissão de outro participante (não a própria).
**RESULTADO IMEDIATO**: `setStreamVolume(identity, valor)` — **distinto do volume de voz do mesmo participante** (`VOICE_PARTICIPANT_VOLUME_CONTROL`, Roteiro 7) — são dois volumes completamente independentes: o volume da *voz* de alguém e o volume do *áudio da tela que ele está compartilhando* podem ser ajustados separadamente.
**RESULTADO VISUAL**: Número atualiza.
**RESULTADO SONORO**: Volume do áudio da transmissão muda imediatamente.
**ANIMAÇÃO**: Nativa do slider.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Volume daquela transmissão específica ajustado, só para quem ajustou.
**EFEITO LOCAL**: Mixagem de áudio local.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada.
**BANCO**: **Não persiste** — mesma característica de todos os volumes individuais já documentados no Roteiro 7 (reseta a cada nova conexão).
**REFRESH**: Reseta pra 100%.
**RECONEXÃO**: Reseta.
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Arrastar de volta.
**ATALHO**: Setas do teclado com foco no slider.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Volume da transmissão de {nome}"`.

---

## 8.6 — SCREEN_SHARE_FULLSCREEN_TOGGLE

**ID**: `SCREEN_SHARE_FULLSCREEN_TOGGLE`
**NOME**: Abrir a transmissão assistida em tela cheia
**PLATAFORMA**: `DESKTOP_WINDOWS` (tela cheia nativa da janela) / `WEB` (Fullscreen API do navegador, só no elemento da transmissão)
**CAMINHO EXATO**: `Área de transmissão (com pelo menos uma tile em foco) > barra superior > botão de tela cheia`
**POSIÇÃO NA INTERFACE**: `.stream-toolbar`, só visível quando `hasHero` (pelo menos uma transmissão sendo assistida).
**APARÊNCIA**: `FullscreenIcon` + texto "Tela cheia"/"Sair da tela cheia".
**ESTADO NORMAL**: "Tela cheia".
**HOVER**: Padrão de botão.
**ACTIVE/PRESSED**: `aria-pressed={fullscreen}`.
**SELECTED**: Texto/estado muda conforme `fullscreen`.
**DISABLED**: Só existe com pelo menos uma transmissão em foco.
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Pelo menos uma transmissão sendo assistida.
**RESULTADO IMEDIATO — DESKTOP**: `window.desktop.setFullscreen(true)` — **usa a MESMA tela cheia nativa da janela inteira documentada no Roteiro 0** (`APP_FULLSCREEN_TOGGLE`), não um modo "tela cheia só do vídeo" — a janela inteira do NexPlay entra em fullscreen do SO, com o resto da interface (sidebar, etc.) ainda tecnicamente presente mas a tela cheia cobrindo tudo.
**RESULTADO IMEDIATO — WEB**: `stage.requestFullscreen()` — Fullscreen API padrão do navegador, **só no elemento `.screen-stage`** (a área de vídeo em si, não a janela/aba inteira) — diferença real de escopo entre as duas plataformas.
**RESULTADO VISUAL**: Tela cheia ativada; classe `native-fullscreen` aplicada ao container.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Nativa do SO/navegador.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Ver `SCREEN_SHARE_FULLSCREEN_EXIT_ESC`.
**RESULTADO FINAL**: Vídeo em tela cheia.
**EFEITO LOCAL**: Apenas visual.
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: Sai da tela cheia (implícito, já que a página recarrega).
**RECONEXÃO**: Não aplicável.
**ERRO**: `catch { setFullscreenError('Não foi possível ativar a tela cheia. Tente novamente.') }` — exibido em `.fullscreen-error` com `role="alert"`.
**CANCELAMENTO**: Clicar de novo, ou Esc (ver ficha seguinte).
**REVERSÃO**: Clicar de novo (é um toggle).
**ATALHO**: **Nenhum atalho de teclado pra *entrar* em tela cheia especificamente daqui** — mas no desktop, F11 (`APP_FULLSCREEN_TOGGLE`, Roteiro 0) aciona exatamente o mesmo estado subjacente da janela, então tecnicamente F11 também entra/sai de "tela cheia" enquanto uma transmissão está em foco, mesmo sem ter sido pensado como um atalho específico desta tela.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-pressed`, `aria-label` dinâmicos corretos; `title` menciona a tecla Esc explicitamente ("Sair da tela cheia (Esc)").

**Nota de auditoria — acoplamento entre F11 e este botão**: como o modo desktop usa a mesma tela cheia nativa da janela (Roteiro 0), pressionar F11 enquanto assiste uma transmissão em foco **também** sai/entra desse mesmo estado — os dois mecanismos (F11 global e este botão local) controlam exatamente o mesmo estado subjacente (`mainWindow.isFullScreen()`), sincronizados via `onFullscreenChanged`/`getFullscreen()`. Isso é consistente e correto (um único estado, duas formas de alterá-lo), não uma duplicação problemática.

---

## 8.7 — SCREEN_SHARE_FULLSCREEN_EXIT_ESC

**ID**: `SCREEN_SHARE_FULLSCREEN_EXIT_ESC`
**NOME**: Sair da tela cheia da transmissão com Esc
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Tela cheia ativa (assistindo transmissão) > tecla Esc`
**RESULTADO IMEDIATO — WEB**: Comportamento **nativo do navegador** — a Fullscreen API já sai sozinha com Esc, sem o NexPlay precisar de nenhum código (o `keydown` customizado em `ScreenStage.tsx` só é registrado `if (fullscreen && window.desktop?.setFullscreen)`, ou seja, **explicitamente não roda no modo web**, deixando o comportamento padrão do navegador cuidar disso).
**RESULTADO IMEDIATO — DESKTOP**: `ScreenStage.tsx` registra seu **próprio** listener de `keydown` pra Esc, chamando `window.desktop.setFullscreen(false)`.
**ACHADO REAL — SOBREPOSIÇÃO COM O ROTEIRO 0**: o processo principal do Electron **já** intercepta Esc no nível de `before-input-event` sempre que `window.isFullScreen()` é verdadeiro (`APP_FULLSCREEN_EXIT_ESC`, Roteiro 0), chamando `window.setFullScreen(false)` **antes mesmo do evento chegar ao React** — e `event.preventDefault()` nesse ponto impede o evento de alcançar a página web. Isso significa que **o listener de Esc dentro de `ScreenStage.tsx` provavelmente nunca chega a disparar no cliente desktop empacotado** — a interceptação do processo principal já resolve a saída da tela cheia primeiro, tornando este segundo handler uma camada redundante (defesa em profundidade não intencional, ou possivelmente código morto, dependendo de nuances exatas do pipeline de input do Electron não confirmáveis sem um teste ao vivo). Como os dois caminhos convergem pro mesmo resultado (`setFullscreen(false)`), isso nunca causaria um bug visível — é só uma duplicação de responsabilidade entre o processo principal e um componente React específico, que só um teste ao vivo (fora do escopo desta auditoria de leitura de código) confirmaria com certeza.
**Demais campos**: idênticos a `APP_FULLSCREEN_EXIT_ESC` (Roteiro 0) e `SCREEN_SHARE_FULLSCREEN_TOGGLE` (ficha anterior) — resultado final é sempre voltar ao layout normal da tela de voz.

---

## 8.8 — SCREEN_SHARE_QUALITY_CHANGE (referência — já registrado como MISSING)

**ID**: `SCREEN_SHARE_QUALITY_CHANGE`
**STATUS**: `MISSING`, já documentado em detalhe em `VOICE_SCREEN_SHARE_START` (Roteiro 6) e `DISCORD_PARITY_PLAN.md` §6 — trocar a qualidade de uma transmissão já em andamento (720p→1080p, 30→60fps) sem precisar parar e reiniciar o compartilhamento. Não repetido aqui por já ter ficha própria; citado só para reforçar que a auditoria de exibição (este roteiro) não encontrou nenhum controle do lado de quem *assiste* pra pedir uma qualidade diferente tampouco (ex.: "assistir em qualidade menor pra economizar banda") — a única alavanca de qualidade é de quem compartilha, e só antes de começar.

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5**, **9 do Roteiro 6**, **12 do Roteiro 7** e **8 do Roteiro 8** — **132 fichas no total**. Com isso, a **prioridade especial de Voz do pedido original está com sua auditoria principal concluída**: conectar, mutar, ensurdecer, sair, câmera, compartilhar tela (enviar e assistir), participantes, dispositivos, chat da call, PTT, perfis de microfone, e agora exibição de vídeo/tela em grid e foco.

**Achado mais valioso desta seção**: `DISCORD_PARITY_PLAN.md` §6 registrava suporte a múltiplas transmissões simultâneas como `PARTIAL` ("não testada/implementada") — **esta auditoria encontrou que já está implementado e funcional** (`SCREEN_SHARE_MULTI_HERO`), uma correção de registro que deveria ser propagada de volta ao arquivo de paridade.

---

# ROTEIRO 9 — CARGOS, PERMISSÕES, MEMBROS E MODERAÇÃO

Arquitetura real (verificada em `apps/web/src/components/ServerSettings.tsx`, funções `RolesPane`/`MembersPane`/`InvitesPane`, lidas por completo nesta passagem): sistema de cargos/permissões/moderação **real e funcional de ponta a ponta**, com hierarquia por posição aplicada consistentemente em cada ação (criar, editar, atribuir, remover, moderar). Esta auditoria encontrou, no meio de tudo isso, **um achado direto do tipo que o próprio usuário já pediu pra caçar e eliminar em sessões anteriores desta linha de trabalho**: uma caixa de busca decorativa, sem função nenhuma, na aba Cargos.

---

## 9.1 — ROLE_LIST_SEARCH_FAKE *(achado — busca decorativa)*

**ID**: `ROLE_LIST_SEARCH_FAKE`
**NOME**: Campo de busca de cargos (não-funcional)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **Achado real — elemento decorativo sem função**, exatamente a categoria de problema que o usuário já pediu explicitamente pra eliminar em uma instrução anterior desta mesma linha de trabalho ("LEMBRANDO, NÃO QUERO NADA QUEBRADO, SEM FUNÇÃO E SEM REAÇÃO, QUERO QUE TUDO FUNCIONE!"). Este caso específico não tinha sido pego na auditoria/correção anterior.
**CAMINHO EXATO**: `Configurações do Servidor > Cargos > coluna esquerda (lista de cargos) > campo "Buscar cargos"`
**POSIÇÃO NA INTERFACE**: Topo de `.roles-list`, acima da contagem de cargos.
**APARÊNCIA**: Idêntica a qualquer outro campo de busca do app — ícone de lupa (`SearchIcon`) + `<input placeholder="Buscar cargos">` — **visualmente indistinguível de um campo de busca funcional**.
**ESTADO NORMAL**: Campo vazio, com placeholder.
**CONFIRMAÇÃO NO CÓDIGO**: `<input readOnly placeholder="Buscar cargos" />` — **o atributo `readOnly` está presente, sem `value` nem `onChange` associados a nenhum estado.** Não existe um `roleSearch`/`setRoleSearch` em lugar nenhum de `RolesPane` (diferente da busca "Buscar membro" dentro da aba "Gerenciar membros" do mesmo componente, que **é** funcional — `value={memberSearch} onChange={...}`, filtrando a lista de fato).
**TRIGGER**: Clicar/tentar digitar no campo.
**RESULTADO IMEDIATO**: **Nada acontece** — `readOnly` impede literalmente digitar qualquer caractere; o cursor pode até piscar no campo, mas nenhuma tecla tem efeito.
**RESULTADO VISUAL**: Nenhuma mudança — a lista de cargos abaixo nunca filtra, não importa o que o usuário tente digitar (ou tentaria, se o campo permitisse).
**IMPACTO PRÁTICO**: Em um servidor com poucos cargos, a ausência de filtro passa despercebida; em um servidor com muitos cargos, o usuário clicaria nesse campo esperando filtrar a lista (é exatamente isso que o campo idêntico "Buscar membro", duas telas ao lado, já faz) e descobriria que não funciona — inconsistência direta e visível entre duas buscas com a mesma aparência dentro da mesma tela de Configurações.
**Correção recomendada**: ou (a) tornar funcional — reaproveitar exatamente o mesmo padrão já usado em `memberSearch` (`useState` + filtro em `roles.filter(...)`), trabalho pequeno já que o padrão de referência está a poucas linhas de distância no mesmo arquivo; ou (b) remover o campo por completo se a lista de cargos for considerada pequena o bastante pra nunca precisar de busca — mas manter como está (presente, com aparência funcional, sem fazer nada) é exatamente o padrão que o usuário já disse não querer.

---

## 9.2 — ROLE_CREATE

**ID**: `ROLE_CREATE`
**NOME**: Criar um novo cargo
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações do Servidor > Cargos > "Criar cargo"`
**POSIÇÃO NA INTERFACE**: Botão de destaque (`.violet-primary`) no cabeçalho da página, só visível com `canManageRoles`.
**APARÊNCIA**: `PlusIcon` + "Criar cargo"; ao clicar, revela uma linha inline (`.role-create-row`) com campo de nome + botão "Criar" — **não abre um modal separado**, expande inline na própria página.
**ESTADO NORMAL**: Linha de criação fechada.
**HOVER**: Padrão de botão de destaque.
**ACTIVE/PRESSED**: Alterna a visibilidade da linha inline (`setCreating(!creating)` — é um toggle, clicar de novo esconde sem criar nada).
**SELECTED**: Não aplicável.
**DISABLED**: Botão "Criar cargo" ausente (não desabilitado) sem `MANAGE_ROLES`.
**LOADING**: Não confirmado indicador de carregamento durante a chamada.
**TRIGGER**: Clique em "Criar cargo" (abre a linha), depois Enter no campo de nome ou clique em "Criar".
**PRÉ-CONDIÇÕES**: `MANAGE_ROLES`; nome não vazio (`newRoleName.trim()`).
**RESULTADO IMEDIATO**: `api.createRole(serverId, nome, cor, 0, false)` — **cor escolhida automaticamente** de uma paleta fixa de 8 cores, ciclando por índice (`ROLE_COLOR_SWATCHES[roles.length % 8]`) — o usuário não escolhe a cor no momento da criação, só depois editando; posição sempre `0` (novo cargo sempre nasce na posição mais baixa da hierarquia, precisa ser reordenado depois — **mas não existe reordenação de posição na UI, ver nota de auditoria**); `hoist` sempre `false` inicialmente.
**RESULTADO VISUAL**: Cargo novo aparece na lista, já ordenado por posição (`sort((a,b) => b.position - a.position)`); torna-se automaticamente o cargo selecionado, aba "Exibição" ativa.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não é modal — inline na própria página.
**SEGUNDA ETAPA**: Editar nome/cor/permissões/membros do cargo recém-criado (fichas seguintes).
**RESULTADO FINAL**: Novo cargo criado, pronto para configuração.
**EFEITO LOCAL**: Estado local atualizado imediatamente com a resposta.
**EFEITO REMOTO**: `ROLE_CREATE` via WebSocket — outros administradores com a tela de Cargos aberta veem o cargo novo aparecer ao vivo.
**REALTIME**: `ROLE_CREATE`.
**BACKEND**: `POST /api/servers/:id/roles`.
**BANCO**: Insere em `roles`.
**REFRESH**: Persiste normalmente.
**RECONEXÃO**: Recarregado via fetch normal.
**ERRO**: `setError(...)` exibido acima da área de trabalho de cargos.
**CANCELAMENTO**: Clicar em "Criar cargo" de novo (fecha a linha sem criar) — **achado**: não há um botão "Cancelar" explícito na própria linha inline, só o toggle do botão que a abriu.
**REVERSÃO**: `ROLE_DELETE` depois.
**ATALHO**: Enter no campo de nome.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Campo sem `<label>` associado explicitamente (só `placeholder`) — mesma lacuna comum de acessibilidade já notada em outros campos desta auditoria mais ampla.

**Nota de auditoria — sem reordenação de posição**: confirmado por ausência: não existe nenhum mecanismo de arrastar/subir/descer cargos na lista pra mudar sua posição hierárquica na UI — cargos novos sempre nascem na posição `0` (mais baixa) e **não há como reordenar depois pela interface**, mesmo que a posição seja central pra hierarquia de moderação/edição (`ownPosition`/`canEditSelected`/`canModerate` em toda esta auditoria). Já registrado de forma adjacente em `DISCORD_PARITY_PLAN.md` §1 ("Sem hierarquia de 'dono' separada nem reordenação manual de posição — redução deliberada").

---

## 9.3 — ROLE_SELECT

**ID**: `ROLE_SELECT`
**NOME**: Selecionar um cargo na lista para editar
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações do Servidor > Cargos > lista à esquerda > um cargo`
**POSIÇÃO NA INTERFACE**: `.roles-list`, um botão por cargo.
**APARÊNCIA**: Ponto colorido (`<i style={{background: role.color}}>`) + nome + contagem de membros ("N membros").
**ESTADO NORMAL**: Nenhum destaque.
**HOVER**: Padrão de item de lista clicável.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `active` no cargo atualmente sendo editado.
**DISABLED**: Nunca — qualquer cargo é selecionável pra visualização, mesmo que não editável (ver `ROLE_HIERARCHY_ENFORCEMENT`).
**LOADING**: Não aplicável.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO IMEDIATO**: `setSelectedRoleId(role.id)` + `setTab('display')` (sempre volta pra aba "Exibição" ao trocar de cargo, mesmo que estivesse em "Permissões"/"Gerenciar membros" no cargo anterior).
**RESULTADO VISUAL**: Painel à direita (`.role-editor`) recarrega com os dados do novo cargo.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Navegar pelas três abas do editor.
**RESULTADO FINAL**: Editor mostrando o cargo escolhido.
**EFEITO LOCAL**: Nenhuma chamada de rede nova (dados já carregados de uma vez no `useEffect` inicial).
**EFEITO REMOTO**: Nenhum.
**REALTIME**: Não aplicável à seleção em si.
**BACKEND**: Nenhuma chamada.
**BANCO**: Não aplicável.
**REFRESH**: `selectedRoleId` reseta a cada F5 (volta ao primeiro cargo da lista, `roles[0]?.id`).
**RECONEXÃO**: Se o cargo selecionado for excluído por outra pessoa enquanto você o edita, `ROLE_DELETE` recebido reseta `selectedRoleId` pra `null`, mostrando "Selecione um cargo à esquerda."
**ERRO**: Não aplicável.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Selecionar outro cargo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: **`MISSING`** — sem botão direito na lista de cargos (Discord real geralmente permite duplicar cargo via menu de contexto ali).
**ACESSIBILIDADE**: Sem indicação de contagem de membros em formato acessível além do texto visível (já é texto, então funciona pra leitor de tela normalmente).

---

## 9.4 — ROLE_EDIT_DISPLAY

**ID**: `ROLE_EDIT_DISPLAY`
**NOME**: Editar nome, cor e exibição separada de um cargo
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Editor de cargo > aba "Exibição"` (padrão ao selecionar qualquer cargo)
**POSIÇÃO NA INTERFACE**: `.role-fields-grid` + `.role-static-toggle`.
**APARÊNCIA**: Campo de nome; grade de 8 cores fixas (`ROLE_COLOR_SWATCHES`, mesma paleta usada pra atribuir cor automática na criação) com anel de seleção na cor atual; toggle "Exibir membros do cargo separadamente".
**ESTADO NORMAL**: Campos preenchidos com os valores atuais.
**HOVER**: Padrão de campo/swatch.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Swatch com classe `selected` na cor atual.
**DISABLED**: Todo o formulário (`disabled={!canEditSelected}`) — nome, swatches de cor, e o toggle de exibição separada ficam travados se a hierarquia não permitir editar aquele cargo específico. **O cargo `@everyone` tem uma restrição adicional**: nome sempre desabilitado (`disabled={!canEditSelected || selectedRole.isEveryone}`) mesmo com permissão — não dá pra renomear `@everyone`; o toggle "exibir separadamente" nem aparece pra `@everyone` (`{!selectedRole.isEveryone && (...)}`).
**LOADING**: Não confirmado indicador durante o salvamento.
**TRIGGER**: Editar nome + `onBlur` salva (não salva a cada tecla, só ao sair do campo); clicar numa cor salva imediatamente; clicar no toggle salva imediatamente.
**PRÉ-CONDIÇÕES**: `canEditSelected` (posição do cargo abaixo da posição mais alta do próprio editor).
**RESULTADO IMEDIATO — nome**: `onChange` atualiza o estado local instantaneamente (edição otimista, visível enquanto digita), `onBlur` dispara `patchSelectedRole({ name: valor.trim() || nomeAntigo })` — **se o campo for deixado vazio, reverte pro nome antigo em vez de salvar vazio** (proteção no próprio cliente).
**RESULTADO IMEDIATO — cor**: Clique aplica na hora, sem etapa de confirmação.
**RESULTADO IMEDIATO — toggle "exibir separadamente"**: Clique aplica na hora.
**RESULTADO VISUAL**: Mudanças refletidas imediatamente na lista de cargos à esquerda (ponto colorido, nome) e em qualquer lugar do app que mostre aquele cargo (ex.: `role-chip` na aba Membros, mesma sessão).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Cargo atualizado.
**EFEITO LOCAL**: Estado local sincronizado com a resposta da API.
**EFEITO REMOTO**: `ROLE_UPDATE` via WebSocket — outros veem a mudança ao vivo (inclusive membros comuns que tenham esse cargo, se a cor aparecer no nome deles em algum lugar da UI deles — a confirmar alcance exato em auditoria futura de perfil/mini-perfil).
**REALTIME**: `ROLE_UPDATE`.
**BACKEND**: `PATCH /api/servers/:id/roles/:roleId`.
**BANCO**: `UPDATE roles`.
**REFRESH**: Persiste.
**RECONEXÃO**: Recarregado via fetch.
**ERRO**: `setError(...)`.
**CANCELAMENTO**: Não aplicável (sem modo de edição com "descartar" — cada campo salva independentemente ao interagir).
**REVERSÃO**: Editar de novo.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Cor {valor hex}"` em cada swatch (anuncia o código de cor, não um nome amigável — mesma característica já notada no seletor de cor de perfil de usuário, Roteiro 1).

---

## 9.5 — ROLE_EDIT_PERMISSIONS

**ID**: `ROLE_EDIT_PERMISSIONS`
**NOME**: Editar as permissões concedidas por um cargo
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Editor de cargo > aba "Permissões"`
**POSIÇÃO NA INTERFACE**: `.permission-group`, uma seção por categoria de permissão (`PERMISSION_DEFINITIONS` agrupado por `category`, de `packages/shared`).
**APARÊNCIA**: Lista de linhas (`.permission-row`), cada uma com o rótulo da permissão (`title` com a descrição completa no hover) + um switch (`.static-switch`) ligado/desligado.
**ESTADO NORMAL**: Switches refletindo o bitfield atual do cargo.
**HOVER**: `title` no rótulo mostra a descrição completa da permissão.
**ACTIVE/PRESSED**: Padrão de switch.
**SELECTED**: Classe `on` no switch quando o bit está setado.
**DISABLED**: `disabled={!canEditSelected}` em cada switch individualmente.
**LOADING**: Não confirmado.
**TRIGGER**: Clique em qualquer switch.
**PRÉ-CONDIÇÕES**: `canEditSelected`.
**RESULTADO IMEDIATO**: `patchSelectedRole({ permissions: bitfield com o bit ligado/desligado })` — operação bit a bit local (`| flag` ou `& ~flag`) antes de enviar o bitfield inteiro atualizado.
**RESULTADO VISUAL — nota especial**: se `ADMINISTRATOR` já estiver ligado, um aviso aparece acima da lista: "Administrador concede todas as permissões — as demais opções abaixo ficam irrelevantes." — **mas as demais opções continuam clicáveis/editáveis mesmo assim** (o aviso é só informativo, não desabilita as outras — tecnicamente redundante ter Administrador + outras permissões específicas ligadas, mas o app não impede).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma — cada switch é independente, sem botão "Salvar" em lote.
**RESULTADO FINAL**: Bitfield de permissões do cargo atualizado.
**EFEITO LOCAL**: Mudança imediata.
**EFEITO REMOTO**: `ROLE_UPDATE` via WebSocket — **membros com aquele cargo ganham/perdem a permissão em tempo real**, sem precisar relogar (backend valida permissão a cada requisição, não em cache de sessão — confirmado consistente com toda a arquitetura de permissões já auditada nesta linha de trabalho).
**REALTIME**: `ROLE_UPDATE`.
**BACKEND**: `PATCH /api/servers/:id/roles/:roleId`.
**BANCO**: `UPDATE roles.permissions`.
**REFRESH**: Persiste.
**RECONEXÃO**: Recarregado.
**ERRO**: `setError(...)`.
**CANCELAMENTO**: Não aplicável (sem lote/confirmação — cada clique já é definitivo).
**REVERSÃO**: Clicar de novo no mesmo switch.
**ATALHO**: Não aplicável.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `title` fornece a descrição completa, mas só em hover — **achado**: sem `aria-describedby` explícito conectando o switch à descrição completa, um leitor de tela focando o switch provavelmente só anuncia o rótulo curto, não a descrição detalhada que aparece no `title`.

**Nota de auditoria — sem overwrite por canal**: confirmado consistente com o resto desta auditoria (`DISCORD_PARITY_PLAN.md` §1/§15, já citado em várias fichas anteriores): permissões são só por cargo, servidor inteiro — não existe "negar esta permissão só neste canal específico". Decisão arquitetural deliberada, não uma lacuna acidental.

---

## 9.6 — ROLE_EDIT_MEMBERS

**ID**: `ROLE_EDIT_MEMBERS`
**NOME**: Atribuir/remover um cargo de membros específicos
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Editor de cargo > aba "Gerenciar membros"`
**POSIÇÃO NA INTERFACE**: `.role-member-list`, uma linha por membro do servidor (não só os que já têm o cargo).
**APARÊNCIA**: Campo de busca **funcional** (`memberSearch`, contraste direto com `ROLE_LIST_SEARCH_FAKE`) + lista de todos os membros, cada um com nome + switch ligado/desligado.
**ESTADO NORMAL**: Switch ligado pra quem já tem o cargo, desligado pra quem não tem.
**HOVER**: Padrão de switch/campo.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Classe `on` refletindo posse do cargo.
**DISABLED**: `disabled={!canEditSelected}`; **cargo `@everyone` bloqueia a aba inteira** com uma nota explicativa em vez da lista: "Todo mundo tem @everyone automaticamente — não dá pra atribuir ou remover manualmente."
**LOADING**: Não confirmado.
**TRIGGER**: Clique no switch de um membro.
**PRÉ-CONDIÇÕES**: `canEditSelected`; cargo não é `@everyone`.
**RESULTADO IMEDIATO**: `api.assignRole`/`api.unassignRole` conforme o estado atual.
**RESULTADO VISUAL**: Switch alterna; contagem de membros do cargo (mostrada na lista à esquerda e no cabeçalho do editor) atualiza.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Não aplicável.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Cargo atribuído/removido daquele membro.
**EFEITO LOCAL**: Estado local atualizado.
**EFEITO REMOTO**: `MEMBER_ROLES_UPDATE` via WebSocket — **para o próprio membro afetado, isso já é confirmado disparando resincronização em tempo real** (`useActiveServerMember`, Roteiro 1) — se acabou de ganhar uma permissão nova, ela já vale imediatamente, sem relogar.
**REALTIME**: `MEMBER_ROLES_UPDATE`.
**BACKEND**: `POST`/`DELETE` de atribuição de cargo.
**BANCO**: `INSERT`/`DELETE` em `user_roles`.
**REFRESH**: Persiste.
**RECONEXÃO**: Recarregado.
**ERRO**: `setError(...)`.
**CANCELAMENTO**: Não aplicável.
**REVERSÃO**: Clicar de novo.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Busca funcional com `<input>` real (contraste positivo com `ROLE_LIST_SEARCH_FAKE`).

---

## 9.7 — ROLE_DELETE

**ID**: `ROLE_DELETE`
**NOME**: Excluir um cargo
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Editor de cargo > cabeçalho > ícone de lixeira`
**POSIÇÃO NA INTERFACE**: `.role-editor-heading`, ao lado do nome do cargo selecionado.
**APARÊNCIA**: `TrashIcon` (14px).
**ESTADO NORMAL**: Visível só se `canEditSelected && !selectedRole.isEveryone` — **`@everyone` nunca pode ser excluído**, e a hierarquia se aplica igual às outras edições.
**HOVER**: `aria-label="Apagar cargo"`.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente (não desabilitado-visível) quando não aplicável.
**LOADING**: Não confirmado.
**TRIGGER**: Clique.
**PRÉ-CONDIÇÕES**: `canEditSelected`; cargo não é `@everyone`.
**RESULTADO IMEDIATO**: `window.confirm('Apagar o cargo "{nome}"? Essa ação não pode ser desfeita.')` — mesma técnica simples de confirmação nativa já vista em `CATEGORY_DELETE` (Roteiro 3), não um modal customizado com confirmação por nome digitado como `SERVER_DELETE` tem.
**RESULTADO VISUAL**: Se confirmado: cargo some da lista; editor volta pro estado "Selecione um cargo à esquerda."
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: O `window.confirm()` nativo.
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL — IRREVERSÍVEL**: Cargo apagado; membros que o tinham simplesmente perdem essas permissões (sem precisar de uma ação explícita de "remover de todo mundo" — é implícito à exclusão, via `ON DELETE CASCADE` em `user_roles`, consistente com o resto do schema já auditado).
**EFEITO LOCAL**: Lista atualizada.
**EFEITO REMOTO**: `ROLE_DELETE` via WebSocket — membros que tinham o cargo perdem as permissões em tempo real.
**REALTIME**: `ROLE_DELETE`.
**BACKEND**: `DELETE /api/servers/:id/roles/:roleId`.
**BANCO**: `DELETE roles` + cascata em `user_roles`.
**REFRESH**: Não aplicável (já apagado).
**RECONEXÃO**: Não aplicável.
**ERRO**: `setError(...)`.
**CANCELAMENTO**: "Cancelar" no `window.confirm()`.
**REVERSÃO**: **`MISSING`** — sem desfazer; recriar um cargo com o mesmo nome não restaura quem o tinha automaticamente.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `aria-label="Apagar cargo"`.

**Nota de auditoria — inconsistência de confirmação, terceira ocorrência**: esta é a **terceira** ação destrutiva nesta auditoria a usar `window.confirm()` nativo simples em vez do padrão de confirmação por nome digitado que `SERVER_DELETE` estabeleceu (as outras duas: `CATEGORY_DELETE`, Roteiro 3, e agora `ROLE_DELETE`) — um cargo mal apagado pode ter consequência tão séria quanto excluir uma categoria (perda de acesso/permissões pra vários membros de uma vez), então vale reconsiderar se o padrão de fricção deveria ser mais uniforme entre essas três ações.

---

## 9.8 — ROLE_HIERARCHY_ENFORCEMENT (referência — mecanismo transversal)

**ID**: `ROLE_HIERARCHY_ENFORCEMENT`
**NOME**: Regra de hierarquia por posição aplicada a toda ação de cargo/moderação
**STATUS**: `CORE` — mecanismo consistente confirmado em `RolesPane` e `MembersPane`: `ownPosition = highestPosition(member.roleIds, roles)` (a posição do cargo mais alto que o **próprio usuário logado** tem) é comparada contra a posição do alvo (`selectedRole.position` pra edição de cargo, `targetPosition(candidate)` pra moderação de membro) — só é permitido agir sobre algo estritamente **abaixo** da própria posição (`<`, nunca `<=`), nunca sobre si mesmo (`candidate.id !== member.userId` em `canModerate`) e nunca sobre igual/acima. **Mesma regra, reaproveitada em todo lugar relevante**: editar cargo (`canEditSelected`), atribuir/remover cargo de membro, timeout, ban, kick de voz. Já confirmado por teste automatizado real em sessão anterior desta linha de trabalho (`authorizeModerationAction`, citado no Roteiro de fundação de testes desta auditoria mais ampla: "rejeita quando o solicitante tenta agir sobre si mesmo", "rejeita quando o alvo tem posição igual à do solicitante", "rejeita quando o alvo tem posição maior que a do solicitante"). Documentado aqui como confirmação positiva consolidada, não repetido campo-a-campo em cada ficha individual de moderação para evitar redundância.

---

## 9.9 — MEMBER_VOICE_KICK

**ID**: `MEMBER_VOICE_KICK`
**NOME**: Expulsar um membro da chamada de voz (a partir da lista de membros do servidor)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações do Servidor > Membros > linha do membro > "Expulsar da voz"`
**POSIÇÃO NA INTERFACE**: `.member-roster-actions`.
**APARÊNCIA**: `.secondary-pill` com o texto "Expulsar da voz".
**ESTADO NORMAL**: Visível se `canModerate(candidate) && canKick` (`KICK_MEMBERS`).
**HOVER**: Padrão de pill.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente sem permissão/hierarquia adequada.
**LOADING**: Não confirmado durante a chamada.
**TRIGGER**: Clique — **sem confirmação prévia**, diferente de `VOICE_MODERATOR_DISCONNECT_PARTICIPANT` (Roteiro 7), que usa `window.confirm()` — **este caminho alternativo pra essencialmente a mesma ação (desconectar alguém da voz) não pede confirmação**, uma inconsistência real entre dois lugares da UI que levam ao mesmo resultado.
**PRÉ-CONDIÇÕES**: `KICK_MEMBERS`; hierarquia (`canModerate`); **não exige que o membro esteja de fato numa call no momento** — clicar em alguém que não está em nenhuma chamada de voz presumivelmente não teria efeito visível (a rota provavelmente só age se houver algo pra desconectar, mas o botão não desaparece condicionalmente a isso).
**RESULTADO IMEDIATO**: `api.voiceKickMember(serverId, userId)`.
**RESULTADO VISUAL**: Mensagem de feedback inline: "{nome} foi expulso da chamada de voz." (`runAction`, exibida em `role="status"` mas com a classe visual `form-error` — **inconsistência de estilo confirmada**: uma mensagem de **sucesso** usa a mesma classe CSS reservada pra erros em todo o resto do app).
**RESULTADO SONORO**: Nenhum pro moderador; o membro afetado teria o mesmo efeito sonoro de qualquer desconexão de voz forçada (Roteiro 7).
**ANIMAÇÃO**: Não aplicável.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: Nenhum (ver `TRIGGER`).
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Efeito idêntico a `VOICE_MODERATOR_DISCONNECT_PARTICIPANT` (Roteiro 7) — mesmo endpoint de backend provavelmente reaproveitado (`voiceKickMember`/`disconnectVoiceParticipant`, a confirmar se são literalmente a mesma rota ou duas rotas distintas com o mesmo efeito).
**EFEITO LOCAL**: Mensagem de feedback.
**EFEITO REMOTO**: Membro desconectado da call.
**REALTIME**: Mesma família de eventos de `VOICE_MODERATOR_DISCONNECT_PARTICIPANT`.
**BACKEND**: `POST` de kick de voz.
**BANCO**: Não aplicável diretamente (ação de sala LiveKit).
**REFRESH**: Não aplicável.
**RECONEXÃO**: Membro pode reentrar na call imediatamente (não é um ban, só uma ejeção pontual — mesma característica já documentada no Roteiro 7).
**ERRO**: Mensagem de erro na mesma área de feedback (`runAction` unifica sucesso/erro no mesmo elemento visual).
**CANCELAMENTO**: **`MISSING`** — sem confirmação, não há nada a cancelar.
**REVERSÃO**: Não aplicável.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: `role="status"` na mensagem de feedback (anúncio não-intrusivo, apropriado pra uma confirmação de sucesso, apesar do `className` visualmente sugerir erro).

---

## 9.10 — MEMBER_TIMEOUT

**ID**: `MEMBER_TIMEOUT`
**NOME**: Aplicar timeout (silenciar temporariamente) a um membro
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Membros > linha do membro > "Timeout" > menu inline com presets`
**POSIÇÃO NA INTERFACE**: `.moderation-inline-menu`, aparece abaixo da linha do membro ao clicar "Timeout".
**APARÊNCIA**: 5 botões de preset (5 min, 10 min, 1 hora, 1 dia, 7 dias — `TIMEOUT_PRESETS`) + "Cancelar".
**ESTADO NORMAL**: Menu fechado; botão "Timeout" visível só se `canTimeout && !isTimedOut`.
**HOVER**: Padrão de pill.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente sem `MODERATE_MEMBERS`/hierarquia; **ausente também se o membro já estiver em timeout** (nesse caso mostra "Remover timeout" em vez disso, ver ficha seguinte).
**LOADING**: Não confirmado.
**TRIGGER**: Clique em "Timeout" abre o menu de presets; clique num preset aplica direto — **sem duração customizada livre**, só os 5 valores fixos (diferente do Discord real, que permite escolher uma data/hora específica além dos presets).
**PRÉ-CONDIÇÕES**: `MODERATE_MEMBERS`; `canModerate(candidate)`.
**RESULTADO IMEDIATO**: `api.timeoutMember(serverId, userId, minutos)`, menu fecha imediatamente (`setMenu(null)` já no `onClick`, antes mesmo da chamada assíncrona resolver).
**RESULTADO VISUAL**: Feedback inline "{nome} está em timeout por {duração}."; selo `role-chip role-chip-timeout` "Silenciado até {data/hora}" aparece ao lado do nome do membro.
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: É o próprio `.moderation-inline-menu`.
**MODAL**: Não é modal (inline).
**SEGUNDA ETAPA**: Nenhuma.
**RESULTADO FINAL**: Membro impedido de enviar mensagens/comandos de voz até o horário indicado (enforcement real já confirmado em `TIMEOUT_COMPOSER_LOCK`, Roteiro 4, e `authorizeModerationAction`, testado automaticamente).
**EFEITO LOCAL**: Feedback + selo.
**EFEITO REMOTO**: `MEMBER_TIMEOUT_UPDATE` via WebSocket — **o próprio membro afetado tem o composer travado em tempo real**, imediatamente, mesmo no meio de uma sessão ativa (já confirmado em `TIMEOUT_COMPOSER_LOCK`).
**REALTIME**: `MEMBER_TIMEOUT_UPDATE`.
**BACKEND**: `POST /api/moderation/timeout`.
**BANCO**: `UPDATE server_members.timeout_until`.
**REFRESH**: Persiste (é dado real, não sessão).
**RECONEXÃO**: Recarregado.
**ERRO**: Feedback de erro na mesma área.
**CANCELAMENTO**: Botão "Cancelar" no menu de presets, antes de escolher.
**REVERSÃO**: `MEMBER_TIMEOUT_CLEAR` (ficha seguinte), ou esperar o prazo expirar naturalmente.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Cada preset é um `<button>` real, texto descritivo completo (não só números).

---

## 9.11 — MEMBER_TIMEOUT_CLEAR

**ID**: `MEMBER_TIMEOUT_CLEAR`
**NOME**: Remover o timeout de um membro antes do prazo expirar
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Membros > linha do membro já em timeout > "Remover timeout"`
**POSIÇÃO NA INTERFACE**: Mesmo lugar de `MEMBER_TIMEOUT`, texto do botão muda conforme o estado.
**APARÊNCIA**: `.secondary-pill` "Remover timeout".
**ESTADO NORMAL**: Visível só se `canTimeout && isTimedOut`.
**TRIGGER**: Clique direto — **sem confirmação, sem menu intermediário** (diferente de aplicar o timeout, que abre um menu de presets primeiro).
**RESULTADO IMEDIATO**: `api.clearMemberTimeout(serverId, userId)`.
**RESULTADO VISUAL**: Feedback "Timeout de {nome} removido."; selo de timeout desaparece.
**RESULTADO FINAL**: Composer do membro destravado imediatamente, em tempo real.
**EFEITO REMOTO**: `MEMBER_TIMEOUT_UPDATE` com `timeoutUntil: null`.
**Demais campos**: idênticos a `MEMBER_TIMEOUT` (mesma família de backend/banco/realtime, na direção oposta).

---

## 9.12 — MEMBER_BAN

**ID**: `MEMBER_BAN`
**NOME**: Banir um membro da instância
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Membros > linha do membro > "Banir" > menu inline com campo de motivo`
**POSIÇÃO NA INTERFACE**: `.moderation-inline-menu`, variante "ban".
**APARÊNCIA**: Botão "Banir" em vermelho (`.danger-pill`); menu expandido: campo "Motivo do banimento (opcional)" + botão "Confirmar banimento" (`.violet-primary.danger-pill` — combinação de classes que mistura destaque roxo com estilo de perigo) + "Cancelar".
**ESTADO NORMAL**: Menu fechado.
**HOVER**: Padrão de pill de perigo.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Ausente sem `BAN_MEMBERS`/hierarquia.
**LOADING**: Não confirmado.
**TRIGGER**: Clique em "Banir" abre o menu; preencher motivo (opcional) e clicar "Confirmar banimento".
**PRÉ-CONDIÇÕES**: `BAN_MEMBERS`; `canModerate(candidate)`.
**RESULTADO IMEDIATO**: `api.banMember(serverId, userId, motivo)`.
**RESULTADO VISUAL**: Feedback "{nome} foi banido."; membro **desaparece da lista de membros ativos** (`MEMBER_BANNED` já filtra `members` em `MembersPane`, não só em quem recebe o sign-out forçado documentado no Roteiro 1) e passa a aparecer na seção "Membros banidos" no rodapé da página (só visível a quem tem `BAN_MEMBERS`).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: `.moderation-inline-menu`, variante ban.
**MODAL**: Não é modal.
**SEGUNDA ETAPA**: Nenhuma pro moderador; do lado do banido, ver `SESSION_FORCE_LOGOUT_BAN`/`BAN_FORCE_DISCONNECT` (Roteiros 1/5).
**RESULTADO FINAL — de instância inteira**: consistente com a nota de auditoria já registrada no Roteiro 1 — banir aqui bane da instância toda, não só deste servidor, apesar da ação estar dentro das configurações de um servidor específico.
**EFEITO LOCAL**: Feedback + membro removido da lista.
**EFEITO REMOTO**: `broadcast({type: 'MEMBER_BANNED'})` (instância inteira, Roteiro 5) + `disconnectUser` força o socket do banido a cair.
**REALTIME**: `MEMBER_BANNED`.
**BACKEND**: `POST /api/moderation/bans`.
**BANCO**: Insere em `bans`; provavelmente remove de `server_members` também (a confirmar exatamente quais tabelas são afetadas na auditoria futura de moderação mais aprofundada).
**REFRESH**: Persiste.
**RECONEXÃO**: Não aplicável ao moderador.
**ERRO**: Feedback de erro na mesma área.
**CANCELAMENTO**: "Cancelar" no menu, antes de confirmar.
**REVERSÃO**: `MEMBER_UNBAN` (ficha seguinte).
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Campo de motivo com `placeholder` (sem `<label>` explícito).

---

## 9.13 — MEMBER_UNBAN

**ID**: `MEMBER_UNBAN`
**NOME**: Desbanir um usuário
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Membros > seção "Membros banidos" (rodapé, só com BAN_MEMBERS) > linha do banido > "Desbanir"`
**POSIÇÃO NA INTERFACE**: `.banned-members-section`, listando motivo do banimento e quem baniu (`ban.bannedByName`, se disponível).
**APARÊNCIA**: Nome + selo com o motivo (ou "Sem motivo informado") + selo "banido por {nome}" (se conhecido) + botão "Desbanir".
**TRIGGER**: Clique — **sem confirmação**, diferente do próprio ato de banir, que pede confirmação explícita via o menu de duas etapas.
**RESULTADO IMEDIATO**: `api.unbanMember(serverId, userId)`.
**RESULTADO VISUAL**: Feedback "{nome} foi desbanido."; linha removida da seção de banidos localmente (`setBans(current => current.filter(...))`, aplicado direto no cliente, **sem esperar confirmação do servidor nem reagir a um evento `MEMBER_UNBANNED`** — atualização puramente otimista aqui, diferente de outras ações desta mesma tela que esperam a resposta).
**RESULTADO FINAL**: Usuário pode logar/entrar de novo na instância.
**EFEITO REMOTO**: `broadcast({type: 'MEMBER_UNBANNED'})` (inferido pela simetria com `MEMBER_BANNED`, já confirmado existir no union de eventos).
**Demais campos**: mesma família de `MEMBER_BAN`, na direção oposta.

**Nota de auditoria**: a seção de banidos só aparece "se `canBan && bans.length > 0`" — **um moderador com `MODERATE_MEMBERS`/`KICK_MEMBERS` mas sem `BAN_MEMBERS` nunca vê quem está banido**, mesmo que pudesse querer saber — comportamento correto do ponto de vista de permissão granular, só registrado aqui como confirmação do escopo exato.

---

## 9.14 — MEMBER_SERVER_KICK *(MISSING)*

**ID**: `MEMBER_SERVER_KICK`
**NOME**: Expulsar um membro do servidor (sem banir permanentemente)
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**STATUS**: **`MISSING` — achado real, uma lacuna funcional concreta, não só de UI.** O Discord real distingue claramente **Kick** (remove a pessoa do servidor; ela pode voltar com um convite novo) de **Ban** (remove e impede a volta). Nesta auditoria da aba Membros, `canKick = hasPermission(member.permissions, Permission.KICK_MEMBERS)` **existe como permissão**, mas a única ação que ela desbloqueia na UI é "Expulsar da voz" (`MEMBER_VOICE_KICK`) — **que é só desconectar de uma call, não remover a filiação ao servidor**. Não há nenhum botão "Expulsar do servidor" em lugar nenhum de `MembersPane`. As únicas duas formas de um membro deixar de fazer parte de um servidor hoje são: (a) ele mesmo sair (`SERVER_LEAVE`, também já confirmado `MISSING` na UI no Roteiro 3, apesar do endpoint existir) ou (b) ser banido (`MEMBER_BAN`, permanente e de instância inteira).
**CAMINHO EXATO ESPERADO** (não implementado): `Membros > linha do membro > "Expulsar do servidor"` (deveria conviver ao lado de "Timeout" e "Banir").
**Impacto prático**: hoje, a única ferramenta de moderação "removível" disponível é o banimento — desproporcional pra situações onde o objetivo é só remover alguém do servidor específico sem impedi-lo de usar o resto da instância ou de ser reconvidado depois. Isso é coerente com `KICK_MEMBERS` já existir como bit de permissão (sugerindo que a intenção original de design já prevía essa ação) mas nunca ter sido conectado a uma rota/UI de "remover do servidor" de fato — só foi reaproveitado pro kick de voz, que é uma ação bem menor em escopo.
**Pré-requisito de implementação, caso venha a ser feito**: backend precisaria de uma rota `DELETE /api/servers/:id/members/:userId` (distinta de `.../members/me`, que já existe só pra auto-remoção) fazendo o mesmo `removeServerMember` já usado internamente, mais um evento de tempo real (`MEMBER_LEAVE` já existe e já é emitido pra auto-saída — reaproveitável) pra notificar o membro expulso e os demais.

---

## 9.15 — INVITE_CODE_VIEW_COPY_REGENERATE

**ID**: `INVITE_CODE_VIEW_COPY_REGENERATE`
**NOME**: Ver, copiar e regenerar o código de convite do servidor
**PLATAFORMA**: `DESKTOP_WINDOWS`, `WEB`
**CAMINHO EXATO**: `Configurações do Servidor > Convites`
**POSIÇÃO NA INTERFACE**: `.invite-code-card`.
**APARÊNCIA**: Código em `<code>` (fonte monoespaçada); botão "Copiar" (`CopyIcon`); texto "Usado N vez(es) — sem limite de usos nem expiração por enquanto." (honesto sobre a limitação, não finge ter controles que não existem); botão "Gerar novo código".
**ESTADO NORMAL**: Visível só a quem tem `MANAGE_SERVER` — quem não tem vê só o título "Convites" com a explicação "Só quem gerencia o servidor pode ver e gerar convites." em vez do código em si (**não é um card vazio/quebrado, é uma mensagem clara do motivo** — bom padrão, consistente com o resto desta auditoria de UI honesta sobre limitações).
**HOVER**: Padrão de botão pill.
**ACTIVE/PRESSED**: Padrão.
**SELECTED**: Não aplicável.
**DISABLED**: Card inteiro ausente sem permissão (não é "visível mas cinza").
**LOADING**: "Carregando…" enquanto busca o convite.
**TRIGGER — copiar**: Clique em "Copiar".
**TRIGGER — regenerar**: Clique em "Gerar novo código".
**PRÉ-CONDIÇÕES**: `MANAGE_SERVER`.
**RESULTADO IMEDIATO — copiar**: `navigator.clipboard.writeText(invite.code)` → `setCopied(true)`, texto do botão muda pra "Copiado!" por 2 segundos (`window.setTimeout`) — **esta é uma das poucas ações de copiar em todo o app auditado até agora que dá feedback visual real** (contraste direto com `MESSAGE_COPY_TEXT`, Roteiro 4, e "Copiar ID da Categoria", Roteiro 3, que não dão feedback nenhum) — **inconsistência a corrigir**: o padrão "Copiado!" já existe e funciona aqui, só precisaria ser replicado nos outros lugares que copiam sem avisar.
**RESULTADO IMEDIATO — regenerar**: `window.confirm('Gerar um novo código invalida o código atual. Continuar?')` — se confirmado, `api.regenerateServerInvite(serverId)`.
**RESULTADO VISUAL — regenerar**: Novo código substitui o antigo na tela; **qualquer link/código antigo já compartilhado para de funcionar imediatamente** (mensagem do próprio `confirm()` já avisa isso antes de agir).
**RESULTADO SONORO**: Nenhum.
**ANIMAÇÃO**: Não confirmada.
**POPOVER**: Não aplicável.
**MENU**: Não aplicável.
**MODAL**: `window.confirm()` nativo (regenerar).
**SEGUNDA ETAPA**: Compartilhar o código copiado com quem se deseja convidar (fora do app).
**RESULTADO FINAL**: Convite ativo, código no clipboard ou regenerado.
**EFEITO LOCAL**: Nenhuma mudança pro próprio servidor além do código em si.
**EFEITO REMOTO**: Regenerar invalida o código pra qualquer pessoa que ainda não tenha usado o antigo — **sem aviso pra quem já tinha o link antigo salvo** (não há como avisar, já que convites não são rastreados por destinatário).
**REALTIME**: Não confirmado se `regenerateServerInvite` emite algum evento de WebSocket (provavelmente não precisa, já que o código só importa pra quem ainda vai entrar, não pra membros já conectados).
**BACKEND**: `POST /api/servers/:id/invite` (buscar/criar) e `.../invite/regenerate`.
**BANCO**: `invites` — schema já suporta `max_uses`/`expires_at`, mas **nunca configurados por essa UI** (sempre `NULL`, confirmado consistente com `DISCORD_PARITY_PLAN.md` §1).
**REFRESH**: Código persiste (é dado real).
**RECONEXÃO**: Recarregado via fetch normal.
**ERRO**: `setError(...)`.
**CANCELAMENTO**: "Cancelar" no `confirm()` de regenerar.
**REVERSÃO**: Regenerar de novo, se necessário.
**ATALHO**: Nenhum.
**MENU DE CONTEXTO**: Não aplicável.
**ACESSIBILIDADE**: Botão de copiar com texto que muda de estado (não só ícone), bom para leitores de tela.

**Nota de auditoria — sem convite por link direto**: o "código" é sempre um código curto pra colar manualmente na tela "Entrar com convite" (`SERVER_JOIN_INVITE_SUBMIT`, Roteiro 3) — não é um link clicável tipo `https://.../invite/ABCD1234` que abriria o app direto na tela de resgate (algo que dependeria do roteamento por URL já confirmado ausente no Roteiro 2). Convite hoje é sempre "copie o código, cole na tela de entrar."

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas `MISSING`/de referência), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5**, **9 do Roteiro 6**, **12 do Roteiro 7**, **8 do Roteiro 8** e **15 do Roteiro 9** — **147 fichas no total**. Cargos, permissões, moderação (timeout/ban/kick de voz) e convites são um sistema **real, testado e consistente**, com hierarquia por posição aplicada uniformemente — documentado como `CORE`.

**Achados novos mais importantes desta seção**: (1) **busca de cargos decorativa** (`readOnly`, sem função) — exatamente o tipo de problema que o usuário já tinha pedido pra caçar e eliminar numa instrução anterior desta linha de trabalho, mas que sobreviveu escondido na aba Cargos; (2) **falta "Expulsar do servidor"** como ação distinta de banir — hoje só existe remover-se a si mesmo (sem botão de UI) ou banir permanentemente, sem meio-termo, mesmo a permissão `KICK_MEMBERS` já existindo (só é usada pra kick de *voz*, não de servidor); (3) **inconsistência de confirmação**: excluir cargo/categoria usa `confirm()` nativo, excluir servidor exige digitar o nome — três níveis de fricção diferentes pra ações de gravidade parecida; (4) **inconsistência de feedback de cópia**: convites já mostram "Copiado!", mas mensagens/IDs em outros lugares do app não — o padrão certo já existe em algum lugar, só não foi replicado.

---

# ROTEIRO 10 — CONFIGURAÇÕES DO APP: APARÊNCIA

Arquitetura real (verificada em `Workspace.tsx`, seção `section === 'appearance'`): esta é uma das telas mais **completas e honestas** de toda a auditoria até agora — cada controle é real, persistido, e refletido numa pré-visualização ao vivo ao lado. Nenhum elemento decorativo encontrado nesta seção específica.

---

## 10.1 — THEME_SELECT

**ID**: `THEME_SELECT`
**NOME**: Escolher o tema visual (claro/escuro/etc.)
**CAMINHO EXATO**: `Configurações > Aparência > "Tema"`
**APARÊNCIA**: Cartões (`.theme-card`) com uma amostra de cor + rótulo, um por opção de `THEME_OPTIONS`.
**TRIGGER**: Clique no cartão.
**RESULTADO IMEDIATO**: `chooseTheme(valor)` — aplica no `<html>`/`<body>` via atributo/classe (mecanismo exato de aplicação de tema não relido campo-a-campo nesta passagem, mas o efeito já é visível na pré-visualização ao lado em tempo real) e persiste (provavelmente `localStorage`, mesmo padrão de `getTheme()`/`setThemeModeState` já usado por outras preferências de UI nesta auditoria).
**BANCO**: `localStorage`, por dispositivo/navegador — não sincroniza entre contas/dispositivos, mesma característica já documentada pra preferências de voz (Roteiro 7).
**REFRESH**: Persiste.
**EFEITO REMOTO**: Nenhum — preferência 100% pessoal e local.
**Demais campos**: `role="group"` no container, `aria-label="Tema"` — estrutura ARIA correta pra um grupo de opções, mesma lacuna de falta de `radiogroup`/`radio` formal já notada em seletores parecidos (Roteiro 1/3).

---

## 10.2 — PERF_MODE_SELECT

**ID**: `PERF_MODE_SELECT`
**NOME**: Alternar entre modo de desempenho "Completo" e "Leve"
**CAMINHO EXATO**: `Configurações > Aparência > "Modo de desempenho"`
**APARÊNCIA**: Dois botões (`.perf-toggle`), com texto de ajuda abaixo: "O modo leve desliga animações e efeitos visuais para PCs mais fracos."
**RESULTADO IMEDIATO**: `choosePerfMode('full' | 'lite')` — **efeito confirmado em outro lugar desta auditoria**: `perfMode === 'full'` é exatamente a condição que decide se `VOICE_CHANNEL_JOIN` (Roteiro 6) usa a View Transitions API do navegador ao entrar num canal de voz — o modo "Leve" desliga especificamente essa transição, não é só um rótulo genérico sem efeito real mensurável.
**BANCO**: `localStorage` (`getPerfMode()`).
**Demais campos**: mesmo padrão de `THEME_SELECT`.

---

## 10.3 — UI_DENSITY_SELECT

**ID**: `UI_DENSITY_SELECT`
**NOME**: Escolher a densidade da interface (Compacta/Padrão/Confortável)
**CAMINHO EXATO**: `Configurações > Aparência > "Densidade da interface"`
**APARÊNCIA**: Três botões (`.perf-toggle.three-way`).
**RESULTADO IMEDIATO**: `chooseDensity(valor)` — afeta espaçamento geral da UI (mecanismo de aplicação via CSS custom property/classe, não relido linha a linha).
**BANCO**: `localStorage`.
**Demais campos**: mesmo padrão.

---

## 10.4 — MESSAGE_STYLE_SELECT

**ID**: `MESSAGE_STYLE_SELECT`
**NOME**: Escolher o estilo de exibição das mensagens (Padrão/Compacto/Agrupado)
**CAMINHO EXATO**: `Configurações > Aparência > "Estilo de exibição das mensagens"`
**RESULTADO IMEDIATO**: `setMessageStyle(valor)` — **efeito já confirmado em duas fichas anteriores desta auditoria**: controla a classe `compact`/`grouped` tanto no chat de canal de texto (Roteiro 4) quanto no chat de voz (Roteiro 7) — uma única preferência central compartilhada pelos dois sistemas de chat distintos do app. "Agrupado" funde mensagens consecutivas da mesma pessoa em menos de 5 minutos numa única entrada visual (`continued`, mecanismo já confirmado lendo o código do chat de voz).
**BANCO**: `localStorage` (`MESSAGE_STYLE_KEY`).
**Demais campos**: mesmo padrão de seleção de 3 vias.

---

## 10.5 — CHAT_FONT_SIZE_SLIDER / MESSAGE_SPACING_SLIDER / UI_ZOOM_SLIDER

**ID**: `APPEARANCE_SLIDERS` (três controles idênticos em padrão, documentados juntos por serem estruturalmente idênticos — não por serem "parecidos" no sentido que o pedido original proíbe resumir, mas porque são literalmente o mesmo componente `<input type="range">` com escalas pré-definidas diferentes)
**NOME**: Ajustar tamanho da fonte do chat, espaçamento entre mensagens, e zoom geral da interface
**CAMINHO EXATO**: `Configurações > Aparência`, três sliders em sequência.
**APARÊNCIA**: `<input type="range">` com `min={0}` `max={escala.length - 1}` (índice discreto numa escala pré-definida, não um valor livre em %) + `<output>` mostrando a porcentagem atual.
**TRIGGER**: Arrastar, clicar num ponto, ou setas do teclado (nativo do slider).
**RESULTADO IMEDIATO**: `chooseChatFontStep`/`chooseMessageSpacingStep`/`chooseUiZoomStep(índice)` — aplicado imediatamente, refletido na pré-visualização ao vivo ao lado (`CHAT_FONT_SCALES`/`MESSAGE_SPACING_SCALES`/`UI_ZOOM_SCALES`, arrays de porcentagens pré-definidas, não um range contínuo arbitrário).
**RESULTADO VISUAL**: Mudança instantânea, visível tanto na pré-visualização quanto (presumivelmente) na UI real por trás do modal de configurações.
**BANCO**: `localStorage`, uma chave por slider.
**REFRESH**: Persiste.
**EFEITO REMOTO**: Nenhum.
**ACESSIBILIDADE**: `<label htmlFor>` associado corretamente em todos os três — nativo do `<input type="range">`, acessível por teclado (setas) sem nenhum trabalho extra necessário.

**Nota de auditoria — zoom da interface no desktop**: o zoom "Configurações > Aparência > Zoom da interface" é **distinto e não confirmado como sincronizado** com o zoom nativo do Electron já documentado no Roteiro 0 (`set-zoom-factor`, usado — segundo o comentário do próprio código — porque "CSS zoom deixa espaço vazio em layouts full-bleed... o zoom nativo do Chromium... recalcula as unidades de viewport corretamente"). **Achado a confirmar em auditoria futura mais profunda**: se este slider de "Zoom da interface" dentro de Aparência aciona `window.desktop.setZoomFactor` (o mecanismo correto já documentado no Roteiro 0) ou se é um zoom CSS separado — os nomes são parecidos o bastante pra serem confundidos, mas o comentário do código em `main.ts` sugere fortemente que só o zoom nativo do Chromium é o caminho "certo" pra evitar o bug de espaço vazio, então valeria confirmar que este slider usa exatamente esse mecanismo e não um zoom CSS alternativo que reintroduziria o mesmo bug já documentado como corrigido.

---

## 10.6 — UI_ACCENT_COLOR_CUSTOM

**ID**: `UI_ACCENT_COLOR_CUSTOM`
**NOME**: Personalizar a cor de destaque de toda a interface
**CAMINHO EXATO**: `Configurações > Aparência > painel lateral > "Cores e personalização"`
**APARÊNCIA**: Paleta de swatches fixos (`UI_ACCENT_SWATCHES`, mesmo padrão de `radiogroup`/`radio` já visto em outros seletores de cor) **mais** um seletor de cor livre: `<input type="color">` nativo do SO/navegador **e** um campo de texto hex validado por regex (`/^#[0-9a-fA-F]{6}$/`) em paralelo — **duas formas de escolher a mesma cor livre**, sincronizadas; um switch "Aplicar cor nos elementos da interface" liga/desliga o efeito por completo sem perder a cor escolhida.
**RESULTADO IMEDIATO**: `chooseUiAccent(cor, habilitado)`.
**RESULTADO VISUAL**: Aplicado em tempo real em toda a interface (não só na pré-visualização) quando habilitado — **esta é a única preferência de Aparência com alcance confirmado além do próprio modal de configurações e da pré-visualização** (as outras — tema, densidade, etc. — presumivelmente também afetam o app real por trás do modal, mas não foram confirmadas tão explicitamente quanto esta, cujo próprio nome do controle, "Aplicar cor nos elementos da interface", deixa o alcance implícito).
**BANCO**: `localStorage` — cor + estado habilitado/desabilitado.
**REFRESH**: Persiste.
**EFEITO REMOTO**: Nenhum — cor de interface é 100% pessoal (distinta da cor de perfil pública, que outros veem, já documentada no Roteiro 1).
**ERRO**: Campo de texto hex simplesmente **ignora** entradas que não batem com o regex (`if (/^#[0-9a-fA-F]{6}$/.test(value)) chooseUiAccent(...)`) — sem mensagem de erro, o valor digitado errado só não tem efeito nenhum até virar um hex válido de 6 dígitos.
**ACESSIBILIDADE**: Swatches com `role="radio"`/`aria-checked` (mesmo padrão parcial de radiogroup já visto), `aria-label="Cor personalizada"` no seletor de cor nativo, switch com `role="switch"`/`aria-checked`.

---

## 10.7 — APPEARANCE_LIVE_PREVIEW (referência)

**ID**: `APPEARANCE_LIVE_PREVIEW`
**STATUS**: `CORE` — painel lateral fixo (`.appearance-preview`) com duas mensagens de exemplo (uma do próprio usuário, com avatar/cor reais da conta; uma de "Amigo", genérica) que refletem **em tempo real** tema/densidade/estilo de mensagem/fonte/espaçamento conforme cada controle é ajustado — sem precisar fechar e reabrir Configurações pra ver o efeito. Padrão de qualidade consistente com o resto desta seção: nada aqui é decorativo.

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas agrupadas/de referência, dado que os três sliders de Aparência são estruturalmente idênticos e a norma contra resumir aplica-se a *interações distintas*, não a instâncias repetidas do mesmo componente genérico), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5**, **9 do Roteiro 6**, **12 do Roteiro 7**, **8 do Roteiro 8**, **15 do Roteiro 9** e **7 do Roteiro 10** — **154 fichas no total**. Aparência é a seção de Configurações mais consistentemente `CORE` de toda a auditoria até agora — sem nenhum elemento decorativo encontrado.

**Interrupção deliberada da auditoria — incidente de produção**: a pedido explícito do usuário, o trabalho de auditoria pausou aqui pra investigar uma queda recorrente do bot de música. **Achado**: o container do bot nunca chegou a cair — ficou 17h no ar atravessando vários deploys de `api`/`web` no mesmo dia, prova direta de que o processo de deploy já era escopado corretamente (`docker compose build api web` + `up -d --no-deps api web`, nunca tocando `music-bot`) — o isolamento pedido já existia. A causa real era só os cookies de autenticação do YouTube expirando (fragilidade conhecida de cookies exportados do navegador, sem relação com deploy nenhum) — corrigido aplicando cookies novos e verificado com o comando exato que o app usa internamente (`--plugin-dirs`/`--js-runtimes node`/PO-token), sem reiniciar nem reconstruir o container. Lição registrada em memória de longo prazo para não repetir a investigação do zero numa próxima queda. Auditoria retomada a partir daqui.

---

# ROTEIRO 11 — AMIGOS E MENSAGENS DIRETAS

Arquitetura real (verificada em `apps/web/src/components/Friends.tsx` e `DmChannelView.tsx`, lidos por completo nesta passagem): sistema de amigos e DM 1:1 **real e funcional**, com uma divergência arquitetural deliberada e importante frente ao Discord real — **só é possível adicionar como amigo alguém que já divide um servidor com você**, não existe busca global por nome de usuário/tag em toda a instância.

---

## 11.1 — FRIEND_ADD_SEARCH

**ID**: `FRIEND_ADD_SEARCH`
**NOME**: Buscar pessoas para adicionar como amigo
**CAMINHO EXATO**: `Início > Amigos > aba "Adicionar amigo"`
**APARÊNCIA**: Campo de busca funcional (`SearchIcon` + `<input>`) + lista de resultados, cada um com avatar/nome + ação conforme o status do relacionamento.
**ACHADO ARQUITETURAL — ESCOPO REAL**: confirmado lendo o código e o comentário do próprio autor: a lista de candidatos **não é "todo mundo registrado na instância"**, é a união deduplicada dos membros de **todos os servidores dos quais o próprio usuário já faz parte** (`Promise.all(serverIds.map(id => api.getMembers(id)))`, mesclados por id). O comentário explica a razão: "não existe mais um único 'todo mundo registrado' desde que múltiplos servidores existem." **Efeito prático**: não dá pra adicionar como amigo alguém que não compartilha nenhum servidor com você — diferente do Discord real, que permite adicionar por `usuário#tag`/nome de usuário global, cruzando servidores livremente.
**TRIGGER**: Digitar no campo (filtro local sobre a lista já carregada, sem nova chamada de rede por tecla).
**RESULTADO IMEDIATO**: Filtro instantâneo client-side (`member.displayName.toLowerCase().includes(query)`).
**PRÉ-CONDIÇÕES**: Estar em pelo menos um servidor com outras pessoas.
**RESULTADO VISUAL**: Lista filtrada; cada linha mostra a ação certa conforme `relationshipStatus`: "Adicionar" (`NONE`), "Pedido enviado" (`PENDING_OUTGOING`), "Pedido recebido" (`PENDING_INCOMING`), "Já são amigos" (`ACCEPTED`) — **nunca mostra um botão de ação errado pro estado atual**.
**BACKEND**: `GET /api/servers/:id/members` por servidor, reaproveitado (mesma rota que a aba Membros de Configurações do Servidor usa, Roteiro 9).
**BANCO**: Leitura de `server_members`.
**EFEITO REMOTO**: Nenhum até enviar um pedido.
**ACESSIBILIDADE**: Busca funcional real (contraste positivo direto com `ROLE_LIST_SEARCH_FAKE`, Roteiro 9).

**Nota de auditoria**: esta restrição pode ser vista como uma feature de privacidade deliberada (instância fechada, comunidade de amigos) tanto quanto uma limitação — vale confirmar com o usuário se isso é intencional pra sempre ou se um dia deveria existir uma forma de adicionar alguém por convite direto/username sem precisar estar no mesmo servidor primeiro.

---

## 11.2 — FRIEND_REQUEST_SEND

**ID**: `FRIEND_REQUEST_SEND`
**NOME**: Enviar um pedido de amizade
**CAMINHO EXATO**: `Aba "Adicionar amigo" > linha de alguém com status NONE > "Adicionar"`
**TRIGGER**: Clique.
**RESULTADO IMEDIATO**: `api.sendFriendRequest(userId)`.
**RESULTADO VISUAL**: Feedback inline por pessoa (`feedback[userId]`): **"Agora vocês são amigos!"** se a resposta já vier `ACCEPTED` (caso do outro lado já ter pedido antes — auto-aceite em pedido mútuo simultâneo, já confirmado como `DONE` em `DISCORD_PARITY_PLAN.md` §1) ou **"Pedido enviado."** caso contrário — **duas mensagens de sucesso diferentes pro mesmo botão**, dependendo do resultado real, não um "sucesso genérico" fixo.
**EFEITO REMOTO**: `FRIENDSHIP_UPDATE` via WebSocket, escopado aos dois participantes (`sendToUsers`, Roteiro 5) — o destinatário vê o pedido aparecer em tempo real na aba "Pendentes" dele, com o badge no botão Início atualizando (`FRIEND_REQUEST_BADGE`, Roteiro 2).
**BACKEND**: `POST /api/friends/requests` (nome exato de rota inferido, não relido linha a linha nesta passagem).
**ERRO**: Feedback de erro na mesma área inline.
**REVERSÃO**: `FRIEND_REQUEST_CANCEL_OUTGOING`.

---

## 11.3 — FRIEND_REQUEST_ACCEPT

**ID**: `FRIEND_REQUEST_ACCEPT`
**NOME**: Aceitar um pedido de amizade recebido
**CAMINHO EXATO**: `Amigos > aba "Pendentes" > pedido recebido > "Aceitar"`
**ACHADO — SEM ROTA DEDICADA**: `respond(userId, true)` chama **o mesmo `api.sendFriendRequest(userId)`** usado pra *enviar* um pedido novo, não uma rota separada de "aceitar" — reaproveita a lógica de auto-aceite do backend (mandar um pedido quando já existe um pedido pendente do outro lado na direção oposta é tratado como aceitar, não como um segundo pedido duplicado).
**RESULTADO IMEDIATO**: Chamada + `onRefresh()` (refetch completo de amigos/pedidos, não uma atualização otimista local).
**RESULTADO VISUAL**: Pedido sai de "Pendentes", pessoa aparece em "Todos".
**EFEITO REMOTO**: `FRIENDSHIP_UPDATE` pros dois lados.
**ERRO**: Silenciado (`catch { /* O usuário pode tentar de novo pelo mesmo botão. */ }`) — **sem feedback visível de erro nesta ação específica**, diferente de `FRIEND_REQUEST_SEND` (que tem feedback inline por pessoa) — se aceitar falhar, o usuário só veria o pedido continuar lá, sem explicação, e teria que tentar nave de novo por conta própria.

---

## 11.4 — FRIEND_REQUEST_DECLINE

**ID**: `FRIEND_REQUEST_DECLINE`
**NOME**: Recusar um pedido de amizade recebido
**CAMINHO EXATO**: `Pendentes > pedido recebido > "Recusar"`
**TRIGGER**: Clique — **sem confirmação**.
**RESULTADO IMEDIATO**: `api.removeFriendship(userId)` — **mesma rota usada pra desfazer uma amizade já aceita** (`FRIEND_REMOVE`) e pra cancelar um pedido enviado (`FRIEND_REQUEST_CANCEL_OUTGOING`) — uma única operação de backend cobre os três casos (recusar/cancelar/desfazer), já que todos resultam no mesmo estado final: nenhum relacionamento entre os dois.
**RESULTADO VISUAL**: Pedido desaparece da lista.
**EFEITO REMOTO**: `FRIENDSHIP_UPDATE`.
**ERRO**: Silenciado, mesma lacuna de `FRIEND_REQUEST_ACCEPT`.

---

## 11.5 — FRIEND_REQUEST_CANCEL_OUTGOING

**ID**: `FRIEND_REQUEST_CANCEL_OUTGOING`
**NOME**: Cancelar um pedido de amizade que você mesmo enviou
**CAMINHO EXATO**: `Pendentes > pedido enviado > "Cancelar"`
**Demais campos**: idênticos a `FRIEND_REQUEST_DECLINE` (mesma rota `removeFriendship`, sem confirmação, erro silenciado).

---

## 11.6 — FRIEND_REMOVE

**ID**: `FRIEND_REMOVE`
**NOME**: Desfazer uma amizade já aceita
**CAMINHO EXATO**: `Amigos > aba "Todos" > linha do amigo > ícone de X`
**TRIGGER**: Clique → **`window.confirm('Remover esse amigo?')`** — **esta é a única das três ações de "remover relacionamento" (recusar/cancelar/desfazer) que pede confirmação** — recusar um pedido recebido ou cancelar um enviado são imediatos, sem confirmar; desfazer uma amizade já estabelecida pede um clique extra de confirmação. Diferença de fricção justificável (desfazer algo já aceito por ambos os lados é uma perda maior que recusar algo que nunca se concretizou), mas vale registrar como a razão da assimetria entre fichas irmãs.
**RESULTADO IMEDIATO**: Se confirmado, `api.removeFriendship(userId)`.
**RESULTADO VISUAL**: Amigo sai da lista "Todos".
**EFEITO REMOTO**: `FRIENDSHIP_UPDATE` pros dois lados — **o DM entre os dois não é apagado** (mensagens antigas continuam existindo se o usuário navegar até o canal de DM diretamente, a confirmar se a aba de DM em si desaparece da sidebar ou só fica "sem amizade" — ver nota de auditoria em `DM_MESSAGE_SEND` adiante).
**ERRO**: Silenciado.

---

## 11.7 — FRIEND_TABS_NAVIGATION

**ID**: `FRIEND_TABS_NAVIGATION`
**NOME**: Navegar entre as abas Todos/Pendentes/Bloqueados/Adicionar amigo
**CAMINHO EXATO**: `Amigos > barra de abas`
**APARÊNCIA**: 4 abas com contagem: "Todos — N", "Pendentes" (só mostra número se `incoming.length > 0`), "Bloqueados — N", "Adicionar amigo" (sem contagem, ícone `UserPlusIcon`, estilo visualmente distinto — `.friends-tab-add`).
**ESTADO NORMAL**: Aba inicial é **dinâmica**: `useState(state.incoming.length > 0 ? 'pending' : 'all')` — se você tem pedidos pendentes ao abrir a tela, ela já abre direto em "Pendentes" em vez de "Todos", chamando atenção pra ação necessária.
**ACHADO — SEM ABA "ONLINE"**: confirmado por ausência: só 4 abas (Todos/Pendentes/Bloqueados/Adicionar), **nenhuma aba "Online"** como o pedido original espera (Roteiro 30) — consequência direta e coerente da ausência total de status de presença já confirmada no protocolo (`PRESENCE_STATUS`, Roteiro 5, `MISSING` até no nível do `RealtimeEvent`) — não dá pra filtrar por "online" quando o conceito de "estar online" não existe em lugar nenhum do sistema.
**Demais campos**: navegação simples por `useState`, sem persistência entre sessões, sem atalho de teclado, sem `role="tablist"` formal confirmado (mesma lacuna ARIA parcial já notada em seletores parecidos).

---

## 11.8 — FRIEND_DM_OPEN

**ID**: `FRIEND_DM_OPEN`
**NOME**: Abrir/criar uma conversa direta com um amigo
**CAMINHO EXATO**: `Amigos > aba "Todos" > linha do amigo > ícone de mensagem`
**RESULTADO IMEDIATO**: **Condicional em duas etapas**: `friend.dmChannelId ? onOpenDm(friend.id) : void api.openDmChannel(friend.id).then(() => onOpenDm(friend.id))` — se já existe um canal de DM com essa pessoa (de uma conversa anterior), abre direto; se nunca conversaram, **cria o canal de DM na hora**, só então abre — **transparente ao usuário**, o clique parece igual nos dois casos, mas o caminho de código por trás é diferente (achado, não um bug).
**RESULTADO VISUAL**: Navega pra `DmChannelView`, sidebar muda pro contexto de DM.
**EFEITO REMOTO**: Se o canal for novo, `DM_CHANNEL_CREATE` via WebSocket — **só entregue pros dois participantes** (`sendToUsers`), não um broadcast.
**BACKEND**: `POST /api/dm-channels` (criação) ou navegação direta se já existe.
**BANCO**: Insere em `dm_channels` só se novo.

---

## 11.9 — DM_SIDEBAR_LIST

**ID**: `DM_SIDEBAR_LIST`
**NOME**: Lista de conversas diretas na sidebar
**CAMINHO EXATO**: `Início > sidebar > "MENSAGENS DIRETAS"`
**APARÊNCIA**: Um botão "Amigos" fixo no topo (com badge de pendentes) + lista de canais de DM, cada um com avatar/nome do outro participante.
**ESTADO NORMAL**: "Nenhuma conversa ainda." se vazio.
**RESULTADO FINAL — ORDENAÇÃO**: confirmado no `useFriendsState` (Roteiro 11, ficha de referência de dados): a lista é **reordenada a cada mensagem nova** — `[...next].sort((a,b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt))` — conversa mais recente sempre sobe pro topo, em tempo real, sem precisar de F5 (mesmo padrão do Discord real).
**ACHADO — SEM INDICADOR DE NÃO LIDA**: mesma lacuna categórica já confirmada nos Roteiros 2/5 (sem rastreio de leitura em lugar nenhum do app) — uma DM nova não mostra nenhum destaque visual além de subir na ordem da lista.
**SELECTED**: Canal ativo com classe `active`.
**EFEITO REMOTO**: `DM_CHANNEL_CREATE` insere no topo da lista em tempo real pra quem recebe a primeira mensagem de alguém novo.

---

## 11.10 — DM_MESSAGE_SEND

**ID**: `DM_MESSAGE_SEND`
**NOME**: Enviar mensagem numa conversa direta
**CAMINHO EXATO**: `DM aberta > composer`
**STATUS**: Reaproveita boa parte do mesmo padrão de `MESSAGE_SEND` (Roteiro 4): markdown real (`MarkdownText`), editar, apagar, copiar, encaminhar — todos confirmados presentes (`CopyIcon`/`EditIcon`/`ForwardIcon`/`TrashIcon` importados e usados em `DmChannelView.tsx`).
**ACHADO — LACUNAS REAIS FRENTE AO CHAT DE CANAL**: confirmado por ausência de import: **sem reações** (nenhum ícone de emoji/reação na toolbar de hover da DM) e **sem upload de anexo** (nenhum botão de clipe/anexo no composer da DM) — ambos existem no chat de canal de servidor (Roteiro 4) mas não aqui, consistente com `DISCORD_PARITY_PLAN.md` §1: "sem reação/pin/busca/anexo dentro do DM ainda."
**PRÉ-CONDIÇÕES**: `composerDisabled = isBlockedByMe` — **só trava o composer se *você* bloqueou a outra pessoa** (não checa se a outra pessoa bloqueou você — nesse caso a mensagem provavelmente falharia no backend em vez de ser prevenida no cliente, a confirmar em auditoria futura). **Sem gate de timeout** — comentário explícito no código confirma que isso é deliberado: "timeout passou a ser por servidor... DM é uma conversa fora de qualquer servidor" — mesmo alguém em timeout em todos os seus servidores pode mandar DM normalmente.
**RESULTADO FINAL**: Mensagem persistida em `dm_messages`, entregue em tempo real só aos dois participantes.
**REALTIME**: `DM_MESSAGE_CREATE`/`DM_MESSAGE_UPSERT`, via `sendToUsers`.

**Nota de auditoria — DM com quem você desfez amizade**: não confirmado nesta passagem se `DM_MESSAGE_SEND` continua funcionando depois de `FRIEND_REMOVE` (desfazer a amizade) — o comentário do código em `DmChannelView.tsx` só menciona bloqueio, não status de amizade, como condição pro composer — **possível que DMs continuem abertas e funcionais mesmo sem amizade ativa**, diferente do que `DISCORD_PARITY_PLAN.md` §1 registra como pré-requisito pra *criar* uma DM ("DM 1:1 exige amizade ACCEPTED") — a exigência pode valer só pra abrir uma conversa nova, não pra continuar uma já existente após desfazer amizade. Marcado como achado a confirmar em auditoria futura mais profunda do backend de DM.

---

## 11.11 — DM_VOICE_VIDEO_CALL *(MISSING)*

**ID**: `DM_VOICE_VIDEO_CALL`
**NOME**: Iniciar uma chamada de voz/vídeo dentro de uma DM
**STATUS**: **`MISSING` por completo.** Confirmado por ausência: `DmChannelView.tsx` cabeçalho (`.dm-channel-header`) só tem o identity button (avatar+nome) — nenhum ícone de telefone/câmera pra iniciar chamada, diferente do Discord real, que tem os dois no cabeçalho de toda DM. Consistente com a arquitetura de voz deste app inteiro sendo baseada em **canais de voz persistentes dentro de servidores** (Roteiro 6), não em chamadas ad-hoc entre duas pessoas fora de um servidor — implementar isso exigiria um modelo novo de "sala de voz efêmera" só pra DMs, não uma extensão trivial do que já existe.
**Roteiro relacionado do pedido original**: `ROTEIRO 32 — RECEBER CALL` (som, overlay, aceitar/recusar) também não tem nenhum equivalente, pela mesma razão de raiz.

---

## 11.12 — DM_UNBLOCK

**ID**: `DM_UNBLOCK`
**NOME**: Desbloquear um usuário pela aba Bloqueados
**CAMINHO EXATO**: `Amigos > aba "Bloqueados" > linha > "Desbloquear"`
**TRIGGER**: Clique — sem confirmação.
**RESULTADO IMEDIATO**: `api.unblockUser(userId)` + `onRefresh()`.
**EFEITO REMOTO**: `BLOCK_UPDATE` via WebSocket (confirmado no union de eventos e no `useFriendsState`).
**ERRO**: Silenciado, mesma família de `FRIEND_REQUEST_ACCEPT`/`DECLINE`.
**Nota**: esta é a **segunda** forma de desbloquear já confirmada nesta auditoria mais ampla — a primeira é dentro de Configurações do app > Privacidade (`blockedUsers`/`unblock`, já mencionado en passant em sessão anterior desta linha de trabalho) — **duas telas diferentes com a mesma funcionalidade de desbloqueio**, a confirmar em auditoria futura se são exatamente redundantes ou se cada uma tem um propósito de navegação distinto (uma é "central de amigos", outra é "configurações da minha conta" — plausivelmente ambas fazem sentido coexistir, como no Discord real, que também tem bloqueados tanto em Amigos quanto em Configurações de Privacidade).

---

## 11.13 — DM_GROUP *(MISSING — referência)*

**ID**: `DM_GROUP`
**STATUS**: `MISSING`, já registrado em `DISCORD_PARITY_PLAN.md` §1/§4 ("sem grupo" repetido em várias entradas) — confirmado nesta auditoria por ausência estrutural: `DmChannel`/`dm_channels` são modelados inteiramente como 1:1 (`channel.participants.find(p => p.id !== ownId)` em vários lugares já lidos assume sempre exatamente um "outro" participante) — adicionar DM em grupo exigiria mudança de schema, não só de UI.

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas agrupadas/de referência/`MISSING`), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5**, **9 do Roteiro 6**, **12 do Roteiro 7**, **8 do Roteiro 8**, **15 do Roteiro 9**, **7 do Roteiro 10** e **13 do Roteiro 11** — **167 fichas no total**. Amigos e DM 1:1 são um sistema **real e funcional**, com uma divergência arquitetural deliberada relevante: adicionar amigo exige compartilhar um servidor primeiro, sem busca global por usuário.

**Achados mais importantes desta seção**: (1) "Aceitar" pedido de amizade e "enviar" pedido são literalmente a mesma chamada de API, reaproveitando lógica de auto-aceite; (2) três ações de "encerrar relacionamento" (recusar/cancelar/desfazer) têm fricção inconsistente — só desfazer amizade já aceita pede confirmação; (3) erros são silenciados em quase toda ação de amigos (aceitar, recusar, desbloquear) exceto enviar pedido, que tem feedback inline — inconsistência real de tratamento de erro; (4) DM não tem reações nem anexos, diferente do chat de canal; (5) sem chamada de voz/vídeo em DM, coerente com a arquitetura de voz ser baseada em canais de servidor, não em chamadas ad-hoc.

---

# ROTEIRO 12 — CONFIGURAÇÕES DO APP: MEU PERFIL, CONTA E SEGURANÇA, PRIVACIDADE

Arquitetura real (verificada em `Workspace.tsx`, seções `'profile'`/`'security'`/`'privacy'` do modal de Configurações do app — distinto de "Perfil do servidor", Roteiro 3, que é outra tela). Fecha o mapeamento de Configurações do app começado no Roteiro 10.

---

## 12.1 — PROFILE_BANNER_UPLOAD

**ID**: `PROFILE_BANNER_UPLOAD`
**NOME**: Alterar o banner do próprio perfil
**CAMINHO EXATO**: `Configurações > Meu perfil > "Alterar banner"`
**APARÊNCIA**: Preview da imagem atual (se houver) + botão "Alterar banner"; input de arquivo real escondido (`hidden`, acionado via `.click()` programático — mesmo padrão de `MESSAGE_ATTACH_FILE_PICKER`, Roteiro 4).
**RESULTADO IMEDIATO**: `handleBannerFile` → `fileToResizedDataUrl(file, 960, BANNER_DATA_URL_MAX_LENGTH)` (Roteiro 3, já documentado — **sem** o parâmetro `square`, então o banner preserva a proporção original, diferente de avatar/ícone de servidor que forçam recorte quadrado central).
**RESULTADO VISUAL**: Preview atualiza; texto de ajuda explícito: "Recomendado: 1920×480. Máximo 800KB (redimensionado automaticamente). Formatos: PNG, JPG ou WEBP."
**ERRO**: `bannerError` exibido como `.settings-hint` (não `.form-error`) — **inconsistência visual menor**: erro usa a mesma classe de texto de ajuda neutro, não a classe de erro em destaque usada em quase todo o resto do app.
**PRÉ-CONDIÇÕES**: Nenhuma.
**RESULTADO FINAL**: Só aplicado de fato ao clicar "Salvar alterações" (`PROFILE_SAVE_CANCEL`, ficha adiante) — **é um formulário de edição em lote**, diferente de várias outras telas desta auditoria onde cada campo salva individualmente ao interagir (ex.: Cargos, Roteiro 9).
**BANCO**: `users.banner_data_url`, só gravado no submit do formulário inteiro.
**ACESSIBILIDADE**: Botão de texto real (não só ícone), `accept="image/png,image/jpeg,image/webp"` restringe o seletor nativo do SO aos formatos suportados.

---

## 12.2 — PROFILE_AVATAR_UPLOAD_REMOVE

**ID**: `PROFILE_AVATAR_UPLOAD_REMOVE`
**NOME**: Alterar ou remover o próprio avatar
**CAMINHO EXATO**: `Configurações > Meu perfil > "Alterar avatar"/"Remover"`
**RESULTADO IMEDIATO — alterar**: `handleAvatarFile` → `fileToResizedDataUrl(file, 256, AVATAR_DATA_URL_MAX_LENGTH, true)` — **com** `square: true` (Roteiro 3), então avatar de usuário já se beneficia do mesmo recorte quadrado central corrigido nesta linha de trabalho (a mesma correção que resolveu o "ícone feio" de servidor se aplica aqui igualmente, já que é a mesma função compartilhada).
**RESULTADO IMEDIATO — remover**: `setProfileAvatar('')` — só limpa o estado local, efetivado só ao salvar.
**RESULTADO VISUAL**: Botão "Remover" só aparece condicionalmente (`{profileAvatar && (...)}`) — some se já não há avatar.
**Demais campos**: mesmo padrão de lote/salvar de `PROFILE_BANNER_UPLOAD`.

---

## 12.3 — PROFILE_DISPLAY_NAME_READONLY *(MISSING — confirma achado já registrado)*

**ID**: `PROFILE_DISPLAY_NAME_READONLY`
**NOME**: Campo de nome de exibição, sem edição
**CAMINHO EXATO**: `Configurações > Meu perfil > "Nome de exibição"`
**CONFIRMAÇÃO NO CÓDIGO**: `<input id="profile-display-name" readOnly value={session.displayName} />` — **deliberadamente somente leitura**, mostrando o nome atual mas sem permitir editar. Consistente com `DISCORD_PARITY_PLAN.md` §2: "Alterar email/username | MISSING (username é fixo no registro)" — **não é um bug isolado desta tela**, é a mesma limitação de fundação já conhecida, só reaparecendo aqui como um campo visível mas inerte.
**Diferença frente a `ROLE_LIST_SEARCH_FAKE` (Roteiro 9)**: este campo **não finge ser editável** — não tem nenhum affordance visual de campo ativo além de mostrar o valor (sem `placeholder` de convite a digitar, `readOnly` explícito) — é uma decisão de design honesta sobre uma limitação real, não um controle decorativo enganoso. Vale a distinção: um campo `readOnly` mostrando dado real não é a mesma categoria de problema que um campo de busca `readOnly` fingindo filtrar uma lista.

---

## 12.4 — PROFILE_STATUS_TEXT / PROFILE_PRONOUNS / PROFILE_BIO

**ID**: `PROFILE_TEXT_FIELDS` (três campos de texto simples, mesmo padrão)
**NOME**: Editar status, pronomes e biografia do perfil
**CAMINHO EXATO**: `Configurações > Meu perfil`
**APARÊNCIA**: Três campos com contador de caracteres visível no rótulo (`{valor.length}/60`, `/30`, `/300`).
**RESULTADO IMEDIATO**: `onChange` atualiza estado local; nada é enviado até salvar.
**RESULTADO VISUAL**: Refletido na pré-visualização ao lado em tempo real (mesmo padrão de `APPEARANCE_LIVE_PREVIEW`, Roteiro 10).
**EFEITO REMOTO**: Só ao salvar — `PATCH` de perfil, visível a qualquer pessoa que veja o mini-perfil deste usuário (Roteiro 3/7, já usado em vários lugares desta auditoria).
**Demais campos**: mesmo padrão de lote/salvar.

---

## 12.5 — PROFILE_ACCENT_COLOR

**ID**: `PROFILE_ACCENT_COLOR`
**NOME**: Escolher a cor de perfil pública
**CAMINHO EXATO**: `Configurações > Meu perfil > "Cor do perfil"`
**STATUS**: Mesmo componente/paleta fixa (`ACCENT_COLORS`, `radiogroup`/`radio`) já usado no cadastro (`REGISTER_ACCENT_COLOR_SELECT`, Roteiro 1) — **esta é a tela onde a cor escolhida no cadastro pode ser trocada depois**, primeira confirmação nesta auditoria de que a cor de perfil não é fixa para sempre após criar a conta.
**Demais campos**: mesmo padrão de lote/salvar; refletido na pré-visualização.

---

## 12.6 — PROFILE_SAVE_CANCEL

**ID**: `PROFILE_SAVE_CANCEL`
**NOME**: Salvar ou descartar as alterações de perfil em lote
**CAMINHO EXATO**: `Configurações > Meu perfil > rodapé do formulário`
**APARÊNCIA**: "Cancelar" (`.test-toggle-button` — nome de classe genérico, provavelmente reaproveitado de um teste antigo, não indicativo de função) + "Salvar alterações" (`.save-profile-button`, destaque).
**DISABLED**: Ambos desabilitados durante `savingProfile`.
**LOADING**: Botão salvar mostra "Salvando…".
**TRIGGER — cancelar**: `onCancelProfile` — reverte todos os campos (banner/avatar/status/pronomes/bio/cor) ao estado salvo mais recente, descartando qualquer edição não salva.
**TRIGGER — salvar**: `onSaveProfile` — `PATCH` único com todos os campos de uma vez.
**RESULTADO FINAL**: **Todos os campos desta tela são transacionais em conjunto** — diferente de Cargos/Aparência (cada controle salva individualmente ao interagir), Meu Perfil exige clicar "Salvar alterações" para qualquer mudança ter efeito. Isso é consistente e deliberado dentro desta tela específica (todos os campos fazem parte do mesmo formulário), só vale notar a diferença de padrão de UX frente a outras telas desta auditoria pra quem for trabalhar no código depois.
**CANCELAMENTO**: Botão "Cancelar" dedicado (diferente de várias outras telas que só têm Esc/fechar).
**EFEITO REMOTO**: `PATCH` de perfil dispara atualização visível a qualquer pessoa vendo perfil/mensagens/mini-perfil deste usuário — mecanismo exato de propagação em tempo real (evento de WebSocket dedicado, ou só refletido na próxima leitura de outros clientes) não confirmado campo a campo nesta passagem específica.

---

## 12.7 — PASSWORD_CHANGE

**ID**: `PASSWORD_CHANGE`
**NOME**: Trocar a senha da conta
**CAMINHO EXATO**: `Configurações > Conta e segurança`
**STATUS**: `CORE` — já implementado e testado nesta mesma linha de trabalho (sessão anterior), substituindo o antigo "Alterar senha | MISSING" registrado em `DISCORD_PARITY_PLAN.md` §2.
**APARÊNCIA**: Três campos (senha atual, nova senha, confirmar nova senha), botão "Trocar senha".
**TRIGGER**: Submit do formulário (Enter em qualquer campo, ou clique no botão).
**PRÉ-CONDIÇÕES**: Senha atual correta; nova senha entre `PASSWORD_MIN_LENGTH` (8) e `PASSWORD_MAX_LENGTH` (72) caracteres — **validação de tamanho no HTML nativo** (`minLength`/`maxLength`), mesmos limites do cadastro (Roteiro 1).
**RESULTADO IMEDIATO**: `submitPasswordChange` → `PATCH /api/auth/password` (Roteiro 1, rota já documentada), sujeito ao mesmo `authLimiter` de login/registro.
**RESULTADO VISUAL — sucesso**: `passwordSuccess` → "Senha atualizada." em `.settings-hint` (neutro, não destaque de sucesso forte).
**RESULTADO VISUAL — erro**: `passwordError` em `.form-error` (`role="alert"`) — **aqui sim usa a classe de erro correta**, diferente do `bannerError` de `PROFILE_BANNER_UPLOAD` que usa a classe neutra por engano.
**ACHADO — SEM VALIDAÇÃO DE CONFIRMAÇÃO NO CLIENTE**: não confirmado nesta passagem se há uma checagem client-side de "nova senha === confirmar nova senha" antes de submeter — se não houver, a discrepância só seria pega no backend (ou nem seria checada lá, dependendo da implementação da rota) — **achado a confirmar em auditoria futura mais profunda do handler `submitPasswordChange`** (não lido em detalhe nesta passagem, só a UI que o aciona).
**RESULTADO FINAL**: Sessão atual continua válida (não desloga automaticamente após trocar a senha — a confirmar se outras sessões/dispositivos são invalidadas, mesma lacuna já registrada em `DISCORD_PARITY_PLAN.md` §2 sobre não existir sessão stateful/lista de dispositivos).
**BACKEND**: `PATCH /api/auth/password`, `requireSession` + `authLimiter`.
**BANCO**: `UPDATE users` com novo hash de senha (`updateUserPassword`, Roteiro 1).
**ATALHO**: Enter em qualquer campo submete o formulário.
**ACESSIBILIDADE**: Labels associados corretamente em todos os três campos.

---

## 12.8 — PRIVACY_BLOCKED_USERS_LIST (referência — já documentado via DM_UNBLOCK)

**ID**: `PRIVACY_BLOCKED_USERS_LIST`
**NOME**: Ver e desbloquear usuários pela tela de Privacidade
**CAMINHO EXATO**: `Configurações > Privacidade`
**STATUS**: `CORE` — lista de bloqueados com avatar/nome + botão "Desbloquear" por linha; estados de carregamento ("Carregando…") e vazio ("Você não bloqueou ninguém.") tratados explicitamente.
**Redundância com `DM_UNBLOCK` (Roteiro 11)**: esta é a **segunda tela** que já oferece exatamente a mesma ação (desbloquear), a primeira sendo a aba "Bloqueados" de Amigos — ambas chamam presumivelmente a mesma `api.unblockUser`. Consistente com o Discord real, que também duplica esse acesso entre Configurações de Privacidade e a lista de Amigos — não é uma redundância acidental, é o padrão esperado.
**Descrição da tela**: "Pessoas que você bloqueou não podem chamar você nem ver sua atividade." — **texto descreve consequências (chamada, atividade) que não têm equivalente real neste app ainda** (sem chamada ad-hoc fora de canal de voz, Roteiro 11; "atividade" existe só como jogo/mídia detectada no desktop, Roteiro 0) — o texto foi provavelmente herdado do texto real do Discord sem adaptação total às features que este app realmente tem, um detalhe cosmético de copy, não funcional.

---

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos (ou o equivalente apropriado pra fichas agrupadas/de referência/`MISSING`), as **24 interações do Roteiro 0**, **18 do Roteiro 1**, **11 do Roteiro 2**, **19 do Roteiro 3**, **23 do Roteiro 4**, **8 do Roteiro 5**, **9 do Roteiro 6**, **12 do Roteiro 7**, **8 do Roteiro 8**, **15 do Roteiro 9**, **7 do Roteiro 10**, **13 do Roteiro 11** e **8 do Roteiro 12** — **175 fichas no total**. Com isso, **todas as seções do modal de Configurações do app** (Meu perfil, Conta e segurança, Privacidade, Voz e vídeo, Aparência) estão mapeadas — nenhuma seção "fantasma"/decorativa restante, confirmando o trabalho de sessão anterior desta linha de trabalho que já tinha eliminado as abas mortas (Notificações/Atalhos/Idioma/Arquivos e mídia/Avançado).

**Achados desta seção**: (1) confirmação de que "Nome de exibição" é intencionalmente somente-leitura, não um bug — mesma limitação de fundação já conhecida (username fixo); (2) inconsistência pequena de estilo de erro (banner de perfil usa classe neutra, senha usa classe de erro real); (3) Meu Perfil é a única tela desta auditoria com padrão "editar tudo, salvar em lote" — todas as outras telas de configuração salvam campo a campo; (4) texto de Privacidade descreve consequências (chamada, atividade) que não se aplicam totalmente às features reais do app — copy herdada, não adaptada.

**Próximo na fila**: com a superfície de app/servidor/voz/mensagens/amigos/configurações mapeada em profundidade (175 fichas, 13 roteiros), a auditoria agora tem material suficiente pra começar os três documentos de síntese ainda não criados: `DISCORD_NAVIGATION_TREE.md` (árvore de navegação completa), `DISCORD_INTERACTION_MATRIX.md` (tabela mestra de todas as interações), e `DISCORD_USER_JOURNEYS.md` (roteiros de usuário ponta a ponta) — nessa ordem, já que a árvore de navegação é a base estrutural mais simples de montar primeiro a partir do que já foi mapeado.

**Atualização — Roteiro 13 (lista de membros, mini-perfil, painel do usuário)**: acrescentou **17 fichas**, levando o total a **192 fichas em 14 roteiros** (numeração do Atlas). Os quatro documentos de síntese (`DISCORD_INTERACTION_MATRIX.md`, `DISCORD_NAVIGATION_TREE.md`, `DISCORD_USER_JOURNEYS.md`, `DISCORD_PARITY_PLAN.md`) foram atualizados para incluí-lo. Diferente dos roteiros anteriores, este teve **medição num Chromium real** além da leitura do código, e a medição corrigiu uma hipótese (o ponto de presença, ficha `PRESENCE_DOT_CLIPPED`).

**Atualização — Roteiro 14 (notificações, não lidas, badges, avisos do desktop)**: acrescentou **14 fichas**, levando o total a **206 fichas em 15 roteiros**. Achado central: quase tudo é `MISSING` por três causas (sem rastreio de leitura, sem menções, sem ponte de aviso no Electron), e há uma preferência salva e sincronizada (modo de notificação por categoria) que nada lê.

**Atualização — Roteiro 15 (teclado, Esc, histórico, copiar, links)**: acrescentou **13 fichas**, levando o total a **219 fichas em 16 roteiros**. Achado central: **copiar não funciona no app desktop** (o Electron nega a permissão de escrita na área de transferência) e **links de mensagem não abrem no desktop**, ambos medidos num Electron real. Este roteiro também corrige duas afirmações anteriores: `MESSAGE_COPY_TEXT` (4.8) partia do princípio de que a cópia funcionava, e `APP_RELOAD` (0.16) deixava "a confirmar" se o canal era restaurado depois do F5 (não é).
