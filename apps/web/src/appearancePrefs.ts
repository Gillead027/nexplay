export const CHAT_FONT_SCALES = [85, 100, 115, 130, 150] as const;
export const MESSAGE_SPACING_SCALES = [75, 100, 125, 150, 175] as const;
export const UI_ZOOM_SCALES = [90, 100, 110, 125, 150] as const;

export const UI_ACCENT_SWATCHES = [
  '#2f7bff',
  '#6a6cf0',
  '#1fb1d6',
  '#e58a3a',
  '#1f9d8f',
  '#e0577f',
  '#7b61ff',
  '#e2634d',
] as const;

// Quem escolheu uma cor antes da paleta azul tem o valor antigo salvo; ele passa para a cor
// equivalente da paleta nova na hora de ler.
const LEGACY_UI_ACCENT: Record<string, string> = {
  '#4e7960': '#2f7bff',
  '#5c526b': '#6a6cf0',
  '#566747': '#1fb1d6',
  '#6b5548': '#e58a3a',
  '#45645f': '#1f9d8f',
  '#684d52': '#e0577f',
  '#4a6b8a': '#7b61ff',
  '#8a5a4a': '#e2634d',
};

const CHAT_FONT_KEY = 'np:chat-font-step';
const MESSAGE_SPACING_KEY = 'np:message-spacing-step';
const UI_ZOOM_KEY = 'np:ui-zoom-step';
const UI_ACCENT_KEY = 'np:ui-accent';
const UI_ACCENT_ENABLED_KEY = 'np:ui-accent-enabled';
const OUTPUT_VOLUME_KEY = 'np:output-volume';
const SOUNDBOARD_VOLUME_KEY = 'np:soundboard-volume';

export function getOutputVolume(): number {
  const stored = localStorage.getItem(OUTPUT_VOLUME_KEY);
  // Number(null) é 0, não NaN — sem checar null antes, todo mundo sem
  // preferência salva abria (e tocaria sons de notificação) com volume 0%.
  if (stored === null) return 100;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 100;
}

export function setOutputVolume(value: number): void {
  localStorage.setItem(OUTPUT_VOLUME_KEY, String(value));
}

// Preferência de quem ESCUTA, não de quem toca — cada participante decide o
// quão alto os sons do soundboard dos outros chegam pra ele, igual o
// volume de stream já funciona hoje (RemoteAudioSink.tsx).
export function getSoundboardVolume(): number {
  const stored = localStorage.getItem(SOUNDBOARD_VOLUME_KEY);
  if (stored === null) return 100;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 100;
}

export function setSoundboardVolume(value: number): void {
  localStorage.setItem(SOUNDBOARD_VOLUME_KEY, String(value));
}

function readStep(key: string, scales: readonly number[]): number {
  const stored = localStorage.getItem(key);
  // Number(null) é 0, não NaN — sem esse "stored === null" antes, todo
  // usuário sem preferência salva (o caso normal, primeira vez abrindo)
  // cairia no passo 0 (o menor valor da escala) em vez do padrão real.
  if (stored === null) return 1;
  const raw = Number(stored);
  return Number.isInteger(raw) && raw >= 0 && raw < scales.length ? raw : 1;
}

export function getChatFontStep(): number {
  return readStep(CHAT_FONT_KEY, CHAT_FONT_SCALES);
}

export function getMessageSpacingStep(): number {
  return readStep(MESSAGE_SPACING_KEY, MESSAGE_SPACING_SCALES);
}

export function getUiZoomStep(): number {
  return readStep(UI_ZOOM_KEY, UI_ZOOM_SCALES);
}

export function applyChatFontStep(step: number): void {
  document.documentElement.setAttribute('data-chat-font-scale', String(CHAT_FONT_SCALES[step]));
}

export function applyMessageSpacingStep(step: number): void {
  document.documentElement.setAttribute('data-message-spacing-scale', String(MESSAGE_SPACING_SCALES[step]));
}

export function applyUiZoomStep(step: number): void {
  // Zoom via CSS (a propriedade "zoom") encolhe a caixa em vez de redistribuir
  // o layout, deixando espaço vazio em volta num layout full-bleed (100vw/100vh
  // calculados antes do fator aplicar). O zoom nativo do Electron/Chromium (o
  // mesmo do Ctrl+scroll) recalcula as unidades de viewport de verdade — por
  // isso essa função pede pro processo principal aplicar, em vez de mexer no CSS.
  window.desktop?.setZoomFactor?.((UI_ZOOM_SCALES[step] ?? 100) / 100);
}

export function setChatFontStep(step: number): void {
  localStorage.setItem(CHAT_FONT_KEY, String(step));
  applyChatFontStep(step);
}

export function setMessageSpacingStep(step: number): void {
  localStorage.setItem(MESSAGE_SPACING_KEY, String(step));
  applyMessageSpacingStep(step);
}

export function setUiZoomStep(step: number): void {
  localStorage.setItem(UI_ZOOM_KEY, String(step));
  applyUiZoomStep(step);
}

export function getUiAccent(): { color: string; enabled: boolean } {
  const stored = localStorage.getItem(UI_ACCENT_KEY);
  const color = stored ? (LEGACY_UI_ACCENT[stored.toLowerCase()] ?? stored) : UI_ACCENT_SWATCHES[0];
  const enabled = localStorage.getItem(UI_ACCENT_ENABLED_KEY) === 'true';
  return { color, enabled };
}

// A cor escolhida troca a cor de destaque inteira: sólida, hover, gradiente dos botões, brilho e fundo suave.
const UI_ACCENT_PROPERTIES = ['--accent', '--accent-hover', '--accent-2', '--accent-gradient', '--accent-glow', '--accent-glow-strong', '--accent-soft'] as const;

export function applyUiAccent(color: string, enabled: boolean): void {
  const style = document.documentElement.style;
  if (!enabled) {
    UI_ACCENT_PROPERTIES.forEach((property) => style.removeProperty(property));
    return;
  }
  style.setProperty('--accent', color);
  style.setProperty('--accent-hover', `color-mix(in srgb, ${color} 80%, #fff)`);
  style.setProperty('--accent-2', `color-mix(in srgb, ${color} 55%, #fff)`);
  style.setProperty('--accent-gradient', `linear-gradient(135deg, color-mix(in srgb, ${color} 55%, #fff) 0%, ${color} 58%, color-mix(in srgb, ${color} 85%, #000) 100%)`);
  style.setProperty('--accent-glow', `color-mix(in srgb, ${color} 38%, transparent)`);
  style.setProperty('--accent-glow-strong', `color-mix(in srgb, ${color} 60%, transparent)`);
  style.setProperty('--accent-soft', `color-mix(in srgb, ${color} 14%, transparent)`);
}

export function setUiAccent(color: string, enabled: boolean): void {
  localStorage.setItem(UI_ACCENT_KEY, color);
  localStorage.setItem(UI_ACCENT_ENABLED_KEY, String(enabled));
  applyUiAccent(color, enabled);
}

export function bootAppearancePrefs(): void {
  applyChatFontStep(getChatFontStep());
  applyMessageSpacingStep(getMessageSpacingStep());
  applyUiZoomStep(getUiZoomStep());
  const { color, enabled } = getUiAccent();
  applyUiAccent(color, enabled);
}
