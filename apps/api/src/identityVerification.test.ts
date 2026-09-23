import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type UserSession } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'identity-verification-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
      // KYC_VENDOR de propósito ausente aqui: o padrão 'none' é o estado que estas rotas
      // testam (nenhum vendor real está implementado ainda — ver kycAdapter.ts).
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
  const response = await request('/auth/register', 'POST', { username, password: 'verify-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

test('conta nova começa como unverified e /status reflete isso', async () => {
  await withApi(async (request) => {
    const cookie = await signUp(request, 'Pessoa');
    const session = (await (await request('/session', 'GET', undefined, cookie)).json()) as { user: UserSession };
    assert.equal(session.user.identityVerificationStatus, 'unverified');

    const status = await request('/identity-verification/status', 'GET', undefined, cookie);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { status: 'unverified', verifiedAt: null });
  });
});

test('POST /identity-verification/start devolve 501 quando KYC_VENDOR=none (padrão)', async () => {
  await withApi(async (request) => {
    const cookie = await signUp(request, 'SemVendor');
    const response = await request('/identity-verification/start', 'POST', {}, cookie);
    assert.equal(response.status, 501);
  });
});

test('POST /identity-verification/start exige sessão', async () => {
  await withApi(async (request) => {
    const response = await request('/identity-verification/start', 'POST', {});
    assert.equal(response.status, 401);
  });
});
