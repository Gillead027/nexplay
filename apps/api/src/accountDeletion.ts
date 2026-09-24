import { randomUUID } from 'node:crypto';
import { Permission } from '@nexplay/shared';
import { db } from './db.js';

// Excluir uma conta (a própria pessoa ou um admin da instância). O banco já apaga em cascata o que é da pessoa (mensagens,
// amizades, conversas diretas, cargos, convites que ela criou...). O que precisa de cuidado é o que NÃO é só dela:
//  - servidores dos quais ela é dona: se outras pessoas estão neles, o servidor passa para o próximo dono (quem já tem cargo de
//    administração, senão quem entrou primeiro) — excluir uma conta não deve derrubar o servidor de ninguém; se ninguém mais
//    está nele, o servidor é apagado junto;
//  - arquivos guardados fora do banco (anexos e fotos de verificação de identidade): a função devolve as chaves para quem
//    chamou apagar do armazenamento, senão sobrariam arquivos órfãos.

export interface OwnedServerPlan {
  serverId: string;
  name: string;
  action: 'transfer' | 'delete';
  newOwnerId: string | null;
  newOwnerName: string | null;
  otherMembers: number;
}

const ADMIN_MASK = Permission.ADMINISTRATOR | Permission.MANAGE_SERVER;

interface SuccessorRow {
  user_id: string;
  username: string;
}

const selectOwnedStatement = db.prepare('SELECT id, name FROM servers WHERE owner_id = ? ORDER BY created_at ASC');
const selectOtherMemberCountStatement = db.prepare('SELECT COUNT(*) AS n FROM server_members WHERE server_id = ? AND user_id != ?');
// Sucessor: quem já administra o servidor primeiro, depois quem entrou primeiro.
const selectSuccessorStatement = db.prepare(`
  SELECT m.user_id, u.username
  FROM server_members m
  JOIN users u ON u.id = m.user_id
  WHERE m.server_id = ? AND m.user_id != ?
  ORDER BY EXISTS (
    SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = m.user_id AND r.server_id = m.server_id AND (r.permissions & ?) != 0
  ) DESC, m.joined_at ASC
  LIMIT 1
`);

export function planAccountDeletion(userId: string): OwnedServerPlan[] {
  const owned = selectOwnedStatement.all(userId) as { id: string; name: string }[];
  return owned.map((server) => {
    const otherMembers = (selectOtherMemberCountStatement.get(server.id, userId) as { n: number }).n;
    const successor = otherMembers > 0 ? (selectSuccessorStatement.get(server.id, userId, ADMIN_MASK) as SuccessorRow | undefined) : undefined;
    return {
      serverId: server.id,
      name: server.name,
      action: successor ? 'transfer' : 'delete',
      newOwnerId: successor?.user_id ?? null,
      newOwnerName: successor?.username ?? null,
      otherMembers,
    };
  });
}

export interface AccountDeletionResult {
  // O que restou para o chamador avisar/limpar depois que o banco já mudou.
  transferred: { serverId: string; newOwnerId: string }[];
  deletedServerIds: string[];
  // Servidores que continuam existindo e de onde a pessoa saiu (para avisar quem ficou).
  leftServerIds: string[];
  friendIds: string[];
  // Chaves de objetos no armazenamento (anexos e fotos de verificação) que não têm mais dono.
  objectKeys: string[];
}

const selectMemberServersStatement = db.prepare('SELECT server_id FROM server_members WHERE user_id = ?');
const selectFriendIdsStatement = db.prepare(`
  SELECT CASE WHEN user_id_a = ? THEN user_id_b ELSE user_id_a END AS other FROM friendships WHERE user_id_a = ? OR user_id_b = ?
`);
const selectUploadKeysStatement = db.prepare('SELECT object_key FROM message_attachments WHERE uploaded_by = ?');
const selectServerAttachmentKeysStatement = db.prepare(`
  SELECT object_key FROM message_attachments WHERE channel_id IN (SELECT id FROM text_channels WHERE server_id = ?)
`);
const selectVerificationKeysStatement = db.prepare(
  "SELECT document_object_key AS a, selfie_object_key AS b FROM identity_verification_attempts WHERE user_id = ?",
);
const selectAdminRoleStatement = db.prepare(
  'SELECT id FROM roles WHERE server_id = ? AND (permissions & ?) != 0 ORDER BY position DESC, created_at ASC LIMIT 1',
);
const insertUserRoleStatement = db.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)');
const insertRoleStatement = db.prepare(
  'INSERT INTO roles (id, server_id, name, color, position, hoist, permissions, created_at) VALUES (?, ?, ?, ?, 100, 1, ?, ?)',
);
const updateOwnerStatement = db.prepare('UPDATE servers SET owner_id = ? WHERE id = ?');
const deleteServerStatement = db.prepare('DELETE FROM servers WHERE id = ?');
const deleteUserStatement = db.prepare('DELETE FROM users WHERE id = ?');

export function deleteAccount(userId: string): AccountDeletionResult {
  const objectKeys = new Set<string>();
  const result: AccountDeletionResult = { transferred: [], deletedServerIds: [], leftServerIds: [], friendIds: [], objectKeys: [] };

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const row of selectUploadKeysStatement.all(userId) as { object_key: string }[]) objectKeys.add(row.object_key);
    for (const row of selectVerificationKeysStatement.all(userId) as { a: string; b: string }[]) {
      if (row.a) objectKeys.add(row.a);
      if (row.b) objectKeys.add(row.b);
    }
    result.friendIds = (selectFriendIdsStatement.all(userId, userId, userId) as { other: string }[]).map((row) => row.other);
    const memberServers = (selectMemberServersStatement.all(userId) as { server_id: string }[]).map((row) => row.server_id);

    for (const plan of planAccountDeletion(userId)) {
      if (plan.action === 'transfer' && plan.newOwnerId) {
        updateOwnerStatement.run(plan.newOwnerId, plan.serverId);
        // O novo dono precisa do cargo de administração (o dono anterior o tinha por ser dono).
        let adminRole = (selectAdminRoleStatement.get(plan.serverId, Permission.ADMINISTRATOR) as { id: string } | undefined)?.id;
        if (!adminRole) {
          adminRole = randomUUID();
          insertRoleStatement.run(adminRole, plan.serverId, 'Administrador', '#ee7798', Permission.ADMINISTRATOR, Date.now());
        }
        insertUserRoleStatement.run(plan.newOwnerId, adminRole, Date.now());
        result.transferred.push({ serverId: plan.serverId, newOwnerId: plan.newOwnerId });
      } else {
        for (const row of selectServerAttachmentKeysStatement.all(plan.serverId) as { object_key: string }[]) objectKeys.add(row.object_key);
        deleteServerStatement.run(plan.serverId);
        result.deletedServerIds.push(plan.serverId);
      }
    }

    result.leftServerIds = memberServers.filter((id) => !result.deletedServerIds.includes(id));
    deleteUserStatement.run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  result.objectKeys = [...objectKeys];
  return result;
}
