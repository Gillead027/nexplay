import { contextBridge, ipcRenderer } from 'electron';
import type { Activity } from '@nexplay/shared';

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
