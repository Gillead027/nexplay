import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ACCENT_COLORS, type Activity, type FriendshipStatus, type UserSession } from '@nexplay/shared';
import { api } from '../api';
import { Avatar } from './Workspace';
import { useEscapeLayer } from '../escapeLayers';
import { ServerImage } from './ServerImage';
import { ActivityLine, ListeningActivityCard } from './ActivityDisplay';
import { BlockIcon, CloseIcon, MessageIcon, UserPlusIcon } from './Icons';
import { computePopoverPosition, POPOVER_WIDTH } from './profilePopoverPosition';

export interface ProfilePopoverTarget {
  userId: string;
  rect: DOMRect;
}

// Só guarda perfis carregados com sucesso, e serve apenas pra mostrar algo na
// hora ao reabrir: cada abertura rebusca (ver useUserProfile), então o cache
// nunca deixa um avatar, status ou bio velho valendo até o próximo F5. Falhas
// não entram aqui — antes um erro de rede ficava gravado pra sempre.
const remoteProfileCache = new Map<string, UserSession>();

interface UserProfileState {
  // undefined = carregando pela primeira vez; null = falhou e não há cópia guardada.
  profile: UserSession | null | undefined;
  retry: () => void;
}

function useUserProfile(userId: string, ownSession: UserSession): UserProfileState {
  const isOwn = userId === ownSession.id;
  const [, forceRender] = useState(0);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId || isOwn) return;
    let active = true;
    setFailedFor(null);
    void api
      .getUserProfile(userId)
      .then(({ user }) => {
        if (!active) return;
        remoteProfileCache.set(userId, user);
        forceRender((value) => value + 1);
      })
      .catch(() => {
        if (active) setFailedFor(userId);
      });
    return () => {
      active = false;
    };
  }, [isOwn, userId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (isOwn) return { profile: ownSession, retry };
  const cached = remoteProfileCache.get(userId);
  if (cached) return { profile: cached, retry };
  return { profile: failedFor === userId ? null : undefined, retry };
}

export function ProfilePopover({
  target,
  ownSession,
  activity,
  relationship,
  isBlockedByMe,
  onClose,
  onSendFriendRequest,
  onRemoveFriendship,
  onBlockUser,
  onUnblockUser,
  onOpenDm,
}: {
  target: ProfilePopoverTarget | null;
  ownSession: UserSession;
  // Só existe enquanto a pessoa está conectada a um canal de voz em que você
  // também está (LiveKit não expõe metadata de quem não compartilha sala com
  // você) — ver Workspace.tsx, onde isso vem de typedParticipants ao vivo.
  activity?: Activity | null;
  // Computado em Workspace.tsx a partir das listas já mantidas em tempo real
  // (nunca guardado no remoteProfileCache acima, que só guarda o perfil público).
  relationship: FriendshipStatus;
  isBlockedByMe: boolean;
  onClose: () => void;
  onSendFriendRequest: (userId: string) => void;
  onRemoveFriendship: (userId: string) => void;
  onBlockUser: (userId: string) => void;
  onUnblockUser: (userId: string) => void;
  onOpenDm: (userId: string) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const userId = target?.userId ?? '';
  const { profile, retry } = useUserProfile(userId, ownSession);
  const isOwnProfile = userId === ownSession.id;
  const [height, setHeight] = useState(0);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  // A altura depende do conteúdo (banner, bio, atividade, quantos botões de
  // ação), então mede depois de cada render, antes de pintar, e só reposiciona
  // se mudou — sem laço, já que setHeight ignora o mesmo valor.
  useLayoutEffect(() => {
    const element = popoverRef.current;
    if (!element) return;
    const measured = element.offsetHeight;
    setHeight((current) => (current === measured ? current : measured));
  });

  useEffect(() => {
    if (!target) return;
    const handleResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [target]);

  useEscapeLayer(Boolean(target), onClose);

  useEffect(() => {
    if (!target) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [target, onClose]);

  if (!target) return null;

  const { top, left } = computePopoverPosition(target.rect, { width: POPOVER_WIDTH, height }, viewport);

  return (
    <div className="profile-popover" ref={popoverRef} role="dialog" aria-label="Perfil do usuário" style={{ top: `${top}px`, left: `${left}px` }}>
      <button type="button" className="profile-popover-close" onClick={onClose} aria-label="Fechar">
        <CloseIcon size={13} />
      </button>
      {profile === undefined ? (
        <div className="profile-popover-loading" role="status">Carregando perfil…</div>
      ) : profile === null ? (
        <div className="profile-popover-loading" role="alert">
          Não foi possível carregar esse perfil.
          <button type="button" className="secondary-pill" onClick={retry}>Tentar de novo</button>
        </div>
      ) : (
        <div className="profile-preview">
          {profile.bannerUrl ? (
            <ServerImage className="profile-preview-banner has-image" src={profile.bannerUrl} animated={profile.bannerAnimated} autoplay />
          ) : (
            <div className={`profile-preview-banner avatar-color-${ACCENT_COLORS.indexOf(profile.accentColor)}`} />
          )}
          <Avatar name={profile.displayName} accentColor={profile.accentColor} avatarUrl={profile.avatarUrl} frame={profile.avatarFrame} />
          <strong>{profile.displayName}</strong>
          {profile.pronouns && <em>{profile.pronouns}</em>}
          {profile.statusText && <span>{profile.statusText}</span>}
          {profile.bio && <p>{profile.bio}</p>}
          {activity && (
            activity.kind === 'listening'
              ? <ListeningActivityCard activity={activity} />
              : <div className="profile-activity-line"><ActivityLine activity={activity} /></div>
          )}
          {!isOwnProfile && (
            <div className="profile-popover-actions">
              {relationship === 'NONE' && (
                <button type="button" className="secondary-pill" onClick={() => onSendFriendRequest(userId)}>
                  <UserPlusIcon size={13} /> Adicionar amigo
                </button>
              )}
              {relationship === 'PENDING_OUTGOING' && (
                <button type="button" className="secondary-pill" onClick={() => onRemoveFriendship(userId)}>
                  Cancelar pedido
                </button>
              )}
              {relationship === 'PENDING_INCOMING' && (
                <>
                  <button type="button" className="secondary-pill" onClick={() => onSendFriendRequest(userId)}>Aceitar pedido</button>
                  <button type="button" className="secondary-pill" onClick={() => onRemoveFriendship(userId)}>Recusar</button>
                </>
              )}
              {relationship === 'ACCEPTED' && (
                <>
                  <button type="button" className="secondary-pill" onClick={() => onOpenDm(userId)}>
                    <MessageIcon size={13} /> Enviar mensagem
                  </button>
                  <button type="button" className="secondary-pill" onClick={() => onRemoveFriendship(userId)}>Remover amigo</button>
                </>
              )}
              <button
                type="button"
                className="secondary-pill danger-pill"
                onClick={() => (isBlockedByMe ? onUnblockUser(userId) : onBlockUser(userId))}
              >
                <BlockIcon size={13} /> {isBlockedByMe ? 'Desbloquear' : 'Bloquear'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
