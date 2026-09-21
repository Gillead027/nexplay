import { randomUUID } from 'node:crypto';
import {
  MUSIC_BOT_DISPLAY_NAME,
  MUSIC_BOT_IDENTITY,
  PINNED_MESSAGES_MAX_PER_CHANNEL,
  type ContentVisibility,
  type ForwardedFromMeta,
  type MusicNowPlayingCard,
  type TextChannel,
  type TextMessage,
  type TextMessageSenderType,
} from '@nexplay/shared';
import { attachToMessage, getAttachmentsByChannel, getAttachmentsForMessage } from './attachments.js';
import { listGameMessages } from './pokemon.js';
import { db } from './db.js';
import { getReactionsByChannel, getReactionsForMessage } from './reactions.js';
import { slugify } from './slug.js';
import type { UserRecord } from './users.js';

interface TextChannelRow {
  id: string;
  server_id: string;
  category_id: string | null;
  name: string;
  description: string;
  topic: string;
  slow_mode_seconds: number;
  content_visibility: ContentVisibility;
  is_announcement: number;
  created_by: string | null;
  created_at: number;
}

interface TextMessageRow {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  created_at: number;
  edited_at: number | null;
  reply_to_message_id: string | null;
  pinned_at: number | null;
  forwarded_from_author_name: string | null;
  forwarded_from_message_id: string | null;
  forwarded_from_server_id: string | null;
  forwarded_from_channel_id: string | null;
  forwarded_from_dm_channel_id: string | null;
  posted_as_system: number;
  server_name: string;
  server_icon_data_url: string;
}

interface TextBotMessageRow {
  id: string;
  channel_id: string;
  sender_name: string;
  text: string;
  music_card_json: string | null;
  created_at: number;
}

const listChannelsStatement = db.prepare(
  'SELECT * FROM text_channels WHERE server_id = ? ORDER BY created_at ASC, name COLLATE NOCASE ASC',
);
const selectChannelByIdStatement = db.prepare('SELECT * FROM text_channels WHERE id = ?');
const selectChannelByNameStatement = db.prepare(
  'SELECT * FROM text_channels WHERE server_id = ? AND name = ? COLLATE NOCASE',
);
const insertChannelStatement = db.prepare(
  'INSERT INTO text_channels (id, server_id, category_id, name, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
);
const insertMessageStatement = db.prepare(`
  INSERT INTO text_messages (
    id, channel_id, sender_id, text, created_at, reply_to_message_id,
    forwarded_from_author_name, forwarded_from_message_id, forwarded_from_server_id,
    forwarded_from_channel_id, forwarded_from_dm_channel_id, posted_as_system
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
// Reaproveitada nas 4 SELECTs abaixo pra nunca esquecer de adicionar uma
// coluna nova numa delas e ter busca/pins silenciosamente sem o dado. O JOIN
// em servers (via text_channels) só serve pra resolver nome/ícone de
// mensagens postadas como sistema (posted_as_system) — barato mesmo em
// mensagens normais, sempre a mesma linha de servidor por canal.
const TEXT_MESSAGE_SELECT_COLUMNS = `
    messages.id,
    messages.channel_id,
    messages.sender_id,
    users.username AS sender_name,
    messages.text,
    messages.created_at,
    messages.edited_at,
    messages.reply_to_message_id,
    messages.pinned_at,
    messages.forwarded_from_author_name,
    messages.forwarded_from_message_id,
    messages.forwarded_from_server_id,
    messages.forwarded_from_channel_id,
    messages.forwarded_from_dm_channel_id,
    messages.posted_as_system,
    servers.name AS server_name,
    servers.icon_data_url AS server_icon_data_url
`;
const TEXT_MESSAGE_SELECT_JOINS = `
  INNER JOIN users ON users.id = messages.sender_id
  INNER JOIN text_channels ON text_channels.id = messages.channel_id
  INNER JOIN servers ON servers.id = text_channels.server_id
`;
const listMessagesStatement = db.prepare(`
  SELECT ${TEXT_MESSAGE_SELECT_COLUMNS}
  FROM text_messages AS messages
  ${TEXT_MESSAGE_SELECT_JOINS}
  WHERE messages.channel_id = ?
  ORDER BY messages.created_at DESC
  LIMIT ?
`);
const selectMessageByIdStatement = db.prepare(`
  SELECT ${TEXT_MESSAGE_SELECT_COLUMNS}
  FROM text_messages AS messages
  ${TEXT_MESSAGE_SELECT_JOINS}
  WHERE messages.id = ? AND messages.channel_id = ?
`);
const updateMessageStatement = db.prepare(
  'UPDATE text_messages SET text = ?, edited_at = ? WHERE id = ? AND sender_id = ?',
);
const deleteMessageStatement = db.prepare('DELETE FROM text_messages WHERE id = ?');
const pinMessageStatement = db.prepare(
  'UPDATE text_messages SET pinned_at = ?, pinned_by = ? WHERE id = ? AND channel_id = ?',
);
const unpinMessageStatement = db.prepare(
  'UPDATE text_messages SET pinned_at = NULL, pinned_by = NULL WHERE id = ? AND channel_id = ?',
);
const countPinnedStatement = db.prepare(
  'SELECT COUNT(*) AS count FROM text_messages WHERE channel_id = ? AND pinned_at IS NOT NULL',
);
const listPinnedStatement = db.prepare(`
  SELECT ${TEXT_MESSAGE_SELECT_COLUMNS}
  FROM text_messages AS messages
  ${TEXT_MESSAGE_SELECT_JOINS}
  WHERE messages.channel_id = ? AND messages.pinned_at IS NOT NULL
  ORDER BY messages.pinned_at DESC
`);
// ESCAPE '\' + fuga manual de '%'/'_'/'\' no termo de busca: sem isso, um
// usuário procurando literalmente por "50%" ou "a_b" teria esses caracteres
// tratados como curinga do LIKE em vez de texto literal.
const searchMessagesStatement = db.prepare(`
  SELECT ${TEXT_MESSAGE_SELECT_COLUMNS}
  FROM text_messages AS messages
  ${TEXT_MESSAGE_SELECT_JOINS}
  WHERE messages.channel_id = ? AND messages.text LIKE ? ESCAPE '\\' COLLATE NOCASE
  ORDER BY messages.created_at DESC
  LIMIT ?
`);

const listBotMessagesStatement = db.prepare(`
  SELECT id, channel_id, sender_name, text, music_card_json, created_at
  FROM text_bot_messages
  WHERE channel_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);
const upsertBotMessageStatement = db.prepare(`
  INSERT INTO text_bot_messages (id, channel_id, sender_name, text, music_card_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(channel_id) DO UPDATE SET
    id = excluded.id,
    sender_name = excluded.sender_name,
    text = excluded.text,
    music_card_json = excluded.music_card_json
`);
const deleteBotMessageByChannelStatement = db.prepare('DELETE FROM text_bot_messages WHERE channel_id = ?');
const listAllBotMessagesStatement = db.prepare(`
  SELECT id, channel_id, sender_name, text, music_card_json, created_at
  FROM text_bot_messages
`);
const deleteBotMessageByIdStatement = db.prepare('DELETE FROM text_bot_messages WHERE id = ?');

function toChannel(row: TextChannelRow): TextChannel {
  return {
    id: row.id,
    serverId: row.server_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    topic: row.topic,
    slowModeSeconds: row.slow_mode_seconds,
    contentVisibility: row.content_visibility,
    isAnnouncement: Boolean(row.is_announcement),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toMessage(row: TextMessageRow): TextMessage {
  const postedAsSystem = Boolean(row.posted_as_system);
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: row.sender_id,
    senderName: postedAsSystem ? row.server_name : row.sender_name,
    senderType: (postedAsSystem ? 'SYSTEM' : 'HUMAN') as TextMessageSenderType,
    ...(postedAsSystem && row.server_icon_data_url ? { senderAvatarUrl: row.server_icon_data_url } : {}),
    text: row.text,
    sentAt: row.created_at,
    ...(row.edited_at !== null ? { editedAt: row.edited_at } : {}),
    ...(row.reply_to_message_id !== null ? { replyToMessageId: row.reply_to_message_id } : {}),
    ...(row.pinned_at !== null ? { pinnedAt: row.pinned_at } : {}),
    // forwarded_from_author_name dobra como "isto é um forward" — os dois
    // sempre são gravados juntos (ver createForwardedTextMessage).
    ...(row.forwarded_from_author_name !== null
      ? {
          forwardedFromAuthorName: row.forwarded_from_author_name,
          forwardedFromMessageId: row.forwarded_from_message_id!,
          ...(row.forwarded_from_server_id !== null && row.forwarded_from_channel_id !== null
            ? { forwardedFromServerId: row.forwarded_from_server_id, forwardedFromChannelId: row.forwarded_from_channel_id }
            : {}),
          ...(row.forwarded_from_dm_channel_id !== null
            ? { forwardedFromDmChannelId: row.forwarded_from_dm_channel_id }
            : {}),
        }
      : {}),
  };
}

function toBotMessage(row: TextBotMessageRow): TextMessage {
  let musicCard: MusicNowPlayingCard | undefined;
  if (row.music_card_json) {
    try {
      musicCard = JSON.parse(row.music_card_json) as MusicNowPlayingCard;
    } catch {
      musicCard = undefined;
    }
  }
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: MUSIC_BOT_IDENTITY,
    senderName: row.sender_name,
    senderType: 'BOT',
    text: row.text,
    sentAt: row.created_at,
    ...(musicCard ? { musicCard } : {}),
  };
}

function channelSlug(name: string): string {
  return slugify(name, (id) => Boolean(selectChannelByIdStatement.get(id)));
}

export function listTextChannels(serverId: string): TextChannel[] {
  return (listChannelsStatement.all(serverId) as unknown as TextChannelRow[]).map(toChannel);
}

export function getTextChannelById(id: string): TextChannel | undefined {
  const row = selectChannelByIdStatement.get(id) as unknown as TextChannelRow | undefined;
  return row && toChannel(row);
}

export function getTextChannelByName(serverId: string, name: string): TextChannel | undefined {
  const row = selectChannelByNameStatement.get(serverId, name) as unknown as TextChannelRow | undefined;
  return row && toChannel(row);
}

export function createTextChannel(
  serverId: string,
  name: string,
  description: string,
  creatorId: string,
  categoryId: string | null = null,
): TextChannel {
  const channel: TextChannel = {
    id: channelSlug(name),
    serverId,
    categoryId,
    name,
    description,
    topic: '',
    slowModeSeconds: 0,
    contentVisibility: 'default',
    isAnnouncement: false,
    createdBy: creatorId,
    createdAt: Date.now(),
  };
  insertChannelStatement.run(
    channel.id,
    channel.serverId,
    channel.categoryId,
    channel.name,
    channel.description,
    channel.createdBy,
    channel.createdAt,
  );
  return channel;
}

export function listTextMessages(channelId: string, limit = 100): TextMessage[] {
  const reactionsByMessage = getReactionsByChannel(channelId);
  const attachmentsByMessage = getAttachmentsByChannel(channelId);
  const humanMessages = (listMessagesStatement.all(channelId, limit) as unknown as TextMessageRow[])
    .map(toMessage)
    .map((message) => {
      const reactions = reactionsByMessage.get(message.id);
      const attachments = attachmentsByMessage.get(message.id);
      return {
        ...message,
        ...(reactions?.length ? { reactions } : {}),
        ...(attachments?.length ? { attachments } : {}),
      };
    });
  const botMessages = (listBotMessagesStatement.all(channelId, limit) as unknown as TextBotMessageRow[])
    .map(toBotMessage);
  return [...humanMessages, ...botMessages, ...listGameMessages(channelId, limit)]
    .sort((left, right) => left.sentAt - right.sentAt)
    .slice(-limit);
}

export function createTextMessage(
  channelId: string,
  text: string,
  sender: UserRecord,
  replyToMessageId?: string,
  attachmentIds?: string[],
  postedAsSystem = false,
): TextMessage {
  const message: TextMessage = {
    id: randomUUID(),
    channelId,
    senderId: sender.id,
    senderName: sender.username,
    senderType: 'HUMAN',
    text,
    sentAt: Date.now(),
    ...(replyToMessageId ? { replyToMessageId } : {}),
  };
  insertMessageStatement.run(
    message.id,
    message.channelId,
    message.senderId,
    message.text,
    message.sentAt,
    replyToMessageId ?? null,
    null,
    null,
    null,
    null,
    null,
    postedAsSystem ? 1 : 0,
  );
  // posted_as_system exige nome/ícone do servidor pra exibição (ver
  // toMessage) — mais simples reconsultar já resolvido do que duplicar aqui
  // a lógica de JOIN só pra este caminho pouco frequente.
  if (postedAsSystem) {
    const resolved = getTextMessageById(channelId, message.id);
    if (resolved) Object.assign(message, resolved);
  }
  if (attachmentIds?.length) {
    const attachments = attachToMessage(attachmentIds, message.id, channelId, sender.id);
    if (attachments.length) message.attachments = attachments;
  }
  return message;
}

// Encaminhamento: nunca copia anexo (ver DISCORD_PARITY_PLAN.md — o
// object_key do MinIO não suporta referência compartilhada de forma segura
// hoje) e nunca é resposta a outra mensagem ao mesmo tempo (reply_to_message_id
// sempre NULL aqui) — as duas coisas são mutuamente exclusivas de propósito.
export function createForwardedTextMessage(
  channelId: string,
  text: string,
  sender: UserRecord,
  forwardedFrom: ForwardedFromMeta,
): TextMessage {
  const message: TextMessage = {
    id: randomUUID(),
    channelId,
    senderId: sender.id,
    senderName: sender.username,
    senderType: 'HUMAN',
    text,
    sentAt: Date.now(),
    forwardedFromAuthorName: forwardedFrom.authorName,
    forwardedFromMessageId: forwardedFrom.messageId,
    ...(forwardedFrom.serverId && forwardedFrom.channelId
      ? { forwardedFromServerId: forwardedFrom.serverId, forwardedFromChannelId: forwardedFrom.channelId }
      : {}),
    ...(forwardedFrom.dmChannelId ? { forwardedFromDmChannelId: forwardedFrom.dmChannelId } : {}),
  };
  insertMessageStatement.run(
    message.id,
    message.channelId,
    message.senderId,
    message.text,
    message.sentAt,
    null,
    forwardedFrom.authorName,
    forwardedFrom.messageId,
    forwardedFrom.serverId ?? null,
    forwardedFrom.channelId ?? null,
    forwardedFrom.dmChannelId ?? null,
    0,
  );
  return message;
}


export function getTextMessageById(channelId: string, messageId: string): TextMessage | undefined {
  const row = selectMessageByIdStatement.get(messageId, channelId) as unknown as TextMessageRow | undefined;
  if (!row) return undefined;
  const message = toMessage(row);
  const reactions = getReactionsForMessage(messageId);
  const attachments = getAttachmentsForMessage(messageId);
  return {
    ...message,
    ...(reactions.length ? { reactions } : {}),
    ...(attachments.length ? { attachments } : {}),
  };
}

export type EditTextMessageResult =
  | { ok: true; message: TextMessage }
  | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' };

// Sem sistema de cargos ainda (ver DISCORD_PARITY_PLAN.md) — só o próprio
// autor pode editar/apagar, mesmo nível de moderação que o resto do app
// hoje (nenhum).
export function editTextMessage(
  channelId: string,
  messageId: string,
  text: string,
  editorId: string,
): EditTextMessageResult {
  const existing = getTextMessageById(channelId, messageId);
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.senderId !== editorId) return { ok: false, reason: 'FORBIDDEN' };
  const editedAt = Date.now();
  updateMessageStatement.run(text, editedAt, messageId, editorId);
  return { ok: true, message: { ...existing, text, editedAt } };
}

export type DeleteTextMessageResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' };

// canManageMessages vem do cargo do requisitante (permissão MANAGE_MESSAGES,
// ver roles.ts) — permite que um moderador apague mensagem de outra pessoa,
// além do autor sempre poder apagar a própria.
export function deleteTextMessage(
  channelId: string,
  messageId: string,
  requesterId: string,
  canManageMessages: boolean,
): DeleteTextMessageResult {
  const existing = getTextMessageById(channelId, messageId);
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.senderId !== requesterId && !canManageMessages) return { ok: false, reason: 'FORBIDDEN' };
  deleteMessageStatement.run(messageId);
  return { ok: true };
}

export type PinTextMessageResult =
  | { ok: true; message: TextMessage }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_PINNED' | 'LIMIT_REACHED' };

export function pinTextMessage(channelId: string, messageId: string, pinnedBy: string): PinTextMessageResult {
  const existing = getTextMessageById(channelId, messageId);
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.pinnedAt) return { ok: false, reason: 'ALREADY_PINNED' };
  const pinnedCount = (countPinnedStatement.get(channelId) as { count: number }).count;
  if (pinnedCount >= PINNED_MESSAGES_MAX_PER_CHANNEL) return { ok: false, reason: 'LIMIT_REACHED' };
  const pinnedAt = Date.now();
  pinMessageStatement.run(pinnedAt, pinnedBy, messageId, channelId);
  return { ok: true, message: { ...existing, pinnedAt } };
}

export type UnpinTextMessageResult = { ok: true; message: TextMessage } | { ok: false; reason: 'NOT_FOUND' };

export function unpinTextMessage(channelId: string, messageId: string): UnpinTextMessageResult {
  const existing = getTextMessageById(channelId, messageId);
  if (!existing || !existing.pinnedAt) return { ok: false, reason: 'NOT_FOUND' };
  unpinMessageStatement.run(messageId, channelId);
  const { pinnedAt: _pinnedAt, ...rest } = existing;
  return { ok: true, message: rest };
}

export function listPinnedMessages(channelId: string): TextMessage[] {
  const reactionsByMessage = getReactionsByChannel(channelId);
  return (listPinnedStatement.all(channelId) as unknown as TextMessageRow[]).map(toMessage).map((message) => {
    const reactions = reactionsByMessage.get(message.id);
    return reactions?.length ? { ...message, reactions } : message;
  });
}

// Escapa os curingas do LIKE ('%', '_' e o próprio caractere de escape) pra
// que o termo de busca do usuário seja tratado sempre como texto literal.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function searchTextMessages(channelId: string, query: string, limit = 50): TextMessage[] {
  const pattern = `%${escapeLikePattern(query)}%`;
  const reactionsByMessage = getReactionsByChannel(channelId);
  return (searchMessagesStatement.all(channelId, pattern, limit) as unknown as TextMessageRow[])
    .map(toMessage)
    .map((message) => {
      const reactions = reactionsByMessage.get(message.id);
      return reactions?.length ? { ...message, reactions } : message;
    });
}

export function getMusicBotTextMessage(channelId: string): TextMessage | undefined {
  const rows = listBotMessagesStatement.all(channelId, 1) as unknown as TextBotMessageRow[];
  const row = rows[0];
  return row ? toBotMessage(row) : undefined;
}

export function deleteMusicBotTextMessage(channelId: string): boolean {
  const result = deleteBotMessageByChannelStatement.run(channelId);
  return result.changes > 0;
}

// Retorna os ids dos canais de texto cujo card foi removido (normalmente no
// máximo um, já que upsertMusicBotTextMessage mantém só um card ativo por
// canal de voz — mas o caller precisa saber quais canais avisar via
// WebSocket, então devolvemos a lista real em vez de só uma contagem).
export function deleteMusicBotTextMessagesForVoiceChannel(
  voiceChannelId: string,
  exceptTextChannelId?: string,
): string[] {
  const rows = listAllBotMessagesStatement.all() as unknown as TextBotMessageRow[];
  const clearedChannelIds: string[] = [];
  for (const row of rows) {
    if (row.channel_id === exceptTextChannelId || !row.music_card_json) continue;
    try {
      const card = JSON.parse(row.music_card_json) as MusicNowPlayingCard;
      if (card.voiceChannelId !== voiceChannelId) continue;
      if (deleteBotMessageByIdStatement.run(row.id).changes) clearedChannelIds.push(row.channel_id);
    } catch {
      // Mensagem antiga/corrompida não deve impedir a limpeza das demais.
    }
  }
  return clearedChannelIds;
}

// Todo canal de texto que tem um card de "tocando agora" ativo agora —
// usado pelo laço de resync periódico em index.ts (ver ali) que mantém o
// progresso do card atualizado via WebSocket sem o cliente precisar pollar.
export function listActiveMusicBotChannelIds(): string[] {
  const rows = listAllBotMessagesStatement.all() as unknown as TextBotMessageRow[];
  return rows.filter((row) => row.music_card_json).map((row) => row.channel_id);
}

export function upsertMusicBotTextMessage(
  channelId: string,
  text: string,
  musicCard: MusicNowPlayingCard,
): { message: TextMessage; clearedChannelIds: string[] } {
  const clearedChannelIds = musicCard.voiceChannelId
    ? deleteMusicBotTextMessagesForVoiceChannel(musicCard.voiceChannelId, channelId)
    : [];
  const existing = getMusicBotTextMessage(channelId);
  const message: TextMessage = {
    id: `music-bot:${channelId}`,
    channelId,
    senderId: MUSIC_BOT_IDENTITY,
    senderName: MUSIC_BOT_DISPLAY_NAME,
    senderType: 'BOT',
    text,
    sentAt: existing?.sentAt ?? Date.now(),
    musicCard,
  };
  upsertBotMessageStatement.run(
    message.id,
    message.channelId,
    message.senderName,
    message.text,
    JSON.stringify(musicCard),
    message.sentAt,
  );
  return { message, clearedChannelIds };
}

export function deleteTextChannel(id: string): boolean {
  return db.prepare('DELETE FROM text_channels WHERE id = ?').run(id).changes > 0;
}

export function renameTextChannel(serverId: string, id: string, name: string): TextChannel | undefined {
  db.prepare('UPDATE text_channels SET name = ? WHERE id = ? AND server_id = ?').run(name, id, serverId);
  return getTextChannelById(id);
}

export interface TextChannelSettingsPatch {
  categoryId?: string | null | undefined;
  topic?: string | undefined;
  slowModeSeconds?: number | undefined;
  contentVisibility?: ContentVisibility | undefined;
  isAnnouncement?: boolean | undefined;
}

export function updateTextChannelSettings(
  serverId: string,
  id: string,
  patch: TextChannelSettingsPatch,
): TextChannel | undefined {
  const existing = getTextChannelById(id);
  if (!existing || existing.serverId !== serverId) return undefined;
  const next = {
    categoryId: patch.categoryId !== undefined ? patch.categoryId : existing.categoryId,
    topic: patch.topic ?? existing.topic,
    slowModeSeconds: patch.slowModeSeconds ?? existing.slowModeSeconds,
    contentVisibility: patch.contentVisibility ?? existing.contentVisibility,
    isAnnouncement: patch.isAnnouncement ?? existing.isAnnouncement,
  };
  db.prepare(
    `UPDATE text_channels
     SET category_id = ?, topic = ?, slow_mode_seconds = ?, content_visibility = ?, is_announcement = ?
     WHERE id = ? AND server_id = ?`,
  ).run(next.categoryId, next.topic, next.slowModeSeconds, next.contentVisibility, next.isAnnouncement ? 1 : 0, id, serverId);
  return getTextChannelById(id);
}

const selectLastMessageAtStatement = db.prepare(
  'SELECT created_at FROM text_messages WHERE channel_id = ? AND sender_id = ? ORDER BY created_at DESC LIMIT 1',
);

// Segundos restantes de modo lento pra este usuário neste canal (0 = pode
// enviar agora). Quem pode gerenciar mensagens (moderação) ignora o modo
// lento, mesma isenção do Discord real.
export function slowModeRemainingSeconds(channelId: string, senderId: string, exempt: boolean): number {
  if (exempt) return 0;
  const channel = getTextChannelById(channelId);
  if (!channel || channel.slowModeSeconds <= 0) return 0;
  const row = selectLastMessageAtStatement.get(channelId, senderId) as { created_at: number } | undefined;
  if (!row) return 0;
  const elapsedMs = Date.now() - row.created_at;
  const remainingMs = channel.slowModeSeconds * 1_000 - elapsedMs;
  return remainingMs > 0 ? Math.ceil(remainingMs / 1_000) : 0;
}
