import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { ACCENT_COLORS } from '@nexplay/shared';

test('rename channels: persistence, validation, permissions and server isolation', async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'channel-rename-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', INVITE_TOKEN: 'rename-test-invite',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1' },
    stdio: 'ignore',
  });
  async function request(path: string, cookie = '', method = 'GET', body?: unknown) {
    return fetch(origin + '/api' + path, { method, headers: { cookie, origin, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await request('/servers'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'API starts');
    async function register(username: string) {
      const response = await request('/auth/register', '', 'POST', { username, password: 'rename-test-password', inviteToken: 'rename-test-invite', accentColor: ACCENT_COLORS[0] });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')!.split(';')[0]!;
    }
    const owner = await register('RenameOwner');
    const member = await register('RenameMember');
    const create = await request('/servers', owner, 'POST', { name: 'Rename server' });
    assert.equal(create.status, 201);
    const { server } = await create.json() as { server: { id: string } };
    const db = new DatabaseSync(join(directory, 'test.db'));
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('RenameMember') as { id: string };
    db.prepare('INSERT INTO server_members(server_id,user_id,joined_at) VALUES(?,?,?)').run(server.id, user.id, Date.now());
    db.close();
    // Conta nova não entra em nenhum servidor sozinha: o segundo servidor (pra provar o isolamento) é criado à parte.
    const createOther = await request('/servers', owner, 'POST', { name: 'Other server' });
    assert.equal(createOther.status, 201);
    const other = (await createOther.json() as { server: { id: string } }).server;
    const setup = new DatabaseSync(join(directory, 'test.db'));
    const admin = setup.prepare('SELECT id FROM users WHERE username = ?').get('RenameOwner') as { id: string };
    setup.prepare('INSERT INTO roles(id,server_id,name,color,position,hoist,permissions,created_at) VALUES(?,?,?,?,?,?,?,?)').run('test-admin', other.id, 'Test admin', '#ffffff', 100, 1, 8192, Date.now());
    setup.prepare('INSERT INTO user_roles(user_id,role_id,created_at) VALUES(?,?,?)').run(admin.id, 'test-admin', Date.now());
    setup.close();
    for (const kind of ['text', 'voice']) {
      const base = `/servers/${server.id}/${kind}-channels`;
      const created = await request(base, owner, 'POST', { name: 'Original', description: 'Keep description' });
      assert.equal(created.status, 201);
      const { channel } = await created.json() as { channel: { id: string; createdAt: number } };
      const path = `${base}/${channel.id}`;
      assert.equal((await request(path, '', 'PATCH', { name: 'Denied' })).status, 401);
      assert.equal((await request(path, member, 'PATCH', { name: 'Denied' })).status, 403);
      assert.equal((await request(`/servers/${other.id}/${kind}-channels/${channel.id}`, owner, 'PATCH', { name: 'Wrong server' })).status, 404);
      assert.equal((await request(path, owner, 'PATCH', { name: '   ' })).status, 400);
      assert.equal((await request(path, owner, 'PATCH', { name: 'geral' })).status, 409);
      const renamed = await request(path, owner, 'PATCH', { name: '  Novo   nome  ' });
      assert.equal(renamed.status, 200);
      const result = await renamed.json() as { channel: { id: string; name: string; description: string; createdAt: number } };
      assert.equal(result.channel.id, channel.id);
      assert.equal(result.channel.name, 'Novo nome');
      assert.equal(result.channel.description, 'Keep description');
      assert.equal(result.channel.createdAt, channel.createdAt);
      assert.equal((await request(path, owner, 'PATCH', { name: 'Novo nome' })).status, 200);
    }
  } finally {
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
    rmSync(directory, { recursive: true, force: true });
  }
});
