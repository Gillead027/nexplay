import { onRealtimeEvent } from '../realtime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ConnectionQuality,
  ConnectionState,
  LocalAudioTrack,
  LocalParticipant,
  LocalVideoTrack,
  Participant,
  RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TrackPublication,
  VideoPresets,
  type AudioCaptureOptions,
  type AudioProcessorOptions,
  type ScreenShareCaptureOptions,
  type TrackProcessor,
  type TrackPublishOptions,
} from 'livekit-client';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  DEAFENED_ATTRIBUTE,
  MIC_MUTED_ATTRIBUTE,
  MUSIC_BOT_DISPLAY_NAME,
  MUSIC_BOT_IDENTITY,
  parseParticipantMetadata,
  SOUNDBOARD_ANNOUNCE_TOPIC,
  VOICE_CHAT_TOPIC,
  type Activity,
  type ChatMessage,
  type SoundboardAnnouncement,
  type SoundboardSound,
  type VoiceChannel,
} from '@nexplay/shared';
import { api } from '../api';
import { getOutputVolume } from '../appearancePrefs';
import { captureConstraintsFor, type VoiceProcessingConfig } from '../audio/processingConfig';
import { NexPlayVoiceProcessor } from '../audio/voiceGraph';
import { clearVoiceMeter } from '../audio/voiceMeter';
import { useVoiceSettings, voiceSettingsStore } from '../audio/voiceSettingsStore';
import { deviceAddedMessage, deviceLostMessage, diffDevices, selectionLost, type DeviceKind, type DeviceLite } from '../deviceChanges';
import { describeMediaError, isPermissionDenied, type MediaAccessKind } from '../mediaAccess';
import { isMicShownMuted } from '../micState';
import { routeVoiceChatInput } from '../musicCommandRouting';
import {
  playJoinSound,
  playLeaveSound,
  playMessageSound,
  playMicMuteSound,
  playMicUnmuteSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
} from '../sounds';

export type ShareQuality = '720p30' | '720p60' | '1080p60';
import type { InputMode } from '../audio/processingConfig';
export type { InputMode, MicProfile } from '../audio/processingConfig';

const PTT_KEY_KEY = 'np:ptt-key';
const DEFAULT_PTT_KEY = 'ControlRight';

function loadPttKey(): string {
  return localStorage.getItem(PTT_KEY_KEY) || DEFAULT_PTT_KEY;
}

// As restrições de captura do navegador que valem agora. Se a rede neural escolhida não pôde ser carregada, cai para a
// supressão nativa (senão o microfone ficaria sem nenhuma supressão sem a pessoa saber).
function nativeCaptureConstraints(config: VoiceProcessingConfig, neuralFailed: boolean) {
  const constraints = captureConstraintsFor(config);
  return neuralFailed && (config.noiseLevel === 'high' || config.noiseLevel === 'max') ? { ...constraints, noiseSuppression: true } : constraints;
}

// echoCancellation/noiseSuppression/autoGainControl são DSP de voz — aplicados
// no áudio do sistema/aba (jogo, música, vídeo), eles abafam e comprimem o som
// exatamente como um microfone de telefone, o efeito de "dentro de uma caixa"
// que estava sendo reportado. Áudio de tela não é voz, então desligamos os três.
//
// restrictOwnAudio é uma constraint real do Chromium (suportada no Windows a
// partir do Electron 44): filtra do áudio capturado por loopback qualquer som
// que tenha se originado do NOSSO PRÓPRIO app — inclui a voz de quem estiver
// na call tocando pelos alto-falantes de quem compartilha. É o motivo de
// alguém ouvir a própria voz (ou a de outros) voltando pela transmissão de
// quem compartilha: sem isso, o loopback pega literalmente tudo que sai pelo
// áudio do sistema, call incluída. Com isso, só o conteúdo real da tela
// compartilhada (jogo, vídeo, música) deveria ser capturado.
const SCREEN_SHARE_AUDIO_CAPTURE = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  restrictOwnAudio: true,
} as AudioCaptureOptions & { restrictOwnAudio?: boolean };

// audioPreset padrão do LiveKit pra qualquer publicação de áudio é otimizado
// pra voz (bitrate baixo); música/jogo precisa de bitrate de música de
// verdade — 320kbps é o teto prático do Opus estéreo (bem acima disso não
// tem ganho perceptível, o codec já fica transparente bem antes) — e dtx
// (que trata trechos "quietos" como silêncio e para de mandar dados) corta
// partes baixas de música, então fica desligado aqui.
const SCREEN_SHARE_AUDIO_PUBLISH = {
  audioPreset: { maxBitrate: 320_000 },
  dtx: false,
  red: true,
} as const;

// Reforça, no próprio RTCRtpSender (o padrão WebRTC, não só a dica do captureStream), que sob pressão o codificador
// deve priorizar manter os quadros por segundo — reduzindo a resolução antes de deixar a transmissão travar. Sem
// isso o navegador tende ao padrão oposto (segurar a resolução) para conteúdo de tela.
// O DOM lib do TypeScript ainda não conhece este campo, embora todo navegador com WebRTC o suporte de verdade.
type EncodingWithDegradation = RTCRtpEncodingParameters & { degradationPreference?: 'maintain-framerate' | 'maintain-resolution' | 'balanced' };

function applyFramerateDegradation(track: LocalVideoTrack): void {
  const sender = track.sender;
  if (!sender) return;
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
    for (const layer of parameters.encodings as EncodingWithDegradation[]) layer.degradationPreference = 'maintain-framerate';
    void sender.setParameters(parameters).catch(() => {});
  } catch {
    // Sem isso a transmissão ainda funciona, só sem essa reforço extra — o contentHint 'motion' já ajuda sozinho.
  }
}

const shareSettings: Record<
  ShareQuality,
  { capture: ScreenShareCaptureOptions; publish: TrackPublishOptions }
> = {
  '720p30': {
    capture: { audio: SCREEN_SHARE_AUDIO_CAPTURE, resolution: { width: 1280, height: 720, frameRate: 30 } },
    // simulcast (várias camadas de qualidade) é ótimo pra câmera vista por
    // gente com conexões bem diferentes, mas pra tela compartilhada, com
    // texto/detalhe, só atrapalha — o SFU pode escolher uma camada mais
    // fraca por padrão. Uma única camada de alta qualidade fica mais nítida.
    publish: { videoEncoding: { maxBitrate: 4_000_000, maxFramerate: 30 }, simulcast: false, ...SCREEN_SHARE_AUDIO_PUBLISH },
  },
  '720p60': {
    capture: { audio: SCREEN_SHARE_AUDIO_CAPTURE, resolution: { width: 1280, height: 720, frameRate: 60 } },
    publish: { videoEncoding: { maxBitrate: 7_000_000, maxFramerate: 60 }, simulcast: false, ...SCREEN_SHARE_AUDIO_PUBLISH },
  },
  '1080p60': {
    capture: { audio: SCREEN_SHARE_AUDIO_CAPTURE, resolution: { width: 1920, height: 1080, frameRate: 60 } },
    publish: { videoEncoding: { maxBitrate: 12_000_000, maxFramerate: 60 }, simulcast: false, ...SCREEN_SHARE_AUDIO_PUBLISH },
  },
};

export interface ScreenTrackView {
  id: string;
  participant: Participant;
  publication: TrackPublication;
}

function isScreenShareCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /invalid capture constraints/i.test(message);
}

// Decodifica uma data: URL (base64) direto em ArrayBuffer sem passar pelo
// fetch(). No cliente desktop empacotado, fetch('data:...') é bloqueado pela
// CSP (connect-src não libera o esquema data:, só img-src/font-src liberam
// — e connect-src é quem rege fetch/XHR, não media-src) e falha com
// "Failed to fetch"; decodificar manualmente não depende de rede nem de CSP.
function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

const CONNECT_TIMEOUT_MS = 20_000;

// room.connect()/room.disconnect() não têm timeout próprio — numa rede ruim
// (sem TURN/coturn, ver DISCORD_PARITY_PLAN.md, a negociação ICE pode ficar
// "checking" pra sempre) a promise nunca resolve nem rejeita, e a tela de
// "Entrando na sala..." (controlada por essa mesma promise em Workspace.tsx)
// fica presa pra sempre, sem erro nenhum pra explicar. Isso converte esse
// travamento silencioso num erro de verdade depois de um tempo limite.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// canPublishVideo: false esconde a possibilidade de ligar câmera/tela pra quem não passou pela
// verificação de identidade (ver Configurações > Conta e segurança). É só a primeira camada —
// o servidor também muta a faixa se um cliente adulterado ignorar isso (ver o webhook do
// LiveKit em apps/api/src/index.ts). Omitir o parâmetro mantém o comportamento de sempre.
export function useVoiceRoom(options: { canPublishVideo?: boolean } = {}) {
  const canPublishVideo = options.canPublishVideo ?? true;
  const processorRef = useRef<NexPlayVoiceProcessor | null>(null);
  const neuralFailedRef = useRef(false);
  const applyMicCaptureOptionsRef = useRef<() => Promise<void>>(async () => undefined);
  const onNeuralFailureRef = useRef<() => void>(() => undefined);
  const [room] = useState(() => {
    const config = voiceSettingsStore.getSnapshot().config;
    // O tratamento de áudio (supressão de ruído por IA, gate de sensibilidade, compressor, volume) roda dentro deste
    // processador; o LiveKit publica a saída dele no lugar do microfone cru.
    const processor = new NexPlayVoiceProcessor(config, () => onNeuralFailureRef.current());
    processorRef.current = processor;
    return new Room({
      // adaptiveStream reduz a resolução recebida com base no tamanho do
      // elemento <video> na tela — útil pra economizar banda, mas troca
      // nitidez por isso, e foi apontado como causa da imagem borrada.
      adaptiveStream: false,
      dynacast: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: { ...nativeCaptureConstraints(config, false), channelCount: 1 },
    });
  });
  const [currentChannel, setCurrentChannel] = useState<VoiceChannel | null>(null);
  useEffect(() => onRealtimeEvent((event) => {
    if (event.type === 'VOICE_CHANNEL_UPDATE') {
      setCurrentChannel((current) => current?.id === event.channel.id && current.serverId === event.serverId ? event.channel : current);
    }
  }), []);

  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  // Qualidade da conexão desta pessoa com a chamada, medida pelo servidor de voz (perda de pacotes, atraso...).
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(ConnectionQuality.Unknown);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [speakers, setSpeakers] = useState<Set<string>>(new Set());
  const [screenTracks, setScreenTracks] = useState<ScreenTrackView[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [soundboardEvent, setSoundboardEvent] = useState<
    (SoundboardAnnouncement & { id: number; fromName: string }) | null
  >(null);
  const soundboardEventCounter = useRef(0);
  const [error, setErrorMessage] = useState('');
  // Quando o erro é uma permissão negada, o aviso ganha o atalho pras configurações do sistema.
  const [errorAction, setErrorAction] = useState<'microphone' | 'camera' | null>(null);
  const setError = useCallback((message: string) => {
    setErrorMessage(message);
    setErrorAction(null);
  }, []);
  const reportMediaError = useCallback(async (mediaError: unknown, kind: MediaAccessKind, suffix = '') => {
    const message = await describeMediaError(mediaError, kind);
    setErrorMessage(suffix ? `${message} ${suffix}` : message);
    setErrorAction(kind !== 'screen' && isPermissionDenied(mediaError) ? kind : null);
  }, []);
  // Aviso que não é erro: um aparelho foi conectado ou o escolhido sumiu.
  const [notice, setNotice] = useState('');
  // Se o modelo de IA de supressão de ruído não carregar, a chamada segue com a supressão nativa do navegador e avisa.
  onNeuralFailureRef.current = () => {
    if (neuralFailedRef.current) return;
    neuralFailedRef.current = true;
    setNotice('Não foi possível carregar a supressão de ruído por IA; usando a do navegador no lugar.');
    void applyMicCaptureOptionsRef.current();
  };
  const [deafened, setDeafened] = useState(false);
  // Mute de verdade: só muda quando a pessoa clica no microfone (ou ensurdece).
  // O track do microfone liga e desliga sozinho no push-to-talk e na
  // sensibilidade de entrada, então ele não serve pra decidir o ícone de mutado.
  const [userMuted, setUserMuted] = useState(false);
  const userMutedRef = useRef(false);
  const updateUserMuted = useCallback((muted: boolean) => {
    userMutedRef.current = muted;
    setUserMuted(muted);
  }, []);
  const [screenEnabled, setScreenEnabled] = useState(false);
  // Captura de áudio do sistema (loopback) pega tudo que sai pelo alto-falante
  // de quem compartilha — incluindo a voz dos outros que o próprio app está
  // tocando pra ela. Não dá pra filtrar isso no Windows sem um driver de
  // áudio virtual, então a saída é mutar localmente (só pra quem compartilha)
  // enquanto o áudio do sistema estiver indo junto, senão vaza de volta.
  const [shareAudioActive, setShareAudioActive] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [canPlaybackAudio, setCanPlaybackAudio] = useState(true);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState('default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('default');
  const [selectedCameraId, setSelectedCameraId] = useState('default');
  // O modo de entrada (Voz ativa ou push-to-talk) e os tratamentos de áudio ficam no armazém de configurações de voz.
  const { inputMode, config: processingConfig } = useVoiceSettings();
  const [pttKey, setPttKeyState] = useState(() => loadPttKey());
  const [pttActive, setPttActive] = useState(false);
  const inputModeRef = useRef(inputMode);
  const pttKeyRef = useRef(pttKey);
  const deafenedRef = useRef(false);
  // Trava contra chamadas concorrentes de connect() — clicar de novo no
  // canal de voz (ex.: voltando de um canal de texto) enquanto uma tentativa
  // anterior ainda está em andamento faria dois room.connect()/disconnect()
  // simultâneos brigarem pelo mesmo Room, um jeito conhecido de travar o SDK
  // sem erro nenhum. Um clique repetido enquanto já está conectando é
  // simplesmente ignorado.
  const connectingRef = useRef(false);
  // Última atividade conhecida (jogo/mídia), reportada pelo app desktop —
  // guardada aqui pra poder ser aplicada assim que uma conexão é aberta,
  // já que o metadata inicial do token sempre chega com activity: null (o
  // servidor não tem como saber o que está rodando na sua máquina).
  const lastActivityRef = useRef<Activity | null>(null);
  // Suprime os sons de entrada/saída pra quem já estava no canal antes de
  // você conectar — sem isso, entrar numa call cheia tocaria um bipe pra
  // cada pessoa já presente, tudo de uma vez.
  const suppressPresenceSoundsRef = useRef(true);
  inputModeRef.current = inputMode;
  pttKeyRef.current = pttKey;
  deafenedRef.current = deafened;

  // As opções de captura do microfone: restrições nativas do navegador (eco, ganho, supressão padrão) e som mono. O processador
  // NÃO vai aqui: o LiveKit cria o microfone sem contexto de áudio e tenta anexar o processador na hora, o que falha ("Audio
  // context needs to be set"). Ele é anexado logo depois da publicação (onLocalTrackPublished), quando o contexto já existe.
  const currentMicCaptureOptions = useCallback(
    () => ({
      ...nativeCaptureConstraints(voiceSettingsStore.getSnapshot().config, neuralFailedRef.current),
      channelCount: 1,
    }),
    [],
  );

  // Publica o mute de verdade pros outros verem na lista de canais deles (ensurdecer
  // também conta como mutado, igual no Discord).
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) return;
    void room.localParticipant
      .setAttributes({ [MIC_MUTED_ATTRIBUTE]: deafened || userMuted ? '1' : '0', [DEAFENED_ATTRIBUTE]: deafened ? '1' : '0' })
      .catch(() => {});
  }, [connectionState, deafened, userMuted, room]);

  const syncRoom = useCallback(() => {
    const everyone: Participant[] = [
      room.localParticipant,
      ...Array.from(room.remoteParticipants.values()),
    ];
    setParticipants(everyone);
    setScreenEnabled(room.localParticipant.isScreenShareEnabled);
    setCameraEnabled(room.localParticipant.isCameraEnabled);
    setCanPlaybackAudio(room.canPlaybackAudio);

    const screens: ScreenTrackView[] = [];
    for (const participant of everyone) {
      for (const publication of participant.trackPublications.values()) {
        const isVideoSource =
          publication.source === Track.Source.ScreenShare || publication.source === Track.Source.Camera;
        if (isVideoSource && publication.track) {
          screens.push({
            id: `${participant.identity}-${publication.trackSid}`,
            participant,
            publication,
          });
        }
      }
    }
    setScreenTracks(screens);
  }, [room]);

  useEffect(() => {
    const removeSpeaker = (identity: string) => {
      setSpeakers((current) => {
        if (!current.has(identity)) return current;
        const next = new Set(current);
        next.delete(identity);
        return next;
      });
    };
    const onActiveSpeakers = (active: Participant[]) => {
      setSpeakers(new Set(active.map((participant) => participant.identity)));
    };
    const onData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic === SOUNDBOARD_ANNOUNCE_TOPIC && participant) {
        try {
          const announcement = JSON.parse(new TextDecoder().decode(payload)) as SoundboardAnnouncement;
          if (typeof announcement.soundId === 'string' && typeof announcement.soundName === 'string') {
            soundboardEventCounter.current += 1;
            setSoundboardEvent({
              ...announcement,
              id: soundboardEventCounter.current,
              fromName: participant.name || participant.identity,
            });
          }
        } catch {
          // Ignora pacotes malformados — o áudio já toca independente disso.
        }
        return;
      }
      if (topic !== VOICE_CHAT_TOPIC || !participant) return;
      try {
        const received = JSON.parse(new TextDecoder().decode(payload)) as ChatMessage;
        if (
          typeof received.id === 'string' &&
          typeof received.text === 'string' &&
          received.text.length <= CHAT_MESSAGE_MAX_LENGTH
        ) {
          const message: ChatMessage = {
            id: received.id,
            senderId: participant.identity,
            senderName: participant.name || participant.identity,
            text: received.text,
            sentAt: Date.now(),
          };
          setMessages((current) => [...current.slice(-99), message]);
          playMessageSound(getOutputVolume());
        }
      } catch {
        // Ignora pacotes de dados que não pertencem ao chat.
      }
    };
    const onStateChanged = (state: ConnectionState) => {
      setConnectionState(state);
      // A medição vale para a chamada que acabou de começar ou terminar; a próxima leitura chega por evento.
      if (state !== ConnectionState.Connected) setConnectionQuality(ConnectionQuality.Unknown);
      else setConnectionQuality(room.localParticipant.connectionQuality);
    };
    const onConnectionQuality = (quality: ConnectionQuality, participant: Participant) => {
      if (participant.isLocal) setConnectionQuality(quality);
    };
    const onMediaError = (mediaError: Error) => {
      if (isScreenShareCancelled(mediaError)) return;
      void describeMediaError(mediaError).then(setError);
    };
    const onParticipantConnected = () => {
      syncRoom();
      if (!suppressPresenceSoundsRef.current) playJoinSound(getOutputVolume());
    };
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      removeSpeaker(participant.identity);
      syncRoom();
      if (!suppressPresenceSoundsRef.current) playLeaveSound(getOutputVolume());
    };
    const onTrackUnsubscribed = (
      _track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (publication.source === Track.Source.Microphone) removeSpeaker(participant.identity);
      syncRoom();
    };
    const onTrackMuted = (publication: TrackPublication, participant: Participant) => {
      if (publication.source === Track.Source.Microphone) removeSpeaker(participant.identity);
      syncRoom();
    };
    // Cobre o caso de parar o compartilhamento pela barra nativa do Windows/
    // navegador em vez do nosso botão — sem isso, o mudo ficava travado. É
    // também o único lugar que toca o som de "parar transmissão": tanto o
    // botão quanto a barra nativa acabam disparando este mesmo evento, então
    // tocar o som aqui (em vez de no botão também) evita ele tocar em dobro.
    // O tratamento de áudio se prende ao microfone publicado (setProcessor troca o que o LiveKit envia). Precisa ser refeito a cada
    // publicação, porque reconectar cria um microfone novo. Troca de dispositivo NÃO passa por aqui: o LiveKit chama restart() do
    // processador. Se não der para anexar, o microfone segue sem o tratamento e a pessoa é avisada (nunca fica mudo por isso).
    const onLocalTrackPublished = (publication: TrackPublication) => {
      if (publication.source !== Track.Source.Microphone) return;
      const track = publication.track;
      const processor = processorRef.current;
      if (!(track instanceof LocalAudioTrack) || !processor || track.getProcessor() === processor) return;
      track.setProcessor(processor).catch((error: unknown) => {
        console.warn('Não foi possível aplicar o tratamento de áudio', error);
        setNotice('Não foi possível aplicar o tratamento de áudio; o microfone segue sem ele.');
      });
    };
    const onLocalTrackUnpublished = (publication: TrackPublication) => {
      if (publication.source === Track.Source.ScreenShare) {
        playScreenShareStopSound(getOutputVolume());
      }
      if (publication.source === Track.Source.ScreenShare || publication.source === Track.Source.ScreenShareAudio) {
        setShareAudioActive(false);
      }
      syncRoom();
    };
    room
      .on(RoomEvent.ParticipantConnected, onParticipantConnected)
      .on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
      .on(RoomEvent.ParticipantMetadataChanged, syncRoom)
      .on(RoomEvent.ParticipantAttributesChanged, syncRoom)
      .on(RoomEvent.TrackSubscribed, syncRoom)
      .on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      .on(RoomEvent.TrackMuted, onTrackMuted)
      .on(RoomEvent.TrackUnmuted, syncRoom)
      .on(RoomEvent.LocalTrackPublished, syncRoom)
      .on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
      .on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)
      .on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers)
      .on(RoomEvent.DataReceived, onData)
      .on(RoomEvent.ConnectionStateChanged, onStateChanged)
      .on(RoomEvent.ConnectionQualityChanged, onConnectionQuality)
      .on(RoomEvent.MediaDevicesError, onMediaError)
      .on(RoomEvent.AudioPlaybackStatusChanged, syncRoom);

    return () => {
      room.removeAllListeners();
      void room.disconnect();
      void processorRef.current?.destroy();
      clearVoiceMeter('call');
    };
  }, [room, syncRoom]);

  // Publica a atividade (jogo/mídia) no próprio metadata do participante —
  // setMetadata dispara ParticipantMetadataChanged pra todo mundo na sala
  // (o listener já registrado acima chama syncRoom sozinho), sem precisar
  // de nenhum canal separado pra isso.
  const applyActivity = useCallback(
    (activity: Activity | null) => {
      lastActivityRef.current = activity;
      if (room.state !== ConnectionState.Connected) return;
      const current = parseParticipantMetadata(room.localParticipant.metadata);
      if (!current || current.participantType !== 'HUMAN') return;
      void room.localParticipant.setMetadata(JSON.stringify({ ...current, activity }));
    },
    [room],
  );

  useEffect(() => {
    // A primeira detecção pode acontecer antes deste efeito montar (ex.:
    // alguém que já estava com o Spotify tocando antes mesmo da janela
    // abrir) — nesse caso o "push" via onActivityChanged já passou e se
    // perdeu no ar, então também puxamos o valor atual explicitamente aqui.
    void window.desktop?.getCurrentActivity?.().then((activity) => applyActivity(activity ?? null));
    return window.desktop?.onActivityChanged?.(applyActivity);
  }, [applyActivity]);

  // Aparelho escolhido que sumiu (fone desconectado, câmera removida): volta pro padrão do
  // sistema e avisa. Aparelho novo: só avisa, sem trocar a escolha da pessoa por conta própria.
  const knownDevicesRef = useRef<Record<DeviceKind, DeviceLite[] | null>>({ audioinput: null, audiooutput: null, videoinput: null });
  const selectedDeviceRef = useRef<Record<DeviceKind, string>>({ audioinput: 'default', audiooutput: 'default', videoinput: 'default' });
  selectedDeviceRef.current = { audioinput: selectedMicId, audiooutput: selectedSpeakerId, videoinput: selectedCameraId };
  const reactToDeviceChange = useCallback(
    (kind: DeviceKind, devices: MediaDeviceInfo[]) => {
      const list = devices.map(({ deviceId, label }) => ({ deviceId, label }));
      const { added } = diffDevices(knownDevicesRef.current[kind], list);
      knownDevicesRef.current[kind] = list;
      let message = '';
      if (selectionLost(selectedDeviceRef.current[kind], list)) {
        if (kind === 'audioinput') setSelectedMicId('default');
        else if (kind === 'audiooutput') setSelectedSpeakerId('default');
        else setSelectedCameraId('default');
        void room.switchActiveDevice(kind, 'default').catch(() => {});
        message = deviceLostMessage(kind);
      } else if (added[0]) {
        message = deviceAddedMessage(kind, added[0]);
      }
      // Fora de uma call ninguém está usando o aparelho: a escolha é acertada em silêncio.
      if (message && room.state === ConnectionState.Connected) setNotice(message);
    },
    [room],
  );

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 10_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshDevices = useCallback(async () => {
    const [inputs, outputs, cameras] = await Promise.allSettled([
      Room.getLocalDevices('audioinput'),
      Room.getLocalDevices('audiooutput'),
      Room.getLocalDevices('videoinput'),
    ]);
    // Cada dispositivo é buscado de forma independente: se a câmera falhar
    // (sem webcam, ou em uso por outro app), microfone e saída de áudio
    // continuam sendo preenchidos normalmente.
    if (inputs.status === 'fulfilled') {
      setAudioInputs(inputs.value);
      reactToDeviceChange('audioinput', inputs.value);
    }
    if (outputs.status === 'fulfilled') {
      setAudioOutputs(outputs.value);
      reactToDeviceChange('audiooutput', outputs.value);
    }
    if (cameras.status === 'fulfilled') {
      setVideoInputs(cameras.value);
      reactToDeviceChange('videoinput', cameras.value);
    }
  }, [room, reactToDeviceChange]);

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices?.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    if (connectionState !== ConnectionState.Connected || inputMode !== 'ptt') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== pttKeyRef.current || pttActive || userMutedRef.current || deafenedRef.current) return;
      setPttActive(true);
      void room.localParticipant
        .setMicrophoneEnabled(true, currentMicCaptureOptions())
        .then(syncRoom);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== pttKeyRef.current) return;
      setPttActive(false);
      void room.localParticipant.setMicrophoneEnabled(false).then(syncRoom);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [connectionState, inputMode, pttActive, room, syncRoom]);

  const connect = useCallback(
    async (channel: VoiceChannel) => {
      if (
        currentChannel?.id === channel.id &&
        room.state === ConnectionState.Connected
      ) {
        return;
      }
      if (connectingRef.current) return;
      connectingRef.current = true;

      setError('');
      setConnectionState(ConnectionState.Connecting);
      try {
        if (room.state !== ConnectionState.Disconnected) {
          await withTimeout(room.disconnect(), CONNECT_TIMEOUT_MS, 'Não foi possível sair do canal anterior. Tente de novo.');
        }
        // Trocar de canal de voz (sem passar pelo disconnect() explícito) deixava participantes e transmissões do canal
        // ANTERIOR na tela por um instante — e, se alguém com a mesma identidade estivesse nos dois canais, o áudio de uma
        // transmissão de tela que você estava assistindo lá podia continuar tocando até o próximo syncRoom(). Limpa aqui,
        // igual ao disconnect() explícito, para nunca depender só da entrada no canal novo pra isso sumir.
        setParticipants([]);
        setSpeakers(new Set());
        setScreenTracks([]);
        setMessages([]);
        setDeafened(false);
        updateUserMuted(false);
        const credentials = await api.getLiveKitToken(channel.serverId, channel.id);
        suppressPresenceSoundsRef.current = true;
        await withTimeout(
          room.connect(credentials.url, credentials.token, { autoSubscribe: true }),
          CONNECT_TIMEOUT_MS,
          'A conexão com o canal de voz demorou demais. Verifique sua rede e tente de novo.',
        );
        setTimeout(() => {
          suppressPresenceSoundsRef.current = false;
        }, 1_500);
        setCurrentChannel(channel);
        try {
          await room.localParticipant.setMicrophoneEnabled(
            true,
            currentMicCaptureOptions(),
          );
          if (inputModeRef.current === 'ptt') {
            await room.localParticipant.setMicrophoneEnabled(false);
          }
          void refreshDevices();
        } catch (mediaError) {
          // O microfone não abriu de verdade: o ícone precisa mostrar isso, e clicar nele tenta de novo.
          updateUserMuted(true);
          await reportMediaError(mediaError, 'microphone', 'Você entrou com o microfone desligado.');
        }
        syncRoom();
        // O token sempre chega com activity: null (o servidor não sabe o que
        // está rodando na sua máquina) — aplica a última atividade conhecida
        // assim que a conexão abre, senão ela só apareceria pros outros na
        // próxima vez que o app desktop detectasse uma mudança.
        applyActivity(lastActivityRef.current);
        // Toca só agora, depois do mic já publicado (ou já ter desistido dele)
        // — é o mesmo ponto em que a tela de "Entrando na sala..." some, então
        // o som acompanha o momento real em que você está dentro, em vez de
        // disparar cedo enquanto a UI ainda mostra carregando. Isso também
        // cobre troca de canal, que passa por aqui de novo.
        playJoinSound(getOutputVolume());
      } catch (connectError) {
        await room.disconnect().catch(() => {});
        setCurrentChannel(null);
        setError(
          connectError instanceof Error
            ? connectError.message
            : 'Não foi possível entrar no canal de voz.',
        );
      } finally {
        connectingRef.current = false;
      }
    },
    [currentChannel, room, syncRoom, refreshDevices, applyActivity, updateUserMuted],
  );

  const disconnect = useCallback(async () => {
    const wasConnected = Boolean(currentChannel);
    await room.disconnect();
    // Só depois de desconectar de verdade — soar isso antes fazia o áudio
    // "confirmar a saída" enquanto você ainda estava tecnicamente na sala.
    if (wasConnected) playLeaveSound(getOutputVolume());
    setCurrentChannel(null);
    setParticipants([]);
    setMessages([]);
    setSpeakers(new Set());
    setDeafened(false);
    updateUserMuted(false);
    setScreenEnabled(false);
    setCameraEnabled(false);
    setScreenTracks([]);
  }, [currentChannel, room, syncRoom]);

  const toggleMicrophone = useCallback(async () => {
    if (deafened) return;
    setError('');
    const nextMuted = !userMutedRef.current;
    try {
      // No push-to-talk o microfone só abre enquanto a tecla está apertada:
      // desmutar só devolve esse direito, não abre o microfone.
      const transmit = !nextMuted && inputModeRef.current !== 'ptt';
      await room.localParticipant.setMicrophoneEnabled(transmit, transmit ? currentMicCaptureOptions() : undefined);
      updateUserMuted(nextMuted);
      (nextMuted ? playMicMuteSound : playMicUnmuteSound)(getOutputVolume());
      syncRoom();
    } catch (mediaError) {
      await reportMediaError(mediaError, 'microphone');
    }
  }, [deafened, room, syncRoom, updateUserMuted]);

  const toggleDeafen = useCallback(async () => {
    setError('');
    const next = !deafened;
    try {
      if (next) {
        await room.localParticipant.setMicrophoneEnabled(false);
      } else if (!userMutedRef.current && inputModeRef.current !== 'ptt') {
        await room.localParticipant.setMicrophoneEnabled(
          true,
          currentMicCaptureOptions(),
        );
      }
      setDeafened(next);
      syncRoom();
    } catch (mediaError) {
      await reportMediaError(mediaError, 'microphone');
    }
  }, [deafened, room, syncRoom]);

  const setInputMode = useCallback(
    (mode: InputMode) => {
      voiceSettingsStore.setInputMode(mode);
      if (mode === 'voice' && connectionState === ConnectionState.Connected && !userMutedRef.current && !deafenedRef.current) {
        void room.localParticipant
          .setMicrophoneEnabled(true, currentMicCaptureOptions())
          .then(syncRoom);
      } else if (mode === 'ptt' && connectionState === ConnectionState.Connected) {
        void room.localParticipant.setMicrophoneEnabled(false).then(syncRoom);
      }
    },
    [connectionState, room, syncRoom, currentMicCaptureOptions],
  );

  const setPttKeyBinding = useCallback((code: string) => {
    localStorage.setItem(PTT_KEY_KEY, code);
    setPttKeyState(code);
  }, []);

  // Reaplica ao microfone já publicado as restrições nativas (eco, ganho, supressão padrão), sem reconectar.
  const applyMicCaptureOptions = useCallback(async () => {
    const constraints = nativeCaptureConstraints(voiceSettingsStore.getSnapshot().config, neuralFailedRef.current);
    room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...constraints };
    const microphone = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (microphone instanceof LocalAudioTrack) {
      try {
        await microphone.applyConstraints(constraints);
        setError('');
      } catch (mediaError) {
        await reportMediaError(mediaError, 'microphone');
      }
    }
  }, [room]);

  applyMicCaptureOptionsRef.current = applyMicCaptureOptions;

  // Qualquer mudança nas opções de áudio (perfil, supressão, compressor, volume, sensibilidade, modo de entrada) vale na hora
  // para a chamada em andamento: o processador se reconfigura ao vivo e as restrições nativas voltam a valer no microfone.
  useEffect(() => {
    processorRef.current?.setConfig(processingConfig);
  }, [processingConfig]);
  // As restrições nativas só mexem no microfone quando elas próprias mudam (arrastar a sensibilidade não precisa disso).
  const nativeConstraintsKey = JSON.stringify(captureConstraintsFor(processingConfig));
  useEffect(() => {
    void applyMicCaptureOptions();
  }, [nativeConstraintsKey, applyMicCaptureOptions]);

  const setMicrophoneDevice = useCallback(
    async (deviceId: string) => {
      setSelectedMicId(deviceId);
      await room.switchActiveDevice('audioinput', deviceId);
    },
    [room],
  );

  const setSpeakerDevice = useCallback(
    async (deviceId: string) => {
      setSelectedSpeakerId(deviceId);
      await room.switchActiveDevice('audiooutput', deviceId);
    },
    [room],
  );

  const setCameraDevice = useCallback(
    async (deviceId: string) => {
      setSelectedCameraId(deviceId);
      await room.switchActiveDevice('videoinput', deviceId);
    },
    [room],
  );

  const toggleCamera = useCallback(async () => {
    setError('');
    // Só bloqueia ao LIGAR — desligar a própria câmera nunca deve ficar preso atrás disso.
    if (!room.localParticipant.isCameraEnabled && !canPublishVideo) {
      setError('Verifique sua identidade em Configurações > Conta e segurança pra usar a câmera.');
      return;
    }
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled, {
        resolution: VideoPresets.h1080.resolution,
      }, {
        videoEncoding: VideoPresets.h1080.encoding,
        simulcast: true,
      });
      syncRoom();
    } catch (mediaError) {
      await reportMediaError(mediaError, 'camera');
    }
  }, [room, syncRoom, canPublishVideo]);

  const toggleScreenShare = useCallback(
    async (quality: ShareQuality, shareAudio = true) => {
      setError('');
      // Só bloqueia ao LIGAR — parar de compartilhar nunca deve ficar preso atrás disso.
      if (!room.localParticipant.isScreenShareEnabled && !canPublishVideo) {
        setError('Verifique sua identidade em Configurações > Conta e segurança pra compartilhar a tela.');
        return;
      }
      try {
        if (room.localParticipant.isScreenShareEnabled) {
          await room.localParticipant.setScreenShareEnabled(false);
          setShareAudioActive(false);
        } else {
          const settings = shareSettings[quality];
          await room.localParticipant.setScreenShareEnabled(
            true,
            { ...settings.capture, audio: shareAudio ? SCREEN_SHARE_AUDIO_CAPTURE : false },
            settings.publish,
          );
          // "motion" pede pro navegador priorizar manter os quadros por segundo, mesmo perdendo nitidez, ao
          // codificar. Media com "detail" (nitidez em primeiro lugar): sob pressão de CPU ou de banda — exatamente
          // o caso de jogar E transmitir ao mesmo tempo — o navegador escolhe segurar a resolução e deixar os
          // quadros por segundo despencarem, e é isso que sentia como "agarrada" na transmissão. Medido: com
          // "detail" a 1080p60/12Mbps sob carga pesada, caía para ~15 quadros por segundo; com "motion" (e o
          // degradationPreference logo abaixo, que reforça a mesma prioridade no nível do WebRTC), ~60 quadros por
          // segundo, com a resolução caindo primeiro se precisar. Sharpness só importa de verdade pra texto parado;
          // suavidade importa sempre, e principalmente pra jogos.
          const screenTrack = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
          const mediaStreamTrack = screenTrack?.mediaStreamTrack;
          if (mediaStreamTrack && 'contentHint' in mediaStreamTrack) {
            mediaStreamTrack.contentHint = 'motion';
          }
          if (screenTrack instanceof LocalVideoTrack) applyFramerateDegradation(screenTrack);
          const audioPublished = Boolean(
            room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio),
          );
          setShareAudioActive(audioPublished);
          playScreenShareStartSound(getOutputVolume());
        }
        syncRoom();
      } catch (mediaError) {
        if (!isScreenShareCancelled(mediaError)) {
          await reportMediaError(mediaError, 'screen');
        }
        syncRoom();
      }
    },
    [room, syncRoom, canPublishVideo],
  );

  // Troca a qualidade da transmissão de tela com ela no ar, sem parar nem escolher a tela de novo: a captura passa a entregar a
  // nova resolução e taxa de quadros (o navegador reescala a captura na hora) e o codificador recebe o novo limite de bitrate
  // e de quadros por segundo, sem renegociar com o servidor. Devolve false se o navegador não aceitou a mudança ao vivo.
  const changeShareQuality = useCallback(
    async (quality: ShareQuality): Promise<boolean> => {
      const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
      if (!(track instanceof LocalVideoTrack)) return false;
      const { capture, publish } = shareSettings[quality];
      const resolution = capture.resolution;
      try {
        if (resolution) {
          await track.mediaStreamTrack.applyConstraints({
            width: { ideal: resolution.width },
            height: { ideal: resolution.height },
            ...(resolution.frameRate ? { frameRate: { ideal: resolution.frameRate } } : {}),
          });
        }
        const sender = track.sender;
        const encoding = publish.videoEncoding;
        if (sender && encoding) {
          const parameters = sender.getParameters();
          if (!parameters.encodings || parameters.encodings.length === 0) parameters.encodings = [{}];
          for (const layer of parameters.encodings as EncodingWithDegradation[]) {
            layer.maxBitrate = encoding.maxBitrate;
            if (encoding.maxFramerate) layer.maxFramerate = encoding.maxFramerate;
            // Reafirma a cada troca de qualidade: manter os quadros por segundo vem antes de manter a resolução.
            layer.degradationPreference = 'maintain-framerate';
          }
          await sender.setParameters(parameters);
        }
        return true;
      } catch {
        return false;
      }
    },
    [room],
  );

  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim().slice(0, CHAT_MESSAGE_MAX_LENGTH);
      if (!text || room.state !== ConnectionState.Connected) return;

      setError('');
      try {
        const result = await routeVoiceChatInput({
          text,
          voiceChannelId: currentChannel?.id ?? null,
          sendMusicCommand: (roomId, commandText, textChannelId) =>
            api.sendMusicCommand(currentChannel!.serverId, roomId, commandText, textChannelId),
          publishChatMessage: async (messageText) => {
            const message: ChatMessage = {
              id: crypto.randomUUID(),
              senderId: room.localParticipant.identity,
              senderName: room.localParticipant.name || room.localParticipant.identity,
              text: messageText,
              sentAt: Date.now(),
            };
            await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), {
              reliable: true,
              topic: VOICE_CHAT_TOPIC,
            });
            setMessages((current) => [...current.slice(-99), message]);
          },
        });
        if (result.kind === 'music-command') {
          const feedback: ChatMessage = {
            id: crypto.randomUUID(),
            senderId: MUSIC_BOT_IDENTITY,
            senderName: MUSIC_BOT_DISPLAY_NAME,
            text: result.response.message,
            sentAt: Date.now(),
            ...(result.response.nowPlaying ? { musicCard: result.response.nowPlaying } : {}),
          };
          setMessages((current) => [...current.slice(-99), feedback]);
        }
      } catch (commandError) {
        setError(
          commandError instanceof Error
            ? commandError.message
            : 'Não foi possível encaminhar o comando ao NexMusic.',
        );
        throw commandError;
      }
    },
    [currentChannel?.id, currentChannel?.serverId, room],
  );

  // O áudio chega pra todo mundo via uma track de verdade publicada por
  // quem tocou (LiveKit distribui pra sala inteira) — nada de servidor
  // repassando bytes de áudio. A track fica de pé só enquanto o som toca:
  // publica no início, despublica no "ended". O anúncio (quem tocou o quê)
  // é só cosmético, via canal de dados, igual o chat de voz.
  const playSoundboardSound = useCallback(
    async (sound: SoundboardSound) => {
      if (room.state !== ConnectionState.Connected) return;
      const audioContext = new AudioContext();
      try {
        const arrayBuffer = dataUrlToArrayBuffer(sound.audioDataUrl);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(destination);
        source.connect(audioContext.destination);

        const [track] = destination.stream.getAudioTracks();
        if (!track) throw new Error('Não foi possível preparar o áudio do soundboard.');

        source.onended = () => {
          void room.localParticipant.unpublishTrack(track, true).catch(() => {});
          void audioContext.close().catch(() => {});
        };

        await room.localParticipant.publishTrack(track, {
          name: 'soundboard',
          source: Track.Source.Unknown,
        });

        await room.localParticipant
          .publishData(
            new TextEncoder().encode(
              JSON.stringify({ soundId: sound.id, soundName: sound.name, emoji: sound.emoji } satisfies SoundboardAnnouncement),
            ),
            { reliable: true, topic: SOUNDBOARD_ANNOUNCE_TOPIC },
          )
          .catch(() => {});

        source.start();
      } catch (playError) {
        await audioContext.close().catch(() => {});
        setError(playError instanceof Error ? playError.message : 'Não foi possível tocar esse som.');
      }
    },
    [room],
  );

  const connected = connectionState === ConnectionState.Connected;
  const micMuted = isMicShownMuted({ connected, deafened, userMuted });

  return useMemo(
    () => ({
      room,
      currentChannel,
      connectionState,
      connectionQuality,
      connected,
      participants,
      speakers,
      screenTracks,
      messages,
      error,
      clearError: () => setError(''),
      errorAction,
      notice,
      clearNotice: () => setNotice(''),
      deafened,
      micMuted,
      screenEnabled,
      shareAudioActive,
      cameraEnabled,
      canPlaybackAudio,
      audioInputs,
      audioOutputs,
      videoInputs,
      selectedMicId,
      selectedSpeakerId,
      selectedCameraId,
      inputMode,
      pttKey,
      pttActive,
      setInputMode,
      setPttKeyBinding,
      setMicrophoneDevice,
      setSpeakerDevice,
      setCameraDevice,
      refreshDevices,
      connect,
      disconnect,
      toggleMicrophone,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
      changeShareQuality,
      sendMessage,
      playSoundboardSound,
      soundboardEvent,
      startAudio: () => room.startAudio().then(syncRoom),
    }),
    [
      room,
      currentChannel,
      connectionState,
      connectionQuality,
      connected,
      participants,
      speakers,
      screenTracks,
      messages,
      error,
      errorAction,
      notice,
      deafened,
      micMuted,
      screenEnabled,
      shareAudioActive,
      cameraEnabled,
      canPlaybackAudio,
      audioInputs,
      audioOutputs,
      videoInputs,
      selectedMicId,
      selectedSpeakerId,
      selectedCameraId,
      inputMode,
      pttKey,
      pttActive,
      setInputMode,
      setPttKeyBinding,
      setMicrophoneDevice,
      setSpeakerDevice,
      setCameraDevice,
      refreshDevices,
      connect,
      disconnect,
      toggleMicrophone,
      toggleDeafen,
      toggleCamera,
      toggleScreenShare,
      changeShareQuality,
      sendMessage,
      playSoundboardSound,
      soundboardEvent,
      syncRoom,
    ],
  );
}

export type VoiceRoomController = ReturnType<typeof useVoiceRoom>;
export { LocalParticipant };
