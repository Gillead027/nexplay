import { randomUUID } from 'node:crypto';
import { combinePermissions, type Role } from '@nexplay/shared';
import { db } from './db.js';

interface RoleRow {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  hoist: number;
  permissions: number;
  created_at: number;
}

const listRolesStatement = db.prepare(
  'SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC, created_at ASC',
);
const selectRoleByIdStatement = db.prepare('SELECT * FROM roles WHERE id = ?');
const selectRoleByNameStatement = db.prepare(
  'SELECT * FROM roles WHERE server_id = ? AND name = ? COLLATE NOCASE',
);
const insertRoleStatement = db.prepare(
  'INSERT INTO roles (id, server_id, name, color, position, hoist, permissions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const updateRoleStatement = db.prepare(
  'UPDATE roles SET name = ?, color = ?, hoist = ?, permissions = ? WHERE id = ?',
);
// position != 0 em vez de comparar id: @everyone é sempre seedado com
// position 0 (ver bootstrapServerRoles em db.ts), e cada servidor tem seu
// próprio id de @everyone gerado (roles.id é chave global, não composta).
const deleteRoleStatement = db.prepare('DELETE FROM roles WHERE id = ? AND position != 0');
const selectUserRoleIdsInServerStatement = db.prepare(`
  SELECT user_roles.role_id
  FROM user_roles
  INNER JOIN roles ON roles.id = user_roles.role_id
  WHERE user_roles.user_id = ? AND roles.server_id = ?
`);
const insertUserRoleStatement = db.prepare(
  'INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)',
);
const deleteUserRoleStatement = db.prepare('DELETE FROM user_roles WHERE user_id = ? AND role_id = ?');
const selectUserPermissionsStatement = db.prepare(`
  SELECT roles.permissions AS permissions
  FROM user_roles
  INNER JOIN roles ON roles.id = user_roles.role_id
  WHERE user_roles.user_id = ? AND roles.server_id = ?
`);
const selectUserHighestPositionStatement = db.prepare(`
  SELECT MAX(roles.position) AS position
  FROM user_roles
  INNER JOIN roles ON roles.id = user_roles.role_id
  WHERE user_roles.user_id = ? AND roles.server_id = ?
`);
const selectEveryoneRoleIdStatement = db.prepare('SELECT id FROM roles WHERE server_id = ? AND position = 0');

function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    color: row.color,
    position: row.position,
    hoist: Boolean(row.hoist),
    permissions: row.permissions,
    createdAt: row.created_at,
    isEveryone: row.position === 0,
  };
}

export function listRoles(serverId: string): Role[] {
  return (listRolesStatement.all(serverId) as unknown as RoleRow[]).map(toRole);
}

export function getRoleById(id: string): Role | undefined {
  const row = selectRoleByIdStatement.get(id) as unknown as RoleRow | undefined;
  return row && toRole(row);
}

export function getRoleByName(serverId: string, name: string): Role | undefined {
  const row = selectRoleByNameStatement.get(serverId, name) as unknown as RoleRow | undefined;
  return row && toRole(row);
}

export function getUserRoleIds(userId: string, serverId: string): string[] {
  return (selectUserRoleIdsInServerStatement.all(userId, serverId) as { role_id: string }[]).map((row) => row.role_id);
}

// OR de tudo que o usuário tem direito por qualquer cargo atribuído NESTE
// servidor — não há conceito de "deny" explícito (fora de escopo, ver
// DISCORD_PARITY_PLAN.md): um cargo só concede, nunca revoga o que outro já
// concedeu. Cargos de outro servidor nunca entram nesta conta.
export function getUserPermissionBitfield(userId: string, serverId: string): number {
  const rows = selectUserPermissionsStatement.all(userId, serverId) as { permissions: number }[];
  return combinePermissions(...rows.map((row) => row.permissions));
}

// Usada pra decidir hierarquia (quem pode moderar/gerenciar cargos de quem)
// DENTRO de um servidor. Quem não tem nenhum cargo além do @everyone
// implícito daquele servidor fica em 0.
export function getUserHighestPosition(userId: string, serverId: string): number {
  const row = selectUserHighestPositionStatement.get(userId, serverId) as { position: number | null } | undefined;
  return row?.position ?? 0;
}

export function assignDefaultRole(serverId: string, userId: string): void {
  const everyoneRole = selectEveryoneRoleIdStatement.get(serverId) as { id: string } | undefined;
  if (!everyoneRole) return;
  insertUserRoleStatement.run(userId, everyoneRole.id, Date.now());
}

export function createRole(
  serverId: string,
  name: string,
  color: string,
  permissions: number,
  position: number,
  hoist: boolean,
): Role {
  const role: Role = {
    id: randomUUID(),
    serverId,
    name,
    color,
    position,
    hoist,
    permissions,
    createdAt: Date.now(),
    isEveryone: false,
  };
  insertRoleStatement.run(role.id, role.serverId, role.name, role.color, role.position, role.hoist ? 1 : 0, role.permissions, role.createdAt);
  return role;
}

export type UpdateRoleResult = { ok: true; role: Role } | { ok: false; reason: 'NOT_FOUND' };

export function updateRole(
  id: string,
  patch: { name?: string | undefined; color?: string | undefined; permissions?: number | undefined; hoist?: boolean | undefined },
): UpdateRoleResult {
  const existing = getRoleById(id);
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };

  // @everyone não pode ser renomeado nem "destacado" na lista de membros —
  // mas suas permissões e cor continuam editáveis (é assim que um admin
  // restringe o que todo mundo pode fazer por padrão).
  const next: Role = {
    ...existing,
    name: existing.isEveryone ? existing.name : (patch.name ?? existing.name),
    color: patch.color ?? existing.color,
    hoist: existing.isEveryone ? false : (patch.hoist ?? existing.hoist),
    permissions: patch.permissions ?? existing.permissions,
  };
  updateRoleStatement.run(next.name, next.color, next.hoist ? 1 : 0, next.permissions, id);
  return { ok: true, role: next };
}

export type DeleteRoleResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'IMMUTABLE' };

export function deleteRole(id: string): DeleteRoleResult {
  const existing = getRoleById(id);
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.isEveryone) return { ok: false, reason: 'IMMUTABLE' };
  deleteRoleStatement.run(id);
  return { ok: true };
}

export function assignRole(userId: string, roleId: string): void {
  insertUserRoleStatement.run(userId, roleId, Date.now());
}

export function unassignRole(userId: string, roleId: string): void {
  deleteUserRoleStatement.run(userId, roleId);
}
