import { useMemo } from 'react';
import type { MemberSummary, PresenceStatus } from '@nexplay/shared';
import { buildMemberSections } from '../memberListState';
import { buildNameColorMap } from '../roleColors';
import type { ServerMemberListData } from '../useServerMemberList';
import { PRESENCE_STATUS_LABELS } from '@nexplay/shared';
import { MemberSkeleton } from './Skeleton';
import { Avatar } from './Workspace';

function MemberRow({
  member,
  online,
  status,
  nameColor,
  isOwn,
  onOpenProfile,
}: {
  member: MemberSummary;
  online: boolean;
  status: PresenceStatus | 'offline';
  nameColor: string | undefined;
  isOwn: boolean;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
}) {
  return (
    <button
      type="button"
      className={`member-row ${online ? 'online' : 'offline'} status-${status}`}
      onClick={(event) => onOpenProfile(member.id, event)}
      title={`Ver perfil de ${member.displayName}`}
    >
      <span className="member-avatar">
        <Avatar name={member.displayName} accentColor={member.accentColor} avatarUrl={member.avatarUrl || undefined} frame={member.avatarFrame} />
        <span className="member-status-dot" aria-hidden="true" />
      </span>
      <span className="member-copy">
        <strong style={nameColor ? { color: nameColor } : undefined}>
          {member.displayName}
          {isOwn ? ' (você)' : ''}
        </strong>
        {member.statusText && <span>{member.statusText}</span>}
        <span className="sr-only">{status === 'offline' ? 'Offline' : PRESENCE_STATUS_LABELS[status]}</span>
      </span>
    </button>
  );
}

// Painel da direita: os membros do servidor em categorias, como no Discord.
// Primeiro uma categoria por cargo que esteja com "Exibir membros do cargo
// separadamente" ligado (só quem está online), depois "Online" e, por último,
// "Offline". Quem abre ou fecha o app muda de categoria sozinho. Nada de
// controles de voz aqui: o volume de cada pessoa fica no botão direito na lista
// de canais de voz, à esquerda.
export function MemberList({
  data,
  ownId,
  ownStatus,
  onOpenProfile,
}: {
  data: ServerMemberListData;
  ownId: string;
  ownStatus: PresenceStatus;
  onOpenProfile: (userId: string, event: { currentTarget: HTMLElement }) => void;
}) {
  const { members, roles, onlineIds, statuses, loading, failed } = data;
  const sections = useMemo(() => buildMemberSections(members, onlineIds, ownId, roles), [members, onlineIds, ownId, roles]);
  const nameColors = useMemo(() => buildNameColorMap(members, roles), [members, roles]);
  const empty = members.length === 0;

  return (
    <aside className="member-list" aria-label="Membros do servidor">
      <div className="member-list-heading">
        <span>MEMBROS</span>
        <small>{members.length}</small>
      </div>
      <div className="member-list-scroll">
        {empty && loading && <MemberSkeleton />}
        {empty && !loading && failed && <p className="member-list-note" role="alert">Não foi possível carregar os membros.</p>}
        {sections.map((section) => (
          <div className="member-group" key={section.key} data-kind={section.kind}>
            <span className="member-group-title">
              {section.title} — {section.members.length}
            </span>
            {section.members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                online={section.kind !== 'offline'}
                status={section.kind === 'offline' ? 'offline' : member.id === ownId ? ownStatus : (statuses.get(member.id) ?? 'online')}
                nameColor={nameColors.get(member.id)}
                isOwn={member.id === ownId}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        ))}
      </div>
    </aside>
  );
}
