import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import WebSocket from 'ws';
import { ACCENT_COLORS, type RealtimeEvent, type Server, type ServerLayout, type TextChannel } from '@nexplay/shared';
import { normalizeServerLayout, parseStoredServerLayout } from './serverLayout.js';

type Request = (path: string, method?: string, body?: unknown, cookie?: string) => Promise<Response>;

async function withApi(run: (request: Request, origin: string, port: number) => Promise<void>) {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as { port: number }).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const directory = mkdtempSync(join(tmpdir(), 'social-'));
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

// Uma conexão de tempo real que junta os eventos recebidos.
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

// ---- layout de pastas (sem servidor)
test('o layout de pastas só guarda servidores da pessoa, sem repetir, e junta os novos no fim', () => {
  const layout: ServerLayout = {
    items: [
      { type: 'folder', id: 'f1', name: ' Jogos ', color: '#3b82f6', serverIds: ['a', 'x', 'b', 'a'] },
      { type: 'server', serverId: 'b' },
      { type: 'folder', id: 'vazia', name: 'Vazia', color: '#22c55e', serverIds: ['x', 'y'] },
      { type: 'server', serverId: 'c' },
    ],
  };
  const result = normalizeServerLayout(layout, ['a', 'b', 'c', 'novo']);
  assert.deepEqual(result.items, [
    { type: 'folder', id: 'f1', name: 'Jogos', color: '#3b82f6', serverIds: ['a', 'b'] },
    { type: 'server', serverId: 'c' },
    { type: 'server', serverId: 'novo' },
  ]);
  assert.deepEqual(normalizeServerLayout({ items: [] }, ['a', 'b']).items, [{ type: 'server', serverId: 'a' }, { type: 'server', serverId: 'b' }]);
});

test('um layout guardado estragado vira lista vazia em vez de quebrar', () => {
  assert.deepEqual(parseStoredServerLayout(''), { items: [] });
  assert.deepEqual(parseStoredServerLayout('{não é json'), { items: [] });
  assert.deepEqual(parseStoredServerLayout('{"items":[{"type":"folder","id":"f","name":"a","color":"vermelho","serverIds":[]}]}'), { items: [] });
});

// ---- pelo servidor de verdade
test('status de presença: escolher, invisível vira offline para os outros, e as outras abas acompanham', async () => {
  await withApi(async (request, origin, port) => {
    const ana = await register(request, 'Ana');
    const bia = await register(request, 'Bia');
    const { server } = (await (await request('/servers', 'POST', { name: 'Sala' }, ana.cookie)).json()) as { server: Server };
    const { invite } = (await (await request(`/servers/${server.id}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
    assert.equal((await request(`/invites/${invite.code}/redeem`, 'POST', undefined, bia.cookie)).status, 201);

    const biaSocket = await listen(port, origin, bia.cookie);
    const anaSocket = await listen(port, origin, ana.cookie);
    await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && event.online);

    let presence = (await (await request(`/servers/${server.id}/presence`, 'GET', undefined, bia.cookie)).json()) as { onlineUserIds: string[]; statuses: Record<string, string> };
    assert.deepEqual(presence.statuses[ana.id], 'online');
    assert.ok(presence.onlineUserIds.includes(ana.id));

    // ausente: os outros recebem o status; a sessão dela também guarda a escolha
    assert.equal((await request('/me/presence', 'PUT', { status: 'idle' }, ana.cookie)).status, 200);
    const idle = await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && event.status === 'idle');
    assert.ok(idle);
    assert.equal(((await (await request('/session', 'GET', undefined, ana.cookie)).json()) as { user: { presenceStatus: string } }).user.presenceStatus, 'idle');

    // invisível: para a Bia a Ana está offline, e a lista de presença não a mostra mais
    assert.equal((await request('/me/presence', 'PUT', { status: 'invisible' }, ana.cookie)).status, 200);
    assert.ok(await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && !event.online));
    presence = (await (await request(`/servers/${server.id}/presence`, 'GET', undefined, bia.cookie)).json()) as typeof presence;
    assert.ok(!presence.onlineUserIds.includes(ana.id));
    assert.equal(presence.statuses[ana.id], undefined);
    assert.ok(await anaSocket.wait((event) => event.type === 'PRESENCE_STATUS_CHOICE' && event.status === 'invisible'));

    assert.equal((await request('/me/presence', 'PUT', { status: 'sumido' }, ana.cookie)).status, 400);
    assert.equal((await request('/me/presence', 'PUT', { status: 'dnd' })).status, 401);
    biaSocket.close();
    anaSocket.close();
  });
});

test('"digitando" chega aos outros membros do canal e nas conversas diretas, e respeita quem não é membro', async () => {
  await withApi(async (request, origin, port) => {
    const ana = await register(request, 'Ana');
    const bia = await register(request, 'Bia');
    const caio = await register(request, 'Caio');
    const { server } = (await (await request('/servers', 'POST', { name: 'Sala' }, ana.cookie)).json()) as { server: Server };
    const { invite } = (await (await request(`/servers/${server.id}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
    assert.equal((await request(`/invites/${invite.code}/redeem`, 'POST', undefined, bia.cookie)).status, 201);
    const { channels } = (await (await request(`/servers/${server.id}/text-channels`, 'GET', undefined, ana.cookie)).json()) as { channels: TextChannel[] };
    const channel = channels[0]!;

    const biaSocket = await listen(port, origin, bia.cookie);
    const caioSocket = await listen(port, origin, caio.cookie);
    assert.equal((await request(`/servers/${server.id}/text-channels/${channel.id}/typing`, 'POST', undefined, ana.cookie)).status, 204);
    const typing = await biaSocket.wait((event) => event.type === 'TYPING_START');
    assert.ok(typing && typing.type === 'TYPING_START');
    assert.equal(typing.userId, ana.id);
    assert.equal(typing.displayName, 'Ana');
    assert.equal(typing.channelId, channel.id);
    // quem não é do servidor não recebe nada, nem consegue avisar
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.ok(!caioSocket.events.some((event) => event.type === 'TYPING_START'));
    assert.equal((await request(`/servers/${server.id}/text-channels/${channel.id}/typing`, 'POST', undefined, caio.cookie)).status, 404);
    assert.equal((await request(`/servers/${server.id}/text-channels/nao-existe/typing`, 'POST', undefined, ana.cookie)).status, 404);
    assert.equal((await request(`/servers/${server.id}/text-channels/${channel.id}/typing`, 'POST')).status, 401);

    // conversa direta: só a outra pessoa é avisada (e só quem participa consegue avisar)
    assert.ok([200, 201, 204].includes((await request(`/friends/${bia.id}`, 'PUT', undefined, ana.cookie)).status));
    assert.ok([200, 201, 204].includes((await request(`/friends/${ana.id}`, 'PUT', undefined, bia.cookie)).status));
    const opened = await request(`/dm-channels/${bia.id}`, 'PUT', undefined, ana.cookie);
    assert.ok(opened.status === 200 || opened.status === 201);
    const { channel: dm } = (await opened.json()) as { channel: { id: string } };
    assert.equal((await request(`/dm-channels/${dm.id}/typing`, 'POST', undefined, ana.cookie)).status, 204);
    const dmTyping = await biaSocket.wait((event) => event.type === 'DM_TYPING_START');
    assert.ok(dmTyping && dmTyping.type === 'DM_TYPING_START');
    assert.equal(dmTyping.userId, ana.id);
    assert.equal(dmTyping.dmChannelId, dm.id);
    assert.equal((await request(`/dm-channels/${dm.id}/typing`, 'POST', undefined, caio.cookie)).status, 404);
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.ok(!caioSocket.events.some((event) => event.type === 'DM_TYPING_START'));
    biaSocket.close();
    caioSocket.close();
  });
});

test('o layout de pastas é por pessoa, conferido contra os servidores dela e sincronizado entre abas', async () => {
  await withApi(async (request, origin, port) => {
    const ana = await register(request, 'Ana');
    const bia = await register(request, 'Bia');
    const make = async (name: string) => ((await (await request('/servers', 'POST', { name }, ana.cookie)).json()) as { server: Server }).server;
    const um = await make('Um');
    const dois = await make('Dois');
    const tres = await make('Tres');

    const inicial = (await (await request('/me/server-layout', 'GET', undefined, ana.cookie)).json()) as { layout: ServerLayout };
    assert.deepEqual(inicial.layout.items.map((item) => (item.type === 'server' ? item.serverId : 'pasta')).sort(), [um.id, dois.id, tres.id].sort());

    const socket = await listen(port, origin, ana.cookie);
    const enviado: ServerLayout = {
      items: [
        { type: 'folder', id: 'pasta-1', name: 'Amigos', color: '#22c55e', serverIds: [um.id, dois.id, 'servidor-que-nao-e-meu'] },
        { type: 'server', serverId: tres.id },
      ],
    };
    const saved = await request('/me/server-layout', 'PUT', enviado, ana.cookie);
    assert.equal(saved.status, 200);
    const { layout } = (await saved.json()) as { layout: ServerLayout };
    assert.deepEqual(layout.items, [
      { type: 'folder', id: 'pasta-1', name: 'Amigos', color: '#22c55e', serverIds: [um.id, dois.id] },
      { type: 'server', serverId: tres.id },
    ]);
    assert.ok(await socket.wait((event) => event.type === 'SERVER_LAYOUT_UPDATE'));
    const lido = (await (await request('/me/server-layout', 'GET', undefined, ana.cookie)).json()) as { layout: ServerLayout };
    assert.deepEqual(lido.layout, layout);

    // sair de um servidor tira ele da pasta; a Bia não vê nada da Ana
    const outra = (await (await request('/me/server-layout', 'GET', undefined, bia.cookie)).json()) as { layout: ServerLayout };
    assert.deepEqual(outra.layout.items, []);
    assert.equal((await request('/me/server-layout', 'PUT', { items: [{ type: 'folder', id: 'x', name: 'x', color: 'vermelho', serverIds: [] }] }, ana.cookie)).status, 400);
    assert.equal((await request('/me/server-layout', 'GET')).status, 401);
    socket.close();
  });
});
