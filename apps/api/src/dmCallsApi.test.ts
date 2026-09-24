import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { ACCENT_COLORS, type DmChannel, type RealtimeEvent } from '@nexplay/shared';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request, origin: string, port: number) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'dm-calls-'));
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
    for (let i = 0; i < 300; i++) {
      try { await request('/auth/registration'); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'API starts');
    await run(request, origin, port);
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => {});
    rmSync(directory, { recursive: true, force: true });
  }
}

async function register(request: Request, username: string) {
  const response = await request('/auth/register', 'POST', { username, password: 'social-password', accentColor: ACCENT_COLORS[0] });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie')!.split(';')[0]!;
  const { user } = (await response.json()) as { user: { id: string } };
  return { cookie, id: user.id };
}

// Uma conexão de tempo real (a pessoa "tem o app aberto") que junta os eventos recebidos.
async function listen(port: number, origin: string, cookie: string) {
  const events: RealtimeEvent[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/realtime`, { headers: { cookie, origin } });
  socket.on('message', (data) => events.push(JSON.parse(String(data)) as RealtimeEvent));
  await once(socket, 'open');
  return {
    events,
    close: () => socket.close(),
    wait: async (predicate: (event: RealtimeEvent) => boolean, ms = 3000) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const found = events.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return undefined;
    },
  };
}

const callEvent = (status: string) => (event: RealtimeEvent) => event.type === 'DM_CALL_UPDATE' && event.status === status;

async function befriend(request: Request, a: { cookie: string; id: string }, b: { cookie: string; id: string }): Promise<DmChannel> {
  assert.equal((await request(`/friends/${b.id}`, 'PUT', undefined, a.cookie)).status, 201);
  assert.equal((await request(`/friends/${a.id}`, 'PUT', undefined, b.cookie)).status, 200);
  const opened = await request(`/dm-channels/${b.id}`, 'PUT', undefined, a.cookie);
  return ((await opened.json()) as { channel: DmChannel }).channel;
}

test('ligar para um amigo: ele recebe o aviso de que está chamando, atende, os dois entram, e encerrar avisa os dois', async () => {
  await withApi(async (request, origin, port) => {
    const ana = await register(request, 'Ana');
    const bia = await register(request, 'Bia');
    const dm = await befriend(request, ana, bia);
    const anaSocket = await listen(port, origin, ana.cookie);
    const biaSocket = await listen(port, origin, bia.cookie);

    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, ana.cookie)).status, 201);
    const ringing = await biaSocket.wait(callEvent('ringing'));
    assert.ok(ringing && ringing.type === 'DM_CALL_UPDATE' && ringing.callerId === ana.id && ringing.calleeId === bia.id, 'quem foi chamado recebe o aviso');
    assert.ok(await anaSocket.wait(callEvent('ringing')), 'quem ligou também acompanha');

    // quem foi chamado ainda não pode entrar na sala; quem ligou pode (fica esperando)
    assert.equal((await request(`/dm-channels/${dm.id}/call/token`, 'POST', undefined, bia.cookie)).status, 403);
    const anaToken = await request(`/dm-channels/${dm.id}/call/token`, 'POST', undefined, ana.cookie);
    assert.equal(anaToken.status, 200);
    assert.ok(((await anaToken.json()) as { token: string }).token.length > 20);

    // só quem foi chamado atende
    assert.equal((await request(`/dm-channels/${dm.id}/call/accept`, 'POST', undefined, ana.cookie)).status, 403);
    assert.equal((await request(`/dm-channels/${dm.id}/call/accept`, 'POST', undefined, bia.cookie)).status, 200);
    assert.ok(await anaSocket.wait(callEvent('active')), 'quem ligou vê que atenderam');
    assert.equal((await request(`/dm-channels/${dm.id}/call/token`, 'POST', undefined, bia.cookie)).status, 200);

    // a ligação aparece para os dois ao reconectar
    const listed = (await (await request('/me/dm-calls', 'GET', undefined, bia.cookie)).json()) as { calls: { dmChannelId: string; status: string }[] };
    assert.deepEqual(listed.calls.map((call) => [call.dmChannelId, call.status]), [[dm.id, 'active']]);

    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'DELETE', undefined, bia.cookie)).status, 204);
    assert.ok(await anaSocket.wait(callEvent('ended')));
    assert.ok(await biaSocket.wait(callEvent('ended')));
    assert.equal((await request(`/dm-channels/${dm.id}/call/token`, 'POST', undefined, ana.cookie)).status, 404);
    anaSocket.close();
    biaSocket.close();
  });
});

test('recusar: quem foi chamado recusa e os dois são avisados; quem ligou pode desistir enquanto chama', async () => {
  await withApi(async (request, origin, port) => {
    const ana = await register(request, 'Ana');
    const bia = await register(request, 'Bia');
    const dm = await befriend(request, ana, bia);
    const anaSocket = await listen(port, origin, ana.cookie);
    const biaSocket = await listen(port, origin, bia.cookie);

    await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, ana.cookie);
    await biaSocket.wait(callEvent('ringing'));
    assert.equal((await request(`/dm-channels/${dm.id}/call/decline`, 'POST', undefined, ana.cookie)).status, 403);
    assert.equal((await request(`/dm-channels/${dm.id}/call/decline`, 'POST', undefined, bia.cookie)).status, 204);
    assert.ok(await anaSocket.wait(callEvent('declined')), 'quem ligou vê que recusaram');

    // depois disso dá para ligar de novo; quem ligou desiste antes de atenderem
    await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, ana.cookie);
    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'DELETE', undefined, bia.cookie)).status, 403); // quem foi chamado recusa, não "cancela"
    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'DELETE', undefined, ana.cookie)).status, 204);
    assert.ok(await biaSocket.wait((event) => event.type === 'DM_CALL_UPDATE' && event.status === 'ended'), 'o toque para na hora');
    anaSocket.close();
    biaSocket.close();
  });
});

test('regras: só amigos ligam, o offline não recebe, ocupado é ocupado, bloqueado não liga e estranho não entra na sala', async () => {
  await withApi(async (request, origin, port) => {
    const ana = await register(request, 'Ana');
    const bia = await register(request, 'Bia');
    const caio = await register(request, 'Caio');
    const dm = await befriend(request, ana, bia);

    // Bia está sem o app aberto: não há como tocar
    const offline = await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, ana.cookie);
    assert.equal(offline.status, 409);
    assert.match(((await offline.json()) as { error: string }).error, /offline/);

    const biaSocket = await listen(port, origin, bia.cookie);
    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, ana.cookie)).status, 201);
    // quem ligou não liga para outra pessoa ao mesmo tempo
    const outro = await befriend(request, ana, caio);
    const caioSocket = await listen(port, origin, caio.cookie);
    assert.equal((await request(`/dm-channels/${outro.id}/call`, 'POST', undefined, ana.cookie)).status, 409);
    // e quem está ocupado não recebe outra
    assert.equal((await request(`/dm-channels/${outro.id}/call`, 'POST', undefined, caio.cookie)).status, 409);
    // uma terceira pessoa não vê a ligação nem entra na sala (404, como nas mensagens)
    assert.equal((await request(`/dm-channels/${dm.id}/call/token`, 'POST', undefined, caio.cookie)).status, 404);
    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'DELETE', undefined, caio.cookie)).status, 404);
    await request(`/dm-channels/${dm.id}/call`, 'DELETE', undefined, ana.cookie);

    // bloqueio: nenhum dos dois consegue ligar
    assert.equal((await request(`/blocks/${ana.id}`, 'PUT', undefined, bia.cookie)).status, 204);
    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, ana.cookie)).status, 403);
    assert.equal((await request(`/dm-channels/${dm.id}/call`, 'POST', undefined, bia.cookie)).status, 403);
    biaSocket.close();
    caioSocket.close();
  });
});

test('sem sessão não liga', async () => {
  await withApi(async (request) => {
    assert.equal((await request('/dm-channels/x/call', 'POST')).status, 401);
    assert.equal((await request('/me/dm-calls')).status, 401);
  });
});
