// Tratamento de áudio do microfone, igual ao do Discord: perfis (Isolamento de voz, Estúdio, Personalizado), supressão de ruído,
// cancelamento de eco, controle automático de ganho, sensibilidade de entrada (gate) e, além do Discord, um compressor de voz e o
// volume de entrada. Este arquivo só decide QUAIS ajustes valem (puro, sem áudio); quem processa de verdade é voiceGraph.ts.

export type MicProfile = 'isolamento' | 'estudio' | 'personalizado';
export type InputMode = 'voice' | 'ptt';

/**
 * off: nada. standard: a supressão nativa do navegador (WebRTC). high: RNNoise, rede neural rápida (a mesma família do Krisp).
 * max: GTCRN, rede neural mais nova e mais forte contra ruídos que não são constantes (teclado, cliques, respiração).
 */
export type NoiseSuppressionLevel = 'off' | 'standard' | 'high' | 'max';
export const NOISE_SUPPRESSION_LEVELS: readonly NoiseSuppressionLevel[] = ['off', 'standard', 'high', 'max'];

export type CompressorLevel = 'off' | 'light' | 'medium' | 'strong';
export const COMPRESSOR_LEVELS: readonly CompressorLevel[] = ['off', 'light', 'medium', 'strong'];

/** As escolhas da pessoa (guardadas). O perfil decide quais delas valem: só o Personalizado usa todas. */
export interface VoiceSettings {
  profile: MicProfile;
  noiseLevel: NoiseSuppressionLevel;
  echoCancellation: boolean;
  autoGain: boolean;
  compressor: CompressorLevel;
  // 0 a 200 (%): 100 é o volume original do microfone.
  inputVolume: number;
  autoSensitivity: boolean;
  // 0 a 100: quanto maior, mais alto é preciso falar para o microfone abrir (mapeado em dB por sensitivityToThresholdDb).
  inputSensitivity: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  profile: 'isolamento',
  noiseLevel: 'max',
  echoCancellation: true,
  autoGain: true,
  compressor: 'off',
  inputVolume: 100,
  autoSensitivity: true,
  inputSensitivity: 40,
};

/** Os ajustes que de fato valem agora, já resolvidos pelo perfil e pelo modo de entrada. */
export interface VoiceProcessingConfig {
  noiseLevel: NoiseSuppressionLevel;
  echoCancellation: boolean;
  autoGain: boolean;
  compressor: CompressorLevel;
  inputVolume: number;
  // Corta o "rumble" (vento, batida na mesa, sopro grave) abaixo de ~90 Hz.
  highPass: boolean;
  gate: { enabled: boolean; auto: boolean; thresholdDb: number };
}

export function resolveVoiceProcessing(settings: VoiceSettings, inputMode: InputMode): VoiceProcessingConfig {
  // A sensibilidade só existe em "Voz ativa": no push-to-talk a própria tecla decide quando o microfone fala.
  const gate = {
    enabled: inputMode === 'voice',
    auto: settings.autoSensitivity,
    thresholdDb: sensitivityToThresholdDb(settings.inputSensitivity),
  };
  switch (settings.profile) {
    case 'isolamento':
      // Como o Isolamento do Discord: a voz sozinha, com tudo que ajuda ligado.
      return { noiseLevel: 'max', echoCancellation: true, autoGain: true, compressor: 'off', inputVolume: clampVolume(settings.inputVolume), highPass: true, gate };
    case 'estudio':
      // Áudio puro, sem nenhum tratamento (o gate segue a sensibilidade escolhida, como no Discord).
      return { noiseLevel: 'off', echoCancellation: false, autoGain: false, compressor: 'off', inputVolume: clampVolume(settings.inputVolume), highPass: false, gate };
    case 'personalizado':
      return {
        noiseLevel: settings.noiseLevel,
        echoCancellation: settings.echoCancellation,
        autoGain: settings.autoGain,
        compressor: settings.compressor,
        inputVolume: clampVolume(settings.inputVolume),
        highPass: settings.noiseLevel !== 'off',
        gate,
      };
  }
}

export const clampVolume = (percent: number): number => (Number.isFinite(percent) ? Math.min(200, Math.max(0, Math.round(percent))) : 100);

/** Sensibilidade (0 a 100) em dBFS: 0 abre com qualquer som (-75 dB), 100 só com voz alta (-15 dB). */
export function sensitivityToThresholdDb(percent: number): number {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 40));
  return Math.round((-75 + clamped * 0.6) * 10) / 10;
}

/**
 * As restrições de captura do navegador. Quando uma rede neural cuida do ruído a supressão nativa fica desligada (duas
 * supressões uma depois da outra soam pior); só o nível "padrão" usa a nativa.
 */
export function captureConstraintsFor(config: VoiceProcessingConfig): { noiseSuppression: boolean; echoCancellation: boolean; autoGainControl: boolean } {
  return {
    noiseSuppression: config.noiseLevel === 'standard',
    echoCancellation: config.echoCancellation,
    autoGainControl: config.autoGain,
  };
}

/** Ajustes do DynamicsCompressorNode de cada nível. O ganho de compensação (makeup) o próprio Web Audio já aplica. */
export const COMPRESSOR_PRESETS: Record<Exclude<CompressorLevel, 'off'>, { threshold: number; knee: number; ratio: number; attack: number; release: number }> = {
  light: { threshold: -26, knee: 24, ratio: 2.5, attack: 0.012, release: 0.25 },
  medium: { threshold: -32, knee: 18, ratio: 4, attack: 0.008, release: 0.2 },
  strong: { threshold: -38, knee: 12, ratio: 7, attack: 0.004, release: 0.16 },
};

// ---- guardar e ler (localStorage), com migração das chaves antigas

const KEYS = {
  profile: 'np:mic-profile',
  noiseLevel: 'np:noise-level',
  noiseSuppressionOld: 'np:noise-suppression',
  echoCancellation: 'np:echo-cancellation',
  autoGain: 'np:auto-gain',
  compressor: 'np:compressor',
  inputVolume: 'np:input-volume',
  autoSensitivity: 'np:auto-sensitivity',
  inputSensitivity: 'np:input-sensitivity',
} as const;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const oneOf = <T extends string>(value: string | null, options: readonly T[]): T | null => (options.includes(value as T) ? (value as T) : null);
const readBool = (value: string | null, fallback: boolean): boolean => (value === 'true' ? true : value === 'false' ? false : fallback);
const readNumber = (value: string | null, min: number, max: number, fallback: number): number => {
  const parsed = value === null ? NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

/** Lê as escolhas guardadas. Quem só tinha o interruptor antigo de supressão de ruído mantém a preferência: ligado vira "Alta". */
export function loadVoiceSettings(store: KeyValueStore): VoiceSettings {
  const d = DEFAULT_VOICE_SETTINGS;
  const oldSuppression = store.getItem(KEYS.noiseSuppressionOld);
  const storedProfile = oneOf(store.getItem(KEYS.profile), ['isolamento', 'estudio', 'personalizado'] as const);
  // Quem tinha desligado a supressão no interruptor antigo e ainda não escolheu perfil fica no Personalizado, como antes.
  const profile: MicProfile = storedProfile ?? (oldSuppression === 'false' ? 'personalizado' : d.profile);
  const migratedNoise: NoiseSuppressionLevel = oldSuppression === 'false' ? 'off' : d.noiseLevel;
  return {
    profile,
    noiseLevel: oneOf(store.getItem(KEYS.noiseLevel), NOISE_SUPPRESSION_LEVELS) ?? migratedNoise,
    echoCancellation: readBool(store.getItem(KEYS.echoCancellation), d.echoCancellation),
    autoGain: readBool(store.getItem(KEYS.autoGain), d.autoGain),
    compressor: oneOf(store.getItem(KEYS.compressor), COMPRESSOR_LEVELS) ?? d.compressor,
    inputVolume: readNumber(store.getItem(KEYS.inputVolume), 0, 200, d.inputVolume),
    autoSensitivity: readBool(store.getItem(KEYS.autoSensitivity), d.autoSensitivity),
    inputSensitivity: readNumber(store.getItem(KEYS.inputSensitivity), 0, 100, d.inputSensitivity),
  };
}

export function saveVoiceSettings(store: KeyValueStore, settings: VoiceSettings): void {
  store.setItem(KEYS.profile, settings.profile);
  store.setItem(KEYS.noiseLevel, settings.noiseLevel);
  store.setItem(KEYS.echoCancellation, String(settings.echoCancellation));
  store.setItem(KEYS.autoGain, String(settings.autoGain));
  store.setItem(KEYS.compressor, settings.compressor);
  store.setItem(KEYS.inputVolume, String(settings.inputVolume));
  store.setItem(KEYS.autoSensitivity, String(settings.autoSensitivity));
  store.setItem(KEYS.inputSensitivity, String(settings.inputSensitivity));
}
