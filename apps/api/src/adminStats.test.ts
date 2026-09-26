import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { collectAdminOverview, isInstanceAdmin, looksLikeTestAccount } from './adminStats.js';

test('só quem está em ADMIN_USERNAMES é administrador, sem diferenciar maiúsculas', () => {
  assert.equal(isInstanceAdmin('Gillezin', 'gillezin'), true);
  assert.equal(isInstanceAdmin('gillezin', ' Outra , Gillezin '), true);
  assert.equal(isInstanceAdmin('Samu', 'Gillezin'), false);
  assert.equal(isInstanceAdmin('Gillezin', ''), false);
  assert.equal(isInstanceAdmin('', ','), false);
});

test('contas com nome de teste são separadas das pessoas', () => {
  for (const name of ['smoketest', 'smoke_a_mu27pv32', 'SmokeEmoji1', 'e2eprd84521354', 'prdfra89095741', 'DebugTest1', 'SmkRb21719801']) {
    assert.equal(looksLikeTestAccount(name), true, name);
  }
  for (const name of ['Gillezin', 'Tomarakyi', 'Jão', 'Samu']) assert.equal(looksLikeTestAccount(name), false, name);
});

test('a visão geral conta pessoas, servidores, mensagens e anexos', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nexplay-admin-'));
  const dbPath = join(directory, 'test.db');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, created_at INTEGER);
      CREATE TABLE servers (id TEXT PRIMARY KEY, name TEXT, owner_id TEXT, created_at INTEGER);
      CREATE TABLE server_members (server_id TEXT, user_id TEXT);
      CREATE TABLE text_channels (id TEXT PRIMARY KEY, server_id TEXT);
      CREATE TABLE voice_channels (id TEXT PRIMARY KEY, server_id TEXT);
      CREATE TABLE text_messages (id TEXT PRIMARY KEY, channel_id TEXT, sender_id TEXT, created_at INTEGER);
      CREATE TABLE dm_messages (id TEXT PRIMARY KEY, sender_id TEXT, created_at INTEGER);
      CREATE TABLE message_attachments (id TEXT PRIMARY KEY, size_bytes INTEGER);
      CREATE TABLE dm_attachments (id TEXT PRIMARY KEY, size_bytes INTEGER);
    `);
    const now = 1_800_000_000_000;
    const day = 86_400_000;
    const user = db.prepare('INSERT INTO users VALUES (?, ?, ?)');
    user.run('u1', 'Gillezin', now - 40 * day);
    user.run('u2', 'Samu', now - 3 * day);
    user.run('u3', 'smoketest', now - 2 * day);
    user.run('u4', 'Sem', now - 1 * day);
    db.prepare('INSERT INTO servers VALUES (?, ?, ?, ?)').run('s1', 'Lobby', 'u1', now - 40 * day);
    const member = db.prepare('INSERT INTO server_members VALUES (?, ?)');
    member.run('s1', 'u1');
    member.run('s1', 'u2');
    member.run('s1', 'u3');
    db.prepare('INSERT INTO text_channels VALUES (?, ?)').run('c1', 's1');
    db.prepare('INSERT INTO text_channels VALUES (?, ?)').run('c2', 's1');
    db.prepare('INSERT INTO voice_channels VALUES (?, ?)').run('v1', 's1');
    const text = db.prepare('INSERT INTO text_messages VALUES (?, ?, ?, ?)');
    text.run('m1', 'c1', 'u1', now - 2 * 3_600_000);
    text.run('m2', 'c1', 'u2', now - 2 * day);
    text.run('m3', 'c2', 'u1', now - 20 * day);
    db.prepare('INSERT INTO dm_messages VALUES (?, ?, ?)').run('d1', 'u2', now - 60_000);
    db.prepare('INSERT INTO message_attachments VALUES (?, ?)').run('a1', 1500);
    db.prepare('INSERT INTO message_attachments VALUES (?, ?)').run('a2', 500);
    db.prepare('INSERT INTO dm_attachments VALUES (?, ?)').run('a3', 250);

    const overview = collectAdminOverview({
      db,
      dbPath,
      dataDir: directory,
      now,
      isOnline: (userId) => userId === 'u1',
      voice: { activeRooms: 1, participants: 2 },
    });

    assert.equal(overview.people.total, 4);
    assert.equal(overview.people.testLooking, 1);
    assert.equal(overview.people.real, 3);
    assert.equal(overview.people.online, 1);
    assert.equal(overview.people.new7d, 3);
    assert.equal(overview.people.new30d, 3);
    assert.equal(overview.people.messaged7d, 2);
    assert.equal(overview.people.withoutServer, 1);
    assert.deepEqual(
      overview.people.accounts.map((a) => [a.username, a.servers, a.messages, a.online]),
      [['Gillezin', 1, 2, true], ['Samu', 1, 2, false], ['smoketest', 1, 0, false], ['Sem', 0, 0, false]],
    );

    assert.equal(overview.servers.total, 1);
    assert.deepEqual(
      { ...overview.servers.list[0]! },
      { id: 's1', name: 'Lobby', owner: 'Gillezin', createdAt: now - 40 * day, members: 3, textChannels: 2, voiceChannels: 1, messages: 3 },
    );

    assert.deepEqual(overview.activity, {
      channelMessages: 3,
      directMessages: 1,
      channelMessages24h: 1,
      channelMessages7d: 2,
      directMessages24h: 1,
      directMessages7d: 1,
    });
    assert.equal(overview.storage.attachmentCount, 3);
    assert.equal(overview.storage.attachmentBytes, 2250);
    assert.ok(overview.storage.databaseBytes > 0);
    assert.ok(overview.storage.diskTotalBytes > 0 && overview.storage.diskFreeBytes > 0);
    assert.deepEqual(overview.voice, { activeRooms: 1, participants: 2 });
    assert.ok(overview.machine.cpuCores >= 1 && overview.machine.memoryTotalBytes > 0);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
