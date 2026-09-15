import { randomUUID } from 'node:crypto';
import type { Server } from '@nexplay/shared';
import { bootstrapServerRoles, db } from './db.js';
import { addServerMember } from './serverMembers.js';
import { createTextChannel } from './textChannels.js';
import { createVoiceChannel } from './voiceChannels.js';
import type { UserRecord } from './users.js';

interface ServerRow {
  id: string;
  name: string;
  description: string;
  icon_data_url: string;
  owner_id: string | null;
  created_at: number;
}

const selectServerByIdStatement = db.prepare('SELECT * FROM servers WHERE id = ?');
const listServersForUserStatement = db.prepare(`
  SELECT servers.*
  FROM servers
  INNER JOIN server_members ON server_members.server_id = servers.id
  WHERE server_members.user_id = ?
  ORDER BY servers.created_at ASC
`);
const insertServerStatement = db.prepare(
  'INSERT INTO servers (id, name, description, icon_data_url, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const updateServerStatement = db.prepare(
  'UPDATE servers SET name = ?, description = ?, icon_data_url = ? WHERE id = ?',
);
const deleteServerStatement = db.prepare('DELETE FROM servers WHERE id = ?');

function toServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconDataUrl: row.icon_data_url,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

export function getServerById(id: string): Server | undefined {
  const row = selectServerByIdStatement.get(id) as unknown as ServerRow | undefined;
  return row && toServer(row);
}

export function listServersForUser(userId: string): Server[] {
  return (listServersForUserStatement.all(userId) as unknown as ServerRow[]).map(toServer);
}

// Qualquer usuário autenticado pode criar um servidor (igual Discord real,
// sem permissão especial) — quem cria vira dono e ganha o cargo
// Administrador com permissão total, via a mesma bootstrapServerRoles usada
// pela migração do servidor padrão (ver db.ts), sem duplicar a lógica. Já
// nasce com um canal de texto e um de voz padrão (mesmo "geral"/"Geral" que
// o servidor migrado sempre teve) — sem isso o servidor nasceria vazio e
// inutilizável até alguém com MANAGE_CHANNELS criar o primeiro canal.
export function createServer(name: string, description: string, owner: UserRecord): Server {
  const server: Server = {
    id: randomUUID(),
    name,
    description,
    iconDataUrl: '',
    ownerId: owner.id,
    createdAt: Date.now(),
  };
  insertServerStatement.run(server.id, server.name, server.description, server.iconDataUrl, server.ownerId, server.createdAt);
  addServerMember(server.id, owner.id);
  bootstrapServerRoles(server.id, [owner.id], owner.id);
  createTextChannel(server.id, 'geral', 'Conversa geral da comunidade', owner.id);
  createVoiceChannel(server.id, 'Geral', 'Conversa livre', owner.id);
  return server;
}

export type UpdateServerResult = { ok: true; server: Server } | { ok: false; reason: 'NOT_FOUND' };

export function updateServer(
  id: string,
  patch: { name?: string | undefined; description?: string | undefined; iconDataUrl?: string | undefined },
): UpdateServerResult {
  const existing = getServerById(id);
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  const next: Server = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    iconDataUrl: patch.iconDataUrl ?? existing.iconDataUrl,
  };
  updateServerStatement.run(next.name, next.description, next.iconDataUrl, id);
  return { ok: true, server: next };
}

// Sem rota associada nesta rodada (exclusão de servidor fica fora de escopo
// de UI — ver DISCORD_PARITY_PLAN.md) — existe só pra completude do módulo e
// pra testes; ON DELETE CASCADE nas tabelas relacionadas cuida do resto.
export function deleteServer(id: string): boolean {
  return deleteServerStatement.run(id).changes > 0;
}
