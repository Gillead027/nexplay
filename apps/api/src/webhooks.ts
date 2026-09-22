import { randomBytes, randomUUID } from 'node:crypto';
import { WEBHOOKS_MAX_PER_CHANNEL, type TextMessage, type TextWebhook } from '@nexplay/shared';
import { db } from './db.js';

interface TextWebhookRow {
  id: string;
  channel_id: string;
  server_id: string;
  name: string;
  avatar_url: string;
  token: string;
  created_by: string | null;
  created_at: number;
}

interface TextWebhookMessageRow {
  id: string;
  channel_id: string;
  webhook_id: string;
  sender_name: string;
  sender_avatar_url: string;
  text: string;
  created_at: number;
}

const listWebhooksStatement = db.prepare('SELECT * FROM text_webhooks WHERE channel_id = ? ORDER BY created_at ASC');
const countWebhooksStatement = db.prepare('SELECT COUNT(*) AS count FROM text_webhooks WHERE channel_id = ?');
const selectWebhookByIdStatement = db.prepare('SELECT * FROM text_webhooks WHERE id = ?');
const selectWebhookByIdAndTokenStatement = db.prepare('SELECT * FROM text_webhooks WHERE id = ? AND token = ?');
const insertWebhookStatement = db.prepare(
  'INSERT INTO text_webhooks (id, channel_id, server_id, name, avatar_url, token, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const deleteWebhookStatement = db.prepare('DELETE FROM text_webhooks WHERE id = ? AND server_id = ?');

const listWebhookMessagesStatement = db.prepare(`
  SELECT id, channel_id, webhook_id, sender_name, sender_avatar_url, text, created_at
  FROM text_webhook_messages
  WHERE channel_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);
const insertWebhookMessageStatement = db.prepare(
  'INSERT INTO text_webhook_messages (id, channel_id, webhook_id, sender_name, sender_avatar_url, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
);

function toWebhook(row: TextWebhookRow): TextWebhook {
  return {
    id: row.id,
    channelId: row.channel_id,
    serverId: row.server_id,
    name: row.name,
    avatarUrl: row.avatar_url,
    token: row.token,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function toWebhookMessage(row: TextWebhookMessageRow): TextMessage {
  return {
    id: row.id,
    channelId: row.channel_id,
    senderId: row.webhook_id,
    senderName: row.sender_name,
    senderType: 'WEBHOOK',
    ...(row.sender_avatar_url ? { senderAvatarUrl: row.sender_avatar_url } : {}),
    text: row.text,
    sentAt: row.created_at,
  };
}

// Token longo e de alta entropia (32 bytes = 256 bits) — diferente do código
// de convite (curto, feito pra digitar), este só é copiado/colado numa URL, e
// é a única coisa que autentica a rota pública de post (sem sessão).
function generateWebhookToken(): string {
  return randomBytes(32).toString('base64url');
}

export function listWebhooksForChannel(channelId: string): TextWebhook[] {
  return (listWebhooksStatement.all(channelId) as unknown as TextWebhookRow[]).map(toWebhook);
}

export function countWebhooksForChannel(channelId: string): number {
  return (countWebhooksStatement.get(channelId) as { count: number }).count;
}

export function getWebhookById(id: string): TextWebhook | undefined {
  const row = selectWebhookByIdStatement.get(id) as unknown as TextWebhookRow | undefined;
  return row && toWebhook(row);
}

export function verifyWebhookToken(id: string, token: string): TextWebhook | undefined {
  const row = selectWebhookByIdAndTokenStatement.get(id, token) as unknown as TextWebhookRow | undefined;
  return row && toWebhook(row);
}

export type CreateWebhookResult = { ok: true; webhook: TextWebhook } | { ok: false; reason: 'LIMIT_REACHED' };

export function createWebhook(
  channelId: string,
  serverId: string,
  name: string,
  avatarUrl: string,
  createdBy: string,
): CreateWebhookResult {
  if (countWebhooksForChannel(channelId) >= WEBHOOKS_MAX_PER_CHANNEL) return { ok: false, reason: 'LIMIT_REACHED' };
  const webhook: TextWebhook = {
    id: randomUUID(),
    channelId,
    serverId,
    name,
    avatarUrl,
    token: generateWebhookToken(),
    createdBy,
    createdAt: Date.now(),
  };
  insertWebhookStatement.run(
    webhook.id,
    webhook.channelId,
    webhook.serverId,
    webhook.name,
    webhook.avatarUrl,
    webhook.token,
    webhook.createdBy,
    webhook.createdAt,
  );
  return { ok: true, webhook };
}

// Escopado por serverId pra nunca deixar quem tem MANAGE_WEBHOOKS num
// servidor apagar webhook de outro (mesmo se adivinhasse o id).
export function deleteWebhook(serverId: string, id: string): boolean {
  return deleteWebhookStatement.run(id, serverId).changes > 0;
}

export function listWebhookMessages(channelId: string, limit = 100): TextMessage[] {
  return (listWebhookMessagesStatement.all(channelId, limit) as unknown as TextWebhookMessageRow[]).map(
    toWebhookMessage,
  );
}

// content chega já validado (tamanho/não-vazio) por quem chama — este módulo
// só cuida de persistência, igual createTextMessage em textChannels.ts.
export function createWebhookMessage(webhook: TextWebhook, content: string): TextMessage {
  const message = toWebhookMessage({
    id: randomUUID(),
    channel_id: webhook.channelId,
    webhook_id: webhook.id,
    sender_name: webhook.name,
    sender_avatar_url: webhook.avatarUrl,
    text: content,
    created_at: Date.now(),
  });
  insertWebhookMessageStatement.run(
    message.id,
    message.channelId,
    webhook.id,
    webhook.name,
    webhook.avatarUrl,
    message.text,
    message.sentAt,
  );
  return message;
}
