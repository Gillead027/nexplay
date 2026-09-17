import { randomUUID } from 'node:crypto';
import { createStereoSignaling } from './stereoSignaling.js';
import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  type LocalTrackPublication,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  MUSIC_BOT_DISPLAY_NAME,
  MUSIC_BOT_IDENTITY,
  MUSIC_BOT_TRACK_NAME,
  VOICE_CHAT_TOPIC,
  parseParticipantMetadata,
  type BotParticipantMetadata,
  type ChatMessage,
} from '@nexplay/shared';
import { FfmpegAudioSource } from './ffmpegAudioSource.js';
import { YtDlpAudioSource } from './ytDlpAudioSource.js';
import type { PlayableMusicSource } from './musicProvider.js';
import {
  ProgrammaticAudioSource,
  TEST_AUDIO_CHANNELS,
  TEST_AUDIO_SAMPLE_RATE,
} from './programmaticAudioSource.js';

export type MusicLog = (event: string, context: Record<string, string | number>) => void;

export interface PlaybackCallbacks {
  onStarted?: () => void;
  onFinished: () => void;
  onError: (error: Error) => void;
}

export interface MusicPlaybackHandle {
  readonly positionMs: number;
  pause: () => void;
  resume: () => void;
  setVolume: (volume: number) => void;
}

export interface MusicVoiceParticipant {
  readonly connected: boolean;
  connect: () => Promise<void>;
  startTestAudio: (
    initialVolume: number,
    callbacks: PlaybackCallbacks,
  ) => Promise<MusicPlaybackHandle>;
  startLocalFileAudio: (
    filePath: string,
    initialVolume: number,
    callbacks: PlaybackCallbacks,
  ) => Promise<MusicPlaybackHandle>;
  startExternalAudio: (
    playable: PlayableMusicSource,
    initialVolume: number,
    callbacks: PlaybackCallbacks,
  ) => Promise<MusicPlaybackHandle>;
  stopAudio: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

export interface VoiceLifecycleCallbacks {
  onHumansEmpty: () => void;
  onDisconnected: () => void;
}

interface ActiveAudio {
  controller: AbortController;
  fixture: ProgrammaticAudioSource | FfmpegAudioSource | YtDlpAudioSource;
  source: AudioSource;
  track: LocalAudioTrack;
  publication: LocalTrackPublication;
  cleanup?: Promise<void>;
}

interface BotVoiceParticipantOptions {
  roomName: string;
  channelId: string;
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  ffmpegPath: string;
  ytdlpPath: string;
  ytdlpCookiesPath?: string;
  ytdlpProxyUrl?: string;
  ytdlpPluginDir: string;
  ytdlpPotBaseUrl: string;
  log: MusicLog;
  lifecycle: VoiceLifecycleCallbacks;
}

export class BotVoiceParticipant implements MusicVoiceParticipant {
  private readonly room = new Room();
  private activeAudio: ActiveAudio | null = null;
  private intentionalDisconnect = false;
  private signaling: Awaited<ReturnType<typeof createStereoSignaling>> | null = null;

  constructor(private readonly options: BotVoiceParticipantOptions) {
    this.room.on(RoomEvent.ParticipantDisconnected, () => {
      if (this.humanParticipantCount() === 0) this.options.lifecycle.onHumansEmpty();
    });
    this.room.on(RoomEvent.Disconnected, () => {
      if (!this.intentionalDisconnect) this.options.lifecycle.onDisconnected();
    });
  }

  get connected(): boolean {
    return this.room.isConnected;
  }

  private humanParticipantCount(): number {
    return Array.from(this.room.remoteParticipants.values()).filter((participant) => {
      const metadata = parseParticipantMetadata(participant.metadata);
      return metadata?.participantType !== 'BOT';
    }).length;
  }

  private async mintToken(): Promise<string> {
    const metadata: BotParticipantMetadata = {
      app: 'sausixudos',
      participantType: 'BOT',
      botId: MUSIC_BOT_IDENTITY,
    };
    const token = new AccessToken(this.options.apiKey, this.options.apiSecret, {
      identity: MUSIC_BOT_IDENTITY,
      name: MUSIC_BOT_DISPLAY_NAME,
      ttl: '10m',
      metadata: JSON.stringify(metadata),
    });
    token.addGrant({
      room: this.options.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: false,
      canPublishData: true,
    });
    return token.toJwt();
  }

  async connect(): Promise<void> {
    if (this.room.isConnected) return;
    this.intentionalDisconnect = false;
    this.options.log('joining room', {
      room: this.options.roomName,
      channel: this.options.channelId,
    });
    await this.signaling?.close();
    this.signaling = await createStereoSignaling(this.options.livekitUrl);
    try {
      await this.room.connect(this.signaling.url, await this.mintToken(), {
        autoSubscribe: false,
        dynacast: false,
      });
    } catch (error) {
      await this.signaling.close();
      this.signaling = null;
      throw error;
    }
    this.options.log('bot participant connected', {
      room: this.options.roomName,
      channel: this.options.channelId,
    });
    if (this.humanParticipantCount() === 0) {
      queueMicrotask(this.options.lifecycle.onHumansEmpty);
      throw new Error('A sala ficou sem participantes humanos antes da publicação.');
    }
  }

  async startTestAudio(
    initialVolume: number,
    callbacks: PlaybackCallbacks,
  ): Promise<MusicPlaybackHandle> {
    return this.startAudioFixture(new ProgrammaticAudioSource(initialVolume), callbacks);
  }

  async startLocalFileAudio(
    filePath: string,
    initialVolume: number,
    callbacks: PlaybackCallbacks,
  ): Promise<MusicPlaybackHandle> {
    return this.startAudioFixture(
      new FfmpegAudioSource(filePath, this.options.ffmpegPath, initialVolume),
      callbacks,
    );
  }

  async startExternalAudio(
    playable: PlayableMusicSource,
    initialVolume: number,
    callbacks: PlaybackCallbacks,
  ): Promise<MusicPlaybackHandle> {
    if (playable.transport !== 'YTDLP_PIPE') throw new Error('Transporte externo não suportado.');
    return this.startAudioFixture(new YtDlpAudioSource({
      webUrl: playable.input,
      ytdlpPath: this.options.ytdlpPath,
      cookiesPath: this.options.ytdlpCookiesPath ?? '',
      proxyUrl: this.options.ytdlpProxyUrl ?? '',
      ffmpegPath: this.options.ffmpegPath,
      pluginDir: this.options.ytdlpPluginDir,
      potBaseUrl: this.options.ytdlpPotBaseUrl,
      initialVolume,
    }), callbacks);
  }

  private async startAudioFixture(
    fixture: ProgrammaticAudioSource | FfmpegAudioSource | YtDlpAudioSource,
    callbacks: PlaybackCallbacks,
  ): Promise<MusicPlaybackHandle> {
    if (!this.room.localParticipant) throw new Error('SausiMusic não está conectado à sala.');
    if (this.activeAudio) throw new Error('SausiMusic já possui uma track ativa nesta sala.');

    // Buffer padrão do SDK (1000ms): dá margem real contra jitter na entrega
    // de frames. pause()/stopAudio() já chamam source.clearQueue() logo
    // abaixo, que descarta a fila na hora — responsividade de pause não
    // depende de manter esse buffer artificialmente curto, e mantê-lo curto
    // só deixava qualquer variação de timing virar gagueira audível direta.
    const source = new AudioSource(TEST_AUDIO_SAMPLE_RATE, TEST_AUDIO_CHANNELS);
    const track = LocalAudioTrack.createAudioTrack(MUSIC_BOT_TRACK_NAME, source);
    const publishOptions = new TrackPublishOptions({ audioEncoding: { maxBitrate: 256_000n } });
    publishOptions.source = TrackSource.SOURCE_MICROPHONE;
    publishOptions.dtx = false;
    publishOptions.red = false;
    const publication = await this.room.localParticipant.publishTrack(track, publishOptions);
    const active: ActiveAudio = {
      controller: new AbortController(),
      fixture,
      source,
      track,
      publication,
    };
    this.activeAudio = active;
    this.options.log('audio track published', {
      sampleRate: TEST_AUDIO_SAMPLE_RATE, channels: TEST_AUDIO_CHANNELS, maxBitrate: 256_000,
      room: this.options.roomName,
      channel: this.options.channelId,
      track: publication.sid ?? MUSIC_BOT_TRACK_NAME,
    });

    let receivedAudio = false;
    let reportedError = false;
    const reportError = async (error: Error) => {
      if (reportedError || active.controller.signal.aborted) return;
      reportedError = true;
      clearTimeout(startupTimer);
      await this.cleanupAudio(active);
      callbacks.onError(error);
    };
    const startupTimer = setTimeout(() => {
      void reportError(new Error('A fonte não entregou áudio em 25 segundos. Tente novamente depois de verificar a conexão e a autenticação.'));
    }, 25_000);
    active.controller.signal.addEventListener('abort', () => clearTimeout(startupTimer), { once: true });

    void fixture
      .play(
        async ({ data, sampleRate, channels, samplesPerChannel }) => {
          await source.captureFrame(new AudioFrame(data, sampleRate, channels, samplesPerChannel));
          if (!receivedAudio && !active.controller.signal.aborted) {
            receivedAudio = true;
            clearTimeout(startupTimer);
            callbacks.onStarted?.();
          }
        },
        active.controller.signal,
      )
      .then(async (result) => {
        if (result === 'finished' && !receivedAudio) {
          await reportError(new Error('A fonte terminou sem entregar áudio.'));
          return;
        }
        if (result === 'finished') await source.waitForPlayout();
        await this.cleanupAudio(active);
        if (result === 'finished' && !reportedError) callbacks.onFinished();
      })
      .catch(async (error: unknown) => {
        await reportError(error instanceof Error ? error : new Error(String(error)));
      });

    return {
      get positionMs() {
        return fixture.positionMs;
      },
      pause: () => {
        fixture.pause();
        source.clearQueue();
      },
      resume: () => fixture.resume(),
      setVolume: (volume) => fixture.setVolume(volume),
    };
  }

  private cleanupAudio(active: ActiveAudio): Promise<void> {
    active.cleanup ??= (async () => {
      active.controller.abort();
      active.source.clearQueue();
      if (this.activeAudio === active) this.activeAudio = null;
      const participant = this.room.localParticipant;
      if (participant && active.publication.sid) {
        await participant.unpublishTrack(active.publication.sid, false).catch(() => {});
      }
      await active.track.close().catch(() => {});
      await active.source.close().catch(() => {});
      this.options.log('track unpublished', {
        room: this.options.roomName,
        channel: this.options.channelId,
        track: active.publication.sid ?? MUSIC_BOT_TRACK_NAME,
      });
    })();
    return active.cleanup;
  }

  async stopAudio(): Promise<void> {
    const active = this.activeAudio;
    if (active) await this.cleanupAudio(active);
  }

  async sendMessage(text: string): Promise<void> {
    const participant = this.room.localParticipant;
    if (!participant) return;
    const message: ChatMessage = {
      id: randomUUID(),
      senderId: MUSIC_BOT_IDENTITY,
      senderName: MUSIC_BOT_DISPLAY_NAME,
      text: text.slice(0, CHAT_MESSAGE_MAX_LENGTH),
      sentAt: Date.now(),
    };
    await participant
      .publishData(new TextEncoder().encode(JSON.stringify(message)), {
        reliable: true,
        topic: VOICE_CHAT_TOPIC,
      })
      .catch(() => {});
  }

  async disconnect(): Promise<void> {
    this.intentionalDisconnect = true;
    await this.stopAudio();
    if (this.room.isConnected) await this.room.disconnect().catch(() => {});
    await this.signaling?.close();
    this.signaling = null;
    this.options.log('bot disconnected', {
      room: this.options.roomName,
      channel: this.options.channelId,
    });
  }
}
