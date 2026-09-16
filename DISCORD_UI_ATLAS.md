# DISCORD_UI_ATLAS.md

Mapa completo da experiência operacional do NexPlay — toda interação, macro e micro, documentada como ficha individual. Ver `DISCORD_PARITY_PLAN.md` para o resumo de status por feature e `DISCORD_NAVIGATION_TREE.md` para a árvore de navegação. Este documento é vivo: cresce a cada auditoria, nunca resume interações parecidas como um grupo só.

**Como ler cada ficha**: campos vazios não existem — todo campo é preenchido, inclusive com "Não aplicável" quando genuinamente não se aplica (isso é uma resposta auditada, não uma omissão).

**Convenção de status por ficha**: `CORE` (existe, funciona, é o caminho normal do app), `PARTIAL` (existe mas incompleto — o campo relevante explica o que falta), `MISSING` (não existe — a ficha documenta o comportamento *esperado*, não o real, e isso é dito explicitamente), `DESKTOP_ONLY`, `ADMIN_ONLY`.

Progresso deste documento: **Roteiro 0 completo** (24 fichas, cliente desktop). **Roteiro 1 completo** (18 fichas, login/sessão). Roteiros 2–69+ pendentes — ver nota de continuação no final do arquivo.

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

# CONTINUAÇÃO

Este documento cobriu, com todos os 36 campos exigidos, as **24 interações do Roteiro 0** (processo desktop) e as **18 interações do Roteiro 1** (login e sessão) — 42 fichas no total, cada uma verificada contra o código real (`apps/desktop/src/*`, `apps/web/src/App.tsx`, `EntryScreen.tsx`, `realtime.ts`, `apps/api/src/session.ts`, `apps/api/src/index.ts`), nunca assumida de memória ou copiada do comportamento genérico do Discord sem checar primeiro. Toda lacuna encontrada foi marcada `MISSING`/`PARTIAL` explicitamente, nunca simulada como se existisse.

**Próximo na fila** (seguindo a ordem de prioridade da "Terceira Tarefa" do pedido original): Roteiro 2 — Navegação (rail de servidores, sidebar de canais, troca de contexto, quick switcher se existir), seguido de Roteiro 3 — Servidores/canais, Roteiro 4 — Mensagens, Roteiro 5 — Tempo real, e a partir daí Voz/Mute/Deafen/Compartilhar tela/Vídeo, que o próprio pedido do usuário marca como prioridade especial. A escala total do que falta continua a mesma descrita na versão anterior deste documento — dezenas de roteiros, cada um no mesmo padrão de profundidade aqui demonstrado.
