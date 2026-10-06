// Ponto único de acesso à casca nativa a partir do web.
//
// A partir da reescrita (Fase 1), a API canônica é `window.NexplayNative`
// (shape do Discord, organizada por domínio — ver DISCORD_REWRITE_BLUEPRINT.md).
// Clientes desktop ANTIGOS só têm `window.desktop` (a ponte legada); para não
// quebrá-los enquanto o auto-update não chega, este módulo entrega sempre a
// forma nova, por cima de um adaptador sobre a legada quando preciso.
//
// Todo o web deve usar `native()` daqui, nunca `window.desktop`/`window.NexplayNative`
// direto. Quando todos os clientes instalados já tiverem a ponte nova, o
// adaptador legado some e o `window.desktop` pode ser removido.
import type { NexplayNative } from '@nexplay/shared';

declare global {
  interface Window {
    NexplayNative?: NexplayNative;
  }
}

type LegacyDesktop = NonNullable<Window['desktop']>;

const noopUnsub = (): void => {};

// Adapta a ponte legada `window.desktop` para a forma canônica `NexplayNative`.
// Métodos que a casca antiga não tinha (clipboard, safeStorage, app.getInfo/
// getPath/relaunch) degradam para padrões seguros.
function fromLegacy(d: LegacyDesktop): NexplayNative {
  return {
    app: {
      getInfo: async () => ({ appVersion: '', electron: '', chrome: '', node: '', platform: '', arch: '' }),
      getPath: async () => '',
      relaunch: () => {},
      checkForUpdates: () => d.checkForUpdates?.() ?? Promise.resolve(undefined),
      openLogs: () => d.openLogs?.() ?? Promise.resolve(false),
    },
    window: {
      minimize: () => d.windowAction?.('minimize'),
      toggleMaximize: () => d.windowAction?.('toggle-maximize'),
      close: () => d.windowAction?.('close'),
      setZoomFactor: (factor) => d.setZoomFactor?.(factor),
      setFullscreen: (enabled) => d.setFullscreen?.(enabled) ?? Promise.resolve(false),
      getFullscreen: () => d.getFullscreen?.() ?? Promise.resolve(false),
      onFullscreenChanged: (listener) => d.onFullscreenChanged?.(listener) ?? noopUnsub,
      isMaximized: async () => false,
      onMaximizedChanged: () => noopUnsub,
    },
    settings: {
      get: () => d.getDesktopSettings?.() ?? Promise.resolve(undefined),
      set: (patch) => d.setDesktopSettings?.(patch as never) ?? Promise.resolve(undefined),
    },
    screenShare: {
      pick: () => d.chooseShareSource?.() ?? Promise.resolve(null),
    },
    media: {
      getAccessStatus: (kind) => d.getMediaAccessStatus?.(kind) ?? Promise.resolve('unknown'),
      openSettings: (kind) => d.openMediaSettings?.(kind) ?? Promise.resolve(false),
    },
    activity: {
      getCurrent: () => d.getCurrentActivity?.() ?? Promise.resolve(null),
      onChanged: (listener) => d.onActivityChanged?.(listener) ?? noopUnsub,
    },
    deepLink: {
      onLink: (listener) => d.onDeepLink?.(listener) ?? noopUnsub,
    },
    hotkeys: {
      onMuteToggle: (listener) => d.onGlobalMuteHotkey?.(listener) ?? noopUnsub,
      onDeafenToggle: (listener) => d.onGlobalDeafenHotkey?.(listener) ?? noopUnsub,
    },
    clipboard: {
      copy: async () => false,
      read: async () => '',
    },
    safeStorage: {
      isAvailable: async () => false,
      encrypt: async () => '',
      decrypt: async () => '',
    },
  };
}

let cached: NexplayNative | null | undefined;

/** A casca nativa no shape do Discord, ou `null` quando roda no navegador puro. */
export function native(): NexplayNative | null {
  if (cached !== undefined) return cached;
  if (typeof window === 'undefined') {
    cached = null;
  } else if (window.NexplayNative) {
    cached = window.NexplayNative;
  } else if (window.desktop) {
    cached = fromLegacy(window.desktop);
  } else {
    cached = null;
  }
  return cached;
}

/** true quando está rodando dentro do app desktop (qualquer versão). */
export function isDesktop(): boolean {
  return native() !== null;
}

// Recursos que nem toda versão instalada do app tem. A ponte nova (0.2.19+) tem todos; na legada, cada um
// chegou numa versão, e a tela esconde o botão quando o app instalado ainda não tem o recurso.
export type NativeFeature =
  | 'updates' // 0.2.12
  | 'logs' // 0.2.12
  | 'deepLink' // 0.2.13
  | 'activity'
  | 'desktopSettings' // 0.2.17
  | 'globalHotkeys' // 0.2.18
  | 'mediaSettings'
  | 'mediaStatus'
  | 'fullscreen'
  | 'screenPicker';

const LEGACY_METHOD: Record<NativeFeature, keyof LegacyDesktop> = {
  updates: 'checkForUpdates',
  logs: 'openLogs',
  deepLink: 'onDeepLink',
  activity: 'onActivityChanged',
  desktopSettings: 'getDesktopSettings',
  globalHotkeys: 'onGlobalMuteHotkey',
  mediaSettings: 'openMediaSettings',
  mediaStatus: 'getMediaAccessStatus',
  fullscreen: 'setFullscreen',
  screenPicker: 'chooseShareSource',
};

/** true quando o app desktop instalado tem o recurso (sempre false no navegador). */
export function nativeSupports(feature: NativeFeature): boolean {
  if (typeof window === 'undefined') return false;
  if (window.NexplayNative) return true;
  const legacy = window.desktop;
  return Boolean(legacy && legacy[LEGACY_METHOD[feature]]);
}
