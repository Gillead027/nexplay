import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import WebSocket from 'ws';
import {
  CHANNEL_OVERWRITE_MASK,
  computeChannelPermissions,
  Permission,
  type RealtimeEvent,
  type Role,
  type Server,
  type TextChannel,
  type VoiceChannel,
} from '@nexplay/shared';
import { register, startApi, withTempDirectory } from './apiHarness.js';

test('a conta das permissões por canal segue a ordem do Discord', () => {
  // Os bits repetidos em channelPermissions.ts precisam bater com Permission.
  assert.equal(CHANNEL_OVERWRITE_MASK, Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES | Permission.CONNECT);
  const all = Object.values(Permission).reduce((sum, flag) => sum | flag, 0);
  const member = { userId: 'u1', roleIds: ['everyone', 'vip'], everyoneRoleId: 'everyone' };
  const base = Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES;

  // Sem ajustes, vale o do servidor.
  assert.equal(computeChannelPermissions(base, [], member), base);
  // @everyone nega ver: some tudo.
  const hidden = [{ targetType: 'role' as const, targetId: 'everyone', allow: 0, deny: Permission.VIEW_CHANNELS }];
  assert.equal(computeChannelPermissions(base, hidden, member), 0);
  // ...mas um cargo da pessoa libera de volta.
  const vipAllowed = [...hidden, { targetType: 'role' as const, targetId: 'vip', allow: Permission.VIEW_CHANNELS, deny: 0 }];
  assert.equal(computeChannelPermissions(base, vipAllowed, member), base);
  // O ajuste da própria pessoa vem por último e ganha do cargo.
  const ownDeny = [...vipAllowed, { targetType: 'member' as const, targetId: 'u1', allow: 0, deny: Permission.SEND_MESSAGES }];
  assert.equal(computeChannelPermissions(base, ownDeny, member), Permission.VIEW_CHANNELS);
  // Administrador passa por cima de tudo.
  assert.equal(computeChannelPermissions(Permission.ADMINISTRATOR, hidden, member), all);
});

async function legacySocket(port: number, origin: string, cookie: string) {
  const events: RealtimeEvent[] = [];
  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/realtime`, { headers: { cookie, origin } });
  socket.on('message', (data) => events.push(JSON.parse(String(data)) as RealtimeEvent));
  await once(socket, 'open');
  return { events, close: () => socket.close() };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('permissões por canal: canal escondido, liberado para uma pessoa, sem escrever, sem vazar evento e voz bloqueada', async () => {
  await withTempDirectory('channel-perms', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin, port } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');
      const { server } = (await (await request('/servers', 'POST', { name: 'Sala' }, ana.cookie)).json()) as { server: Server };
      const { invite } = (await (await request(`/servers/${server.id}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
      assert.equal((await request(`/invites/${invite.code}/redeem`, 'POST', undefined, bia.cookie)).status, 201);

      const created = await request(`/servers/${server.id}/text-channels`, 'POST', { name: 'segredo' }, ana.cookie);
      assert.equal(created.status, 201);
      const secret = ((await created.json()) as { channel: TextChannel }).channel;
      const { roles } = (await (await request(`/servers/${server.id}/roles`, 'GET', undefined, ana.cookie)).json()) as { roles: Role[] };
      const everyone = roles.find((role) => role.isEveryone)!;
      const overwritesPath = `/servers/${server.id}/channel-overwrites/text/${secret.id}`;

      // Bia não gerencia cargos: não mexe em permissões.
      assert.equal((await request(overwritesPath, 'PUT', { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.VIEW_CHANNELS }, bia.cookie)).status, 403);

      // Esconde o canal de todo mundo.
      const hide = await request(overwritesPath, 'PUT', { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.VIEW_CHANNELS }, ana.cookie);
      assert.equal(hide.status, 200);

      const biaChannels = (await (await request(`/servers/${server.id}/text-channels`, 'GET', undefined, bia.cookie)).json()) as { channels: TextChannel[] };
      assert.equal(biaChannels.channels.some((channel) => channel.id === secret.id), false, 'some da lista da Bia');
      assert.equal((await request(`/servers/${server.id}/text-channels/${secret.id}/messages`, 'GET', undefined, bia.cookie)).status, 404);
      assert.equal((await request(`/servers/${server.id}/text-channels/${secret.id}/messages`, 'POST', { text: 'oi' }, bia.cookie)).status, 404);
      const anaChannels = (await (await request(`/servers/${server.id}/text-channels`, 'GET', undefined, ana.cookie)).json()) as { channels: TextChannel[] };
      assert.ok(anaChannels.channels.some((channel) => channel.id === secret.id), 'a dona (administradora) continua vendo');

      // A mensagem do canal escondido não chega à Bia em tempo real; a de um canal aberto chega.
      const biaSocket = await legacySocket(port, origin, bia.cookie);
      await pause(150);
      assert.equal((await request(`/servers/${server.id}/text-channels/${secret.id}/messages`, 'POST', { text: 'só a staff vê' }, ana.cookie)).status, 201);
      const general = anaChannels.channels.find((channel) => channel.id !== secret.id && !channel.isUpdates)!;
      assert.equal((await request(`/servers/${server.id}/text-channels/${general.id}/messages`, 'POST', { text: 'todo mundo vê' }, ana.cookie)).status, 201);
      await pause(300);
      const messageChannels = biaSocket.events
        .filter((event): event is Extract<RealtimeEvent, { type: 'TEXT_MESSAGE_CREATE' }> => event.type === 'TEXT_MESSAGE_CREATE')
        .map((event) => event.channelId);
      assert.ok(messageChannels.includes(general.id), 'a mensagem do canal aberto chega');
      assert.equal(messageChannels.includes(secret.id), false, 'a do canal escondido não vaza');
      biaSocket.close();

      // Libera ver para a Bia, mas nega escrever para todo mundo.
      assert.equal((await request(overwritesPath, 'PUT', { targetType: 'member', targetId: bia.id, allow: Permission.VIEW_CHANNELS, deny: 0 }, ana.cookie)).status, 200);
      assert.equal((await request(overwritesPath, 'PUT', { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.VIEW_CHANNELS | Permission.SEND_MESSAGES }, ana.cookie)).status, 200);
      const visible = (await (await request(`/servers/${server.id}/text-channels`, 'GET', undefined, bia.cookie)).json()) as { channels: (TextChannel & { myPermissions: number })[] };
      const seen = visible.channels.find((channel) => channel.id === secret.id);
      assert.ok(seen, 'agora a Bia vê o canal');
      assert.equal(seen.myPermissions & Permission.SEND_MESSAGES, 0, 'e a lista avisa que ela não escreve nele');
      assert.equal((await request(`/servers/${server.id}/text-channels/${secret.id}/messages`, 'GET', undefined, bia.cookie)).status, 200);
      assert.equal((await request(`/servers/${server.id}/text-channels/${secret.id}/messages`, 'POST', { text: 'oi' }, bia.cookie)).status, 403);

      // Tirar o ajuste da Bia esconde o canal de novo.
      assert.equal((await request(`${overwritesPath}/member/${bia.id}`, 'DELETE', undefined, ana.cookie)).status, 200);
      assert.equal((await request(`/servers/${server.id}/text-channels/${secret.id}/messages`, 'GET', undefined, bia.cookie)).status, 404);

      // Voz: negar Conectar ao @everyone bloqueia a entrada (o token não é emitido).
      const { channel: voice } = (await (await request(`/servers/${server.id}/voice-channels`, 'POST', { name: 'Papo' }, ana.cookie)).json()) as { channel: VoiceChannel };
      assert.equal((await request(`/servers/${server.id}/channel-overwrites/voice/${voice.id}`, 'PUT', { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.CONNECT }, ana.cookie)).status, 200);
      assert.equal((await request(`/servers/${server.id}/livekit/token`, 'POST', { roomId: voice.id }, bia.cookie)).status, 403);

      // Categoria: canal sem ajustes próprios herda os da categoria.
      const { category } = (await (await request(`/servers/${server.id}/categories`, 'POST', { name: 'Staff' }, ana.cookie)).json()) as { category: { id: string } };
      const inCategory = ((await (await request(`/servers/${server.id}/text-channels`, 'POST', { name: 'planos' }, ana.cookie)).json()) as { channel: TextChannel }).channel;
      const moved = await request(`/servers/${server.id}/text-channels/${inCategory.id}/settings`, 'PATCH', { categoryId: category.id }, ana.cookie);
      assert.equal(moved.status, 200, 'canal entra na categoria');
      assert.equal((await request(`/servers/${server.id}/text-channels/${inCategory.id}/messages`, 'GET', undefined, bia.cookie)).status, 200);
      assert.equal((await request(`/servers/${server.id}/channel-overwrites/category/${category.id}`, 'PUT', { targetType: 'role', targetId: everyone.id, allow: 0, deny: Permission.VIEW_CHANNELS }, ana.cookie)).status, 200);
      assert.equal((await request(`/servers/${server.id}/text-channels/${inCategory.id}/messages`, 'GET', undefined, bia.cookie)).status, 404, 'herda da categoria');
    } finally {
      await api.stop();
    }
  });
});
