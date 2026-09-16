import { randomUUID } from 'node:crypto';
import type { Category, CategoryPrefs, NotificationMode } from '@nexplay/shared';
import { db } from './db.js';

interface CategoryRow {
  id: string;
  server_id: string;
  name: string;
  position: number;
  staff_only: number;
  created_at: number;
}

interface CategoryPrefsRow {
  category_id: string;
  collapsed: number;
  notification_mode: NotificationMode;
}

const listCategoriesStatement = db.prepare(
  'SELECT * FROM categories WHERE server_id = ? ORDER BY position ASC, created_at ASC',
);
const selectCategoryByIdStatement = db.prepare('SELECT * FROM categories WHERE id = ?');
const selectMaxPositionStatement = db.prepare('SELECT MAX(position) AS maxPosition FROM categories WHERE server_id = ?');
const insertCategoryStatement = db.prepare(
  'INSERT INTO categories (id, server_id, name, position, staff_only, created_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const updateCategoryStatement = db.prepare('UPDATE categories SET name = ?, staff_only = ? WHERE id = ?');
const deleteCategoryStatement = db.prepare('DELETE FROM categories WHERE id = ?');
const uncategorizeTextChannelsStatement = db.prepare('UPDATE text_channels SET category_id = NULL WHERE category_id = ?');
const uncategorizeVoiceChannelsStatement = db.prepare('UPDATE voice_channels SET category_id = NULL WHERE category_id = ?');

const selectPrefsStatement = db.prepare(
  'SELECT category_id, collapsed, notification_mode FROM category_prefs WHERE user_id = ? AND category_id = ?',
);
const listPrefsForUserStatement = db.prepare(
  'SELECT category_id, collapsed, notification_mode FROM category_prefs WHERE user_id = ?',
);
const upsertPrefsStatement = db.prepare(`
  INSERT INTO category_prefs (user_id, category_id, collapsed, notification_mode)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, category_id) DO UPDATE SET
    collapsed = excluded.collapsed,
    notification_mode = excluded.notification_mode
`);

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    serverId: row.server_id,
    name: row.name,
    position: row.position,
    staffOnly: Boolean(row.staff_only),
    createdAt: row.created_at,
  };
}

function toPrefs(row: CategoryPrefsRow): CategoryPrefs {
  return {
    categoryId: row.category_id,
    collapsed: Boolean(row.collapsed),
    notificationMode: row.notification_mode,
  };
}

export function listCategories(serverId: string): Category[] {
  return (listCategoriesStatement.all(serverId) as unknown as CategoryRow[]).map(toCategory);
}

export function getCategoryById(id: string): Category | undefined {
  const row = selectCategoryByIdStatement.get(id) as unknown as CategoryRow | undefined;
  return row && toCategory(row);
}

export function createCategory(serverId: string, name: string, staffOnly = false): Category {
  const { maxPosition } = selectMaxPositionStatement.get(serverId) as { maxPosition: number | null };
  const category: Category = {
    id: randomUUID(),
    serverId,
    name,
    position: (maxPosition ?? -1) + 1,
    staffOnly,
    createdAt: Date.now(),
  };
  insertCategoryStatement.run(category.id, category.serverId, category.name, category.position, staffOnly ? 1 : 0, category.createdAt);
  return category;
}

export type UpdateCategoryResult = { ok: true; category: Category } | { ok: false; reason: 'NOT_FOUND' };

export function updateCategory(
  serverId: string,
  id: string,
  patch: { name?: string | undefined; staffOnly?: boolean | undefined },
): UpdateCategoryResult {
  const existing = getCategoryById(id);
  if (!existing || existing.serverId !== serverId) return { ok: false, reason: 'NOT_FOUND' };
  const next: Category = {
    ...existing,
    name: patch.name ?? existing.name,
    staffOnly: patch.staffOnly ?? existing.staffOnly,
  };
  updateCategoryStatement.run(next.name, next.staffOnly ? 1 : 0, id);
  return { ok: true, category: next };
}

// Apagar categoria não apaga os canais dentro dela — eles voltam a ficar
// sem categoria (mesmo comportamento do Discord real).
export function deleteCategory(id: string): boolean {
  uncategorizeTextChannelsStatement.run(id);
  uncategorizeVoiceChannelsStatement.run(id);
  return deleteCategoryStatement.run(id).changes > 0;
}

export function getCategoryPrefs(userId: string, categoryId: string): CategoryPrefs {
  const row = selectPrefsStatement.get(userId, categoryId) as unknown as CategoryPrefsRow | undefined;
  return row ? toPrefs(row) : { categoryId, collapsed: false, notificationMode: 'all' };
}

export function listCategoryPrefsForUser(userId: string): CategoryPrefs[] {
  return (listPrefsForUserStatement.all(userId) as unknown as CategoryPrefsRow[]).map(toPrefs);
}

export function setCategoryPrefs(
  userId: string,
  categoryId: string,
  patch: { collapsed?: boolean | undefined; notificationMode?: NotificationMode | undefined },
): CategoryPrefs {
  const current = getCategoryPrefs(userId, categoryId);
  const next: CategoryPrefs = {
    categoryId,
    collapsed: patch.collapsed ?? current.collapsed,
    notificationMode: patch.notificationMode ?? current.notificationMode,
  };
  upsertPrefsStatement.run(userId, categoryId, next.collapsed ? 1 : 0, next.notificationMode);
  return next;
}
