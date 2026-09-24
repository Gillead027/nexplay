import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type Channel, type Server } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'account-deletion-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      MAX_SERVERS_PER_USER: '5', ADMIN_USERNAMES: 'Chefe',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  const request: Request = (path, method = 'GET', body, cookie = '') =>
    fetch(origin + '/api' + path, { method, headers: { cookie, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
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

const PASSWORD = 'senha-de-teste-123';

async function signUp(request: Request, username: string): Promise<{ id: string; cookie: string }> {
  const response = await request('/auth/register', 'POST', { username, password: PASSWORD, accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { id: user.id, cookie };
}

async function joinServer(request: Request, owner: { cookie: string }, member: { cookie: string }, server: Server): Promise<void> {
  const { invite } = (await (await request(`/servers/${server.id}/invite`, 'POST', undefined, owner.cookie)).json()) as { invite: { code: string } };
  assert.equal((await request(`/invites/${invite.code}/redeem`, 'POST', undefined, member.cookie)).status, 201);
}

test('a própria pessoa exclui a conta com a senha: sem senha certa não vale, com ela a conta some e não dá mais para entrar', async () => {
  await withApi(async (request) => {
    const ana = await signUp(request, 'Ana');
    assert.equal((await request('/me', 'DELETE', {}, ana.cookie)).status, 400);
    // 403 (não 401): o cliente lê 401 fora de /auth como sessão expirada e deslogaria a pessoa por errar a senha
    assert.equal((await request('/me', 'DELETE', { password: 'errada' }, ana.cookie)).status, 403);
    assert.equal((await request('/session', 'GET', undefined, ana.cookie)).status, 200);

    assert.equal((await request('/me', 'DELETE', { password: PASSWORD }, ana.cookie)).status, 204);
    assert.equal((await request('/session', 'GET', undefined, ana.cookie)).status, 401);
    assert.equal((await request('/auth/login', 'POST', { username: 'Ana', password: PASSWORD })).status, 401);
    // o nome fica livre de novo
    assert.equal((await request('/auth/register', 'POST', { username: 'Ana', password: PASSWORD, accentColor: ACCENT_COLORS[0] })).status, 201);
  });
});

test('servidor de que a dona sai: com outras pessoas passa para quem já administra (ou entrou primeiro); sozinha, o servidor some', async () => {
  await withApi(async (request) => {
    const ana = await signUp(request, 'Ana');
    const bia = await signUp(request, 'Bia');
    const caio = await signUp(request, 'Caio');
    const com = ((await (await request('/servers', 'POST', { name: 'Com gente' }, ana.cookie)).json()) as { server: Server }).server;
    const sozinha = ((await (await request('/servers', 'POST', { name: 'So eu' }, ana.cookie)).json()) as { server: Server }).server;
    await joinServer(request, ana, bia, com);
    await joinServer(request, ana, caio, com);

    // a prévia mostra o que vai acontecer antes de confirmar
    const preview = (await (await request('/me/deletion-preview', 'GET', undefined, ana.cookie)).json()) as {
      servers: { name: string; action: string; newOwnerName: string | null }[];
      blocked: boolean;
    };
    assert.equal(preview.blocked, false);
    const byName = Object.fromEntries(preview.servers.map((entry) => [entry.name, entry]));
    assert.equal(byName['Com gente']!.action, 'transfer');
    assert.equal(byName['Com gente']!.newOwnerName, 'Bia'); // entrou primeiro
    assert.equal(byName['So eu']!.action, 'delete');

    assert.equal((await request('/me', 'DELETE', { password: PASSWORD }, ana.cookie)).status, 204);

    const biaServers = ((await (await request('/servers', 'GET', undefined, bia.cookie)).json()) as { servers: Server[] }).servers;
    const herdado = biaServers.find((server) => server.id === com.id);
    assert.ok(herdado, 'o servidor continua existindo');
    assert.equal(herdado.ownerId, bia.id);
    assert.ok(!biaServers.some((server) => server.id === sozinha.id));
    // a nova dona de fato administra: consegue apagar o servidor (só o dono pode)
    assert.equal((await request(`/servers/${com.id}`, 'DELETE', { confirmName: 'Com gente' }, bia.cookie)).status, 204);
  });
});

test('as mensagens da conta excluída somem, mas as de quem ficou continuam', async () => {
  await withApi(async (request) => {
    const ana = await signUp(request, 'Ana');
    const bia = await signUp(request, 'Bia');
    const server = ((await (await request('/servers', 'POST', { name: 'Papo' }, ana.cookie)).json()) as { server: Server }).server;
    await joinServer(request, ana, bia, server);
    const channels = ((await (await request(`/servers/${server.id}/channels`, 'GET', undefined, ana.cookie)).json()) as { channels: Channel[] }).channels;
    const text = channels.find((channel) => channel.type === 'TEXT')!;
    const path = `/servers/${server.id}/text-channels/${text.id}/messages`;
    assert.equal((await request(path, 'POST', { text: 'da Ana' }, ana.cookie)).status, 201);
    assert.equal((await request(path, 'POST', { text: 'da Bia' }, bia.cookie)).status, 201);

    assert.equal((await request('/me', 'DELETE', { password: PASSWORD }, ana.cookie)).status, 204);
    const messages = ((await (await request(path, 'GET', undefined, bia.cookie)).json()) as { messages: { text: string }[] }).messages;
    assert.deepEqual(messages.map((message) => message.text), ['da Bia']);
  });
});

test('o admin da instância exclui contas de outras pessoas; quem não é admin não pode, e admin não se apaga por aí', async () => {
  await withApi(async (request) => {
    const chefe = await signUp(request, 'Chefe');
    const teste = await signUp(request, 'e2e-teste');
    const comum = await signUp(request, 'Comum');
    await request('/servers', 'POST', { name: 'Do teste' }, teste.cookie);

    assert.equal((await request(`/admin/users/${teste.id}`, 'DELETE', undefined, comum.cookie)).status, 403);
    assert.equal((await request(`/admin/users/${chefe.id}`, 'DELETE', undefined, chefe.cookie)).status, 403);
    assert.equal((await request('/admin/users/nao-existe', 'DELETE', undefined, chefe.cookie)).status, 404);
    assert.equal((await request('/me', 'DELETE', { password: PASSWORD }, chefe.cookie)).status, 403);

    const preview = (await (await request(`/admin/users/${teste.id}/deletion-preview`, 'GET', undefined, chefe.cookie)).json()) as {
      username: string;
      servers: { action: string }[];
    };
    assert.equal(preview.username, 'e2e-teste');
    assert.deepEqual(preview.servers.map((entry) => entry.action), ['delete']);

    assert.equal((await request(`/admin/users/${teste.id}`, 'DELETE', undefined, chefe.cookie)).status, 204);
    assert.equal((await request('/session', 'GET', undefined, teste.cookie)).status, 401);
    assert.equal((await request('/auth/login', 'POST', { username: 'e2e-teste', password: PASSWORD })).status, 401);
    // a conta do admin e a da pessoa comum seguem intactas
    assert.equal((await request('/session', 'GET', undefined, chefe.cookie)).status, 200);
    assert.equal((await request('/session', 'GET', undefined, comum.cookie)).status, 200);
  });
});
