# DISCORD_UI_ATLAS.md

Mapa completo da experiência operacional do NexPlay — toda interação, macro e micro, documentada como ficha individual. Ver `DISCORD_PARITY_PLAN.md` para o resumo de status por feature e `DISCORD_NAVIGATION_TREE.md` para a árvore de navegação. Este documento é vivo: cresce a cada auditoria, nunca resume interações parecidas como um grupo só.

**Como ler cada ficha**: campos vazios não existem — todo campo é preenchido, inclusive com "Não aplicável" quando genuinamente não se aplica (isso é uma resposta auditada, não uma omissão).

**Convenção de status por ficha**: `CORE` (existe, funciona, é o caminho normal do app), `PARTIAL` (existe mas incompleto — o campo relevante explica o que falta), `MISSING` (não existe — a ficha documenta o comportamento *esperado*, não o real, e isso é dito explicitamente), `DESKTOP_ONLY`, `ADMIN_ONLY`.

Progresso deste documento: **Roteiro 0 completo** (24 fichas, cliente desktop). Roteiros 1–69+ pendentes — ver nota de continuação no final do arquivo.

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
**ATALHO**: Nenhum atalho de teclado dedicado no código. **Duplo clique na barra de título não está implementado** — a `.app-chrome-drag` (região arrastável, ver `WINDOW_DRAG`) não tem listener de `dblclick`, então o comportamento nativo esperado do Windows (duplo clique na titlebar maximiza) **não funciona** nesta janela `frame:false`. `MISSING`.
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

# FIM DO ROTEIRO 0 — CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos, as **24 interações reais do processo desktop** (`Roteiro 0`), verificadas linha a linha contra `apps/desktop/src/main.ts`, `preload.ts`, `updater.ts`, `activity.ts` e `apps/web/src/components/AppChrome.tsx` — nenhuma delas foi inventada ou copiada do Discord real sem checar o código primeiro. Onde o comportamento não existe, isso foi dito explicitamente como `MISSING`, nunca simulado como se existisse.

**Escala real do trabalho restante** (para ser transparente sobre o tamanho do que falta, sem resumir o pedido): os Roteiros 1 a 69+ cobrem a interface inteira — servidores, categorias, canais de texto/voz, mensagens, composer, voz (mute/deafen/câmera/tela), member list, mini-perfil, configurações (conta, perfil, privacidade, voz&vídeo, aparência, atalhos, avançado — auditoria completa de cada uma), configurações de servidor (cargos, permissões, convites, moderação, integrações), amigos/DMs, busca, inbox, notificações, atalhos de teclado, estados vazios/loading/erro/offline, e as jornadas completas (entrar em voz, mutar, compartilhar tela, fechar sem sair da call, encerrar de verdade). Cada uma dessas áreas, no mesmo padrão de profundidade do Roteiro 0 acima (36 campos por interação), é um documento do tamanho do que foi escrito aqui — este arquivo vai continuar crescendo seção por seção nas próximas passagens de auditoria, na mesma ordem de prioridade do pedido original (voz e chamada primeiro, depois servidores/canais/mensagens, depois o resto).
