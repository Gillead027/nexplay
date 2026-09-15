import { randomBytes } from 'node:crypto';
import type { Invite } from '@sausixudos/shared';
import { db } from './db.js';
import { assignDefaultRole } from './roles.js';
import { addServerMember, isServerMember } from './serverMembers.js';

interface InviteRow {
  code: string;
  server_id: string;
  created_by: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: number | null;
  created_at: number;
}

const selectInviteByServerStatement = db.prepare('SELECT * FROM invites WHERE server_id = ?');
const selectInviteByCodeStatement = db.prepare('SELECT * FROM invites WHERE code = ?');
const insertInviteStatement = db.prepare(
  'INSERT INTO invites (code, server_id, created_by, max_uses, uses, expires_at, created_at) VALUES (?, ?, ?, NULL, 0, NULL, ?)',
);
const deleteInviteByServerStatement = db.prepare('DELETE FROM invites WHERE server_id = ?');
const incrementUsesStatement = db.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?');

function toInvite(row: InviteRow): Invite {
  return {
    code: row.code,
    serverId: row.server_id,
    createdBy: row.created_by,
    uses: row.uses,
    maxUses: row.max_uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// Curto e amigável de digitar/colar (8 chars base32-like, sem 0/O/1/I pra
// evitar ambiguidade visual) — colisão é praticamente impossível nesta
// escala, mas o retry existe pra nunca gerar um 500 num caso raro.
function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

export function getServerInvite(serverId: string): Invite | undefined {
  const row = selectInviteByServerStatement.get(serverId) as unknown as InviteRow | undefined;
  return row && toInvite(row);
}

// Idempotente: se o servidor já tem um convite, devolve o mesmo sem criar
// outro — "gerar novo código" é uma ação explícita separada (regenerate).
export function getOrCreateServerInvite(serverId: string, createdBy: string): Invite {
  const existing = getServerInvite(serverId);
  if (existing) return existing;
  return insertNewInvite(serverId, createdBy);
}

export function regenerateServerInvite(serverId: string, createdBy: string): Invite {
  deleteInviteByServerStatement.run(serverId);
  return insertNewInvite(serverId, createdBy);
}

function insertNewInvite(serverId: string, createdBy: string): Invite {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    if (selectInviteByCodeStatement.get(code)) continue;
    insertInviteStatement.run(code, serverId, createdBy, Date.now());
    return getServerInvite(serverId) as Invite;
  }
  throw new Error('Não foi possível gerar um código de convite único.');
}

export function getInviteByCode(code: string): Invite | undefined {
  const row = selectInviteByCodeStatement.get(code) as unknown as InviteRow | undefined;
  return row && toInvite(row);
}

export type RedeemInviteResult =
  | { ok: true; serverId: string; alreadyMember: boolean }
  | { ok: false; reason: 'NOT_FOUND' };

// max_uses/expires_at ficam sempre NULL nesta rodada (ver
// DISCORD_PARITY_PLAN.md) — a checagem já está aqui, pronta pra quando a UI
// de convite com limite/expiração existir, sem exigir outra migração.
export function redeemInvite(code: string, userId: string): RedeemInviteResult {
  const invite = getInviteByCode(code);
  if (!invite) return { ok: false, reason: 'NOT_FOUND' };
  if (invite.expiresAt !== null && invite.expiresAt < Date.now()) return { ok: false, reason: 'NOT_FOUND' };
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return { ok: false, reason: 'NOT_FOUND' };

  const alreadyMember = isServerMember(invite.serverId, userId);
  if (!alreadyMember) {
    addServerMember(invite.serverId, userId);
    assignDefaultRole(invite.serverId, userId);
    incrementUsesStatement.run(code);
  }
  return { ok: true, serverId: invite.serverId, alreadyMember };
}
