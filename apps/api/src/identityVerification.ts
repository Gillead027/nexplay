import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export type VerificationAttemptStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface VerificationAttemptRecord {
  id: string;
  userId: string;
  vendor: string;
  vendorSessionRef: string;
  status: VerificationAttemptStatus;
  failureReason: string;
  createdAt: number;
  updatedAt: number;
}

interface VerificationAttemptRow {
  id: string;
  user_id: string;
  vendor: string;
  vendor_session_ref: string;
  status: VerificationAttemptStatus;
  failure_reason: string;
  created_at: number;
  updated_at: number;
}

function toRecord(row: VerificationAttemptRow): VerificationAttemptRecord {
  return {
    id: row.id,
    userId: row.user_id,
    vendor: row.vendor,
    vendorSessionRef: row.vendor_session_ref,
    status: row.status,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const insertStatement = db.prepare(
  `INSERT INTO identity_verification_attempts (id, user_id, vendor, vendor_session_ref, status, failure_reason, created_at, updated_at)
   VALUES (?, ?, ?, ?, 'pending', '', ?, ?)`,
);
// Mais recente primeiro: se o vendor reusar/reemitir uma referência (ou o app reenviar o
// webhook), a tentativa em aberto mais nova é a que deve ser resolvida.
const selectByVendorRefStatement = db.prepare(
  'SELECT * FROM identity_verification_attempts WHERE vendor_session_ref = ? ORDER BY created_at DESC LIMIT 1',
);
const updateStatusStatement = db.prepare(
  'UPDATE identity_verification_attempts SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?',
);

export function createVerificationAttempt(userId: string, vendor: string, vendorSessionRef: string): VerificationAttemptRecord {
  const id = randomUUID();
  const now = Date.now();
  insertStatement.run(id, userId, vendor, vendorSessionRef, now, now);
  return { id, userId, vendor, vendorSessionRef, status: 'pending', failureReason: '', createdAt: now, updatedAt: now };
}

export function getAttemptByVendorRef(vendorSessionRef: string): VerificationAttemptRecord | undefined {
  const row = selectByVendorRefStatement.get(vendorSessionRef) as unknown as VerificationAttemptRow | undefined;
  return row && toRecord(row);
}

export function resolveAttempt(id: string, status: VerificationAttemptStatus, failureReason: string): void {
  updateStatusStatement.run(status, failureReason, Date.now(), id);
}
