import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { DmChannel, DmMessage } from '@nexplay/shared';
import { register, startApi, withTempDirectory, type Request } from './apiHarness.js';

type Person = { cookie: string; id: string };

async function befriend(request: Request, a: Person, b: Person): Promise<DmChannel> {
  assert.equal((await request(`/friends/${b.id}`, 'PUT', undefined, a.cookie)).status, 201);
  assert.equal((await request(`/friends/${a.id}`, 'PUT', undefined, b.cookie)).status, 200);
  const opened = await request(`/dm-channels/${b.id}`, 'PUT', undefined, a.cookie);
  return ((await opened.json()) as { channel: DmChannel }).channel;
}

async function listMessages(request: Request, dmChannelId: string, cookie: string): Promise<DmMessage[]> {
  const response = await request(`/dm-channels/${dmChannelId}/messages`, 'GET', undefined, cookie);
  assert.equal(response.status, 200);
  return ((await response.json()) as { messages: DmMessage[] }).messages;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('conversa privada com arquivo: só os dois participantes acessam, o anexo liga à mensagem uma vez e some junto com ela', async () => {
  await withTempDirectory('dm-files', async (directory) => {
    const api = await startApi(directory);
    try {
      const { request, origin, dbPath } = api;
      const ana = await register(request, 'Ana');
      const bia = await register(request, 'Bia');
      const cami = await register(request, 'Cami');
      const dm = await befriend(request, ana, bia);

      const upload = (cookie: string, withFile: boolean, dmChannelId = dm.id) => {
        const form = new FormData();
        if (withFile) form.append('file', new Blob(['conteudo do zip']), 'trabalho.zip');
        return fetch(`${origin}/api/dm-channels/${dmChannelId}/attachments`, { method: 'POST', headers: { cookie, origin }, body: form });
      };

      // Envio: sem sessão, quem não é da conversa e sem arquivo são recusados antes de qualquer coisa ser guardada.
      const anonymous = await fetch(`${origin}/api/dm-channels/${dm.id}/attachments`, { method: 'POST', headers: { origin }, body: new FormData() });
      assert.equal(anonymous.status, 401);
      assert.equal((await upload(cami.cookie, true)).status, 404, 'quem não é da conversa não envia arquivo');
      assert.equal((await upload(ana.cookie, false)).status, 400, 'sem arquivo');

      // O armazenamento de objetos não roda nos testes: um upload de verdade falha com 503, mas o caminho de
      // autorização acima e o de mensagem abaixo (com um upload pendente criado direto no banco) cobrem o resto.
      const db = new DatabaseSync(dbPath);
      const pending = (id: string, uploaderId: string) =>
        db.prepare(
          `INSERT INTO dm_attachments (id, dm_message_id, dm_channel_id, object_key, filename, content_type, size_bytes, uploaded_by, created_at)
           VALUES (?, NULL, ?, ?, 'trabalho.zip', 'application/zip', 1234, ?, ?)`,
        ).run(id, dm.id, `${id}/trabalho.zip`, uploaderId, Date.now());
      pending('anexo-1', ana.id);
      pending('anexo-2', ana.id);

      // Mensagem só com arquivo (texto vazio) é válida; o anexo vem na resposta e só liga uma vez.
      const sent = await request(`/dm-channels/${dm.id}/messages`, 'POST', { text: '', attachmentIds: ['anexo-1'] }, ana.cookie);
      assert.equal(sent.status, 201);
      const { message } = (await sent.json()) as { message: DmMessage };
      assert.equal(message.text, '');
      assert.equal(message.attachments?.length, 1);
      assert.equal(message.attachments?.[0]?.filename, 'trabalho.zip');
      assert.equal(message.attachments?.[0]?.url, '/api/dm-attachments/anexo-1/trabalho.zip');
      assert.equal((await request(`/dm-channels/${dm.id}/messages`, 'POST', { text: '', attachmentIds: ['anexo-1'] }, ana.cookie)).status, 400, 'o mesmo arquivo não vai de novo');
      assert.equal((await request(`/dm-channels/${dm.id}/messages`, 'POST', { text: '', attachmentIds: ['nao-existe'] }, ana.cookie)).status, 400, 'arquivo inexistente e sem texto');
      assert.equal((await request(`/dm-channels/${dm.id}/messages`, 'POST', { text: '', attachmentIds: ['anexo-2'] }, bia.cookie)).status, 400, 'não dá para enviar o upload pendente de outra pessoa');
      assert.equal((await request(`/dm-channels/${dm.id}/messages`, 'POST', { text: '' }, ana.cookie)).status, 400, 'nem texto nem arquivo');

      // Com texto, um id inválido só não vira anexo.
      await pause(5);
      const textOnly = await request(`/dm-channels/${dm.id}/messages`, 'POST', { text: 'olha o arquivo', attachmentIds: ['nao-existe'] }, bia.cookie);
      assert.equal(textOnly.status, 201);
      assert.equal(((await textOnly.json()) as { message: DmMessage }).message.attachments, undefined);

      // A lista vem em ordem cronológica (a mais antiga primeiro) e com os anexos.
      const list = await listMessages(request, dm.id, bia.cookie);
      assert.deepEqual(list.map((item) => item.id), [message.id, ...list.slice(1).map((item) => item.id)]);
      assert.ok(list.every((item, index) => index === 0 || list[index - 1]!.sentAt <= item.sentAt), 'ordem cronológica');
      assert.equal(list[0]?.attachments?.[0]?.id, 'anexo-1');

      // Download: só os dois participantes passam da autorização (aqui chegam ao armazenamento, que não roda: 503).
      const file = '/api/dm-attachments/anexo-1/trabalho.zip';
      const get = (cookie: string, path = file) => fetch(origin + path, { headers: { cookie, origin } });
      assert.equal((await fetch(origin + file, { headers: { origin } })).status, 401);
      assert.equal((await get(cami.cookie)).status, 404, 'quem não é da conversa não baixa (nem sabe que existe)');
      assert.equal((await get(bia.cookie)).status, 503, 'a outra pessoa da conversa passa da autorização');
      assert.equal((await get(ana.cookie)).status, 503);
      // Upload ainda pendente: só quem enviou.
      assert.equal((await get(bia.cookie, '/api/dm-attachments/anexo-2/trabalho.zip')).status, 404);
      assert.equal((await get(ana.cookie, '/api/dm-attachments/anexo-2/trabalho.zip')).status, 503);

      // Quem bloqueou não recebe arquivo.
      assert.equal((await request(`/blocks/${ana.id}`, 'PUT', undefined, bia.cookie)).status, 204);
      assert.equal((await upload(ana.cookie, true)).status, 403);
      assert.equal((await request(`/blocks/${ana.id}`, 'DELETE', undefined, bia.cookie)).status, 204);

      // Apagar a mensagem apaga o registro do anexo.
      assert.equal((await request(`/dm-channels/${dm.id}/messages/${message.id}`, 'DELETE', undefined, ana.cookie)).status, 204);
      const remaining = db.prepare("SELECT id FROM dm_attachments WHERE id = 'anexo-1'").all();
      assert.equal(remaining.length, 0);
      db.close();
    } finally {
      await api.stop();
    }
  });
});
