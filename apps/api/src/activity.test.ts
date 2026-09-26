import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import type { Activity, RealtimeEvent, Server } from '@nexplay/shared';
import { register, startApi, withTempDirectory, type Request } from './apiHarness.js';

// Uma conexão de tempo real que junta os eventos recebidos.
async function listen(port: number, origin: string, cookie: string) {
  const events: RealtimeEvent[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/realtime`, { headers: { cookie, origin } });
  socket.on('message', (data) => events.push(JSON.parse(String(data)) as RealtimeEvent));
  await once(socket, 'open');
  return {
    events,
    close: () => socket.close(),
    // Só olha os eventos a partir de `from`, para não casar com um evento antigo parecido.
    wait: async (predicate: (event: RealtimeEvent) => boolean, ms = 3000, from = 0) => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        const found = events.slice(from).find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return undefined;
    },
  };
}

interface PresenceResponse {
  statuses: Record<string, string>;
  activities: Record<string, Activity>;
}

async function presenceOf(request: Request, serverId: string, cookie: string): Promise<PresenceResponse> {
  const response = await request(`/servers/${serverId}/presence`, 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  return (await response.json()) as PresenceResponse;
}

const song: Activity = { kind: 'listening', app: 'Spotify', title: 'Tá Tranquilo', artist: 'Brandão85' };

test('atividade (jogo/música) chega à lista de membros: ao vivo, na leitura inicial, some no invisível e ao sair', async () => {
  await withTempDirectory('activity', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin, port } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');
      const { server } = (await (await request('/servers', 'POST', { name: 'Sala' }, ana.cookie)).json()) as { server: Server };
      const { invite } = (await (await request(`/servers/${server.id}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
      assert.equal((await request(`/invites/${invite.code}/redeem`, 'POST', undefined, bia.cookie)).status, 201);

      const biaSocket = await listen(port, origin, bia.cookie);
      let anaSocket = await listen(port, origin, ana.cookie);
      await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && event.online);

      // Ana começa a ouvir música: capa e tempo enviados por engano são descartados, e a Bia recebe na hora.
      const noisy = { ...song, thumbnailDataUrl: 'data:image/jpeg;base64,AAAA', positionMs: 1000, durationMs: 90000, updatedAt: 1 };
      assert.equal((await request('/me/activity', 'PUT', { activity: noisy }, ana.cookie)).status, 204);
      const live = await biaSocket.wait((event) => event.type === 'ACTIVITY_UPDATE' && event.userId === ana.id);
      assert.deepEqual(live && live.type === 'ACTIVITY_UPDATE' ? live.activity : undefined, song);
      assert.deepEqual((await presenceOf(request, server.id, bia.cookie)).activities[ana.id], song, 'quem abre o servidor depois também vê');

      // Repetir a mesma faixa não gera outro aviso.
      const before = biaSocket.events.filter((event) => event.type === 'ACTIVITY_UPDATE').length;
      assert.equal((await request('/me/activity', 'PUT', { activity: { ...song, positionMs: 50000 } }, ana.cookie)).status, 204);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(biaSocket.events.filter((event) => event.type === 'ACTIVITY_UPDATE').length, before);

      // Trocou para um jogo; depois parou.
      assert.equal((await request('/me/activity', 'PUT', { activity: { kind: 'playing', name: 'Valorant' } }, ana.cookie)).status, 204);
      await biaSocket.wait((event) => event.type === 'ACTIVITY_UPDATE' && event.userId === ana.id && event.activity?.kind === 'playing');
      assert.deepEqual((await presenceOf(request, server.id, bia.cookie)).activities[ana.id], { kind: 'playing', name: 'Valorant' });
      assert.equal((await request('/me/activity', 'PUT', { activity: null }, ana.cookie)).status, 204);
      await biaSocket.wait((event) => event.type === 'ACTIVITY_UPDATE' && event.userId === ana.id && event.activity === null);
      assert.equal((await presenceOf(request, server.id, bia.cookie)).activities[ana.id], undefined);

      // Invisível não entrega o que está ouvindo, e ao voltar a presença já traz a atividade atual.
      assert.equal((await request('/me/activity', 'PUT', { activity: song }, ana.cookie)).status, 204);
      await biaSocket.wait((event) => event.type === 'ACTIVITY_UPDATE' && event.userId === ana.id && event.activity?.kind === 'listening');
      assert.equal((await request('/me/presence', 'PUT', { status: 'invisible' }, ana.cookie)).status, 200);
      await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && !event.online);
      assert.equal((await presenceOf(request, server.id, bia.cookie)).activities[ana.id], undefined, 'invisível não aparece nem com atividade');
      const eventsWhileHidden = biaSocket.events.length;
      assert.equal((await request('/me/activity', 'PUT', { activity: { kind: 'playing', name: 'Minecraft' } }, ana.cookie)).status, 204);
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.equal(biaSocket.events.length, eventsWhileHidden, 'nada vaza enquanto invisível');
      assert.equal((await request('/me/presence', 'PUT', { status: 'online' }, ana.cookie)).status, 200);
      const back = await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && event.online, 3000, eventsWhileHidden);
      assert.deepEqual(back && back.type === 'PRESENCE_UPDATE' ? back.activity : undefined, { kind: 'playing', name: 'Minecraft' });

      // Fechou o app (passada a carência): a atividade some e não volta velha.
      const beforeLeaving = biaSocket.events.length;
      anaSocket.close();
      await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && !event.online, 9000, beforeLeaving);
      const beforeReturning = biaSocket.events.length;
      anaSocket = await listen(port, origin, ana.cookie);
      const returned = await biaSocket.wait((event) => event.type === 'PRESENCE_UPDATE' && event.userId === ana.id && event.online && event.activity === undefined, 3000, beforeReturning);
      assert.ok(returned, 'ao voltar, sem atividade velha');
      assert.equal((await presenceOf(request, server.id, bia.cookie)).activities[ana.id], undefined);

      // Entradas inválidas.
      assert.equal((await request('/me/activity', 'PUT', { activity: { kind: 'playing', name: '   ' } }, ana.cookie)).status, 400);
      assert.equal((await request('/me/activity', 'PUT', { activity: 'jogando' }, ana.cookie)).status, 400);
      assert.equal((await request('/me/activity', 'PUT', {}, ana.cookie)).status, 400);
      assert.equal((await request('/me/activity', 'PUT', { activity: null })).status, 401, 'precisa estar logado');

      anaSocket.close();
      biaSocket.close();
    } finally {
      await api.stop();
    }
  });
});
