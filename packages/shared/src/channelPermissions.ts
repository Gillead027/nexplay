// Permissões por canal no modelo das "permission overwrites" do Discord: para um canal (ou uma categoria), cada cargo ou
// membro pode ter bits PERMITIDOS (allow) e NEGADOS (deny); o que não está em nenhum dos dois herda do servidor.
//
// Ordem de aplicação (a mesma do Discord):
//   1. as permissões do servidor (OR dos cargos da pessoa); Administrador passa por cima de tudo;
//   2. o ajuste do @everyone no canal;
//   3. os ajustes dos cargos da pessoa, somados (todos os deny, depois todos os allow);
//   4. o ajuste da própria pessoa;
//   5. sem "Ver canal", nada mais vale.
//
// Um canal sem ajustes próprios usa os da categoria dele ("sincronizado", como no Discord).

// Os bits são os mesmos de Permission (index.ts); ficam repetidos aqui porque index.ts reexporta este arquivo antes de
// definir Permission (importar de lá daria erro de ordem de carregamento). channelPermissions.test.ts confere que batem.
const VIEW_CHANNELS = 1 << 0;
const SEND_MESSAGES = 1 << 3;
const CONNECT = 1 << 5;
const ADMINISTRATOR = 1 << 13;
// Todos os bits de Permission (até MOVE_MEMBERS = 1 << 16).
const ALL_PERMISSIONS = (1 << 17) - 1;

export type OverwriteTargetType = 'role' | 'member';
export type ChannelKind = 'text' | 'voice' | 'category';

export interface PermissionOverwrite {
  targetType: OverwriteTargetType;
  targetId: string;
  allow: number;
  deny: number;
}


export function computeChannelPermissions(
  basePermissions: number,
  overwrites: readonly PermissionOverwrite[],
  member: { userId: string; roleIds: readonly string[]; everyoneRoleId: string | null },
): number {
  if ((basePermissions & ADMINISTRATOR) !== 0) return ALL_PERMISSIONS;
  let permissions = basePermissions;

  const everyone = member.everyoneRoleId
    ? overwrites.find((overwrite) => overwrite.targetType === 'role' && overwrite.targetId === member.everyoneRoleId)
    : undefined;
  if (everyone) permissions = (permissions & ~everyone.deny) | everyone.allow;

  let roleAllow = 0;
  let roleDeny = 0;
  for (const overwrite of overwrites) {
    if (overwrite.targetType !== 'role' || overwrite.targetId === member.everyoneRoleId) continue;
    if (!member.roleIds.includes(overwrite.targetId)) continue;
    roleAllow |= overwrite.allow;
    roleDeny |= overwrite.deny;
  }
  permissions = (permissions & ~roleDeny) | roleAllow;

  const own = overwrites.find((overwrite) => overwrite.targetType === 'member' && overwrite.targetId === member.userId);
  if (own) permissions = (permissions & ~own.deny) | own.allow;

  if ((permissions & VIEW_CHANNELS) === 0) return 0;
  return permissions;
}

// O que dá para ajustar por canal, por tipo de canal (só o que o servidor de fato confere).
export const CHANNEL_OVERWRITE_FLAGS: Record<ChannelKind, readonly { flag: number; label: string; description: string }[]> = {
  text: [
    { flag: VIEW_CHANNELS, label: 'Ver canal', description: 'Deixa ver o canal e ler as mensagens. Sem isso o canal some da lista.' },
    { flag: SEND_MESSAGES, label: 'Enviar mensagens', description: 'Deixa escrever no canal.' },
  ],
  voice: [
    { flag: VIEW_CHANNELS, label: 'Ver canal', description: 'Deixa ver o canal de voz na lista.' },
    { flag: CONNECT, label: 'Conectar', description: 'Deixa entrar no canal de voz.' },
  ],
  category: [
    { flag: VIEW_CHANNELS, label: 'Ver canais', description: 'Deixa ver os canais da categoria.' },
    { flag: SEND_MESSAGES, label: 'Enviar mensagens', description: 'Deixa escrever nos canais de texto da categoria.' },
    { flag: CONNECT, label: 'Conectar', description: 'Deixa entrar nos canais de voz da categoria.' },
  ],
};

// Bits que podem ir num ajuste (o resto é ignorado).
export const CHANNEL_OVERWRITE_MASK = VIEW_CHANNELS | SEND_MESSAGES | CONNECT;
