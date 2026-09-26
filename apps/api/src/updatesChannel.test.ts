import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { CHANGELOG, UPDATES_CHANNEL_NAME, formatChangelogMessage, type TextChannel, type TextMessage } from '@nexplay/shared';
import { register, startApi, withTempDirectory, type Request } from './apiHarness.js';

async function textChannels(request: Request, serverId: string, cookie: string): Promise<TextChannel[]> {
  const response = await request(`/servers/${serverId}/text-channels`, 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  return ((await response.json()) as { channels: TextChannel[] }).channels;
}

async function messagesOf(request: Request, serverId: string, channelId: string, cookie: string): Promise<TextMessage[]> {
  const response = await request(`/servers/${serverId}/text-channels/${channelId}/messages`, 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  return ((await response.json()) as { messages: TextMessage[] }).messages;
}

async function createServer(request: Request, cookie: string, name: string): Promise<string> {
  const response = await request('/servers', 'POST', { name, description: '' }, cookie);
  assert.equal(response.status, 201);
  return ((await response.json()) as { server: { id: string } }).server.id;
}

test('servidor novo já nasce com o canal atualizações (depois do geral) e só quem modera escreve nele', async () => {
  await withTempDirectory('updates-new', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');
      const serverId = await createServer(request, ana.cookie, 'Casa da Ana');

      const channels = await textChannels(request, serverId, ana.cookie);
      assert.equal(channels[0]?.name, 'geral', 'o geral continua sendo o primeiro canal');
      const updates = channels.find((channel) => channel.isUpdates);
      assert.ok(updates, 'o servidor tem o canal de atualizações');
      assert.equal(updates.name, UPDATES_CHANNEL_NAME);
      assert.equal(channels.filter((channel) => channel.isUpdates).length, 1);
      assert.deepEqual(await messagesOf(request, serverId, updates.id, ana.cookie), [], 'servidor novo não recebe o histórico de novidades');

      const invite = (await (await request(`/servers/${serverId}/invite`, 'POST', undefined, ana.cookie)).json()) as { invite: { code: string } };
      assert.equal((await request(`/invites/${invite.invite.code}/redeem`, 'POST', undefined, bia.cookie)).status, 201);

      const general = channels[0]!;
      assert.equal((await request(`/servers/${serverId}/text-channels/${general.id}/messages`, 'POST', { text: 'oi' }, bia.cookie)).status, 201);
      const blocked = await request(`/servers/${serverId}/text-channels/${updates.id}/messages`, 'POST', { text: 'oi' }, bia.cookie);
      assert.equal(blocked.status, 403, 'membro comum não escreve no canal de atualizações');
      const upload = new FormData();
      upload.append('file', new Blob(['conteudo']), 'nota.txt');
      const blockedUpload = await fetch(`${origin}/api/servers/${serverId}/text-channels/${updates.id}/attachments`, {
        method: 'POST',
        headers: { cookie: bia.cookie, origin },
        body: upload,
      });
      assert.equal(blockedUpload.status, 403, 'nem envia arquivo lá');
      const allowed = await request(`/servers/${serverId}/text-channels/${updates.id}/messages`, 'POST', { text: 'aviso da administração' }, ana.cookie);
      assert.equal(allowed.status, 201, 'quem administra pode escrever');
    } finally {
      await api.stop();
    }
  });
});

test('na subida da API: servidor que já existia ganha o canal e recebe as novidades uma única vez; canal apagado de propósito não volta', async () => {
  await withTempDirectory('updates-backfill', async (directory) => {
    let serverId = '';
    let ana = { cookie: '', id: '' };

    const first = await startApi(directory);
    try {
      ana = await register(first.request, 'Ana');
      serverId = await createServer(first.request, ana.cookie, 'Servidor antigo');
    } finally {
      await first.stop();
    }

    // Simula um servidor criado antes do recurso: sem canal de atualizações, sem "já atendido" e sem novidades entregues.
    const db = new DatabaseSync(join(directory, 'test.db'));
    db.prepare('DELETE FROM text_channels WHERE server_id = ? AND is_updates = 1').run(serverId);
    db.prepare('UPDATE servers SET updates_provisioned = 0 WHERE id = ?').run(serverId);
    db.prepare('DELETE FROM update_announcements WHERE server_id = ?').run(serverId);
    db.close();

    const second = await startApi(directory);
    let updatesChannelId = '';
    try {
      const channels = await textChannels(second.request, serverId, ana.cookie);
      assert.equal(channels[0]?.name, 'geral', 'o canal criado depois não passa na frente do geral');
      const updates = channels.find((channel) => channel.isUpdates);
      assert.ok(updates, 'servidor antigo ganhou o canal de atualizações');
      updatesChannelId = updates.id;
      const messages = await messagesOf(second.request, serverId, updates.id, ana.cookie);
      assert.equal(messages.length, CHANGELOG.length, 'uma mensagem por novidade');
      assert.deepEqual(messages.map((message) => message.text), CHANGELOG.map(formatChangelogMessage), 'na ordem do changelog');
      assert.ok(messages.every((message) => message.senderType === 'SYSTEM' && message.senderName === 'NexPlay'));
    } finally {
      await second.stop();
    }

    const third = await startApi(directory);
    try {
      const messages = await messagesOf(third.request, serverId, updatesChannelId, ana.cookie);
      assert.equal(messages.length, CHANGELOG.length, 'subir de novo não repete as novidades');
      // O dono apaga o canal: ele não pode voltar sozinho a cada subida.
      assert.equal((await third.request(`/servers/${serverId}/text-channels/${updatesChannelId}`, 'DELETE', undefined, ana.cookie)).status, 204);
    } finally {
      await third.stop();
    }

    const fourth = await startApi(directory);
    try {
      const channels = await textChannels(fourth.request, serverId, ana.cookie);
      assert.equal(channels.some((channel) => channel.isUpdates), false, 'canal apagado não é recriado');
    } finally {
      await fourth.stop();
    }
  });
});
