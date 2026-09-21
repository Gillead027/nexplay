import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { parseImageDataUrl, type AccentColor, type AvatarFrame } from '@nexplay/shared';
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
  assetsRev: number;
  timeoutUntil: number | null;
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
  assets_rev: number;
  timeout_until: number | null;
}

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
    assetsRev: row.assets_rev,
    timeoutUntil: row.timeout_until,
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
    assetsRev: 0,
    timeoutUntil: null,
  };
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
