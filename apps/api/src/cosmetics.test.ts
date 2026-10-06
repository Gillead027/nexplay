import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ACCENT_COLORS, type MemberSummary, type Server, type UserSession } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request, origin: string) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'cosmetics-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
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
    await run(request, origin);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
}

async function signUp(request: Request, username: string): Promise<{ cookie: string; user: UserSession }> {
  const response = await request('/auth/register', 'POST', { username, password: 'profile-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  const { user } = (await response.json()) as { user: UserSession };
  return { cookie: response.headers.get('set-cookie')!.split(';')[0]!, user };
}

test('Loja: itens são salvos, aparecem no perfil e a plaquinha chega na lista de membros', async () => {
  await withApi(async (request) => {
    const dono = await signUp(request, 'lojista');
    assert.deepEqual(dono.user.cosmetics, { profileEffect: '', nameplate: '', themePrimary: '', themeAccent: '' });

    const aplicar = await request('/me/cosmetics', 'PUT', { profileEffect: 'neve', nameplate: 'cosmo', themePrimary: '#112233', themeAccent: '#445566', avatarFrame: 'fogo' }, dono.cookie);
    assert.equal(aplicar.status, 200);
    const { user } = (await aplicar.json()) as { user: UserSession };
    assert.deepEqual(user.cosmetics, { profileEffect: 'neve', nameplate: 'cosmo', themePrimary: '#112233', themeAccent: '#445566' });
    assert.equal(user.avatarFrame, 'fogo');

    // Campo ausente mantém; '' tira só aquele item.
    const tirar = (await (await request('/me/cosmetics', 'PUT', { profileEffect: '' }, dono.cookie)).json()) as { user: UserSession };
    assert.equal(tirar.user.cosmetics?.profileEffect, '');
    assert.equal(tirar.user.cosmetics?.nameplate, 'cosmo');
    assert.equal(tirar.user.avatarFrame, 'fogo');

    // Item que não existe e cor inválida são recusados.
    assert.equal((await request('/me/cosmetics', 'PUT', { nameplate: 'nao-existe' }, dono.cookie)).status, 400);
    assert.equal((await request('/me/cosmetics', 'PUT', { themePrimary: 'red' }, dono.cookie)).status, 400);

    const perfil = (await (await request(`/users/${dono.user.id}/profile`, 'GET', undefined, dono.cookie)).json()) as { user: UserSession };
    assert.equal(perfil.user.cosmetics?.themeAccent, '#445566');

    const { server } = (await (await request('/servers', 'POST', { name: 'Loja' }, dono.cookie)).json()) as { server: Server };
    const membros = (await (await request(`/servers/${server.id}/members`, 'GET', undefined, dono.cookie)).json()) as { members: MemberSummary[] };
    assert.equal(membros.members.find((member) => member.id === dono.user.id)?.nameplate, 'cosmo');
  });
});
