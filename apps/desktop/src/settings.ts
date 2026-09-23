// Preferências do app de desktop (guardadas num arquivo na pasta de dados do app). Este arquivo não usa o Electron: só decide o que
// vale e valida o que a página pede, para poder ser testado.

export interface DesktopSettings {
  // O X da janela esconde o app na bandeja em vez de encerrar (como no Discord).
  closeToTray: boolean;
  // Abrir o NexPlay sozinho quando o Windows inicia.
  launchAtLogin: boolean;
  // Quando abre sozinho com o Windows, fica escondido na bandeja em vez de abrir a janela.
  startMinimized: boolean;
  // Atalhos globais (formato Accelerator do Electron, ex. "ControlRight" ou "Control+Shift+M"):
  // funcionam mesmo com o NexPlay em segundo plano (jogando, por exemplo). '' = desativado.
  globalMuteHotkey: string;
  globalDeafenHotkey: string;
}

export const DEFAULT_DESKTOP_SETTINGS: DesktopSettings = {
  closeToTray: true,
  launchAtLogin: false,
  startMinimized: true,
  globalMuteHotkey: '',
  globalDeafenHotkey: '',
};

const BOOLEAN_SETTINGS_KEYS = ['closeToTray', 'launchAtLogin', 'startMinimized'] as const;
const STRING_SETTINGS_KEYS = ['globalMuteHotkey', 'globalDeafenHotkey'] as const;

/** Argumento que o Windows passa ao NexPlay quando ele abre sozinho no início da sessão. */
export const HIDDEN_LAUNCH_ARGUMENT = '--hidden';

/** Lê o arquivo de preferências; qualquer coisa fora do esperado cai no padrão daquela opção. */
export function parseDesktopSettings(raw: string | null | undefined): DesktopSettings {
  if (!raw) return { ...DEFAULT_DESKTOP_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof DesktopSettings, unknown>> | null;
    const pickBoolean = (key: (typeof BOOLEAN_SETTINGS_KEYS)[number]): boolean =>
      typeof parsed?.[key] === 'boolean' ? (parsed[key] as boolean) : DEFAULT_DESKTOP_SETTINGS[key];
    const pickString = (key: (typeof STRING_SETTINGS_KEYS)[number]): string =>
      typeof parsed?.[key] === 'string' ? (parsed[key] as string) : DEFAULT_DESKTOP_SETTINGS[key];
    return {
      closeToTray: pickBoolean('closeToTray'),
      launchAtLogin: pickBoolean('launchAtLogin'),
      startMinimized: pickBoolean('startMinimized'),
      globalMuteHotkey: pickString('globalMuteHotkey'),
      globalDeafenHotkey: pickString('globalDeafenHotkey'),
    };
  } catch {
    return { ...DEFAULT_DESKTOP_SETTINGS };
  }
}

/** Valida o que a página mandou mudar: só as chaves conhecidas, com o tipo certo pra cada uma. */
export function sanitizeSettingsPatch(input: unknown): Partial<DesktopSettings> | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const patch: Partial<DesktopSettings> = {};
  for (const key of BOOLEAN_SETTINGS_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean') return null;
    patch[key] = value;
  }
  for (const key of STRING_SETTINGS_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') return null;
    patch[key] = value;
  }
  return patch;
}

/** O app abriu sozinho com o Windows e deve ficar na bandeja? (Só se a bandeja existe: senão não haveria como abrir a janela.) */
export function shouldStartHidden(argv: readonly string[], settings: DesktopSettings, trayAvailable: boolean): boolean {
  return trayAvailable && settings.startMinimized && argv.includes(HIDDEN_LAUNCH_ARGUMENT);
}

/** O X esconde o app na bandeja só se a pessoa quer e a bandeja existe (nunca deixar o app rodando sem jeito de reabrir). */
export function shouldHideOnClose(settings: DesktopSettings, trayAvailable: boolean, quitting: boolean): boolean {
  return settings.closeToTray && trayAvailable && !quitting;
}
