import type { MemberSummary, RealtimeEvent } from '@nexplay/shared';

export interface MemberGroups {
  online: MemberSummary[];
  offline: MemberSummary[];
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function byName(a: MemberSummary, b: MemberSummary): number {
  return collator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id);
}

// Separa os membros em quem está online (em cima) e offline (embaixo), cada
// grupo em ordem alfabética. Quem está vendo a lista conta sempre como online:
// o app dele está aberto, e assim ele nunca se vê na categoria de offline
// durante o instante em que a própria conexão ainda está sendo registrada.
export function groupMembersByPresence(
  members: readonly MemberSummary[],
  onlineIds: ReadonlySet<string>,
  ownId: string,
): MemberGroups {
  const seen = new Set<string>();
  const online: MemberSummary[] = [];
  const offline: MemberSummary[] = [];
  for (const member of members) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);
    (member.id === ownId || onlineIds.has(member.id) ? online : offline).push(member);
  }
  return { online: online.sort(byName), offline: offline.sort(byName) };
}

// Aplica à lista de membros do servidor aberto um evento de tempo real. Devolve
// a mesma lista (mesma referência) quando o evento não muda nada, pra o React
// não redesenhar à toa. MEMBER_UNBANNED não está aqui de propósito: quem volta
// de um banimento precisa de uma nova leitura completa da lista.
export function applyMemberEvent(members: MemberSummary[], event: RealtimeEvent, serverId: string): MemberSummary[] {
  switch (event.type) {
    case 'MEMBER_JOIN':
      if (event.serverId !== serverId) return members;
      return [...members.filter((member) => member.id !== event.member.id), event.member];
    case 'MEMBER_LEAVE':
      if (event.serverId !== serverId) return members;
      return members.some((member) => member.id === event.userId) ? members.filter((member) => member.id !== event.userId) : members;
    case 'MEMBER_BANNED':
      // Banimento vale pra instância inteira.
      return members.some((member) => member.id === event.userId) ? members.filter((member) => member.id !== event.userId) : members;
    default:
      return members;
  }
}

export function applyPresenceEvent(online: ReadonlySet<string>, event: RealtimeEvent): ReadonlySet<string> {
  if (event.type !== 'PRESENCE_UPDATE') return online;
  if (online.has(event.userId) === event.online) return online;
  const next = new Set(online);
  if (event.online) next.add(event.userId);
  else next.delete(event.userId);
  return next;
}
