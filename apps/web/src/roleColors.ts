import type { MemberSummary, Role } from '@nexplay/shared';

// Os dois cinzas da paleta de cores de cargo (ServerSettings) valem como "sem cor": quem só tem cargos assim mantém o nome na
// cor normal do tema, como no Discord.
const NEUTRAL_ROLE_COLORS = new Set(['#68708b', '#8a91a6']);

/**
 * A cor do nome de alguém: a do cargo mais alto que ela tem e que tenha uma cor de verdade (o @everyone e os cinzas neutros
 * não contam). Devolve undefined quando não há nenhuma, e aí o nome fica com a cor normal.
 */
export function nameColorFor(roleIds: readonly string[], roles: readonly Role[]): string | undefined {
  let best: Role | undefined;
  for (const role of roles) {
    if (role.isEveryone || !roleIds.includes(role.id)) continue;
    if (NEUTRAL_ROLE_COLORS.has(role.color.toLowerCase())) continue;
    if (!best || role.position > best.position) best = role;
  }
  return best?.color;
}

/** Cor de nome de cada membro que tem uma (id da pessoa -> cor), pronta para consultar por mensagem. */
export function buildNameColorMap(members: readonly MemberSummary[], roles: readonly Role[]): ReadonlyMap<string, string> {
  const colors = new Map<string, string>();
  for (const member of members) {
    const color = nameColorFor(member.roleIds, roles);
    if (color) colors.set(member.id, color);
  }
  return colors;
}
