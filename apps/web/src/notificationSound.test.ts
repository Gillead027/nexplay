import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mentionsUser } from './mentions';
import { decideNotificationSound, parseNotificationPrefs, type NotificationInput } from './notificationSound';

const base: NotificationInput = { source: 'channel', mention: false, viewing: false, mode: 'all', status: 'online', prefs: { messages: true, mentions: true } };

test('mensagem comum toca o som de mensagem e menção toca o de menção', () => {
  assert.equal(decideNotificationSound(base), 'message');
  assert.equal(decideNotificationSound({ ...base, mention: true }), 'mention');
});

test('não toca no Não perturbe nem no canal que a pessoa está olhando com a janela em foco', () => {
  assert.equal(decideNotificationSound({ ...base, status: 'dnd' }), null);
  assert.equal(decideNotificationSound({ ...base, status: 'dnd', mention: true }), null);
  assert.equal(decideNotificationSound({ ...base, viewing: true }), null);
  assert.equal(decideNotificationSound({ ...base, viewing: true, mention: true }), null);
  // ausente e invisível continuam recebendo
  assert.equal(decideNotificationSound({ ...base, status: 'idle' }), 'message');
  assert.equal(decideNotificationSound({ ...base, status: 'invisible' }), 'message');
});

test('o modo de notificação do canal manda: nenhuma, só menções ou todas', () => {
  assert.equal(decideNotificationSound({ ...base, mode: 'none' }), null);
  assert.equal(decideNotificationSound({ ...base, mode: 'none', mention: true }), null);
  assert.equal(decideNotificationSound({ ...base, mode: 'mentions' }), null);
  assert.equal(decideNotificationSound({ ...base, mode: 'mentions', mention: true }), 'mention');
});

test('os interruptores de Configurações > Notificações desligam cada tipo de som', () => {
  assert.equal(decideNotificationSound({ ...base, prefs: { messages: false, mentions: true } }), null);
  assert.equal(decideNotificationSound({ ...base, mention: true, prefs: { messages: false, mentions: true } }), 'mention');
  // menção com o som de menção desligado cai no som de mensagem, se este estiver ligado
  assert.equal(decideNotificationSound({ ...base, mention: true, prefs: { messages: true, mentions: false } }), 'message');
  assert.equal(decideNotificationSound({ ...base, mention: true, prefs: { messages: false, mentions: false } }), null);
});

test('toda mensagem direta chama, mesmo sem menção, e respeita o mesmo Não perturbe', () => {
  assert.equal(decideNotificationSound({ ...base, source: 'dm' }), 'message');
  assert.equal(decideNotificationSound({ ...base, source: 'dm', status: 'dnd' }), null);
  assert.equal(decideNotificationSound({ ...base, source: 'dm', viewing: true }), null);
  assert.equal(decideNotificationSound({ ...base, source: 'dm', prefs: { messages: false, mentions: true } }), null);
});

test('preferências guardadas: tudo ligado por padrão e lixo no armazenamento é ignorado', () => {
  assert.deepEqual(parseNotificationPrefs(null), { messages: true, mentions: true });
  assert.deepEqual(parseNotificationPrefs('{"messages":false}'), { messages: false, mentions: true });
  assert.deepEqual(parseNotificationPrefs('nada disso'), { messages: true, mentions: true });
  assert.deepEqual(parseNotificationPrefs('{"messages":"sim","mentions":1}'), { messages: true, mentions: true });
});

test('menção precisa do nome inteiro e não pega parte de outra palavra', () => {
  assert.equal(mentionsUser('oi @Ana, tudo bem?', 'Ana'), true);
  assert.equal(mentionsUser('@ana', 'Ana'), true);
  assert.equal(mentionsUser('oi @Ananda', 'Ana'), false);
  assert.equal(mentionsUser('email@Ana.com', 'Ana'), false);
  assert.equal(mentionsUser('chama o @Maria Clara aí', 'Maria Clara'), true);
  assert.equal(mentionsUser('chama o @Maria', 'Maria Clara'), false);
  assert.equal(mentionsUser('sem menção', 'Ana'), false);
  assert.equal(mentionsUser('@', ''), false);
});
