import {
  CHANNEL_OVERWRITE_MASK,
  computeChannelPermissions,
  Permission,
  type ChannelKind,
  type OverwriteTargetType,
  type PermissionOverwrite,
} from '@nexplay/shared';
import { db } from './db.js';
import { getUserPermissionBitfield, getUserRoleIds, listRoles } from './roles.js';
import { getTextChannelById } from './textChannels.js';
import { getVoiceChannelById } from './voiceChannels.js';

// Permissões por canal (ver computeChannelPermissions em @nexplay/shared). Um canal sem ajustes próprios usa os da
// categoria dele, como um canal "sincronizado" no Discord.

interface OverwriteRow {
  target_type: OverwriteTargetType;
  target_id: string;
  allow: number;
  deny: number;
}

const listStatement = db.prepare(
  'SELECT target_type, target_id, allow, deny FROM channel_overwrites WHERE channel_kind = ? AND channel_id = ?',
);
const upsertStatement = db.prepare(`
  INSERT INTO channel_overwrites (channel_kind, channel_id, server_id, target_type, target_id, allow, deny)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (channel_kind, channel_id, target_type, target_id) DO UPDATE SET allow = excluded.allow, deny = excluded.deny
`);
const deleteOneStatement = db.prepare(
  'DELETE FROM channel_overwrites WHERE channel_kind = ? AND channel_id = ? AND target_type = ? AND target_id = ?',
);
const deleteForChannelStatement = db.prepare('DELETE FROM channel_overwrites WHERE channel_kind = ? AND channel_id = ?');
const deleteForTargetStatement = db.prepare('DELETE FROM channel_overwrites WHERE server_id = ? AND target_type = ? AND target_id = ?');

export function listOverwrites(kind: ChannelKind, channelId: string): PermissionOverwrite[] {
  return (listStatement.all(kind, channelId) as unknown as OverwriteRow[]).map((row) => ({
    targetType: row.target_type,
    targetId: row.target_id,
    allow: row.allow,
    deny: row.deny,
  }));
}

// Grava o ajuste de um cargo/membro no canal. Sem nada permitido nem negado, o ajuste some (volta a herdar).
export function setOverwrite(kind: ChannelKind, channelId: string, serverId: string, overwrite: PermissionOverwrite): void {
  const allow = overwrite.allow & CHANNEL_OVERWRITE_MASK;
  // O mesmo bit não pode estar permitido e negado: negar ganha.
  const deny = overwrite.deny & CHANNEL_OVERWRITE_MASK;
  if (allow === 0 && deny === 0) {
    deleteOneStatement.run(kind, channelId, overwrite.targetType, overwrite.targetId);
    return;
  }
  upsertStatement.run(kind, channelId, serverId, overwrite.targetType, overwrite.targetId, allow & ~deny, deny);
}

export function deleteOverwrite(kind: ChannelKind, channelId: string, targetType: OverwriteTargetType, targetId: string): void {
  deleteOneStatement.run(kind, channelId, targetType, targetId);
}

export function deleteChannelOverwrites(kind: ChannelKind, channelId: string): void {
  deleteForChannelStatement.run(kind, channelId);
}

// Cargo apagado ou membro que saiu: os ajustes dele não servem mais.
export function deleteTargetOverwrites(serverId: string, targetType: OverwriteTargetType, targetId: string): void {
  deleteForTargetStatement.run(serverId, targetType, targetId);
}

// Os ajustes que valem para o canal: os dele, ou os da categoria se ele não tiver nenhum.
export function effectiveOverwrites(kind: 'text' | 'voice', channelId: string, categoryId: string | null): PermissionOverwrite[] {
  const own = listOverwrites(kind, channelId);
  if (own.length > 0 || !categoryId) return own;
  return listOverwrites('category', categoryId);
}

function everyoneRoleId(serverId: string): string | null {
  return listRoles(serverId).find((role) => role.isEveryone)?.id ?? null;
}

// Ver, enviar e conectar nunca foram conferidos no nível do servidor: há servidores com esses interruptores de cargo
// desligados sem efeito nenhum. Para não bloquear ninguém de surpresa, eles partem ligados e só os ajustes por canal
// restringem (sem ajuste no canal, tudo continua como antes).
const ALWAYS_ON_BASE = CHANNEL_OVERWRITE_MASK;

function permissionsWith(userId: string, serverId: string, overwrites: PermissionOverwrite[]): number {
  return computeChannelPermissions(getUserPermissionBitfield(userId, serverId) | ALWAYS_ON_BASE, overwrites, {
    userId,
    roleIds: getUserRoleIds(userId, serverId),
    everyoneRoleId: everyoneRoleId(serverId),
  });
}

// Permissões da pessoa num canal. Canal que não existe (ou de outro servidor) = nenhuma.
export function channelPermissions(userId: string, serverId: string, kind: 'text' | 'voice', channelId: string): number {
  const channel = kind === 'text' ? getTextChannelById(channelId) : getVoiceChannelById(channelId);
  if (!channel || channel.serverId !== serverId) return 0;
  return permissionsWith(userId, serverId, effectiveOverwrites(kind, channel.id, channel.categoryId));
}

export function canInChannel(userId: string, serverId: string, kind: 'text' | 'voice', channelId: string, flag: number): boolean {
  return (channelPermissions(userId, serverId, kind, channelId) & flag) !== 0;
}

export function canViewChannel(userId: string, serverId: string, kind: 'text' | 'voice', channelId: string): boolean {
  return canInChannel(userId, serverId, kind, channelId, Permission.VIEW_CHANNELS);
}

// Filtra uma lista de canais pelo que a pessoa pode ver (já com os dados do canal em mãos, sem buscar de novo).
export function filterVisibleChannels<T extends { id: string; serverId: string; categoryId: string | null }>(
  userId: string,
  kind: 'text' | 'voice',
  channels: T[],
): T[] {
  return channels.filter((channel) => {
    const overwrites = effectiveOverwrites(kind, channel.id, channel.categoryId);
    if (overwrites.length === 0) return true;
    return (permissionsWith(userId, channel.serverId, overwrites) & Permission.VIEW_CHANNELS) !== 0;
  });
}
