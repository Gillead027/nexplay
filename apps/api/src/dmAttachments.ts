import { randomUUID } from 'node:crypto';
import type { MessageAttachment } from '@nexplay/shared';
import { db } from './db.js';

// Anexos de conversa privada. Espelha attachments.ts (canais de texto), em tabela
// própria porque message_attachments referencia text_channels/text_messages.
// O upload é em duas etapas: sobe "pendente" (dm_message_id NULL) e só é ligado à
// mensagem quando ela é enviada, pelo mesmo autor e na mesma conversa.

interface DmAttachmentRow {
  id: string;
  dm_message_id: string | null;
  dm_channel_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: number;
}

export interface DmAttachmentRecord {
  id: string;
  dmMessageId: string | null;
  dmChannelId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: number;
}

const insertPendingStatement = db.prepare(`
  INSERT INTO dm_attachments (id, dm_message_id, dm_channel_id, object_key, filename, content_type, size_bytes, uploaded_by, created_at)
  VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
`);
const selectByIdStatement = db.prepare('SELECT * FROM dm_attachments WHERE id = ?');
const selectByMessageStatement = db.prepare('SELECT * FROM dm_attachments WHERE dm_message_id = ? ORDER BY created_at ASC');
const selectByChannelStatement = db.prepare(
  'SELECT * FROM dm_attachments WHERE dm_channel_id = ? AND dm_message_id IS NOT NULL ORDER BY created_at ASC',
);
const selectPendingStatement = db.prepare(
  'SELECT * FROM dm_attachments WHERE id = ? AND dm_channel_id = ? AND uploaded_by = ? AND dm_message_id IS NULL',
);
const attachStatement = db.prepare(
  'UPDATE dm_attachments SET dm_message_id = ? WHERE id = ? AND dm_channel_id = ? AND uploaded_by = ? AND dm_message_id IS NULL',
);
const deleteRowStatement = db.prepare('DELETE FROM dm_attachments WHERE id = ?');
const selectOrphanedStatement = db.prepare('SELECT * FROM dm_attachments WHERE dm_message_id IS NULL AND created_at < ?');

function toRecord(row: DmAttachmentRow): DmAttachmentRecord {
  return {
    id: row.id,
    dmMessageId: row.dm_message_id,
    dmChannelId: row.dm_channel_id,
    objectKey: row.object_key,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export function toDmAttachment(record: DmAttachmentRecord): MessageAttachment {
  return {
    id: record.id,
    filename: record.filename,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    url: `/api/dm-attachments/${record.id}/${encodeURIComponent(record.filename)}`,
  };
}

export function createPendingDmAttachment(params: {
  dmChannelId: string;
  objectKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
}): DmAttachmentRecord {
  const id = randomUUID();
  const createdAt = Date.now();
  insertPendingStatement.run(
    id,
    params.dmChannelId,
    params.objectKey,
    params.filename,
    params.contentType,
    params.sizeBytes,
    params.uploadedBy,
    createdAt,
  );
  return { id, dmMessageId: null, ...params, createdAt };
}

export function getDmAttachmentRecordById(id: string): DmAttachmentRecord | undefined {
  const row = selectByIdStatement.get(id) as unknown as DmAttachmentRow | undefined;
  return row && toRecord(row);
}

// Versão completa (com object_key): só para saber o que apagar no armazenamento quando a
// mensagem é apagada. A pública (getDmAttachmentsForMessage) nunca expõe o object_key.
export function getDmAttachmentRecordsForMessage(messageId: string): DmAttachmentRecord[] {
  return (selectByMessageStatement.all(messageId) as unknown as DmAttachmentRow[]).map(toRecord);
}

export function getDmAttachmentsForMessage(messageId: string): MessageAttachment[] {
  return getDmAttachmentRecordsForMessage(messageId).map(toDmAttachment);
}

// Um mapa da conversa inteira de uma vez (evita uma consulta por mensagem ao listar).
export function getDmAttachmentsByChannel(dmChannelId: string): Map<string, MessageAttachment[]> {
  const byMessage = new Map<string, MessageAttachment[]>();
  for (const row of selectByChannelStatement.all(dmChannelId) as unknown as DmAttachmentRow[]) {
    if (!row.dm_message_id) continue;
    const list = byMessage.get(row.dm_message_id) ?? [];
    list.push(toDmAttachment(toRecord(row)));
    byMessage.set(row.dm_message_id, list);
  }
  return byMessage;
}

// Dos ids pedidos, só os que são mesmo uploads pendentes desta pessoa nesta conversa.
export function listPendingDmAttachments(attachmentIds: string[], dmChannelId: string, uploaderId: string): DmAttachmentRecord[] {
  const found: DmAttachmentRecord[] = [];
  for (const attachmentId of new Set(attachmentIds)) {
    const row = selectPendingStatement.get(attachmentId, dmChannelId, uploaderId) as unknown as DmAttachmentRow | undefined;
    if (row) found.push(toRecord(row));
  }
  return found;
}

// Liga os uploads pendentes à mensagem só se conversa e autor baterem; devolve o que de fato
// foi ligado, para a resposta nunca prometer um anexo que não entrou.
export function attachToDmMessage(
  attachmentIds: string[],
  messageId: string,
  dmChannelId: string,
  uploaderId: string,
): MessageAttachment[] {
  const linked: MessageAttachment[] = [];
  for (const attachmentId of new Set(attachmentIds)) {
    if (attachStatement.run(messageId, attachmentId, dmChannelId, uploaderId).changes > 0) {
      const record = getDmAttachmentRecordById(attachmentId);
      if (record) linked.push(toDmAttachment(record));
    }
  }
  return linked;
}

export function deleteDmAttachmentRecord(id: string): void {
  deleteRowStatement.run(id);
}

// Uploads pendentes (escolhidos e nunca enviados) mais antigos que olderThanMs, varridos
// periodicamente para não deixar arquivo sobrando no armazenamento.
export function listOrphanedDmAttachments(olderThanMs: number): DmAttachmentRecord[] {
  return (selectOrphanedStatement.all(Date.now() - olderThanMs) as unknown as DmAttachmentRow[]).map(toRecord);
}
