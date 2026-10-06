import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import type { GatewayPayload, RealtimeEvent, Server } from '@nexplay/shared';
import { register, startApi, withTempDirectory } from './apiHarness.js';

// Uma conexão no formato do gateway (?v=2) que junta o que chega.
async function gatewaySocket(port: number, origin: string, cookie: string) {
  const received: GatewayPayload[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/realtime?v=2`, { headers: { cookie, origin } });
  socket.on('message', (data) => received.push(JSON.parse(String(data)) as GatewayPayload));
  await once(socket, 'open');
  const wait = async (predicate: (payload: GatewayPayload) => boolean, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const found = received.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    return undefined;
  };
  return {
    received,
    wait,
    send: (payload: GatewayPayload) => socket.send(JSON.stringify(payload)),
    close: async () => {
      socket.close();
      await once(socket, 'close');
    },
  };
}

const isDispatch = (t: string) => (payload: GatewayPayload) => payload.op === 0 && payload.t === t;

test('gateway: HELLO, IDENTIFY/READY, heartbeat e RESUME reenviando o que se perdeu na queda', async () => {
  await withTempDirectory('gateway', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin, port } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');
      const { server } = (await (await request('/servers', 'POST', { name: 'Sala' }, ana.cookie)).json()) as { server: Server };
      const { invite } = (await (await request(`/servers/${server.id}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
      assert.equal((await request(`/invites/${invite.code}/redeem`, 'POST', undefined, bia.cookie)).status, 201);
      // Ana fica online (senão o status dela não aparece para ninguém).
      const anaSocket = await gatewaySocket(port, origin, ana.cookie);
      await anaSocket.wait((payload) => payload.op === 10);
      anaSocket.send({ op: 2, d: {} });
      await anaSocket.wait(isDispatch('READY'));

      // Conexão nova: HELLO com o intervalo, IDENTIFY, READY com a sessão.
      const first = await gatewaySocket(port, origin, bia.cookie);
      const hello = await first.wait((payload) => payload.op === 10);
      assert.ok(hello, 'servidor abre com HELLO');
      assert.equal(typeof (hello.d as { heartbeatInterval: number }).heartbeatInterval, 'number');
      first.send({ op: 2, d: {} });
      const ready = await first.wait(isDispatch('READY'));
      assert.ok(ready, 'READY depois do IDENTIFY');
      const sessionId = (ready.d as { sessionId: string }).sessionId;
      assert.equal(ready.s, 1);

      first.send({ op: 1, d: 1 });
      assert.ok(await first.wait((payload) => payload.op === 11), 'HEARTBEAT_ACK');

      // Bia cai. Enquanto está fora, Ana muda o status: o evento tem que ficar guardado para ela.
      const lastSeq = Math.max(...first.received.map((payload) => payload.s ?? 0));
      await first.close();
      assert.equal((await request('/me/presence', 'PUT', { status: 'idle' }, ana.cookie)).status, 200);

      const second = await gatewaySocket(port, origin, bia.cookie);
      await second.wait((payload) => payload.op === 10);
      second.send({ op: 6, d: { sessionId, seq: lastSeq } });
      const resumed = await second.wait(isDispatch('RESUMED'));
      assert.ok(resumed, 'RESUMED depois do RESUME');
      const missed = second.received.find(
        (payload) => payload.op === 0 && (payload.d as RealtimeEvent).type === 'PRESENCE_UPDATE'
          && (payload.d as { userId: string; status?: string }).userId === ana.id
          && (payload.d as { status?: string }).status === 'idle',
      );
      assert.ok(missed, 'o PRESENCE_UPDATE perdido na queda é reenviado');
      assert.ok((missed.s ?? 0) > lastSeq && (missed.s ?? 0) < (resumed.s ?? 0), 'na ordem certa, antes do RESUMED');

      // Ao vivo continua chegando, com sequência crescente.
      assert.equal((await request('/me/presence', 'PUT', { status: 'online' }, ana.cookie)).status, 200);
      const live = await second.wait(
        (payload) => payload.op === 0 && (payload.d as { status?: string } | undefined)?.status === 'online'
          && (payload.s ?? 0) > (resumed.s ?? 0),
      );
      assert.ok(live, 'evento ao vivo depois de retomar');
      await second.close();
      await anaSocket.close();
    } finally {
      await api.stop();
    }
  });
});

test('gateway: sessão de outra pessoa ou inexistente não retoma; o formato antigo continua funcionando', async () => {
  await withTempDirectory('gateway-invalid', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin, port } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');

      const anaSocket = await gatewaySocket(port, origin, ana.cookie);
      await anaSocket.wait((payload) => payload.op === 10);
      anaSocket.send({ op: 2, d: {} });
      const ready = await anaSocket.wait(isDispatch('READY'));
      const anaSession = (ready!.d as { sessionId: string }).sessionId;
      await anaSocket.close();

      // Bia tenta retomar a sessão da Ana: recusado.
      const thief = await gatewaySocket(port, origin, bia.cookie);
      await thief.wait((payload) => payload.op === 10);
      thief.send({ op: 6, d: { sessionId: anaSession, seq: 0 } });
      assert.ok(await thief.wait((payload) => payload.op === 9), 'INVALID_SESSION para sessão de outra pessoa');
      assert.equal(thief.received.some(isDispatch('RESUMED')), false);
      await thief.close();

      // Sessão inventada: recusado.
      const ghost = await gatewaySocket(port, origin, ana.cookie);
      await ghost.wait((payload) => payload.op === 10);
      ghost.send({ op: 6, d: { sessionId: 'nao-existe', seq: 0 } });
      assert.ok(await ghost.wait((payload) => payload.op === 9), 'INVALID_SESSION para sessão que não existe');
      await ghost.close();

      // Sem ?v=2: formato antigo, sem HELLO, o evento chega direto.
      const legacyEvents: unknown[] = [];
      const legacy = new WebSocket(`ws://127.0.0.1:${port}/api/realtime`, { headers: { cookie: ana.cookie, origin } });
      legacy.on('message', (data) => legacyEvents.push(JSON.parse(String(data))));
      await once(legacy, 'open');
      await new Promise((resolve) => setTimeout(resolve, 200));
      assert.equal(legacyEvents.length, 0, 'o formato antigo não manda HELLO');
      legacy.close();
      await once(legacy, 'close');
    } finally {
      await api.stop();
    }
  });
});
