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
  documentObjectKey: string;
  selfieObjectKey: string;
  documentContentType: string;
  selfieContentType: string;
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
  document_object_key: string;
  selfie_object_key: string;
  document_content_type: string;
  selfie_content_type: string;
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
    documentObjectKey: row.document_object_key,
    selfieObjectKey: row.selfie_object_key,
    documentContentType: row.document_content_type,
    selfieContentType: row.selfie_content_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const insertStatement = db.prepare(
  `INSERT INTO identity_verification_attempts (id, user_id, vendor, vendor_session_ref, status, failure_reason, created_at, updated_at)
   VALUES (?, ?, ?, ?, 'pending', '', ?, ?)`,
);
const insertManualStatement = db.prepare(
  `INSERT INTO identity_verification_attempts
     (id, user_id, vendor, vendor_session_ref, status, failure_reason,
      document_object_key, selfie_object_key, document_content_type, selfie_content_type, created_at, updated_at)
   VALUES (?, ?, 'manual', '', 'pending', '', ?, ?, ?, ?, ?, ?)`,
);
// Mais recente primeiro: se o vendor reusar/reemitir uma referência (ou o app reenviar o
// webhook), a tentativa em aberto mais nova é a que deve ser resolvida.
const selectByVendorRefStatement = db.prepare(
  'SELECT * FROM identity_verification_attempts WHERE vendor_session_ref = ? ORDER BY created_at DESC LIMIT 1',
);
const selectByIdStatement = db.prepare('SELECT * FROM identity_verification_attempts WHERE id = ?');
// Mais antiga primeiro: fila justa — quem mandou primeiro é revisado primeiro.
const selectPendingManualStatement = db.prepare(
  "SELECT * FROM identity_verification_attempts WHERE vendor = 'manual' AND status = 'pending' ORDER BY created_at ASC",
);
const updateStatusStatement = db.prepare(
  'UPDATE identity_verification_attempts SET status = ?, failure_reason = ?, updated_at = ? WHERE id = ?',
);
// Zera as duas colunas junto com o status: depois de decidida (e as imagens apagadas do MinIO
// pelo chamador), a tentativa não deve mais apontar pra nenhum object_key.
const resolveManualStatement = db.prepare(
  `UPDATE identity_verification_attempts
   SET status = ?, failure_reason = ?, document_object_key = '', selfie_object_key = '', document_content_type = '', selfie_content_type = '', updated_at = ?
   WHERE id = ?`,
);

export function createVerificationAttempt(userId: string, vendor: string, vendorSessionRef: string): VerificationAttemptRecord {
  const id = randomUUID();
  const now = Date.now();
  insertStatement.run(id, userId, vendor, vendorSessionRef, now, now);
  return {
    id, userId, vendor, vendorSessionRef, status: 'pending', failureReason: '',
    documentObjectKey: '', selfieObjectKey: '', documentContentType: '', selfieContentType: '',
    createdAt: now, updatedAt: now,
  };
}

export function createManualVerificationAttempt(
  userId: string,
  document: { objectKey: string; contentType: string },
  selfie: { objectKey: string; contentType: string },
): VerificationAttemptRecord {
  const id = randomUUID();
  const now = Date.now();
  insertManualStatement.run(id, userId, document.objectKey, selfie.objectKey, document.contentType, selfie.contentType, now, now);
  return {
    id, userId, vendor: 'manual', vendorSessionRef: '', status: 'pending', failureReason: '',
    documentObjectKey: document.objectKey, selfieObjectKey: selfie.objectKey,
    documentContentType: document.contentType, selfieContentType: selfie.contentType,
    createdAt: now, updatedAt: now,
  };
}

export function getAttemptByVendorRef(vendorSessionRef: string): VerificationAttemptRecord | undefined {
  const row = selectByVendorRefStatement.get(vendorSessionRef) as unknown as VerificationAttemptRow | undefined;
  return row && toRecord(row);
}

export function getAttemptById(id: string): VerificationAttemptRecord | undefined {
  const row = selectByIdStatement.get(id) as unknown as VerificationAttemptRow | undefined;
  return row && toRecord(row);
}

export function listPendingManualAttempts(): VerificationAttemptRecord[] {
  return (selectPendingManualStatement.all() as unknown as VerificationAttemptRow[]).map(toRecord);
}

export function resolveAttempt(id: string, status: VerificationAttemptStatus, failureReason: string): void {
  updateStatusStatement.run(status, failureReason, Date.now(), id);
}

// Usado só pelo fluxo manual: o chamador (rota de decisão) já apagou as imagens do MinIO antes
// de chamar isto — aqui só grava o resultado e limpa as referências aos objetos removidos.
export function resolveManualAttempt(id: string, status: 'verified' | 'rejected', reason: string): void {
  resolveManualStatement.run(status, reason, Date.now(), id);
}
