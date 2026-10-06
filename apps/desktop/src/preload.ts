import { contextBridge, ipcRenderer } from 'electron';
import type { Activity, NexplayNative, SharePickerChoice as SharePickerChoiceShared, MediaAccessStatus as MediaAccessStatusShared, DesktopAppInfo } from '@nexplay/shared';
import { IpcChannels as CH } from '@nexplay/shared';

// Repassa exceções e rejeições não tratadas pro console.error, que o main
// process já captura via webContents 'console-message' — sem isso, um erro
// que quebra silenciosamente um clique (ex.: tela cheia) não deixa rastro
// nenhum, já que o DevTools fica desligado no build empacotado.
window.addEventListener('error', (event) => {
  console.error('[uncaught]', event.message, event.error?.stack || '');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  console.error('[unhandledrejection]', reason instanceof Error ? reason.stack || reason.message : String(reason));
});

export interface SharePickerChoice {
  quality: '720p30' | '720p60' | '1080p60';
  shareAudio: boolean;
}

export type MediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';

contextBridge.exposeInMainWorld('desktop', {
  windowAction: (action: 'minimize' | 'toggle-maximize' | 'close'): void => ipcRenderer.send('window:action', action),
  // Bandeja do sistema e início com o Windows (Configurações > Aplicativo).
  getDesktopSettings: (): Promise<unknown> => ipcRenderer.invoke('desktop:get-settings'),
  setDesktopSettings: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('desktop:set-settings', patch),
  chooseShareSource: (): Promise<SharePickerChoice | null> => ipcRenderer.invoke('share-picker:open'),
  setZoomFactor: (factor: number): void => ipcRenderer.send('set-zoom-factor', Number(factor)),
  setFullscreen: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('window:set-fullscreen', Boolean(enabled)),
  getFullscreen: (): Promise<boolean> => ipcRenderer.invoke('window:get-fullscreen'),
  onFullscreenChanged: (listener: (enabled: boolean) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, enabled: unknown) => listener(Boolean(enabled));
    ipcRenderer.on('window:fullscreen-changed', wrapped);
    return () => ipcRenderer.removeListener('window:fullscreen-changed', wrapped);
  },
  getMediaAccessStatus: (mediaType: 'camera' | 'microphone'): Promise<MediaAccessStatus> =>
    ipcRenderer.invoke('media:get-access-status', mediaType),
  openMediaSettings: (mediaType: 'camera' | 'microphone'): Promise<boolean> =>
    ipcRenderer.invoke('media:open-settings', mediaType),
  checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke('app:check-updates'),
  // Link nexplay://convite/<CÓDIGO> que o sistema entregou ao app (só links validados pelo processo principal).
  onDeepLink: (listener: (url: string) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, url: unknown) => listener(String(url));
    ipcRenderer.on('deep-link', wrapped);
    return () => ipcRenderer.removeListener('deep-link', wrapped);
  },
  openLogs: (): Promise<boolean> => ipcRenderer.invoke('app:open-logs'),
  onActivityChanged: (listener: (activity: Activity | null) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, activity: unknown) => listener(activity as Activity | null);
    ipcRenderer.on('activity:changed', wrapped);
    return () => ipcRenderer.removeListener('activity:changed', wrapped);
  },
  getCurrentActivity: (): Promise<Activity | null> => ipcRenderer.invoke('activity:get-current'),
  // Atalhos globais de mutar/ensurdecer (Configurações > Aplicativo) — disparam mesmo com o
  // NexPlay em segundo plano, registrados no processo principal via globalShortcut.
  onGlobalMuteHotkey: (listener: () => void): (() => void) => {
    const wrapped = () => listener();
    ipcRenderer.on('global-hotkey:mute-toggle', wrapped);
    return () => ipcRenderer.removeListener('global-hotkey:mute-toggle', wrapped);
  },
  onGlobalDeafenHotkey: (listener: () => void): (() => void) => {
    const wrapped = () => listener();
    ipcRenderer.on('global-hotkey:deafen-toggle', wrapped);
    return () => ipcRenderer.removeListener('global-hotkey:deafen-toggle', wrapped);
  },
});

// -----------------------------------------------------------------------------
// Ponte CANÔNICA `window.NexplayNative` — shape inspirado no `window.DiscordNative`
// do Discord (uma só exposeInMainWorld, organizada por domínio). Fonte dos canais:
// `IpcChannels` do @nexplay/shared. O `window.desktop` acima segue como camada de
// compatibilidade até o `apps/web` migrar para esta ponte (ver DISCORD_REWRITE_BLUEPRINT.md).
// -----------------------------------------------------------------------------
function onEvent(channel: string, listener: (...args: unknown[]) => void): () => void {
  const wrapped = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

const nexplayNative: NexplayNative = {
  app: {
    getInfo: (): Promise<DesktopAppInfo> => ipcRenderer.invoke(CH.app.getInfo),
    getPath: (name: string): Promise<string> => ipcRenderer.invoke(CH.app.getPath, name),
    relaunch: (): void => ipcRenderer.send(CH.app.relaunch),
    checkForUpdates: (): Promise<unknown> => ipcRenderer.invoke(CH.app.checkUpdates),
    openLogs: (): Promise<boolean> => ipcRenderer.invoke(CH.app.openLogs),
  },
  window: {
    minimize: (): void => ipcRenderer.send(CH.window.action, 'minimize'),
    toggleMaximize: (): void => ipcRenderer.send(CH.window.action, 'toggle-maximize'),
    close: (): void => ipcRenderer.send(CH.window.action, 'close'),
    setZoomFactor: (factor: number): void => ipcRenderer.send(CH.window.setZoom, Number(factor)),
    setFullscreen: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke(CH.window.setFullscreen, Boolean(enabled)),
    getFullscreen: (): Promise<boolean> => ipcRenderer.invoke(CH.window.getFullscreen),
    onFullscreenChanged: (listener: (enabled: boolean) => void): (() => void) =>
      onEvent(CH.window.fullscreenChanged, (enabled) => listener(Boolean(enabled))),
  },
  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke(CH.settings.get),
    set: (patch: unknown): Promise<unknown> => ipcRenderer.invoke(CH.settings.set, patch),
  },
  screenShare: {
    pick: (): Promise<SharePickerChoiceShared | null> => ipcRenderer.invoke(CH.screenShare.open),
  },
  media: {
    getAccessStatus: (kind): Promise<MediaAccessStatusShared> => ipcRenderer.invoke(CH.media.getAccessStatus, kind),
    openSettings: (kind): Promise<boolean> => ipcRenderer.invoke(CH.media.openSettings, kind),
  },
  activity: {
    getCurrent: (): Promise<Activity | null> => ipcRenderer.invoke(CH.activity.getCurrent),
    onChanged: (listener): (() => void) => onEvent(CH.activity.changed, (activity) => listener(activity as Activity | null)),
  },
  deepLink: {
    onLink: (listener): (() => void) => onEvent(CH.deepLink.link, (url) => listener(String(url))),
  },
  hotkeys: {
    onMuteToggle: (listener): (() => void) => onEvent(CH.hotkeys.muteToggle, () => listener()),
    onDeafenToggle: (listener): (() => void) => onEvent(CH.hotkeys.deafenToggle, () => listener()),
  },
  clipboard: {
    copy: (text: string): Promise<boolean> => ipcRenderer.invoke(CH.clipboard.copy, String(text)),
    read: (): Promise<string> => ipcRenderer.invoke(CH.clipboard.read),
  },
  safeStorage: {
    isAvailable: (): Promise<boolean> => ipcRenderer.invoke(CH.safeStorage.isAvailable),
    encrypt: (plain: string): Promise<string> => ipcRenderer.invoke(CH.safeStorage.encrypt, String(plain)),
    decrypt: (base64: string): Promise<string> => ipcRenderer.invoke(CH.safeStorage.decrypt, String(base64)),
  },
};

contextBridge.exposeInMainWorld('NexplayNative', nexplayNative);
