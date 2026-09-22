import { captureConstraintsFor } from './processingConfig';
import { VoiceGraph } from './voiceGraph';
import { clearVoiceMeter } from './voiceMeter';
import { voiceSettingsStore } from './voiceSettingsStore';

// O teste de microfone das Configurações: abre o microfone e passa o som pelo MESMO tratamento da chamada (supressão de ruído,
// gate, compressor, volume), então o medidor e a escuta mostram exatamente o que os outros vão ouvir. Mexer nas opções durante
// o teste muda o resultado na hora.

export interface MicPreview {
  stop: () => void;
  setMonitor: (enabled: boolean) => void;
  /** Se o modelo de IA escolhido não pôde ser carregado (o teste segue com a supressão nativa). */
  neuralFailed: () => boolean;
}

export async function startMicPreview(deviceId: string): Promise<MicPreview> {
  const config = voiceSettingsStore.getSnapshot().config;
  const native = captureConstraintsFor(config);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { ...(deviceId === 'default' ? {} : { deviceId: { exact: deviceId } }), ...native, channelCount: 1 },
  });
  const rawTrack = stream.getAudioTracks()[0]!;
  let neuralFailed = false;
  let graph: VoiceGraph;
  try {
    graph = await VoiceGraph.create(rawTrack, config, {
      source: 'test',
      onNeuralFailure: () => {
        neuralFailed = true;
      },
    });
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }

  // Opções mudadas durante o teste: as restrições nativas voltam a valer no microfone e o grafo se reconfigura.
  const unsubscribe = voiceSettingsStore.subscribe(() => {
    const next = voiceSettingsStore.getSnapshot().config;
    void rawTrack.applyConstraints(captureConstraintsFor(next)).catch(() => undefined);
    void graph.applyConfig(next);
  });

  return {
    stop() {
      unsubscribe();
      graph.destroy();
      stream.getTracks().forEach((track) => track.stop());
      clearVoiceMeter('test');
    },
    setMonitor: (enabled) => graph.setMonitor(enabled),
    neuralFailed: () => neuralFailed,
  };
}
