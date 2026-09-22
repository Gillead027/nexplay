import type { AudioProcessorOptions, Track, TrackProcessor } from 'livekit-client';
import dspWorkletUrl from './voice-dsp.worklet.js?url';
import gtcrnWorkletUrl from '@sapphi-red/web-noise-suppressor/gtcrnWorklet.js?url';
import gtcrnWasmUrl from '@sapphi-red/web-noise-suppressor/gtcrn.wasm?url';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';
import { COMPRESSOR_PRESETS, type VoiceProcessingConfig } from './processingConfig';
import { publishVoiceMeter, type VoiceMeterReport, type VoiceMeterSource } from './voiceMeter';

// O tratamento de áudio do microfone, em tempo real, dentro do próprio app (Web Audio):
//
//   microfone -> mono -> filtro de graves (corta rumble e sopro grave) -> supressão de ruído por IA (RNNoise ou GTCRN, opcional)
//             -> gate de sensibilidade + medidor -> compressor de voz (opcional) -> volume de entrada -> limitador -> saída
//
// A saída é uma faixa de áudio comum, que o LiveKit publica no lugar do microfone cru. Tudo é reconfigurável ao vivo
// (setConfig), sem reiniciar o microfone nem reconectar a chamada. Os modelos de IA (WebAssembly, ~150 a 200 KB cada) só são
// baixados na primeira vez que um deles é escolhido.

const SAMPLE_RATE = 48000; // os dois modelos de IA trabalham em 48 kHz
const RAMP = 0.02; // s: transições de ganho e de rota sem estalos

type NeuralKind = 'high' | 'max';
type NeuralNode = AudioWorkletNode & { destroy(): void };

const workletModulesByContext = new WeakMap<AudioContext, Set<string>>();
async function addWorkletOnce(context: AudioContext, url: string): Promise<void> {
  let loaded = workletModulesByContext.get(context);
  if (!loaded) {
    loaded = new Set();
    workletModulesByContext.set(context, loaded);
  }
  if (loaded.has(url)) return;
  await context.audioWorklet.addModule(url);
  loaded.add(url);
}

// Os binários WebAssembly são baixados uma vez por sessão e reaproveitados em cada chamada e teste.
const wasmCache = new Map<NeuralKind, Promise<ArrayBuffer>>();
function loadNeuralBinary(kind: NeuralKind): Promise<ArrayBuffer> {
  let promise = wasmCache.get(kind);
  if (!promise) {
    promise = import('@sapphi-red/web-noise-suppressor').then((lib) =>
      kind === 'high' ? lib.loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdWasmUrl }) : lib.loadGtcrn({ url: gtcrnWasmUrl }),
    );
    // Uma falha (sem rede na primeira vez, por exemplo) não pode ficar guardada para sempre.
    promise.catch(() => wasmCache.delete(kind));
    wasmCache.set(kind, promise);
  }
  return promise;
}

async function createNeuralNode(context: AudioContext, kind: NeuralKind): Promise<NeuralNode> {
  const [lib, wasmBinary] = await Promise.all([import('@sapphi-red/web-noise-suppressor'), loadNeuralBinary(kind)]);
  await addWorkletOnce(context, kind === 'high' ? rnnoiseWorkletUrl : gtcrnWorkletUrl);
  return kind === 'high'
    ? new lib.RnnoiseWorkletNode(context, { maxChannels: 1, wasmBinary })
    : new lib.GtcrnWorkletNode(context, { maxChannels: 1, wasmBinary });
}

export interface VoiceGraphOptions {
  source: VoiceMeterSource;
  // Chamado quando um modelo de IA não pôde ser carregado (o app cai para a supressão nativa do navegador).
  onNeuralFailure?: (kind: NeuralKind, error: unknown) => void;
}

export class VoiceGraph {
  readonly context: AudioContext;
  readonly output: MediaStreamAudioDestinationNode;
  private readonly options: VoiceGraphOptions;
  private input: MediaStreamAudioSourceNode | null = null;
  private readonly mono: GainNode;
  private readonly highPass: BiquadFilterNode;
  private readonly denoiseIn: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly denoiseOut: GainNode;
  private gate: AudioWorkletNode | null = null;
  private readonly gateFallback: GainNode;
  private readonly compIn: GainNode;
  private readonly compressor: DynamicsCompressorNode;
  private readonly compWet: GainNode;
  private readonly compDry: GainNode;
  private readonly compOut: GainNode;
  private readonly volume: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly neural = new Map<NeuralKind, NeuralNode>();
  private neuralLoading = new Map<NeuralKind, Promise<void>>();
  private activeNeural: NeuralKind | null = null;
  private config: VoiceProcessingConfig;
  private destroyed = false;
  private reduction = 0;
  private monitor: GainNode | null = null;

  private constructor(context: AudioContext, config: VoiceProcessingConfig, options: VoiceGraphOptions) {
    this.context = context;
    this.config = config;
    this.options = options;
    this.output = context.createMediaStreamDestination();

    this.mono = context.createGain();
    this.mono.channelCount = 1;
    this.mono.channelCountMode = 'explicit';
    this.mono.channelInterpretation = 'speakers';

    this.highPass = context.createBiquadFilter();
    this.highPass.type = 'highpass';
    this.highPass.Q.value = 0.7;
    this.highPass.frequency.value = config.highPass ? 90 : 10;

    this.denoiseIn = context.createGain();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.wet.gain.value = 0;
    this.denoiseOut = context.createGain();

    this.gateFallback = context.createGain();
    this.compIn = context.createGain();
    this.compressor = context.createDynamicsCompressor();
    this.compWet = context.createGain();
    this.compDry = context.createGain();
    this.compOut = context.createGain();
    this.volume = context.createGain();
    this.limiter = context.createDynamicsCompressor();
    // Limitador de segurança: o volume de entrada acima de 100% e o compressor nunca estouram a saída.
    this.limiter.threshold.value = -1.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.06;

    this.mono.connect(this.highPass);
    this.highPass.connect(this.denoiseIn);
    this.denoiseIn.connect(this.dry);
    this.dry.connect(this.denoiseOut);
    this.wet.connect(this.denoiseOut);
    this.compIn.connect(this.compressor);
    this.compressor.connect(this.compWet);
    this.compWet.connect(this.compOut);
    this.compIn.connect(this.compDry);
    this.compDry.connect(this.compOut);
    this.compOut.connect(this.volume);
    this.volume.connect(this.limiter);
    this.limiter.connect(this.output);
  }

  /** Monta o grafo para a faixa de microfone `track` e já o deixa no estado de `config` (modelos de IA carregados, se pedidos). */
  static async create(track: MediaStreamTrack, config: VoiceProcessingConfig, options: VoiceGraphOptions): Promise<VoiceGraph> {
    let context: AudioContext;
    try {
      context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
    } catch {
      context = new AudioContext({ latencyHint: 'interactive' });
    }
    const graph = new VoiceGraph(context, config, options);
    try {
      await addWorkletOnce(context, dspWorkletUrl);
      graph.gate = new AudioWorkletNode(context, 'np-voice-dsp', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
      graph.gate.port.onmessage = (event: MessageEvent<Partial<VoiceMeterReport>>) => graph.report(event.data);
      graph.denoiseOut.connect(graph.gate);
      graph.gate.connect(graph.compIn);
    } catch (error) {
      // Sem AudioWorklet (navegador muito antigo): segue sem gate e sem IA, mas o áudio continua funcionando.
      graph.gate = null;
      graph.denoiseOut.connect(graph.gateFallback);
      graph.gateFallback.connect(graph.compIn);
      options.onNeuralFailure?.('high', error);
    }
    graph.attachInput(track);
    await graph.applyConfig(config, true);
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
    return graph;
  }

  get outputTrack(): MediaStreamTrack {
    return this.output.stream.getAudioTracks()[0]!;
  }

  /** Troca a faixa de entrada (mudou o dispositivo) sem desmontar o grafo. */
  attachInput(track: MediaStreamTrack): void {
    this.input?.disconnect();
    this.input = this.context.createMediaStreamSource(new MediaStream([track]));
    this.input.connect(this.mono);
  }

  /** Ligar ou desligar a escuta do próprio microfone (teste de microfone): manda a saída tratada para os alto-falantes. */
  setMonitor(enabled: boolean): void {
    if (enabled && !this.monitor) {
      this.monitor = this.context.createGain();
      this.monitor.gain.value = 1;
      this.limiter.connect(this.monitor);
      this.monitor.connect(this.context.destination);
    } else if (!enabled && this.monitor) {
      this.monitor.disconnect();
      this.limiter.disconnect(this.monitor);
      this.monitor = null;
    }
  }

  private report(partial: Partial<VoiceMeterReport>): void {
    if (this.destroyed) return;
    this.reduction = this.compressor.reduction;
    publishVoiceMeter(this.options.source, {
      level: partial.level ?? -100,
      threshold: partial.threshold ?? -100,
      open: partial.open ?? true,
      floor: partial.floor ?? -100,
      gate: partial.gate ?? false,
      reduction: this.config.compressor === 'off' ? 0 : Math.abs(this.reduction),
      at: Date.now(),
    });
  }

  private ensureNeural(kind: NeuralKind): Promise<void> {
    if (this.neural.has(kind)) return Promise.resolve();
    let loading = this.neuralLoading.get(kind);
    if (!loading) {
      loading = createNeuralNode(this.context, kind).then((node) => {
        if (this.destroyed) {
          node.destroy();
          return;
        }
        this.neural.set(kind, node);
      });
      loading.finally(() => this.neuralLoading.delete(kind)).catch(() => undefined);
      this.neuralLoading.set(kind, loading);
    }
    return loading;
  }

  /** Aplica uma nova configuração ao vivo. Com `waitForModels`, espera o modelo de IA carregar antes de liberar a rota. */
  async applyConfig(config: VoiceProcessingConfig, waitForModels = false): Promise<void> {
    if (this.destroyed) return;
    this.config = config;
    const now = this.context.currentTime;

    this.highPass.frequency.setTargetAtTime(config.highPass ? 90 : 10, now, RAMP);
    this.volume.gain.setTargetAtTime(config.inputVolume / 100, now, RAMP);
    this.gate?.port.postMessage({ config: { enabled: config.gate.enabled, auto: config.gate.auto, thresholdDb: config.gate.thresholdDb } });

    if (config.compressor === 'off') {
      this.compWet.gain.setTargetAtTime(0, now, RAMP);
      this.compDry.gain.setTargetAtTime(1, now, RAMP);
    } else {
      const preset = COMPRESSOR_PRESETS[config.compressor];
      this.compressor.threshold.setTargetAtTime(preset.threshold, now, RAMP);
      this.compressor.knee.setTargetAtTime(preset.knee, now, RAMP);
      this.compressor.ratio.setTargetAtTime(preset.ratio, now, RAMP);
      this.compressor.attack.setTargetAtTime(preset.attack, now, RAMP);
      this.compressor.release.setTargetAtTime(preset.release, now, RAMP);
      this.compWet.gain.setTargetAtTime(1, now, RAMP);
      this.compDry.gain.setTargetAtTime(0, now, RAMP);
    }

    const wanted: NeuralKind | null = config.noiseLevel === 'high' || config.noiseLevel === 'max' ? config.noiseLevel : null;
    if (wanted) {
      const loading = this.ensureNeural(wanted).catch((error) => {
        this.options.onNeuralFailure?.(wanted, error);
      });
      if (waitForModels) await loading;
      else void loading.then(() => this.routeNeural(this.config));
    }
    this.routeNeural(config);
  }

  // Liga o modelo de IA escolhido no caminho do áudio (ou volta ao caminho direto), com uma transição suave.
  private routeNeural(config: VoiceProcessingConfig): void {
    if (this.destroyed) return;
    const wanted: NeuralKind | null = config.noiseLevel === 'high' || config.noiseLevel === 'max' ? config.noiseLevel : null;
    const ready = wanted !== null && this.neural.has(wanted);
    const target = ready ? wanted : null;
    const now = this.context.currentTime;

    if (target !== this.activeNeural) {
      // Desconecta o modelo anterior e conecta o novo (só o modelo em uso gasta processador).
      if (this.activeNeural) {
        const previous = this.neural.get(this.activeNeural);
        if (previous) {
          this.denoiseIn.disconnect(previous);
          previous.disconnect();
        }
      }
      if (target) {
        const next = this.neural.get(target)!;
        this.denoiseIn.connect(next);
        next.connect(this.wet);
      }
      this.activeNeural = target;
    }
    // Enquanto o modelo carrega, o áudio segue pelo caminho direto (com a supressão nativa, se for o caso).
    this.wet.gain.setTargetAtTime(target ? 1 : 0, now, RAMP);
    this.dry.gain.setTargetAtTime(target ? 0 : 1, now, RAMP);
  }

  /** Redução de ganho do compressor neste instante (dB, negativo ou zero), para o medidor. */
  get compressorReduction(): number {
    return this.compressor.reduction;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.setMonitor(false);
    for (const node of this.neural.values()) node.destroy();
    this.neural.clear();
    this.input?.disconnect();
    this.output.stream.getTracks().forEach((track) => track.stop());
    void this.context.close().catch(() => undefined);
  }
}

/**
 * O processador de faixa do LiveKit: no lugar do microfone cru, o LiveKit publica a saída tratada pelo VoiceGraph. O grafo se
 * reconfigura ao vivo por setConfig (sem reiniciar o microfone) e é remontado sozinho quando o dispositivo de entrada muda.
 */
export class NexPlayVoiceProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  readonly name = 'nexplay-voice-processing';
  processedTrack?: MediaStreamTrack;
  private graph: VoiceGraph | null = null;
  private config: VoiceProcessingConfig;
  private readonly onNeuralFailure: ((kind: NeuralKind, error: unknown) => void) | undefined;

  constructor(config: VoiceProcessingConfig, onNeuralFailure?: (kind: NeuralKind, error: unknown) => void) {
    this.config = config;
    this.onNeuralFailure = onNeuralFailure;
  }

  async init(options: AudioProcessorOptions): Promise<void> {
    this.graph?.destroy();
    this.graph = await VoiceGraph.create(options.track, this.config, {
      source: 'call',
      ...(this.onNeuralFailure ? { onNeuralFailure: this.onNeuralFailure } : {}),
    });
    this.processedTrack = this.graph.outputTrack;
  }

  async restart(options: AudioProcessorOptions): Promise<void> {
    // O dispositivo mudou: a faixa de entrada nova entra no mesmo grafo, sem refazer a faixa publicada.
    if (this.graph) {
      this.graph.attachInput(options.track);
      return;
    }
    await this.init(options);
  }

  async destroy(): Promise<void> {
    this.graph?.destroy();
    this.graph = null;
    delete this.processedTrack;
  }

  setConfig(config: VoiceProcessingConfig): void {
    this.config = config;
    void this.graph?.applyConfig(config);
  }
}
