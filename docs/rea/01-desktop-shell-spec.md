# REA 01 — Spec alvo da casca desktop (Fase 1)

Mapa um-para-um da casca do NexPlay (`apps/desktop`) reescrita no shape do Discord. Fonte: leitura REA do `core.asar`/`mainScreenPreload.js` do Discord Desktop 1.0.9260. Este é o **alvo de implementação** da Fase 1 do `DISCORD_REWRITE_BLUEPRINT.md`.

## Princípios

1. **Ponte única** `window.NexplayNative` (uma só `exposeInMainWorld`), organizada por domínio, espelhando o `window.DiscordNative`. Nada de `ipcRenderer` cru no renderer.
2. **Enum tipado de canais** por domínio no `packages/shared` (como o `IPCEvents` do Discord), fonte única para main e preload.
3. **Divergências deliberadas de segurança (manter, não regredir)**: `sandbox: true` e `devTools: false` — o Discord usa `sandbox:false`. Documentado como melhoria consciente.
4. **Só o que faz sentido aqui**: removidas as áreas do Discord específicas de macOS, Riot/Dota/CS (`riotGames`, `Gsi`, `dotaGsi`), clips e WebAuthn por ora. Adicionadas as reais do NexPlay (picker de tela, activity, deep link, hotkeys globais).

## `window.NexplayNative` — áreas (espelhando `DiscordNative`)

| Área Discord | Vira no NexPlay | Métodos (alvo) | Hoje em `window.desktop.*` |
|---|---|---|---|
| `app` | `app` | `getInfo()`, `getVersion()`, `getPath(name)`, `relaunch()`, `checkForUpdates()`, `openLogs()` | `checkForUpdates`, `openLogs` |
| `window` | `window` | `minimize()`, `toggleMaximize()`, `close()`, `setFullscreen(b)`, `getFullscreen()`, `onFullscreenChanged(cb)`, `setZoomFactor(f)` | `windowAction`, `set*Fullscreen`, `setZoomFactor` |
| `settings` | `settings` | `get()`, `set(patch)` | `get/setDesktopSettings` |
| `desktopCapture` | `screenShare` | `choosePickerSource()` → `{sourceId, audio, quality}` | `chooseShareSource` + canais `capture-picker:*` |
| (permissões de mídia) | `media` | `getAccessStatus(type)`, `openSettings(type)` | `media:get-access-status`, `media:open-settings` |
| `ipc`/rich presence | `activity` | `getCurrent()`, `onChanged(cb)` | `activity:get-current`, `activity:changed` |
| (protocolo) | `deepLink` | `onLink(cb)` | `deep-link` |
| (atalhos) | `hotkeys` | `onMuteToggle(cb)`, `onDeafenToggle(cb)` | `global-hotkey:*` |
| `clipboard` | `clipboard` | `copy(text)`, `read()` | **novo** (hoje via web; o Discord expõe nativo) |
| `safeStorage` | `safeStorage` | `isAvailable()`, `encrypt(s)`, `decrypt(b64)` | **novo** (tokens/segredos) |
| `crashReporter` | `crashReporter` | `getMetadata()` | **novo** (opcional) |

Áreas do Discord **não portadas** (e por quê): `nativeModules`/`processUtils`/`gpuSettings`/`powerSaveBlocker`/`ntpClock`/`spellCheck`/`tracing`/`hardware`/`sysimg` — úteis só quando as features correspondentes existirem; entram sob demanda nas fases seguintes. `riotGames`/`Gsi`/`dotaGsi`/`clips`/`webAuthn` — fora de escopo para um app self-hosted de amigos.

## Enum de canais IPC (alvo, em `packages/shared`)

Prefixo `NXP_` (equivalente ao `DISCORD_` do Discord), agrupado por domínio. Enum tipado = fonte única; o preload monta a ponte a partir dele, o main registra handlers a partir dele.

```
APP_GET_INFO, APP_GET_PATH, APP_RELAUNCH, APP_CHECK_UPDATES, APP_OPEN_LOGS
WINDOW_MINIMIZE, WINDOW_TOGGLE_MAXIMIZE, WINDOW_CLOSE, WINDOW_SET_FULLSCREEN,
  WINDOW_GET_FULLSCREEN, WINDOW_FULLSCREEN_CHANGED(evt), WINDOW_SET_ZOOM
SETTINGS_GET, SETTINGS_SET
SCREENSHARE_PICK, SCREENSHARE_LIST, SCREENSHARE_CHOOSE, SCREENSHARE_CANCEL
MEDIA_GET_ACCESS_STATUS, MEDIA_OPEN_SETTINGS
ACTIVITY_GET_CURRENT, ACTIVITY_CHANGED(evt)
DEEPLINK(evt)
HOTKEY_MUTE_TOGGLE(evt), HOTKEY_DEAFEN_TOGGLE(evt)
CLIPBOARD_COPY, CLIPBOARD_READ
SAFESTORAGE_IS_AVAILABLE, SAFESTORAGE_ENCRYPT, SAFESTORAGE_DECRYPT
```

Direção: `invoke` (request/response) por padrão; `send` só para ações fire-and-forget (window actions, zoom); `(evt)` = push main→renderer.

## Config da janela (alvo)

```
frame: false                 // já é
contextIsolation: true       // já é
nodeIntegration: false       // já é
sandbox: true                // DIVERGÊNCIA deliberada (Discord: false) — manter
devTools: false              // DIVERGÊNCIA deliberada (Discord: condicional) — manter em prod
preload: NexplayNative bridge
```
Guardas (do Discord, já parcialmente presentes): `will-navigate` travado na origem do app; `setWindowOpenHandler` negando por padrão (links externos via allowlist — o NexPlay já corrigiu isso no `MESSAGE_LINK_OPEN`); permissões de mídia só para a própria origem (`installSessionSecurity`).

## Delta de implementação (checklist da Fase 1)

- [ ] Criar o enum `IpcChannel` tipado em `packages/shared` (nomes acima).
- [ ] Reescrever `preload.ts` para montar `window.NexplayNative` por domínio a partir do enum (uma só `exposeInMainWorld`).
- [ ] Reorganizar os handlers de `main.ts` por domínio, lendo do mesmo enum.
- [ ] Adaptador no `apps/web` para consumir `window.NexplayNative.*` (camada fina sobre o `window.desktop.*` atual, para migração sem big-bang).
- [ ] Adicionar `clipboard`/`safeStorage` nativos (o Discord expõe; resolve de vez o `CLIPBOARD_COPY_DESKTOP`).
- [ ] Manter verdes `policy.test.ts` e `settings.test.ts`; adicionar teste da ponte.
- [ ] Verificar: app abre, janela/picker/activity/updater/hotkeys funcionam; smoke no desktop empacotado.

## Risco e reversão

Casca isolada — não toca backend nem dados. A migração do renderer é via adaptador fino (o `window.desktop.*` atual continua funcionando atrás da nova ponte durante a transição), então dá para reverter trocando o adaptador. Exige nova versão do desktop (auto-update), como qualquer mudança de processo principal.
