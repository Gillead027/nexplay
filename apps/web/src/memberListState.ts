import type { MemberSummary, RealtimeEvent, Role } from '@nexplay/shared';

export type MemberSectionKind = 'role' | 'online' | 'offline';

export interface MemberSection {
  key: string;
  kind: MemberSectionKind;
  title: string;
  members: MemberSummary[];
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

function byName(a: MemberSummary, b: MemberSummary): number {
  return collator.compare(a.displayName, b.displayName) || a.id.localeCompare(b.id);
}

// Monta as categorias do painel de membros, na ordem em que aparecem:
//
//  1. uma categoria por cargo com "Exibir membros do cargo separadamente" ligado
//     (o interruptor do editor de cargos), do cargo mais alto pro mais baixo.
//     Só entra quem está online, e cada pessoa fica só no cargo separado mais
//     alto que tiver, sem repetir em várias categorias;
//  2. "Online": quem está online e não tem nenhum cargo separado;
//  3. "Offline": todo mundo que está offline, num grupo só, qualquer que seja o
//     cargo. Quando a pessoa ficar online, sobe para a categoria dela.
//
// Categorias vazias não aparecem. Quem abre a lista conta sempre como online: o
// app dele está aberto, então ele não se vê em "Offline" durante o instante em
// que a própria conexão ainda está sendo registrada.
export function buildMemberSections(
  members: readonly MemberSummary[],
  onlineIds: ReadonlySet<string>,
  ownId: string,
  roles: readonly Role[],
): MemberSection[] {
  const separated = roles
    .filter((role) => role.hoist && !role.isEveryone)
    .sort((a, b) => b.position - a.position || collator.compare(a.name, b.name) || a.id.localeCompare(b.id));

  const byRole = new Map<string, MemberSummary[]>();
  const online: MemberSummary[] = [];
  const offline: MemberSummary[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);

    if (member.id !== ownId && !onlineIds.has(member.id)) {
      offline.push(member);
      continue;
    }
    const role = separated.find((candidate) => member.roleIds.includes(candidate.id));
    if (!role) {
      online.push(member);
      continue;
    }
    const bucket = byRole.get(role.id);
    if (bucket) bucket.push(member);
    else byRole.set(role.id, [member]);
  }

  const sections: MemberSection[] = [];
  for (const role of separated) {
    const bucket = byRole.get(role.id);
    if (bucket && bucket.length > 0) {
      sections.push({ key: `role:${role.id}`, kind: 'role', title: role.name, members: bucket.sort(byName) });
    }
  }
  if (online.length > 0) sections.push({ key: 'online', kind: 'online', title: 'Online', members: online.sort(byName) });
  if (offline.length > 0) sections.push({ key: 'offline', kind: 'offline', title: 'Offline', members: offline.sort(byName) });
  return sections;
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
    case 'MEMBER_ROLES_UPDATE':
      if (event.serverId !== serverId || !members.some((member) => member.id === event.userId)) return members;
      return members.map((member) => (member.id === event.userId ? { ...member, roleIds: event.roleIds } : member));
    default:
      return members;
  }
}

// Cargos do servidor aberto: quando alguém liga ou desliga "Exibir membros do
// cargo separadamente", renomeia ou apaga um cargo, as categorias mudam na hora.
export function applyRoleEvent(roles: Role[], event: RealtimeEvent, serverId: string): Role[] {
  switch (event.type) {
    case 'ROLE_CREATE':
    case 'ROLE_UPDATE':
      if (event.serverId !== serverId) return roles;
      return [...roles.filter((role) => role.id !== event.role.id), event.role];
    case 'ROLE_DELETE':
      if (event.serverId !== serverId) return roles;
      return roles.some((role) => role.id === event.roleId) ? roles.filter((role) => role.id !== event.roleId) : roles;
    default:
      return roles;
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
