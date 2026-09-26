import { randomUUID } from 'node:crypto';
import { parseImageDataUrl, type AccentColor, type ImageFormat, type Server } from '@nexplay/shared';
import { bootstrapServerRoles, db } from './db.js';
import { addServerMember } from './serverMembers.js';
import { createTextChannel } from './textChannels.js';
import { createUpdatesChannel } from './updatesChannel.js';
import { createVoiceChannel } from './voiceChannels.js';
import type { UserRecord } from './users.js';

interface ServerRow {
  id: string;
  name: string;
  description: string;
  icon_data_url: string;
  banner_data_url: string;
  icon_animated: number;
  banner_animated: number;
  assets_rev: number;
  accent_color: AccentColor | null;
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
const listAllServersStatement = db.prepare('SELECT * FROM servers ORDER BY created_at ASC');
const insertServerStatement = db.prepare(
  'INSERT INTO servers (id, name, description, icon_data_url, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const updateServerStatement = db.prepare(
  `UPDATE servers SET name = ?, description = ?, icon_data_url = ?, banner_data_url = ?, icon_animated = ?, banner_animated = ?,
    assets_rev = ?, accent_color = ? WHERE id = ?`,
);
const deleteServerStatement = db.prepare('DELETE FROM servers WHERE id = ?');
const countServersOwnedStatement = db.prepare('SELECT COUNT(*) AS count FROM servers WHERE owner_id = ?');

export type ServerAssetKind = 'icon' | 'banner';

function toServer(row: ServerRow): Server {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    iconUrl: row.icon_data_url ? `/api/servers/${row.id}/icon?v=${row.assets_rev}` : '',
    iconAnimated: row.icon_animated === 1,
    bannerUrl: row.banner_data_url ? `/api/servers/${row.id}/banner?v=${row.assets_rev}` : '',
    bannerAnimated: row.banner_animated === 1,
    accentColor: row.accent_color,
    ownerId: row.owner_id,
    createdAt: row.created_at,
  };
}

// Quantos servidores esta conta tem como dona (os em que só entrou por convite não contam).
export function countServersOwnedBy(ownerId: string): number {
  return (countServersOwnedStatement.get(ownerId) as { count: number }).count;
}

export function getServerById(id: string): Server | undefined {
  const row = selectServerByIdStatement.get(id) as unknown as ServerRow | undefined;
  return row && toServer(row);
}

export function listServersForUser(userId: string): Server[] {
  return (listServersForUserStatement.all(userId) as unknown as ServerRow[]).map(toServer);
}

// Todo servidor da instância, sem filtro de membro — usado só pela visão de
// segurança do admin (ver requireInstanceAdmin em index.ts), nunca por uma
// conta comum.
export function listAllServers(): Server[] {
  return (listAllServersStatement.all() as unknown as ServerRow[]).map(toServer);
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
    iconUrl: '',
    iconAnimated: false,
    bannerUrl: '',
    bannerAnimated: false,
    accentColor: null,
    ownerId: owner.id,
    createdAt: Date.now(),
  };
  insertServerStatement.run(server.id, server.name, server.description, '', server.ownerId, server.createdAt);
  addServerMember(server.id, owner.id);
  bootstrapServerRoles(server.id, [owner.id], owner.id);
  createTextChannel(server.id, 'geral', 'Conversa geral da comunidade', owner.id);
  // Todo servidor nasce com o canal "atualizações" (criado depois do "geral", que continua sendo o primeiro).
  createUpdatesChannel(server.id, true);
  createVoiceChannel(server.id, 'Geral', 'Conversa livre', owner.id);
  return server;
}

export type UpdateServerResult = { ok: true; server: Server } | { ok: false; reason: 'NOT_FOUND' };

// Ícone e painel chegam (e ficam guardados) como data: URL; '' remove.
export function updateServer(
  id: string,
  patch: {
    name?: string | undefined;
    description?: string | undefined;
    iconDataUrl?: string | undefined;
    bannerDataUrl?: string | undefined;
    accentColor?: AccentColor | null | undefined;
  },
): UpdateServerResult {
  const row = selectServerByIdStatement.get(id) as unknown as ServerRow | undefined;
  if (!row) return { ok: false, reason: 'NOT_FOUND' };
  const iconChanged = patch.iconDataUrl !== undefined && patch.iconDataUrl !== row.icon_data_url;
  const bannerChanged = patch.bannerDataUrl !== undefined && patch.bannerDataUrl !== row.banner_data_url;
  const next: ServerRow = {
    ...row,
    name: patch.name ?? row.name,
    description: patch.description ?? row.description,
    icon_data_url: patch.iconDataUrl ?? row.icon_data_url,
    banner_data_url: patch.bannerDataUrl ?? row.banner_data_url,
    icon_animated: iconChanged ? Number(parseImageDataUrl(patch.iconDataUrl ?? '')?.animated ?? false) : row.icon_animated,
    banner_animated: bannerChanged ? Number(parseImageDataUrl(patch.bannerDataUrl ?? '')?.animated ?? false) : row.banner_animated,
    assets_rev: iconChanged || bannerChanged ? row.assets_rev + 1 : row.assets_rev,
    accent_color: patch.accentColor !== undefined ? patch.accentColor : row.accent_color,
  };
  updateServerStatement.run(
    next.name,
    next.description,
    next.icon_data_url,
    next.banner_data_url,
    next.icon_animated,
    next.banner_animated,
    next.assets_rev,
    next.accent_color,
    id,
  );
  return { ok: true, server: toServer(next) };
}

// O arquivo do ícone ou do painel, já decodificado, para a rota que o entrega ao navegador.
export function getServerAsset(id: string, kind: ServerAssetKind): { format: ImageFormat; bytes: Uint8Array } | null {
  const row = selectServerByIdStatement.get(id) as unknown as ServerRow | undefined;
  const dataUrl = kind === 'icon' ? row?.icon_data_url : row?.banner_data_url;
  if (!dataUrl) return null;
  const parsed = parseImageDataUrl(dataUrl);
  if (!parsed?.actual) return null;
  return { format: parsed.actual, bytes: parsed.bytes };
}

// Sem rota associada nesta rodada (exclusão de servidor fica fora de escopo
// de UI — ver DISCORD_PARITY_PLAN.md) — existe só pra completude do módulo e
// pra testes; ON DELETE CASCADE nas tabelas relacionadas cuida do resto.
export function deleteServer(id: string): boolean {
  return deleteServerStatement.run(id).changes > 0;
}
