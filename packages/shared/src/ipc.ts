// Canais IPC da casca desktop, agrupados por domínio — shape inspirado no
// `IPCEvents` do Discord (ver DISCORD_REWRITE_BLUEPRINT.md, Fase 1). Fonte única
// para o preload (`apps/desktop/src/preload.ts`) e o processo principal
// (`apps/desktop/src/main.ts`). Os valores reusam os canais já existentes onde
// havia um; os marcados "novo" entram nesta fase.
//
// Este arquivo é TS puro (sem dependência de electron) — vale para os dois lados.

export const IpcChannels = {
  app: {
    getInfo: 'app:get-info', // novo
    getPath: 'app:get-path', // novo
    relaunch: 'app:relaunch', // novo
    checkUpdates: 'app:check-updates',
    openLogs: 'app:open-logs',
  },
  window: {
    action: 'window:action',
    setZoom: 'set-zoom-factor',
    setFullscreen: 'window:set-fullscreen',
    getFullscreen: 'window:get-fullscreen',
    fullscreenChanged: 'window:fullscreen-changed', // evt main->renderer
  },
  settings: {
    get: 'desktop:get-settings',
    set: 'desktop:set-settings',
  },
  screenShare: {
    open: 'share-picker:open',
    list: 'capture-picker:list',
    choose: 'capture-picker:choose',
    cancel: 'capture-picker:cancel',
  },
  media: {
    getAccessStatus: 'media:get-access-status',
    openSettings: 'media:open-settings',
  },
  activity: {
    getCurrent: 'activity:get-current',
    changed: 'activity:changed', // evt
  },
  deepLink: {
    link: 'deep-link', // evt
  },
  hotkeys: {
    muteToggle: 'global-hotkey:mute-toggle', // evt
    deafenToggle: 'global-hotkey:deafen-toggle', // evt
  },
  clipboard: {
    copy: 'clipboard:copy', // novo
    read: 'clipboard:read', // novo
  },
  safeStorage: {
    isAvailable: 'safe-storage:is-available', // novo
    encrypt: 'safe-storage:encrypt', // novo
    decrypt: 'safe-storage:decrypt', // novo
  },
} as const;

// --- tipos compartilhados da casca ---
export interface SharePickerChoice {
  quality: '720p30' | '720p60' | '1080p60';
  shareAudio: boolean;
}
export type MediaAccessStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
export type MediaKind = 'camera' | 'microphone';
export type WindowAction = 'minimize' | 'toggle-maximize' | 'close';

export interface DesktopAppInfo {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
}

// --- forma da ponte única `window.NexplayNative` (espelha `window.DiscordNative`) ---
// Organizada por domínio. É a API canônica da casca a partir da Fase 1; o
// `window.desktop` antigo segue como camada de compatibilidade até o `web`
// migrar. Usa tipos genéricos para não acoplar o shared às libs do Electron.
export interface NexplayNative {
  app: {
    getInfo(): Promise<DesktopAppInfo>;
    getPath(name: string): Promise<string>;
    relaunch(): void;
    checkForUpdates(): Promise<unknown>;
    openLogs(): Promise<boolean>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
    setZoomFactor(factor: number): void;
    setFullscreen(enabled: boolean): Promise<boolean>;
    getFullscreen(): Promise<boolean>;
    onFullscreenChanged(listener: (enabled: boolean) => void): () => void;
  };
  settings: {
    get(): Promise<unknown>;
    set(patch: unknown): Promise<unknown>;
  };
  screenShare: {
    pick(): Promise<SharePickerChoice | null>;
  };
  media: {
    getAccessStatus(kind: MediaKind): Promise<MediaAccessStatus>;
    openSettings(kind: MediaKind): Promise<boolean>;
  };
  activity: {
    getCurrent(): Promise<unknown | null>;
    onChanged(listener: (activity: unknown | null) => void): () => void;
  };
  deepLink: {
    onLink(listener: (url: string) => void): () => void;
  };
  hotkeys: {
    onMuteToggle(listener: () => void): () => void;
    onDeafenToggle(listener: () => void): () => void;
  };
  clipboard: {
    copy(text: string): Promise<boolean>;
    read(): Promise<string>;
  };
  safeStorage: {
    isAvailable(): Promise<boolean>;
    encrypt(plain: string): Promise<string>; // base64
    decrypt(base64: string): Promise<string>;
  };
}
