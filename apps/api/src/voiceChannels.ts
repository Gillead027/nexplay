import type { VoiceChannel } from '@sausixudos/shared';
import { db } from './db.js';
import { slugify } from './slug.js';

interface VoiceChannelRow {
  id: string;
  server_id: string;
  name: string;
  description: string;
  position: number;
  created_by: string | null;
  created_at: number;
}

const listChannelsStatement = db.prepare(
  'SELECT * FROM voice_channels WHERE server_id = ? ORDER BY position ASC, created_at ASC',
);
const listAllChannelsStatement = db.prepare('SELECT * FROM voice_channels');
const selectChannelByIdStatement = db.prepare('SELECT * FROM voice_channels WHERE id = ?');
const selectChannelByNameStatement = db.prepare(
  'SELECT * FROM voice_channels WHERE server_id = ? AND name = ? COLLATE NOCASE',
);
const selectMaxPositionStatement = db.prepare('SELECT MAX(position) AS maxPosition FROM voice_channels WHERE server_id = ?');
const insertChannelStatement = db.prepare(
  'INSERT INTO voice_channels (id, server_id, name, description, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const deleteChannelStatement = db.prepare('DELETE FROM voice_channels WHERE id = ?');

function toChannel(row: VoiceChannelRow): VoiceChannel {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// Colisão de id continua checada GLOBALMENTE (todos os servidores), não só
// dentro do servidor sendo criado: o nome da sala do LiveKit é o id do canal
// de voz, e o namespace de salas do LiveKit é único pra todo o processo —
// dois servidores com um canal "Geral" gerando o mesmo id colidiriam e
// misturariam áudio de servidores diferentes. server_id serve só pra
// escopar consultas/permissões, nunca geração de id (ver DISCORD_PARITY_PLAN.md).
function channelSlug(name: string): string {
  return slugify(name, (id) => Boolean(selectChannelByIdStatement.get(id)));
}

export function listVoiceChannels(serverId: string): VoiceChannel[] {
  return (listChannelsStatement.all(serverId) as unknown as VoiceChannelRow[]).map(toChannel);
}

// Sem filtro de servidor — usada só pela varredura de desconexão forçada em
// ban (ban continua global, ver moderation.ts), que precisa achar a sala
// ativa de um usuário banido em QUALQUER servidor da instância.
export function listAllVoiceChannels(): VoiceChannel[] {
  return (listAllChannelsStatement.all() as unknown as VoiceChannelRow[]).map(toChannel);
}

export function getVoiceChannelById(id: string): VoiceChannel | undefined {
  const row = selectChannelByIdStatement.get(id) as unknown as VoiceChannelRow | undefined;
  return row && toChannel(row);
}

export function getVoiceChannelByName(serverId: string, name: string): VoiceChannel | undefined {
  const row = selectChannelByNameStatement.get(serverId, name) as unknown as VoiceChannelRow | undefined;
  return row && toChannel(row);
}

export function createVoiceChannel(serverId: string, name: string, description: string, creatorId: string): VoiceChannel {
  const { maxPosition } = selectMaxPositionStatement.get(serverId) as { maxPosition: number | null };
  const channel: VoiceChannel = {
    id: channelSlug(name),
    serverId,
    name,
    description,
    createdBy: creatorId,
    createdAt: Date.now(),
  };
  insertChannelStatement.run(
    channel.id,
    channel.serverId,
    channel.name,
    channel.description,
    (maxPosition ?? -1) + 1,
    creatorId,
    channel.createdAt,
  );
  return channel;
}

export function deleteVoiceChannel(id: string): boolean {
  return deleteChannelStatement.run(id).changes > 0;
}

export function renameVoiceChannel(serverId: string, id: string, name: string): VoiceChannel | undefined {
  db.prepare('UPDATE voice_channels SET name = ? WHERE id = ? AND server_id = ?').run(name, id, serverId);
  return getVoiceChannelById(id);
}
