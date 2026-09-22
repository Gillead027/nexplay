// O medidor de entrada em tempo real (nível da voz depois do tratamento, limite do gate e estado do gate). Quem processa o áudio
// publica aqui (a chamada em andamento ou o teste de microfone); a tela só escuta.

export interface VoiceMeterReport {
  // Nível da voz depois da supressão de ruído, em dBFS (0 é o máximo; -100 é silêncio).
  level: number;
  // Limite do gate (a sensibilidade) em dBFS: acima dele o microfone abre.
  threshold: number;
  // O gate está deixando a voz passar?
  open: boolean;
  // Estimativa do ruído de fundo (modo automático).
  floor: number;
  // O gate está ligado (Voz ativa)? No push-to-talk fica desligado e a voz sempre passa.
  gate: boolean;
  // Quanto o compressor está abaixando o volume agora, em dB (0 quando não comprime).
  reduction: number;
  // Quando este relatório foi publicado (ms).
  at: number;
}

export type VoiceMeterSource = 'call' | 'test';

type Listener = (report: VoiceMeterReport | null) => void;

const listeners = new Set<Listener>();
let latest: VoiceMeterReport | null = null;
let latestSource: VoiceMeterSource | null = null;

// Relatórios de quem parou de falar há tempo saem da tela sozinhos.
export const METER_STALE_MS = 1500;

export function publishVoiceMeter(source: VoiceMeterSource, report: VoiceMeterReport): void {
  // O teste de microfone manda no medidor enquanto está aberto (a chamada continua publicando por baixo).
  if (latestSource === 'test' && source === 'call' && latest && report.at - latest.at < METER_STALE_MS) return;
  latest = report;
  latestSource = source;
  for (const listener of listeners) listener(report);
}

export function clearVoiceMeter(source: VoiceMeterSource): void {
  if (latestSource !== source) return;
  latest = null;
  latestSource = null;
  for (const listener of listeners) listener(null);
}

export function subscribeVoiceMeter(listener: Listener): () => void {
  listeners.add(listener);
  listener(latest);
  return () => {
    listeners.delete(listener);
  };
}

/** Do nível em dBFS (-100 a 0) para uma posição de barra (0 a 1); abaixo de -80 dB é considerado silêncio. */
export function levelToFraction(db: number): number {
  return Math.min(1, Math.max(0, (db + 80) / 80));
}
