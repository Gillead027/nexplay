import { useEffect, useRef } from 'react';
import { RemoteAudioTrack, RemoteParticipant, Track, type RemoteTrackPublication } from 'livekit-client';
import { shouldPlayAudioPublication } from '../streamAudio';

interface RemoteAudioSinkProps {
  participant: RemoteParticipant;
  volume: number;
  streamVolume: number;
  outputVolume: number;
  soundboardVolume: number;
  deafened: boolean;
  trackVersion: string;
  // O usuário abriu a transmissão de tela dessa pessoa ("Ver transmissão").
  // Sem isso o áudio da transmissão não é ligado, ver streamAudio.ts.
  watchingStream: boolean;
}

// Tracks de soundboard não têm Source dedicado no LiveKit — publicadas como
// Unknown com name "soundboard" (ver useVoiceRoom.ts, playSoundboardSound).
// Sem esse reconhecimento aqui, elas nunca ganhariam um elemento <audio> e
// ninguém além de quem tocou ouviria o som.
function isSoundboardPublication(publication: RemoteTrackPublication): boolean {
  return publication.source === Track.Source.Unknown && publication.trackName === 'soundboard';
}

export function RemoteAudioSink({
  participant,
  volume,
  streamVolume,
  outputVolume,
  soundboardVolume,
  deafened,
  trackVersion,
  watchingStream,
}: RemoteAudioSinkProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const publications = Array.from(participant.audioTrackPublications.values()) as RemoteTrackPublication[];
    const elements = publications
      .filter((publication) =>
        shouldPlayAudioPublication(
          {
            isMicrophone: publication.source === Track.Source.Microphone,
            isScreenShareAudio: publication.source === Track.Source.ScreenShareAudio,
            isSoundboard: isSoundboardPublication(publication),
          },
          watchingStream,
        ),
      )
      .filter((publication): publication is RemoteTrackPublication & { track: RemoteAudioTrack } => publication.track instanceof RemoteAudioTrack)
      .map((publication) => {
        // Voz, áudio de transmissão de tela e soundboard têm volumes
        // independentes — alguém pode querer ouvir a pessoa falando alto e
        // o jogo dela (ou os sons que ela dispara) mais baixo.
        const perTrackVolume = isSoundboardPublication(publication)
          ? soundboardVolume
          : publication.source === Track.Source.ScreenShareAudio
            ? streamVolume
            : volume;
        const element = publication.track.attach();
        element.autoplay = true;
        element.muted = deafened;
        element.volume = (perTrackVolume / 100) * (outputVolume / 100);
        container.appendChild(element);
        return { element, track: publication.track };
      });

    return () => {
      for (const { element, track } of elements) {
        track.detach(element);
        // Reforço deliberado: mesmo que o detach do LiveKit não pare o áudio a tempo (o elemento vai para um pool
        // reciclado e compartilhado entre faixas — ver track.recycleElement), pausar e limpar o srcObject aqui
        // garante silêncio imediato, sem depender de mais ninguém.
        element.pause();
        element.srcObject = null;
        element.remove();
      }
    };
  }, [participant, volume, streamVolume, outputVolume, soundboardVolume, deafened, trackVersion, watchingStream]);

  return <div ref={containerRef} className="audio-sink" aria-hidden="true" />;
}
