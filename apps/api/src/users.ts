import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  PRESENCE_STATUSES,
  parseImageDataUrl,
  type AccentColor,
  type AvatarFrame,
  type IdentityVerificationStatus,
  type PresenceStatus,
} from '@nexplay/shared';
import { db } from './db.js';

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  accentColor: AccentColor;
  statusText: string;
  bio: string;
  pronouns: string;
  avatarDataUrl: string;
  bannerDataUrl: string;
  bannerAnimated: boolean;
  avatarFrame: AvatarFrame | '';
  presenceStatus: PresenceStatus;
  assetsRev: number;
  timeoutUntil: number | null;
  identityVerificationStatus: IdentityVerificationStatus;
  identityVerifiedAt: number | null;
  identityVerificationRef: string;
}

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  accent_color: AccentColor;
  status_text: string;
  bio: string;
  pronouns: string;
  avatar_data_url: string;
  banner_data_url: string;
  banner_animated: number;
  avatar_frame: AvatarFrame | '';
  presence_status: string;
  assets_rev: number;
  timeout_until: number | null;
  identity_verification_status: string;
  identity_verified_at: number | null;
  identity_verification_ref: string;
}

const asIdentityVerificationStatus = (value: string): IdentityVerificationStatus =>
  value === 'pending' || value === 'verified' || value === 'rejected' ? value : 'unverified';

const asPresenceStatus = (value: string): PresenceStatus =>
  (PRESENCE_STATUSES as readonly string[]).includes(value) ? (value as PresenceStatus) : 'online';

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    accentColor: row.accent_color,
    statusText: row.status_text,
    bio: row.bio,
    pronouns: row.pronouns,
    avatarDataUrl: row.avatar_data_url,
    bannerDataUrl: row.banner_data_url,
    bannerAnimated: row.banner_animated === 1,
    avatarFrame: row.avatar_frame,
    presenceStatus: asPresenceStatus(row.presence_status),
    assetsRev: row.assets_rev,
    timeoutUntil: row.timeout_until,
    identityVerificationStatus: asIdentityVerificationStatus(row.identity_verification_status),
    identityVerifiedAt: row.identity_verified_at,
    identityVerificationRef: row.identity_verification_ref,
  };
}

const insertUser = db.prepare(
  'INSERT INTO users (id, username, password_hash, accent_color, status_text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const selectByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const selectById = db.prepare('SELECT * FROM users WHERE id = ?');
const updateProfileStatement = db.prepare(
  `UPDATE users SET accent_color = ?, status_text = ?, bio = ?, pronouns = ?, avatar_data_url = ?, avatar_frame = ?, banner_data_url = ?,
    banner_animated = ?, assets_rev = ? WHERE id = ?`,
);
const updateTimeoutStatement = db.prepare('UPDATE users SET timeout_until = ? WHERE id = ?');
const updateIdentityVerificationStatement = db.prepare(
  'UPDATE users SET identity_verification_status = ?, identity_verified_at = ?, identity_verification_ref = ? WHERE id = ?',
);
const updatePresenceStatusStatement = db.prepare('UPDATE users SET presence_status = ? WHERE id = ?');
const selectServerLayoutStatement = db.prepare('SELECT server_layout FROM users WHERE id = ?');
const updateServerLayoutStatement = db.prepare('UPDATE users SET server_layout = ? WHERE id = ?');
const updatePasswordStatement = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');

export function createUser(username: string, password: string, accentColor: AccentColor): UserRecord {
  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  insertUser.run(id, username, passwordHash, accentColor, '', Date.now());
  return {
    id,
    username,
    passwordHash,
    accentColor,
    statusText: '',
    bio: '',
    pronouns: '',
    avatarDataUrl: '',
    bannerDataUrl: '',
    bannerAnimated: false,
    avatarFrame: '',
    presenceStatus: 'online',
    assetsRev: 0,
    timeoutUntil: null,
    identityVerificationStatus: 'unverified',
    identityVerifiedAt: null,
    identityVerificationRef: '',
  };
}

export function setUserPresenceStatus(id: string, status: PresenceStatus): void {
  updatePresenceStatusStatement.run(status, id);
}

// Chamada só pelo fluxo de verificação de identidade (ver identityVerification.ts): 'pending'
// ao iniciar, 'verified'/'rejected' quando o webhook do vendor resolve a tentativa.
export function setIdentityVerificationStatus(
  id: string,
  status: IdentityVerificationStatus,
  verifiedAt: number | null,
  ref: string,
): void {
  updateIdentityVerificationStatement.run(status, verifiedAt, ref, id);
}

// A organização da lista de servidores fica como JSON opaco aqui; quem valida o formato é a rota (serverLayout.ts).
export function getUserServerLayoutJson(id: string): string {
  return ((selectServerLayoutStatement.get(id) as { server_layout: string } | undefined)?.server_layout) ?? '';
}

export function setUserServerLayoutJson(id: string, json: string): void {
  updateServerLayoutStatement.run(json, id);
}

export function setUserTimeout(id: string, until: number | null): void {
  updateTimeoutStatement.run(until, id);
}

export function getUserByUsername(username: string): UserRecord | undefined {
  const row = selectByUsername.get(username) as UserRow | undefined;
  return row && toRecord(row);
}

export function getUserById(id: string): UserRecord | undefined {
  const row = selectById.get(id) as UserRow | undefined;
  return row && toRecord(row);
}

export function verifyPassword(user: UserRecord, password: string): boolean {
  return bcrypt.compareSync(password, user.passwordHash);
}

export function updateUserPassword(id: string, newPassword: string): void {
  updatePasswordStatement.run(bcrypt.hashSync(newPassword, 10), id);
}

// Atualiza o perfil. `bannerDataUrl` e `avatarFrame` ausentes (undefined) mantêm o que já estava; '' remove a capa / a borda.
export function updateUserProfile(
  id: string,
  fields: {
    accentColor: AccentColor;
    statusText: string;
    bio: string;
    pronouns: string;
    avatarDataUrl: string;
    bannerDataUrl?: string | undefined;
    avatarFrame?: AvatarFrame | '' | undefined;
  },
): UserRecord | undefined {
  const current = getUserById(id);
  if (!current) return undefined;
  const bannerChanged = fields.bannerDataUrl !== undefined && fields.bannerDataUrl !== current.bannerDataUrl;
  const bannerDataUrl = fields.bannerDataUrl ?? current.bannerDataUrl;
  const bannerAnimated = bannerChanged ? (parseImageDataUrl(bannerDataUrl)?.animated ?? false) : current.bannerAnimated;
  updateProfileStatement.run(
    fields.accentColor,
    fields.statusText,
    fields.bio,
    fields.pronouns,
    fields.avatarDataUrl,
    fields.avatarFrame ?? current.avatarFrame,
    bannerDataUrl,
    Number(bannerAnimated),
    bannerChanged ? current.assetsRev + 1 : current.assetsRev,
    id,
  );
  return getUserById(id);
}
