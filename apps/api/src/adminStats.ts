import { statfsSync, statSync } from 'node:fs';
import os from 'node:os';
import type { DatabaseSync } from 'node:sqlite';
import type { AdminOverview } from '@nexplay/shared';

const DAY_MS = 86_400_000;

// Quem vê o painel de administração: os nomes de usuário em ADMIN_USERNAMES
// (separados por vírgula, sem diferenciar maiúsculas). Sem a variável, ninguém vê.
export function isInstanceAdmin(username: string, adminUsernames: string): boolean {
  const wanted = username.trim().toLowerCase();
  if (!wanted) return false;
  return adminUsernames
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .some((name) => name && name === wanted);
}

// O banco de produção acumula contas de teste (smoke, e2e...). Como não existe um
// marcador de "conta de teste" no cadastro, o painel as separa pelo começo do nome; a
// lista de contas fica visível pra conferir.
export function looksLikeTestAccount(username: string): boolean {
  return /^(smoke|smk|e2e|prd|debug|test)/i.test(username.trim());
}

export interface LiveVoiceStats {
  activeRooms: number;
  participants: number;
}

export interface AdminStatsInput {
  db: DatabaseSync;
  dbPath: string;
  dataDir: string;
  now: number;
  isOnline: (userId: string) => boolean;
  voice: LiveVoiceStats | null;
}

function count(db: DatabaseSync, sql: string, ...params: number[]): number {
  return (db.prepare(sql).get(...params) as { n: number }).n;
}

export function collectAdminOverview({ db, dbPath, dataDir, now, isOnline, voice }: AdminStatsInput): AdminOverview {
  const accounts = (
    db
      .prepare(
        `SELECT u.id, u.username, u.created_at AS createdAt,
           (SELECT COUNT(*) FROM server_members m WHERE m.user_id = u.id) AS servers,
           (SELECT COUNT(*) FROM text_messages t WHERE t.sender_id = u.id)
             + (SELECT COUNT(*) FROM dm_messages d WHERE d.sender_id = u.id) AS messages
         FROM users u ORDER BY u.created_at ASC`,
      )
      .all() as { id: string; username: string; createdAt: number; servers: number; messages: number }[]
  ).map((account) => ({
    ...account,
    online: isOnline(account.id),
    testLooking: looksLikeTestAccount(account.username),
  }));

  const servers = db
    .prepare(
      `SELECT s.id, s.name, u.username AS owner, s.created_at AS createdAt,
         (SELECT COUNT(*) FROM server_members m WHERE m.server_id = s.id) AS members,
         (SELECT COUNT(*) FROM text_channels c WHERE c.server_id = s.id) AS textChannels,
         (SELECT COUNT(*) FROM voice_channels v WHERE v.server_id = s.id) AS voiceChannels,
         (SELECT COUNT(*) FROM text_messages t JOIN text_channels c ON c.id = t.channel_id WHERE c.server_id = s.id) AS messages
       FROM servers s LEFT JOIN users u ON u.id = s.owner_id ORDER BY s.created_at ASC`,
    )
    .all() as AdminOverview['servers']['list'];

  const attachments = db
    .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes FROM message_attachments')
    .get() as { n: number; bytes: number };

  const disk = statfsSync(dataDir);
  const testLooking = accounts.filter((account) => account.testLooking).length;

  return {
    generatedAt: now,
    people: {
      total: accounts.length,
      real: accounts.length - testLooking,
      testLooking,
      online: accounts.filter((account) => account.online).length,
      new7d: count(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - 7 * DAY_MS),
      new30d: count(db, 'SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', now - 30 * DAY_MS),
      messaged7d: count(
        db,
        `SELECT COUNT(DISTINCT s) AS n FROM (
           SELECT sender_id AS s FROM text_messages WHERE created_at >= ?
           UNION SELECT sender_id FROM dm_messages WHERE created_at >= ?)`,
        now - 7 * DAY_MS,
        now - 7 * DAY_MS,
      ),
      withoutServer: accounts.filter((account) => account.servers === 0).length,
      accounts,
    },
    servers: { total: servers.length, list: servers },
    activity: {
      channelMessages: count(db, 'SELECT COUNT(*) AS n FROM text_messages'),
      directMessages: count(db, 'SELECT COUNT(*) AS n FROM dm_messages'),
      channelMessages24h: count(db, 'SELECT COUNT(*) AS n FROM text_messages WHERE created_at >= ?', now - DAY_MS),
      channelMessages7d: count(db, 'SELECT COUNT(*) AS n FROM text_messages WHERE created_at >= ?', now - 7 * DAY_MS),
      directMessages24h: count(db, 'SELECT COUNT(*) AS n FROM dm_messages WHERE created_at >= ?', now - DAY_MS),
      directMessages7d: count(db, 'SELECT COUNT(*) AS n FROM dm_messages WHERE created_at >= ?', now - 7 * DAY_MS),
    },
    storage: {
      databaseBytes: statSync(dbPath).size,
      attachmentCount: attachments.n,
      attachmentBytes: attachments.bytes,
      diskTotalBytes: disk.blocks * disk.bsize,
      diskFreeBytes: disk.bavail * disk.bsize,
    },
    voice,
    machine: {
      cpuCores: os.cpus().length,
      load1: os.loadavg()[0] ?? 0,
      load5: os.loadavg()[1] ?? 0,
      load15: os.loadavg()[2] ?? 0,
      memoryTotalBytes: os.totalmem(),
      memoryFreeBytes: os.freemem(),
      apiMemoryBytes: process.memoryUsage().rss,
      apiUptimeSeconds: Math.round(process.uptime()),
      hostUptimeSeconds: Math.round(os.uptime()),
    },
  };
}
