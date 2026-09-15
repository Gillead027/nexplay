import type { AccentColor, MemberSummary, ServerMember } from '@nexplay/shared';
import { db } from './db.js';
import { getUserPermissionBitfield, getUserRoleIds } from './roles.js';

interface MemberRow {
  id: string;
  username: string;
  accent_color: AccentColor;
  avatar_data_url: string;
  status_text: string;
}

const selectMemberStatement = db.prepare(
  'SELECT server_id, user_id, joined_at, timeout_until FROM server_members WHERE server_id = ? AND user_id = ?',
);
const insertMemberStatement = db.prepare(
  'INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at, timeout_until) VALUES (?, ?, ?, NULL)',
);
const deleteMemberStatement = db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?');
const updateMemberTimeoutStatement = db.prepare(
  'UPDATE server_members SET timeout_until = ? WHERE server_id = ? AND user_id = ?',
);
// LEFT JOIN bans exclui quem está banido da instância inteira (ver
// moderation.ts — bans continuam globais, não por servidor) da listagem de
// membros de qualquer servidor, mesmo padrão que já existia antes de
// múltiplos servidores existirem.
const listMembersStatement = db.prepare(`
  SELECT users.id, users.username, users.accent_color, users.avatar_data_url, users.status_text
  FROM server_members
  INNER JOIN users ON users.id = server_members.user_id
  LEFT JOIN bans ON bans.user_id = users.id
  WHERE server_members.server_id = ? AND bans.user_id IS NULL
  ORDER BY users.username COLLATE NOCASE ASC
`);
const listMemberUserIdsStatement = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?');

export function isServerMember(serverId: string, userId: string): boolean {
  return Boolean(selectMemberStatement.get(serverId, userId));
}

export function addServerMember(serverId: string, userId: string): void {
  insertMemberStatement.run(serverId, userId, Date.now());
}

export function removeServerMember(serverId: string, userId: string): boolean {
  return deleteMemberStatement.run(serverId, userId).changes > 0;
}

export function getServerMember(serverId: string, userId: string): ServerMember | undefined {
  const row = selectMemberStatement.get(serverId, userId) as
    | { server_id: string; user_id: string; joined_at: number; timeout_until: number | null }
    | undefined;
  if (!row) return undefined;
  return {
    serverId: row.server_id,
    userId: row.user_id,
    roleIds: getUserRoleIds(userId, serverId),
    permissions: getUserPermissionBitfield(userId, serverId),
    timeoutUntil: row.timeout_until,
    joinedAt: row.joined_at,
  };
}

export function setServerMemberTimeout(serverId: string, userId: string, timeoutUntil: number | null): void {
  updateMemberTimeoutStatement.run(timeoutUntil, serverId, userId);
}

// Substitui o antigo roles.ts#listMembers() (que era literalmente
// `SELECT * FROM users`, sem filtro nenhum de servidor) — agora um "membro"
// de verdade só é quem tem uma linha em server_members para este servidor.
export function listServerMembers(serverId: string): MemberSummary[] {
  const rows = listMembersStatement.all(serverId) as unknown as MemberRow[];
  return rows.map((row) => ({
    id: row.id,
    displayName: row.username,
    accentColor: row.accent_color,
    avatarUrl: row.avatar_data_url,
    statusText: row.status_text,
    roleIds: getUserRoleIds(row.id, serverId),
    timeoutUntil: (selectMemberStatement.get(serverId, row.id) as { timeout_until: number | null }).timeout_until,
  }));
}

// Usada pelo realtime (sendToServerMembers) pra resolver, na hora de cada
// broadcast, quem deve receber o evento — sem cache/rooms, consulta direta
// (escala de grupo de amigos é pequena o bastante, mesmo padrão pragmático
// já usado por sendToUsers).
export function listMemberUserIdsForServer(serverId: string): string[] {
  return (listMemberUserIdsStatement.all(serverId) as { user_id: string }[]).map((row) => row.user_id);
}
