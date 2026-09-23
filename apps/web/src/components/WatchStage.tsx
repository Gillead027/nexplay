import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { LocalVideoTrack, RemoteParticipant, RemoteVideoTrack } from 'livekit-client';
import type { ScreenTrackView } from '../livekit/useVoiceRoom';
import { ChevronIcon, EyeOffIcon, FullscreenIcon, SpeakerIcon } from './Icons';
import { useEscapeLayer } from '../escapeLayers';

export function attachVideo(view: ScreenTrackView, element: HTMLVideoElement | null): (() => void) | undefined {
  const track = view.publication.track;
  if (!element || !(track instanceof RemoteVideoTrack || track instanceof LocalVideoTrack)) return undefined;
  track.attach(element);
  return () => track.detach(element);
}

// Tela cheia do palco. No app desktop é a janela inteira (a API do Chromium não deixa no cliente empacotado); no
// navegador é o elemento do palco.
function useStageFullscreen(stageRef: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleFullscreenChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    let unsubscribeDesktop: (() => void) | undefined;
    if (window.desktop?.getFullscreen) {
      void window.desktop.getFullscreen().then(setFullscreen).catch(() => {});
      unsubscribeDesktop = window.desktop.onFullscreenChanged?.(setFullscreen);
    }
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      unsubscribeDesktop?.();
    };
  }, [stageRef]);

  useEscapeLayer(fullscreen && Boolean(window.desktop?.setFullscreen), () => {
    void window.desktop?.setFullscreen?.(false);
  });

  async function toggle() {
    const stage = stageRef.current;
    if (!stage) return;
    setError('');
    try {
      if (window.desktop?.setFullscreen) {
        const nextFullscreen = !fullscreen;
        await window.desktop.setFullscreen(nextFullscreen);
        setFullscreen(nextFullscreen);
        return;
      }
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await stage.requestFullscreen();
      }
    } catch {
      setError('Não foi possível ativar a tela cheia. Tente novamente.');
    }
  }

  return { fullscreen, error, toggle };
}

/** A transmissão que a pessoa está assistindo: ocupa o palco, sem moldura. Passe o mouse para ver as ações. */
function HeroTile({
  view,
  volume,
  setVolume,
  onStopWatching,
  fullscreen,
  onToggleFullscreen,
}: {
  view: ScreenTrackView;
  volume: number;
  setVolume: (value: number) => void;
  onStopWatching: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const isRemote = view.participant instanceof RemoteParticipant;
  const name = view.participant.name || view.participant.identity;

  // Depende só do id estável, não do objeto `view` (recriado a cada syncRoom() mesmo quando a
  // faixa não muda) — senão o efeito roda de novo em qualquer evento não relacionado da sala
  // (silenciar, entrar/sair, mudança de atividade), forçando um detach+attach que pisca o vídeo.
  useEffect(() => attachVideo(view, videoRef.current), [view.id]);

  return (
    <article className="watch-hero">
      {!ready && <div className="stream-skeleton"><span /><span /><span /></div>}
      <video ref={videoRef} autoPlay playsInline muted={!isRemote} onLoadedMetadata={() => setReady(true)} />
      <span className="watch-live">AO VIVO</span>
      <div className="watch-hero-label">
        <span className="live-dot" />
        {view.participant.isLocal ? 'Sua transmissão' : name}
      </div>
      <div className="watch-hero-actions">
        <button type="button" className="watch-hero-button" onClick={onStopWatching}>
          <EyeOffIcon size={15} /> Sair da transmissão
        </button>
        <button
          type="button"
          className="watch-hero-button icon"
          onClick={onToggleFullscreen}
          aria-pressed={fullscreen}
          aria-label={fullscreen ? 'Sair da tela cheia' : 'Abrir transmissão em tela cheia'}
          title={fullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
        >
          <FullscreenIcon size={16} />
        </button>
      </div>
      {isRemote && (
        <label className="screen-volume" title={`Volume da transmissão: ${volume}%`} onClick={(event) => event.stopPropagation()}>
          <SpeakerIcon size={14} />
          <input
            aria-label={`Volume da transmissão de ${name}`}
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <output>{volume}</output>
        </label>
      )}
    </article>
  );
}

/**
 * Palco de quem está assistindo uma transmissão: a(s) transmissão(ões) em foco e, embaixo, a faixa de
 * participantes (feita por quem chama). A setinha embaixo esconde a faixa e os controles da chamada para a
 * transmissão ganhar o espaço todo; a tela cheia leva o palco inteiro.
 */
export function WatchStage({
  heroes,
  streamVolumes,
  setStreamVolume,
  onStopWatching,
  strip,
  chromeHidden,
  onToggleChrome,
}: {
  heroes: ScreenTrackView[];
  streamVolumes: Record<string, number>;
  setStreamVolume: (identity: string, value: number) => void;
  onStopWatching: (id: string) => void;
  strip: ReactNode;
  chromeHidden: boolean;
  onToggleChrome: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const { fullscreen, error, toggle } = useStageFullscreen(stageRef);
  const toggleLabel = chromeHidden ? 'Mostrar participantes e controles' : 'Esconder participantes e controles';

  return (
    <div className={`watch-stage ${fullscreen ? 'native-fullscreen' : ''} ${chromeHidden ? 'chrome-hidden' : ''}`} ref={stageRef}>
      {error && <div className="fullscreen-error" role="alert">{error}</div>}
      <div className="watch-heroes">
        {heroes.map((view) => (
          <HeroTile
            key={view.id}
            view={view}
            volume={streamVolumes[view.participant.identity] ?? 100}
            setVolume={(value) => setStreamVolume(view.participant.identity, value)}
            onStopWatching={() => onStopWatching(view.id)}
            fullscreen={fullscreen}
            onToggleFullscreen={() => void toggle()}
          />
        ))}
      </div>
      <div className="watch-strip" aria-hidden={chromeHidden || undefined}>
        <div className="watch-strip-inner">{strip}</div>
      </div>
      <button
        type="button"
        className="watch-chrome-tab"
        onClick={onToggleChrome}
        aria-pressed={chromeHidden}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        <ChevronIcon size={14} />
      </button>
    </div>
  );
}
