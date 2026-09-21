import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS } from '@nexplay/shared';

async function withApi(openRegistration: boolean, run: (request: (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'registration-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', INVITE_TOKEN: 'registration-code',
      OPEN_REGISTRATION: openRegistration ? 'true' : 'false',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
    },
    stdio: 'ignore',
  });
  const request = (path: string, method = 'GET', body?: unknown, cookie = '') =>
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

const account = (username: string, inviteToken?: string) => ({
  username, password: 'registration-password', accentColor: ACCENT_COLORS[0], ...(inviteToken === undefined ? {} : { inviteToken }),
});

test('cadastro fechado: exige o código de cadastro e a tela é avisada', async () => {
  await withApi(false, async (request) => {
    assert.deepEqual(await (await request('/auth/registration')).json(), { open: false });
    const semCodigo = await request('/auth/register', 'POST', account('SemCodigo'));
    assert.equal(semCodigo.status, 401);
    assert.match(((await semCodigo.json()) as { error: string }).error, /Código de cadastro inválido/);
    assert.equal((await request('/auth/register', 'POST', account('CodigoErrado', 'outro-codigo'))).status, 401);
    assert.equal((await request('/auth/register', 'POST', account('ComCodigo', 'registration-code'))).status, 201);
  });
});

test('cadastro aberto: cria conta sem código e a conta nova não entra em servidor nenhum', async () => {
  await withApi(true, async (request) => {
    assert.deepEqual(await (await request('/auth/registration')).json(), { open: true });
    const criada = await request('/auth/register', 'POST', account('SemCodigoAberto'));
    assert.equal(criada.status, 201);
    const cookie = criada.headers.get('set-cookie')!.split(';')[0]!;
    const { servers } = (await (await request('/servers', 'GET', undefined, cookie)).json()) as { servers: unknown[] };
    assert.equal(servers.length, 0);
    // o código, se vier, é simplesmente ignorado
    assert.equal((await request('/auth/register', 'POST', account('ComCodigoAberto', 'qualquer-coisa'))).status, 201);
    // continua validando o resto
    assert.equal((await request('/auth/register', 'POST', { username: 'x', password: 'curta', accentColor: ACCENT_COLORS[0] })).status, 400);
    assert.equal((await request('/auth/register', 'POST', account('SemCodigoAberto'))).status, 409);
  });
});

test('cadastro aberto limita a 10 contas por hora por endereço', async () => {
  await withApi(true, async (request) => {
    let bloqueada = 0;
    for (let i = 0; i < 12; i += 1) {
      const response = await request('/auth/register', 'POST', account(`Limite${i}`));
      if (response.status === 429) bloqueada += 1;
    }
    assert.equal(bloqueada, 2);
  });
});
