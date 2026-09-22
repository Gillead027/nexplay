import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { ACCENT_COLORS, MUSIC_BOT_IDENTITY, parseParticipantMetadata } from '@nexplay/shared';
import type { ScreenTrackView } from '../livekit/useVoiceRoom';
import { attachVideo, WatchStage } from './WatchStage';
import { EyeIcon, HeadphonesOffIcon, MicOffIcon, ShareIcon, UserPlusIcon } from './Icons';

export interface StageEntry {
  identity: string;
  name: string;
  isLocal: boolean;
  isBot: boolean;
  // Cor de fundo do quadrado: a cor do perfil da pessoa (ou uma derivada do nome quando não há).
  colorIndex: number;
  muted: boolean;
  // Fone desligado: a pessoa não está ouvindo a call.
  deafened: boolean;
  speaking: boolean;
  camera: ScreenTrackView | null;
}

// Uma transmissão de tela que ainda não está sendo assistida: ganha um quadrado próprio, ao lado dos das pessoas.
interface StreamEntry {
  view: ScreenTrackView;
  name: string;
  isLocal: boolean;
  colorIndex: number;
}

const TILE_GAP = 12;
const MAX_TILE_WIDTH = 1040;
const MIN_TILE_WIDTH = 168;

function colorFromName(name: string): number {
  const sum = Array.from(name).reduce((value, character) => value + character.charCodeAt(0), 0);
  return sum % ACCENT_COLORS.length;
}

function buildEntries(
  participants: (LocalParticipant | RemoteParticipant)[],
  cameras: ScreenTrackView[],
  speakingIds: Set<string>,
  liveMuted: Map<string, boolean>,
  liveDeafened: Map<string, boolean>,
): StageEntry[] {
  const entries = participants.map((participant) => {
    const metadata = parseParticipantMetadata(participant.metadata);
    const isBot = metadata?.participantType === 'BOT' || participant.identity === MUSIC_BOT_IDENTITY;
    const accent = metadata?.participantType === 'HUMAN' ? ACCENT_COLORS.indexOf(metadata.accentColor) : -1;
    const name = participant.name || participant.identity;
    return {
      identity: participant.identity,
      name,
      isLocal: participant.isLocal,
      isBot,
      colorIndex: accent >= 0 ? accent : colorFromName(name),
      muted: !isBot && (liveMuted.get(participant.identity) ?? false),
      deafened: !isBot && (liveDeafened.get(participant.identity) ?? false),
      speaking: speakingIds.has(participant.identity),
      camera: cameras.find((view) => view.participant.identity === participant.identity) ?? null,
    } satisfies StageEntry;
  });
  // Você primeiro, depois quem já estava na sala; o bot de música fica por último.
  return entries.sort((a, b) => Number(b.isLocal) - Number(a.isLocal) || Number(a.isBot) - Number(b.isBot));
}

// Escolhe a quantidade de colunas em que os quadrados 16:9 ficam maiores dentro da área livre.
function bestTileWidth(width: number, height: number, count: number): number {
  let best = 0;
  for (let columns = 1; columns <= Math.max(1, count); columns += 1) {
    const rows = Math.ceil(count / columns);
    let tileWidth = (width - TILE_GAP * (columns - 1)) / columns;
    if ((tileWidth * 9) / 16 * rows + TILE_GAP * (rows - 1) > height) {
      tileWidth = (((height - TILE_GAP * (rows - 1)) / rows) * 16) / 9;
    }
    best = Math.max(best, tileWidth);
  }
  return Math.round(Math.min(MAX_TILE_WIDTH, Math.max(MIN_TILE_WIDTH, best)));
}

function useTileWidth(ref: RefObject<HTMLDivElement | null>, count: number, enabled: boolean): number {
  const [tileWidth, setTileWidth] = useState(MAX_TILE_WIDTH / 2);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return undefined;
    const measure = () => setTileWidth(bestTileWidth(element.clientWidth, element.clientHeight, count));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, count, enabled]);
  return tileWidth;
}

type CopyState = 'idle' | 'copied' | 'failed';

function useInviteCopy(copy: (() => Promise<boolean>) | undefined) {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function run() {
    if (!copy) return;
    let ok = false;
    try {
      ok = await copy();
    } catch {
      ok = false;
    }
    setState(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2400);
  }
  return { state, run };
}

function Tile({
  entry,
  renderAvatar,
  onParticipantContextMenu,
  onOpenProfile,
}: {
  entry: StageEntry;
  renderAvatar: (entry: StageEntry) => ReactNode;
  onParticipantContextMenu: (event: ReactMouseEvent<HTMLElement>, participant: { identity: string; name: string }) => void;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => (entry.camera ? attachVideo(entry.camera, videoRef.current) : undefined), [entry.camera]);

  return (
    <article
      className={`voice-tile tile-color-${entry.colorIndex} ${entry.speaking ? 'speaking' : ''} ${entry.camera ? 'has-video' : ''}`}
      onContextMenu={entry.isLocal ? undefined : (event) => onParticipantContextMenu(event, { identity: entry.identity, name: entry.name })}
    >
      {entry.camera ? (
        <video ref={videoRef} autoPlay playsInline muted={entry.isLocal} />
      ) : (
        <button
          type="button"
          className="voice-tile-avatar"
          disabled={entry.isBot}
          onClick={(event) => onOpenProfile(entry.identity, event)}
          aria-label={entry.isBot ? entry.name : `Ver perfil de ${entry.name}`}
        >
          {renderAvatar(entry)}
        </button>
      )}
      <div className="voice-tile-label">
        {entry.muted && <span className="voice-tile-status" title="Microfone desligado"><MicOffIcon className="voice-tile-muted" size={13} /></span>}
        {entry.deafened && <span className="voice-tile-status" title="Fone desligado: não está ouvindo a call"><HeadphonesOffIcon className="voice-tile-muted voice-tile-deafened" size={13} /></span>}
        <span className="voice-tile-name">{entry.name}</span>
        {entry.isBot && <span className="bot-badge">BOT</span>}
      </div>
    </article>
  );
}

function StreamTile({ entry, onWatch }: { entry: StreamEntry; onWatch: () => void }) {
  const label = entry.isLocal ? 'Ver minha transmissão' : 'Assista à transmissão';
  return (
    <article className={`voice-tile stream-tile tile-color-${entry.colorIndex}`} onClick={onWatch}>
      <ShareIcon className="stream-tile-art" size={64} />
      <span className="watch-live">AO VIVO</span>
      <button type="button" className="stream-watch-button" onClick={(event) => { event.stopPropagation(); onWatch(); }} title={label}>
        <EyeIcon size={16} /> <span>{label}</span>
      </button>
      <div className="voice-tile-label">
        <ShareIcon size={13} />
        <span className="voice-tile-name">{entry.isLocal ? 'Sua transmissão' : entry.name}</span>
      </div>
    </article>
  );
}

export function VoiceStage({
  participants,
  cameras,
  shares,
  watchingIds,
  onWatch,
  onStopWatching,
  streamVolumes,
  setStreamVolume,
  chromeHidden,
  onToggleChrome,
  speakingIds,
  liveMuted,
  liveDeafened,
  channelName,
  renderAvatar,
  onParticipantContextMenu,
  onOpenProfile,
  copyInvite,
}: {
  participants: (LocalParticipant | RemoteParticipant)[];
  cameras: ScreenTrackView[];
  shares: ScreenTrackView[];
  watchingIds: Set<string>;
  onWatch: (id: string) => void;
  onStopWatching: (id: string) => void;
  streamVolumes: Record<string, number>;
  setStreamVolume: (identity: string, value: number) => void;
  // Esconde a faixa de participantes (e, em quem chama, os controles da chamada) enquanto assiste uma transmissão.
  chromeHidden: boolean;
  onToggleChrome: () => void;
  speakingIds: Set<string>;
  liveMuted: Map<string, boolean>;
  liveDeafened: Map<string, boolean>;
  channelName: string;
  renderAvatar: (entry: StageEntry) => ReactNode;
  onParticipantContextMenu: (event: ReactMouseEvent<HTMLElement>, participant: { identity: string; name: string }) => void;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
  // Copia o link de convite do servidor. Só existe para quem pode gerenciar o servidor.
  copyInvite?: (() => Promise<boolean>) | undefined;
}) {
  const entries = useMemo(() => buildEntries(participants, cameras, speakingIds, liveMuted, liveDeafened), [participants, cameras, speakingIds, liveMuted, liveDeafened]);
  const heroes = shares.filter((view) => watchingIds.has(view.id));
  const streams: StreamEntry[] = shares
    .filter((view) => !watchingIds.has(view.id))
    .map((view) => {
      const owner = entries.find((entry) => entry.identity === view.participant.identity);
      const name = view.participant.name || view.participant.identity;
      return { view, name, isLocal: view.participant.isLocal, colorIndex: owner?.colorIndex ?? colorFromName(name) };
    });

  const gridRef = useRef<HTMLDivElement>(null);
  const watching = heroes.length > 0;
  const tileWidth = useTileWidth(gridRef, entries.length + streams.length, !watching);
  const invite = useInviteCopy(copyInvite);
  const alone = entries.length === 1 && streams.length === 0 && !watching;
  const inviteLabel = invite.state === 'copied' ? 'Link copiado!' : invite.state === 'failed' ? 'Não foi possível copiar' : 'Convidar para voz';

  const tiles = (
    <>
      {streams.map((entry) => (
        <StreamTile key={entry.view.id} entry={entry} onWatch={() => onWatch(entry.view.id)} />
      ))}
      {entries.map((entry) => (
        <Tile key={entry.identity} entry={entry} renderAvatar={renderAvatar} onParticipantContextMenu={onParticipantContextMenu} onOpenProfile={onOpenProfile} />
      ))}
    </>
  );

  if (watching) {
    return (
      <div className="voice-stage watching">
        <WatchStage
          heroes={heroes}
          streamVolumes={streamVolumes}
          setStreamVolume={setStreamVolume}
          onStopWatching={onStopWatching}
          strip={<div className="voice-tiles strip">{tiles}</div>}
          chromeHidden={chromeHidden}
          onToggleChrome={onToggleChrome}
        />
      </div>
    );
  }

  return (
    <div className="voice-stage">
      <div className="voice-tiles" ref={gridRef} style={{ '--tile-w': `${tileWidth}px` } as CSSProperties}>
        {tiles}
      </div>

      {alone && (
        <div className="voice-invite">
          <div className="voice-invite-text">
            <strong>Só você por aqui</strong>
            <span>Chame seus amigos para entrar em {channelName}.</span>
          </div>
          {copyInvite && (
            <button type="button" className={`primary-button voice-invite-button ${invite.state}`} onClick={() => void invite.run()}>
              <UserPlusIcon size={16} /> {inviteLabel}
            </button>
          )}
        </div>
      )}

      {!alone && copyInvite && (
        <button
          type="button"
          className={`voice-invite-fab ${invite.state}`}
          onClick={() => void invite.run()}
          title={inviteLabel}
          aria-label="Convidar para voz"
        >
          <UserPlusIcon size={18} />
          {invite.state !== 'idle' && <span className="voice-invite-fab-note" role="status">{inviteLabel}</span>}
        </button>
      )}
    </div>
  );
}
