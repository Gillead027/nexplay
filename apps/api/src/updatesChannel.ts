import { randomUUID } from 'node:crypto';
import {
  CHANGELOG,
  NEXPLAY_ANNOUNCER_AVATAR_URL,
  NEXPLAY_ANNOUNCER_IDENTITY,
  NEXPLAY_ANNOUNCER_NAME,
  UPDATES_CHANNEL_DESCRIPTION,
  UPDATES_CHANNEL_NAME,
  formatChangelogMessage,
  type ChangelogEntry,
  type TextMessage,
} from '@nexplay/shared';
import { db } from './db.js';
import { slugify } from './slug.js';

// O canal "atualizações": todo servidor tem um (os que já existiam ganham na subida da API; os novos
// nascem com ele), e é ali que o NexPlay publica, em texto, o que mudou a cada atualização (ver
// packages/shared/src/changelog.ts). O canal é identificado pela coluna is_updates, não pelo nome.

interface AnnouncementRow {
  id: string;
  channel_id: string;
  entry_id: string;
  text: string;
  created_at: number;
}

const selectChannelIdExistsStatement = db.prepare('SELECT 1 FROM text_channels WHERE id = ?');
const selectUpdatesChannelStatement = db.prepare('SELECT id FROM text_channels WHERE server_id = ? AND is_updates = 1');
const selectChannelNamedStatement = db.prepare('SELECT id FROM text_channels WHERE server_id = ? AND name = ? COLLATE NOCASE');
const selectMaxCreatedAtStatement = db.prepare('SELECT MAX(created_at) AS latest FROM text_channels WHERE server_id = ?');
const insertChannelStatement = db.prepare(`
  INSERT INTO text_channels (id, server_id, category_id, name, description, topic, created_by, created_at, is_updates)
  VALUES (?, ?, NULL, ?, ?, ?, NULL, ?, 1)
`);
const markProvisionedStatement = db.prepare('UPDATE servers SET updates_provisioned = 1 WHERE id = ?');
const selectUnprovisionedServersStatement = db.prepare('SELECT id FROM servers WHERE updates_provisioned = 0');
const insertDeliveredStatement = db.prepare(
  'INSERT OR IGNORE INTO update_announcements (server_id, entry_id, created_at) VALUES (?, ?, ?)',
);
const selectDeliveredStatement = db.prepare('SELECT entry_id FROM update_announcements WHERE server_id = ?');
const selectUpdatesChannelsStatement = db.prepare('SELECT id, server_id FROM text_channels WHERE is_updates = 1');
const insertMessageStatement = db.prepare(
  'INSERT OR IGNORE INTO text_announcement_messages (id, channel_id, entry_id, text, created_at) VALUES (?, ?, ?, ?, ?)',
);
const listMessagesStatement = db.prepare(`
  SELECT id, channel_id, entry_id, text, created_at
  FROM text_announcement_messages
  WHERE channel_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

function withTransaction<T>(run: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function toAnnouncementMessage(row: AnnouncementRow): TextMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: NEXPLAY_ANNOUNCER_IDENTITY,
    senderName: NEXPLAY_ANNOUNCER_NAME,
    senderType: 'SYSTEM',
    senderAvatarUrl: NEXPLAY_ANNOUNCER_AVATAR_URL,
    text: row.text,
    sentAt: row.created_at,
  };
}

export function listAnnouncementMessages(channelId: string, limit = 100): TextMessage[] {
  return (listMessagesStatement.all(channelId, limit) as unknown as AnnouncementRow[]).map(toAnnouncementMessage);
}

// Cria o canal "atualizações" de um servidor e marca o servidor como já atendido (mesmo que o canal
// não seja criado, para nunca tentar de novo). `skipHistory` = servidor recém-criado: as novidades
// que já existiam não são despejadas nele, só as futuras. Devolve o id do canal criado, ou null se o
// servidor já tinha um canal desse tipo ou um canal com esse nome escolhido pelo dono.
export function createUpdatesChannel(serverId: string, skipHistory: boolean): string | null {
  return withTransaction(() => {
    markProvisionedStatement.run(serverId);
    if (selectUpdatesChannelStatement.get(serverId) || selectChannelNamedStatement.get(serverId, UPDATES_CHANNEL_NAME)) return null;
    const now = Date.now();
    // Sempre depois dos canais que o servidor já tem: a lista ordena por criação, e o app abre o primeiro canal.
    const latest = (selectMaxCreatedAtStatement.get(serverId) as { latest: number | null }).latest ?? 0;
    const id = slugify(UPDATES_CHANNEL_NAME, (candidate) => Boolean(selectChannelIdExistsStatement.get(candidate)));
    insertChannelStatement.run(id, serverId, UPDATES_CHANNEL_NAME, UPDATES_CHANNEL_DESCRIPTION, UPDATES_CHANNEL_DESCRIPTION, Math.max(now, latest + 1));
    if (skipHistory) for (const entry of CHANGELOG) insertDeliveredStatement.run(serverId, entry.id, now);
    return id;
  });
}

// Na subida da API: todo servidor que ainda não passou pela criação do canal ganha o seu.
export function provisionUpdatesChannels(): number {
  let created = 0;
  for (const row of selectUnprovisionedServersStatement.all() as { id: string }[]) {
    if (createUpdatesChannel(row.id, false)) created += 1;
  }
  return created;
}

export interface PostedAnnouncement {
  serverId: string;
  channelId: string;
  message: TextMessage;
}

// Publica, em cada servidor que tem canal de atualizações, as novidades que ainda não foram publicadas
// ali (uma mensagem por novidade, na ordem do changelog). Seguro para rodar a cada subida: o que já foi
// entregue fica registrado e nunca se repete. Devolve o que foi publicado, para avisar quem está conectado.
export function announcePendingUpdates(entries: readonly ChangelogEntry[] = CHANGELOG): PostedAnnouncement[] {
  const posted: PostedAnnouncement[] = [];
  for (const channel of selectUpdatesChannelsStatement.all() as { id: string; server_id: string }[]) {
    const delivered = new Set((selectDeliveredStatement.all(channel.server_id) as { entry_id: string }[]).map((row) => row.entry_id));
    const pending = entries.filter((entry) => !delivered.has(entry.id));
    if (pending.length === 0) continue;
    withTransaction(() => {
      let at = Date.now();
      for (const entry of pending) {
        const row: AnnouncementRow = {
          id: randomUUID(),
          channel_id: channel.id,
          entry_id: entry.id,
          text: formatChangelogMessage(entry),
          created_at: at,
        };
        at += 1;
        insertMessageStatement.run(row.id, row.channel_id, row.entry_id, row.text, row.created_at);
        insertDeliveredStatement.run(channel.server_id, entry.id, row.created_at);
        posted.push({ serverId: channel.server_id, channelId: channel.id, message: toAnnouncementMessage(row) });
      }
    });
  }
  return posted;
}
