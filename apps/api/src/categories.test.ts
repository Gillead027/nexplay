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

test('categorias: CRUD, filtro staffOnly e modo lento por canal', async () => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'categories-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: { ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', INVITE_TOKEN: 'categories-test-invite',
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
      const response = await request('/auth/register', '', 'POST', { username, password: 'categories-test-password', inviteToken: 'categories-test-invite', accentColor: ACCENT_COLORS[0] });
      assert.equal(response.status, 201);
      return response.headers.get('set-cookie')!.split(';')[0]!;
    }
    const owner = await register('CategoriesOwner');
    const member = await register('CategoriesMember');
    const create = await request('/servers', owner, 'POST', { name: 'Categories server' });
    assert.equal(create.status, 201);
    const { server } = await create.json() as { server: { id: string } };
    const { servers } = await (await request('/servers', owner)).json() as { servers: { id: string }[] };
    const targetServer = servers.find((item) => item.id === server.id)!;
    const db = new DatabaseSync(join(directory, 'test.db'));
    const memberRow = db.prepare('SELECT id FROM users WHERE username = ?').get('CategoriesMember') as { id: string };
    db.prepare('INSERT INTO server_members(server_id,user_id,joined_at) VALUES(?,?,?)').run(targetServer.id, memberRow.id, Date.now());
    db.close();

    // Membro sem MANAGE_CHANNELS não pode criar categoria.
    assert.equal((await request(`/servers/${targetServer.id}/categories`, member, 'POST', { name: 'Staff' })).status, 403);

    const createStaffCategory = await request(`/servers/${targetServer.id}/categories`, owner, 'POST', { name: 'Staff Chats', staffOnly: true });
    assert.equal(createStaffCategory.status, 201);
    const { category: staffCategory } = await createStaffCategory.json() as { category: { id: string } };

    const createPublicCategory = await request(`/servers/${targetServer.id}/categories`, owner, 'POST', { name: 'Interação' });
    assert.equal(createPublicCategory.status, 201);

    // Membro comum vê só a categoria pública.
    const memberCategories = await (await request(`/servers/${targetServer.id}/categories`, member)).json() as { categories: { id: string }[] };
    assert.equal(memberCategories.categories.length, 1);
    assert.notEqual(memberCategories.categories[0]!.id, staffCategory.id);
    // Owner (Administrador) vê as duas.
    const ownerCategories = await (await request(`/servers/${targetServer.id}/categories`, owner)).json() as { categories: { id: string }[] };
    assert.equal(ownerCategories.categories.length, 2);

    // Canal de texto dentro da categoria staffOnly some da listagem de quem não é staff.
    const createdChannel = await request(`/servers/${targetServer.id}/text-channels`, owner, 'POST', { name: 'logs-in-calls', description: 'logs' });
    const { channel } = await createdChannel.json() as { channel: { id: string } };
    const settingsResponse = await request(`/servers/${targetServer.id}/text-channels/${channel.id}/settings`, owner, 'PATCH', { categoryId: staffCategory.id });
    assert.equal(settingsResponse.status, 200);

    const memberChannels = await (await request(`/servers/${targetServer.id}/text-channels`, member)).json() as { channels: { id: string }[] };
    assert.ok(!memberChannels.channels.some((item) => item.id === channel.id), 'membro comum não vê canal da categoria staffOnly');
    const ownerChannels = await (await request(`/servers/${targetServer.id}/text-channels`, owner)).json() as { channels: { id: string }[] };
    assert.ok(ownerChannels.channels.some((item) => item.id === channel.id), 'owner (staff) vê o canal');

    // Editar categoria (nome) e depois excluir: canal volta a ficar sem categoria.
    const renameCategory = await request(`/servers/${targetServer.id}/categories/${staffCategory.id}`, owner, 'PATCH', { name: 'Staff renomeada' });
    assert.equal(renameCategory.status, 200);
    assert.equal((await request(`/servers/${targetServer.id}/categories/${staffCategory.id}`, owner, 'DELETE')).status, 204);
    const channelsAfterDelete = await (await request(`/servers/${targetServer.id}/text-channels`, member)).json() as { channels: { id: string; categoryId: string | null }[] };
    const survivingChannel = channelsAfterDelete.channels.find((item) => item.id === channel.id);
    assert.ok(survivingChannel, 'canal sobrevive à exclusão da categoria');
    assert.equal(survivingChannel!.categoryId, null);

    // Modo lento: 2 mensagens seguidas do MESMO membro comum (não-admin, já
    // que Administrador/MANAGE_MESSAGES é isento de propósito, igual Discord
    // real) são bloqueadas na segunda.
    const slowChannel = await request(`/servers/${targetServer.id}/text-channels`, owner, 'POST', { name: 'devagar', description: '' });
    const { channel: slow } = await slowChannel.json() as { channel: { id: string } };
    await request(`/servers/${targetServer.id}/text-channels/${slow.id}/settings`, owner, 'PATCH', { slowModeSeconds: 30 });
    const firstMessage = await request(`/servers/${targetServer.id}/text-channels/${slow.id}/messages`, member, 'POST', { text: 'oi' });
    assert.equal(firstMessage.status, 201);
    const secondMessage = await request(`/servers/${targetServer.id}/text-channels/${slow.id}/messages`, member, 'POST', { text: 'de novo' });
    assert.equal(secondMessage.status, 429);
    // O dono (isento) consegue mandar mesmo com o modo lento ativo.
    const ownerMessage = await request(`/servers/${targetServer.id}/text-channels/${slow.id}/messages`, owner, 'POST', { text: 'moderador' });
    assert.equal(ownerMessage.status, 201);

    // Preferências de categoria (recolher/notificação) são por usuário.
    const prefsResponse = await request(`/servers/${targetServer.id}/categories/${(await (await request(`/servers/${targetServer.id}/categories`, owner)).json() as { categories: { id: string }[] }).categories[0]!.id}/prefs`, member, 'PATCH', { collapsed: true });
    assert.equal(prefsResponse.status, 200);
  } finally {
    const stopped = once(child, 'exit');
    child.kill();
    await stopped;
    rmSync(directory, { recursive: true, force: true });
  }
});
