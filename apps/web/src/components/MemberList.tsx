import { useMemo } from 'react';
import type { MemberSummary } from '@nexplay/shared';
import { groupMembersByPresence } from '../memberListState';
import { useServerMemberList } from '../useServerMemberList';
import { Avatar } from './Workspace';

function MemberRow({
  member,
  online,
  isOwn,
  onOpenProfile,
}: {
  member: MemberSummary;
  online: boolean;
  isOwn: boolean;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
}) {
  return (
    <button
      type="button"
      className={`member-row ${online ? 'online' : 'offline'}`}
      onClick={(event) => onOpenProfile(member.id, event)}
      title={`Ver perfil de ${member.displayName}`}
    >
      <span className="member-avatar">
        <Avatar name={member.displayName} accentColor={member.accentColor} avatarUrl={member.avatarUrl || undefined} />
        <span className="member-status-dot" aria-hidden="true" />
      </span>
      <span className="member-copy">
        <strong>
          {member.displayName}
          {isOwn ? ' (você)' : ''}
        </strong>
        {member.statusText && <span>{member.statusText}</span>}
        <span className="sr-only">{online ? 'Online' : 'Offline'}</span>
      </span>
    </button>
  );
}

// Painel da direita: só os membros do servidor. Quem está com o app aberto fica
// em cima, em "Online"; quem não está fica numa categoria "Offline" embaixo, e
// sobe sozinho quando ficar online. Nada de controles de voz aqui: quem está em
// cada call e o volume de cada pessoa ficam na lista de canais de voz à esquerda.
export function MemberList({
  serverId,
  ownId,
  onOpenProfile,
}: {
  serverId: string;
  ownId: string;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
}) {
  const { members, onlineIds, loading, failed } = useServerMemberList(serverId);
  const groups = useMemo(() => groupMembersByPresence(members, onlineIds, ownId), [members, onlineIds, ownId]);
  const empty = members.length === 0;

  return (
    <aside className="member-list" aria-label="Membros do servidor">
      <div className="member-list-heading">
        <span>MEMBROS</span>
        <small>{members.length}</small>
      </div>
      <div className="member-list-scroll">
        {empty && loading && <p className="member-list-note">Carregando membros…</p>}
        {empty && !loading && failed && <p className="member-list-note" role="alert">Não foi possível carregar os membros.</p>}
        {groups.online.length > 0 && (
          <div className="member-group">
            <span className="member-group-title">Online — {groups.online.length}</span>
            {groups.online.map((member) => (
              <MemberRow key={member.id} member={member} online isOwn={member.id === ownId} onOpenProfile={onOpenProfile} />
            ))}
          </div>
        )}
        {groups.offline.length > 0 && (
          <div className="member-group">
            <span className="member-group-title">Offline — {groups.offline.length}</span>
            {groups.offline.map((member) => (
              <MemberRow key={member.id} member={member} online={false} isOwn={false} onOpenProfile={onOpenProfile} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
