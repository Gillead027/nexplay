import { randomUUID } from 'node:crypto';
import type { ModerationIncidentCategory, ModerationIncidentPriority, ModerationIncidentStatus } from '@nexplay/shared';
import { db } from './db.js';

export type ModerationIncidentSourceType = 'text_message' | 'dm_message' | 'camera_track' | 'screen_track';

export interface ModerationIncidentRecord {
  id: string;
  category: ModerationIncidentCategory;
  sourceType: ModerationIncidentSourceType;
  serverId: string | null;
  channelId: string | null;
  subjectUserId: string | null;
  confidence: number;
  priority: ModerationIncidentPriority;
  status: ModerationIncidentStatus;
  reviewedBy: string | null;
  reviewedAt: number | null;
  createdAt: number;
}

interface ModerationIncidentRow {
  id: string;
  category: ModerationIncidentCategory;
  source_type: ModerationIncidentSourceType;
  server_id: string | null;
  channel_id: string | null;
  subject_user_id: string | null;
  confidence: number;
  priority: ModerationIncidentPriority;
  status: ModerationIncidentStatus;
  reviewed_by: string | null;
  reviewed_at: number | null;
  created_at: number;
}

function toRecord(row: ModerationIncidentRow): ModerationIncidentRecord {
  return {
    id: row.id,
    category: row.category,
    sourceType: row.source_type,
    serverId: row.server_id,
    channelId: row.channel_id,
    subjectUserId: row.subject_user_id,
    confidence: row.confidence,
    priority: row.priority,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  };
}

const insertStatement = db.prepare(`
  INSERT INTO moderation_incidents
    (id, category, source_type, server_id, channel_id, subject_user_id, confidence, priority, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
`);
const selectByIdStatement = db.prepare('SELECT * FROM moderation_incidents WHERE id = ?');
// Prioridade alta primeiro, depois mais antigo primeiro — não dá pra usar ORDER BY priority DESC
// direto porque 'normal' vem depois de 'high' em ordem alfabética.
const selectByStatusStatement = db.prepare(
  `SELECT * FROM moderation_incidents WHERE status = ? ORDER BY CASE priority WHEN 'high' THEN 0 ELSE 1 END, created_at ASC`,
);
const resolveStatement = db.prepare(
  'UPDATE moderation_incidents SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?',
);

export function createModerationIncident(input: {
  category: ModerationIncidentCategory;
  sourceType: ModerationIncidentSourceType;
  serverId: string | null;
  channelId: string | null;
  subjectUserId: string | null;
  confidence: number;
  priority: ModerationIncidentPriority;
}): ModerationIncidentRecord {
  const id = randomUUID();
  const createdAt = Date.now();
  insertStatement.run(
    id,
    input.category,
    input.sourceType,
    input.serverId,
    input.channelId,
    input.subjectUserId,
    input.confidence,
    input.priority,
    createdAt,
  );
  return { id, ...input, status: 'open', reviewedBy: null, reviewedAt: null, createdAt };
}

export function getModerationIncidentById(id: string): ModerationIncidentRecord | undefined {
  const row = selectByIdStatement.get(id) as unknown as ModerationIncidentRow | undefined;
  return row && toRecord(row);
}

export function listModerationIncidentsByStatus(status: ModerationIncidentStatus): ModerationIncidentRecord[] {
  return (selectByStatusStatement.all(status) as unknown as ModerationIncidentRow[]).map(toRecord);
}

export function resolveModerationIncident(
  id: string,
  reviewerId: string,
  status: 'confirmed' | 'dismissed',
): void {
  resolveStatement.run(status, reviewerId, Date.now(), id);
}
