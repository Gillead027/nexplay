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
  const directory = mkdtempSync(join(tmpdir(), 'moderation-incidents-'));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx', new URL('./index.ts', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '')], {
    env: {
      ...process.env, PORT: String(port), DB_PATH: join(directory, 'test.db'), NODE_ENV: 'test',
      WEB_ORIGIN: origin, COOKIE_SECURE: 'false', OPEN_REGISTRATION: 'true', INVITE_TOKEN: 'unused-invite-token',
      SESSION_SECRET: 's'.repeat(40), LIVEKIT_API_KEY: 'test-key', LIVEKIT_API_SECRET: 's'.repeat(40),
      LIVEKIT_PUBLIC_URL: 'ws://127.0.0.1:1', LIVEKIT_INTERNAL_URL: 'http://127.0.0.1:1',
      // SELF_HARM_VENDOR ausente de propósito: 'none' (padrão) é o estado que estes testes
      // cobrem — sem Azure configurado, nada deve ser chamado nem gerar incidente.
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
  const response = await request('/auth/register', 'POST', { username, password: 'incident-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie')!.split(';')[0]!;
}

test('mensagem de texto normal nunca cria incidente quando SELF_HARM_VENDOR=none (padrão)', async () => {
  await withApi(
    async (request) => {
      const cookie = await signUp(request, 'Chefe');
      const { server } = (await (await request('/servers', 'POST', { name: 'Servidor' }, cookie)).json()) as { server: Server };
      const { channels } = (await (await request(`/servers/${server.id}/channels`, 'GET', undefined, cookie)).json()) as { channels: Channel[] };
      const textChannel = channels.find((channel) => channel.type === 'TEXT')!;

      const sent = await request(
        `/servers/${server.id}/text-channels/${textChannel.id}/messages`,
        'POST',
        { text: 'não aguento mais viver assim, queria sumir' },
        cookie,
      );
      assert.equal(sent.status, 201);

      // checkSelfHarmAndNotify é fire-and-forget; com SELF_HARM_VENDOR=none ele nem chega a
      // rodar de verdade (retorna cedo), então não há corrida a esperar aqui.
      const incidents = await request('/admin/moderation/incidents', 'GET', undefined, cookie);
      assert.equal(incidents.status, 200);
      assert.deepEqual(await incidents.json(), { incidents: [] });
    },
    { ADMIN_USERNAMES: 'Chefe' },
  );
});

test('rotas administrativas da fila de moderação exigem admin', async () => {
  await withApi(async (request) => {
    const cookie = await signUp(request, 'PessoaComum');
    assert.equal((await request('/admin/moderation/incidents', 'GET', undefined, cookie)).status, 403);
    assert.equal((await request('/admin/moderation/incidents/algum-id/resolve', 'POST', { decision: 'confirmed' }, cookie)).status, 403);
  });
});

test('resolver um incidente inexistente devolve 404', async () => {
  await withApi(
    async (request) => {
      const cookie = await signUp(request, 'Chefe');
      const response = await request('/admin/moderation/incidents/inexistente/resolve', 'POST', { decision: 'confirmed' }, cookie);
      assert.equal(response.status, 404);
    },
    { ADMIN_USERNAMES: 'Chefe' },
  );
});
