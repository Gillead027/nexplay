import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type Server } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'account-limits-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      MAX_SERVERS_PER_USER: '2', ADMIN_USERNAMES: 'Chefe',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
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
  const response = await request('/auth/register', 'POST', { username, password: 'limits-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

const newServer = (request: Request, cookie: string, name: string) => request('/servers', 'POST', { name }, cookie);

test('cada conta pode ter no máximo MAX_SERVERS_PER_USER servidores; excluir um libera a vaga', async () => {
  await withApi(async (request) => {
    const comum = await signUp(request, 'Comum');
    const primeiro = (await (await newServer(request, comum, 'Um')).json()) as { server: Server };
    assert.equal((await newServer(request, comum, 'Dois')).status, 201);
    const negado = await newServer(request, comum, 'Tres');
    assert.equal(negado.status, 403);
    assert.match(((await negado.json()) as { error: string }).error, /máximo por conta/);

    // outra conta não é afetada
    const outra = await signUp(request, 'Outra');
    assert.equal((await newServer(request, outra, 'Da outra')).status, 201);

    // excluir um servidor libera a vaga
    assert.equal((await request(`/servers/${primeiro.server.id}`, 'DELETE', { confirmName: 'Um' }, comum)).status, 204);
    assert.equal((await newServer(request, comum, 'Tres')).status, 201);
  });
});

test('quem administra a instância não tem o limite de servidores', async () => {
  await withApi(async (request) => {
    const chefe = await signUp(request, 'Chefe');
    for (const nome of ['A', 'B', 'C', 'D']) assert.equal((await newServer(request, chefe, nome)).status, 201);
  });
});

test('comandos do NexMusic têm limite de 20 por minuto por conta', async () => {
  await withApi(async (request) => {
    const dono = await signUp(request, 'Musical');
    const { server } = (await (await newServer(request, dono, 'Som')).json()) as { server: Server };
    const comando = (cookie: string) => request(`/servers/${server.id}/music/command`, 'POST', { roomId: 'sala-que-nao-existe', text: '!play qualquer' }, cookie);
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await comando(dono)).status);
    assert.equal(statuses.filter((status) => status === 400).length, 20);
    assert.deepEqual(statuses.slice(20), [429, 429]);
  });
});
