import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Permission, type Channel, type Role } from '@nexplay/shared';
import { register, startApi, withTempDirectory } from './apiHarness.js';

// O LiveKit não roda nos testes: quem passa pela permissão e pela validação chega até a consulta ao LiveKit e
// recebe 503. Então 403 = barrado pela permissão, 400 = pedido inválido, 503 = passou por tudo até o LiveKit.
test('mover membro de canal de voz: só quem tem a permissão "Mover membros" (ou administra) passa', async () => {
  await withTempDirectory('voice-move', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');
      const cami = await register(request, 'Cami');

      const created = await request('/servers', 'POST', { name: 'Casa', description: '' }, ana.cookie);
      const serverId = ((await created.json()) as { server: { id: string } }).server.id;
      const invite = (await (await request(`/servers/${serverId}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
      for (const person of [bia, cami]) assert.equal((await request(`/invites/${invite.invite.code}/redeem`, 'POST', undefined, person.cookie)).status, 201);

      assert.equal((await request(`/servers/${serverId}/voice-channels`, 'POST', { name: 'Jogos', description: '' }, ana.cookie)).status, 201);
      const channels = ((await (await request(`/servers/${serverId}/channels`, 'GET', undefined, ana.cookie)).json()) as { channels: Channel[] }).channels;
      const voice = channels.filter((channel) => channel.type === 'VOICE');
      assert.ok(voice.length >= 2, 'o servidor tem dois canais de voz');
      const [from, to] = [voice[0]!, voice[1]!];
      const move = (cookie: string, toRoomId = to.id) =>
        request(`/servers/${serverId}/rooms/${from.id}/participants/${cami.id}/move`, 'POST', { toRoomId }, cookie);

      assert.equal((await request(`/servers/${serverId}/rooms/${from.id}/participants/${cami.id}/move`, 'POST', { toRoomId: to.id })).status, 401, 'sem sessão');
      assert.equal((await move(bia.cookie)).status, 403, 'membro comum não move ninguém');
      assert.equal((await move(ana.cookie, 'canal-que-nao-existe')).status, 400, 'destino inválido');
      assert.equal((await move(ana.cookie)).status, 503, 'quem administra passa da permissão (e chega ao LiveKit, que não roda no teste)');

      // Um cargo com "Mover membros" libera a Bia — a permissão nova é aceita pelos cargos e checada de verdade.
      const role = await request(
        `/servers/${serverId}/roles`,
        'POST',
        { name: 'Moderador', color: '#3366ff', permissions: Permission.MOVE_MEMBERS, hoist: false },
        ana.cookie,
      );
      assert.equal(role.status, 201);
      const { role: moderator } = (await role.json()) as { role: Role };
      assert.equal((await request(`/servers/${serverId}/roles/${moderator.id}/members/${bia.id}`, 'PUT', undefined, ana.cookie)).status, 204);
      assert.equal((await move(bia.cookie)).status, 503, 'com o cargo, a Bia passa da permissão');
      assert.equal((await move(cami.cookie)).status, 403, 'quem continua sem permissão segue barrado');
    } finally {
      await api.stop();
    }
  });
});
