import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  COMPRESSOR_PRESETS,
  DEFAULT_VOICE_SETTINGS,
  captureConstraintsFor,
  loadVoiceSettings,
  resolveVoiceProcessing,
  saveVoiceSettings,
  sensitivityToThresholdDb,
  type KeyValueStore,
  type VoiceSettings,
} from './processingConfig';

// ---- configuração (sem áudio)
const memoryStore = (initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } => {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
};

test('cada perfil resolve os ajustes como o Discord: Isolamento tudo ligado, Estúdio nada, Personalizado o que a pessoa escolheu', () => {
  const custom: VoiceSettings = { ...DEFAULT_VOICE_SETTINGS, profile: 'personalizado', noiseLevel: 'standard', echoCancellation: false, autoGain: false, compressor: 'strong', inputVolume: 130 };
  const isolation = resolveVoiceProcessing({ ...custom, profile: 'isolamento' }, 'voice');
  assert.deepEqual([isolation.noiseLevel, isolation.echoCancellation, isolation.autoGain, isolation.highPass], ['max', true, true, true]);
  const studio = resolveVoiceProcessing({ ...custom, profile: 'estudio' }, 'voice');
  assert.deepEqual([studio.noiseLevel, studio.echoCancellation, studio.autoGain, studio.compressor, studio.highPass], ['off', false, false, 'off', false]);
  const own = resolveVoiceProcessing(custom, 'voice');
  assert.deepEqual([own.noiseLevel, own.echoCancellation, own.autoGain, own.compressor, own.inputVolume], ['standard', false, false, 'strong', 130]);
});

test('o gate de sensibilidade só vale na Voz ativa; no push-to-talk quem manda é a tecla', () => {
  assert.equal(resolveVoiceProcessing(DEFAULT_VOICE_SETTINGS, 'voice').gate.enabled, true);
  assert.equal(resolveVoiceProcessing(DEFAULT_VOICE_SETTINGS, 'ptt').gate.enabled, false);
  assert.equal(resolveVoiceProcessing({ ...DEFAULT_VOICE_SETTINGS, autoSensitivity: false, inputSensitivity: 50 }, 'voice').gate.thresholdDb, -45);
});

test('a sensibilidade em porcentagem vira dB e fica sempre dentro da faixa', () => {
  assert.equal(sensitivityToThresholdDb(0), -75);
  assert.equal(sensitivityToThresholdDb(100), -15);
  assert.equal(sensitivityToThresholdDb(-20), -75);
  assert.equal(sensitivityToThresholdDb(500), -15);
  assert.ok(sensitivityToThresholdDb(30) < sensitivityToThresholdDb(31));
});

test('as restrições do navegador: a supressão nativa só no nível "padrão"; com IA ela sai para não empilhar dois tratamentos', () => {
  const base = resolveVoiceProcessing({ ...DEFAULT_VOICE_SETTINGS, profile: 'personalizado' }, 'voice');
  assert.equal(captureConstraintsFor({ ...base, noiseLevel: 'standard' }).noiseSuppression, true);
  for (const level of ['off', 'high', 'max'] as const) assert.equal(captureConstraintsFor({ ...base, noiseLevel: level }).noiseSuppression, false);
  assert.deepEqual(captureConstraintsFor({ ...base, echoCancellation: false, autoGain: true }), { noiseSuppression: false, echoCancellation: false, autoGainControl: true });
});

test('o compressor fica mais firme a cada nível (limite mais baixo, razão maior, ataque mais rápido)', () => {
  const { light, medium, strong } = COMPRESSOR_PRESETS;
  assert.ok(light.threshold > medium.threshold && medium.threshold > strong.threshold);
  assert.ok(light.ratio < medium.ratio && medium.ratio < strong.ratio);
  assert.ok(light.attack > medium.attack && medium.attack > strong.attack);
});

test('as escolhas são guardadas e lidas de volta, e as chaves antigas migram sem mudar o que a pessoa tinha', () => {
  const store = memoryStore();
  const chosen: VoiceSettings = { profile: 'personalizado', noiseLevel: 'high', echoCancellation: false, autoGain: true, compressor: 'medium', inputVolume: 150, autoSensitivity: false, inputSensitivity: 65 };
  saveVoiceSettings(store, chosen);
  assert.deepEqual(loadVoiceSettings(store), chosen);

  assert.deepEqual(loadVoiceSettings(memoryStore()), DEFAULT_VOICE_SETTINGS);
  // quem só tinha o interruptor antigo desligado continua sem supressão, no Personalizado
  const old = loadVoiceSettings(memoryStore({ 'np:noise-suppression': 'false' }));
  assert.equal(old.profile, 'personalizado');
  assert.equal(old.noiseLevel, 'off');
  // lixo no armazenamento cai nos padrões
  const junk = loadVoiceSettings(memoryStore({ 'np:noise-level': 'ultra', 'np:compressor': '???', 'np:input-volume': '9999', 'np:input-sensitivity': 'x' }));
  assert.equal(junk.noiseLevel, DEFAULT_VOICE_SETTINGS.noiseLevel);
  assert.equal(junk.compressor, 'off');
  assert.equal(junk.inputVolume, 100);
  assert.equal(junk.inputSensitivity, DEFAULT_VOICE_SETTINGS.inputSensitivity);
});

// ---- o gate de verdade (o mesmo arquivo que roda no navegador, alimentado com sinais sintéticos)
const SAMPLE_RATE = 48000;
const BLOCK = 128;

interface Processor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
  port: { onmessage: ((event: { data: unknown }) => void) | null; postMessage: (message: unknown) => void };
}

function loadProcessor(): { create: () => Processor; reports: Array<Record<string, number | boolean>> } {
  const reports: Array<Record<string, number | boolean>> = [];
  const source = readFileSync(new URL('./voice-dsp.worklet.js', import.meta.url), 'utf8');
  let Registered: (new () => Processor) | undefined;
  class AudioWorkletProcessor {
    port = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: (message: unknown) => { reports.push(message as Record<string, number | boolean>); } };
  }
  new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', source)(AudioWorkletProcessor, (_name: string, cls: new () => Processor) => { Registered = cls; }, SAMPLE_RATE);
  assert.ok(Registered, 'o worklet registrou o processador');
  return { create: () => new Registered!(), reports };
}

function prng(seed: number) {
  let state = seed;
  return () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296 - 0.5; };
}
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));
const rms = (samples: Float32Array | number[], from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / Math.max(1, to - from));
};
const at = (from: number, to: number) => [Math.round(from * SAMPLE_RATE), Math.round(to * SAMPLE_RATE)] as const;

// trechos de ruído (rms em dBFS) e de "voz" (harmônicos de 180 Hz, rms em dBFS)
function scene(parts: Array<{ seconds: number; kind: 'noise' | 'speech'; db: number }>): Float32Array {
  const random = prng(7);
  const total = parts.reduce((sum, part) => sum + Math.round(part.seconds * SAMPLE_RATE), 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    const count = Math.round(part.seconds * SAMPLE_RATE);
    // a soma dos três harmônicos tem rms de sqrt((1 + .36 + .1225) / 2) ≈ 0,861
    const amplitude = part.kind === 'speech' ? (10 ** (part.db / 20)) / 0.861 : (10 ** (part.db / 20)) * Math.sqrt(12);
    for (let i = 0; i < count; i++) {
      const t = (offset + i) / SAMPLE_RATE;
      const voice = Math.sin(2 * Math.PI * 180 * t) + 0.6 * Math.sin(2 * Math.PI * 360 * t) + 0.35 * Math.sin(2 * Math.PI * 900 * t);
      out[offset + i] = part.kind === 'speech' ? amplitude * voice : amplitude * random();
    }
    offset += count;
  }
  return out;
}

function run(processor: Processor, input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let start = 0; start + BLOCK <= input.length; start += BLOCK) {
    const inBlock = input.subarray(start, start + BLOCK);
    const outBlock = new Float32Array(BLOCK);
    processor.process([[inBlock]], [[outBlock]]);
    out.set(outBlock, start);
  }
  return out;
}

test('gate manual: deixa a voz passar e silencia o ruído abaixo do limite', () => {
  const { create } = loadProcessor();
  const processor = create();
  processor.port.onmessage?.({ data: { config: { enabled: true, auto: false, thresholdDb: -45 } } });
  const input = scene([{ seconds: 1, kind: 'noise', db: -58 }, { seconds: 1, kind: 'speech', db: -22 }, { seconds: 1.2, kind: 'noise', db: -58 }]);
  const out = run(processor, input);
  const noiseBefore = rms(out, ...at(0.6, 0.95));
  const speech = rms(out, ...at(1.1, 1.9));
  const speechIn = rms(input, ...at(1.1, 1.9));
  const noiseAfter = rms(out, ...at(2.6, 3.1));
  assert.ok(db(noiseBefore) < -85, `ruído antes da fala: ${db(noiseBefore).toFixed(1)} dB`);
  assert.ok(Math.abs(db(speech) - db(speechIn)) < 0.6, `a voz passa inteira: ${db(speech).toFixed(1)} dB contra ${db(speechIn).toFixed(1)} dB`);
  assert.ok(db(noiseAfter) < -85, `ruído depois da fala: ${db(noiseAfter).toFixed(1)} dB`);
});

test('gate: o começo da fala não é engolido e o fim não é cortado (lookahead e tempo de espera)', () => {
  const { create } = loadProcessor();
  const processor = create();
  processor.port.onmessage?.({ data: { config: { enabled: true, auto: false, thresholdDb: -45 } } });
  const input = scene([{ seconds: 1, kind: 'noise', db: -60 }, { seconds: 0.5, kind: 'speech', db: -22 }, { seconds: 1, kind: 'noise', db: -60 }]);
  const out = run(processor, input);
  const speechStart = SAMPLE_RATE; // a fala começa em 1,000 s
  // 12 ms depois do início a saída já está com a voz (o atraso do lookahead é de 6 ms)
  const early = rms(out, speechStart + Math.round(0.012 * SAMPLE_RATE), speechStart + Math.round(0.03 * SAMPLE_RATE));
  const expected = rms(input, speechStart, speechStart + Math.round(0.02 * SAMPLE_RATE));
  assert.ok(db(early) > db(expected) - 3, `início da fala preservado: ${db(early).toFixed(1)} dB (esperado perto de ${db(expected).toFixed(1)} dB)`);
  // logo depois de a fala acabar o gate ainda está aberto (o ruído de fundo passa), e bem depois já fechou
  const speechEnd = Math.round(1.5 * SAMPLE_RATE);
  const held = rms(out, speechEnd + Math.round(0.05 * SAMPLE_RATE), speechEnd + Math.round(0.15 * SAMPLE_RATE));
  const closed = rms(out, speechEnd + Math.round(0.7 * SAMPLE_RATE), speechEnd + Math.round(0.95 * SAMPLE_RATE));
  assert.ok(db(held) > -75, `gate ainda aberto logo depois da fala: ${db(held).toFixed(1)} dB`);
  assert.ok(db(closed) < -85, `gate fechado bem depois: ${db(closed).toFixed(1)} dB`);
});

test('gate automático: aprende o ruído de fundo sozinho, mesmo alto, e abre só para a voz', () => {
  for (const noiseDb of [-62, -48]) {
    const { create } = loadProcessor();
    const processor = create();
    processor.port.onmessage?.({ data: { config: { enabled: true, auto: true, thresholdDb: -50 } } });
    const input = scene([{ seconds: 3, kind: 'noise', db: noiseDb }, { seconds: 1, kind: 'speech', db: -20 }, { seconds: 1.5, kind: 'noise', db: noiseDb }]);
    const out = run(processor, input);
    const noiseOnly = rms(out, ...at(2.0, 2.9));
    const speech = rms(out, ...at(3.2, 3.9));
    const speechIn = rms(input, ...at(3.2, 3.9));
    assert.ok(db(noiseOnly) < noiseDb - 20, `ruído de fundo de ${noiseDb} dB fica calado: saída ${db(noiseOnly).toFixed(1)} dB`);
    assert.ok(Math.abs(db(speech) - db(speechIn)) < 1, `voz passa com ruído de fundo de ${noiseDb} dB: ${db(speech).toFixed(1)} dB`);
  }
});

test('gate automático: o silêncio digital antes do áudio começar não estraga o aprendizado do ruído', () => {
  // no navegador o microfone demora alguns blocos para entregar áudio: os primeiros quadros chegam zerados
  const { create } = loadProcessor();
  const processor = create();
  processor.port.onmessage?.({ data: { config: { enabled: true, auto: true, thresholdDb: -50 } } });
  const input = scene([{ seconds: 0.6, kind: 'noise', db: -200 }, { seconds: 3, kind: 'noise', db: -50 }, { seconds: 1, kind: 'speech', db: -22 }, { seconds: 1.5, kind: 'noise', db: -50 }]);
  const out = run(processor, input);
  const noiseOnly = rms(out, ...at(2.4, 3.5));
  const speech = rms(out, ...at(4.2, 4.9));
  const speechIn = rms(input, ...at(4.2, 4.9));
  assert.ok(db(noiseOnly) < -75, `ruído de fundo de -50 dB fica calado: ${db(noiseOnly).toFixed(1)} dB`);
  assert.ok(Math.abs(db(speech) - db(speechIn)) < 1, `a voz passa: ${db(speech).toFixed(1)} dB`);
});

test('gate automático: fala contínua, sem pausas, não é cortada pelo próprio aprendizado do ruído', () => {
  const { create } = loadProcessor();
  const processor = create();
  processor.port.onmessage?.({ data: { config: { enabled: true, auto: true, thresholdDb: -50 } } });
  const input = scene([{ seconds: 1, kind: 'noise', db: -58 }, { seconds: 9, kind: 'speech', db: -24 }]);
  const out = run(processor, input);
  for (const [from, to] of [[2, 4], [5, 7], [8, 9.8]] as const) {
    const passed = rms(out, ...at(from, to));
    const original = rms(input, ...at(from, to));
    assert.ok(Math.abs(db(passed) - db(original)) < 1, `fala contínua entre ${from}s e ${to}s: ${db(passed).toFixed(1)} dB`);
  }
});

test('gate desligado (push-to-talk): tudo passa, só atrasado alguns milissegundos', () => {
  const { create } = loadProcessor();
  const processor = create();
  processor.port.onmessage?.({ data: { config: { enabled: false, auto: true, thresholdDb: -50 } } });
  const input = scene([{ seconds: 0.5, kind: 'noise', db: -60 }, { seconds: 0.5, kind: 'speech', db: -25 }]);
  const out = run(processor, input);
  const [from, to] = at(0.6, 0.95);
  assert.ok(Math.abs(db(rms(out, from, to)) - db(rms(input, from, to))) < 0.3);
  assert.ok(db(rms(out, ...at(0.1, 0.4))) > -70, 'o ruído baixo também passa quando o gate está desligado');
});

test('o processador informa nível, limite e estado do gate para o medidor da tela', () => {
  const { create, reports } = loadProcessor();
  const processor = create();
  processor.port.onmessage?.({ data: { config: { enabled: true, auto: false, thresholdDb: -45 } } });
  run(processor, scene([{ seconds: 0.5, kind: 'speech', db: -20 }]));
  assert.ok(reports.length > 10);
  const last = reports.at(-1)!;
  assert.ok(typeof last.level === 'number' && last.level > -30 && last.level < -10, `nível informado: ${last.level}`);
  assert.equal(last.threshold, -45);
  assert.equal(last.open, true);
});
