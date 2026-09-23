import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type Channel, type Server } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request) => Promise<void>, envOverrides: Record<string, string> = {}) {
  const probe = createNetServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'admin-servers-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
      ...envOverrides,
    },
    stdio: 'ignore',
  });
  const request: Request = (path, method = 'GET', body, cookie = '') =>
    fetch(origin + '/api' + path, { method, headers: { cookie, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await request('/auth/registration'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'API starts');
    await run(request);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
}

async function signUp(request: Request, username: string): Promise<string> {
  const response = await request('/auth/register', 'POST', { username, password: 'admin-servers-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

test('rotas /api/admin/servers exigem admin', async () => {
  await withApi(async (request) => {
    const cookie = await signUp(request, 'PessoaComum');
    assert.equal((await request('/admin/servers', 'GET', undefined, cookie)).status, 403);
    assert.equal((await request('/admin/servers/algum-id/channels', 'GET', undefined, cookie)).status, 403);
    assert.equal((await request('/admin/servers/algum-id/text-channels/algum-canal/messages', 'GET', undefined, cookie)).status, 403);
  });
});

test('admin vê servidor e mensagens sem ser membro, mas não consegue postar por essa rota', async () => {
  await withApi(
    async (request) => {
      // "Dono" cria um servidor comum e manda uma mensagem no canal padrão.
      const donoCookie = await signUp(request, 'Dono');
      const { server } = (await (await request('/servers', 'POST', { name: 'ServidorAlheio' }, donoCookie)).json()) as { server: Server };
      const { channels } = (await (await request(`/servers/${server.id}/channels`, 'GET', undefined, donoCookie)).json()) as { channels: Channel[] };
      const textChannel = channels.find((channel) => channel.type === 'TEXT')!;
      await request(`/servers/${server.id}/text-channels/${textChannel.id}/messages`, 'POST', { text: 'mensagem do dono' }, donoCookie);

      // "Chefe" é admin da instância, mas nunca entrou nesse servidor.
      const chefeCookie = await signUp(request, 'Chefe');
      assert.equal(
        (await request(`/servers/${server.id}/channels`, 'GET', undefined, chefeCookie)).status,
        404,
        'rota normal de membro continua bloqueada pra quem não é membro',
      );

      const listResponse = await request('/admin/servers', 'GET', undefined, chefeCookie);
      assert.equal(listResponse.status, 200);
      const { servers } = (await listResponse.json()) as { servers: Server[] };
      assert.ok(servers.some((item) => item.id === server.id));

      const channelsResponse = await request(`/admin/servers/${server.id}/channels`, 'GET', undefined, chefeCookie);
      assert.equal(channelsResponse.status, 200);
      const { channels: adminChannels } = (await channelsResponse.json()) as { channels: Channel[] };
      assert.ok(adminChannels.some((channel) => channel.id === textChannel.id));

      const messagesResponse = await request(
        `/admin/servers/${server.id}/text-channels/${textChannel.id}/messages`,
        'GET',
        undefined,
        chefeCookie,
      );
      assert.equal(messagesResponse.status, 200);
      const { messages } = (await messagesResponse.json()) as { messages: { text: string }[] };
      assert.ok(messages.some((message) => message.text === 'mensagem do dono'));

      // A superfície de admin é só leitura: não existe rota de postar mensagem sob /api/admin/servers.
      const postAttempt = await request(
        `/admin/servers/${server.id}/text-channels/${textChannel.id}/messages`,
        'POST',
        { text: 'tentativa do admin' },
        chefeCookie,
      );
      assert.equal(postAttempt.status, 404);
    },
    { ADMIN_USERNAMES: 'Chefe' },
  );
});

test('servidor ou canal inexistente devolve 404 pro admin', async () => {
  await withApi(
    async (request) => {
      const cookie = await signUp(request, 'Chefe');
      assert.equal((await request('/admin/servers/inexistente/channels', 'GET', undefined, cookie)).status, 404);
      assert.equal(
        (await request('/admin/servers/inexistente/text-channels/inexistente/messages', 'GET', undefined, cookie)).status,
        404,
      );
    },
    { ADMIN_USERNAMES: 'Chefe' },
  );
});
