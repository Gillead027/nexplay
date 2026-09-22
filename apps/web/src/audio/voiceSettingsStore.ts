import { useSyncExternalStore } from 'react';
import {
  DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings,
  resolveVoiceProcessing,
  saveVoiceSettings,
  type InputMode,
  type KeyValueStore,
  type VoiceProcessingConfig,
  type VoiceSettings,
} from './processingConfig';

// Onde ficam as escolhas de tratamento de áudio do microfone. A chamada de voz e a tela de Configurações leem e escrevem
// aqui; qualquer mudança chega na hora a quem estiver ouvindo (o processador de áudio da chamada, o teste de microfone),
// e é guardada neste dispositivo.

const INPUT_MODE_KEY = 'np:input-mode';

const safeStorage = (): KeyValueStore | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

interface Snapshot {
  settings: VoiceSettings;
  inputMode: InputMode;
  config: VoiceProcessingConfig;
}

type Listener = () => void;

function readInputMode(store: KeyValueStore | null): InputMode {
  return store?.getItem(INPUT_MODE_KEY) === 'ptt' ? 'ptt' : 'voice';
}

function buildSnapshot(settings: VoiceSettings, inputMode: InputMode): Snapshot {
  return { settings, inputMode, config: resolveVoiceProcessing(settings, inputMode) };
}

let snapshot: Snapshot = (() => {
  const store = safeStorage();
  return buildSnapshot(store ? loadVoiceSettings(store) : DEFAULT_VOICE_SETTINGS, readInputMode(store));
})();
const listeners = new Set<Listener>();

function commit(next: Snapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export const voiceSettingsStore = {
  getSnapshot: (): Snapshot => snapshot,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  update(patch: Partial<VoiceSettings>): void {
    const settings = { ...snapshot.settings, ...patch };
    const store = safeStorage();
    if (store) {
      try {
        saveVoiceSettings(store, settings);
      } catch {
        // sem armazenamento: a escolha vale até fechar o app
      }
    }
    commit(buildSnapshot(settings, snapshot.inputMode));
  },
  setInputMode(inputMode: InputMode): void {
    try {
      safeStorage()?.setItem(INPUT_MODE_KEY, inputMode);
    } catch {
      // idem
    }
    commit(buildSnapshot(snapshot.settings, inputMode));
  },
};

/** Para os componentes: as escolhas, o modo de entrada (voz ativa ou push-to-talk) e os ajustes resolvidos. */
export function useVoiceSettings(): Snapshot {
  return useSyncExternalStore(voiceSettingsStore.subscribe, voiceSettingsStore.getSnapshot, voiceSettingsStore.getSnapshot);
}
