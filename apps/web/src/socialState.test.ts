import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MemberSummary, PresenceStatus, RealtimeEvent, Role, TextMessage } from '@nexplay/shared';
import { applyPresenceStatusEvent, presenceFromResponse } from './presenceStatus';
import { buildNameColorMap, nameColorFor } from './roleColors';
import { TYPING_SEND_INTERVAL_MS, TYPING_VISIBLE_MS, activeTypers, applyTypingEvent, shouldSendTyping, typingLabel } from './typingState';

const role = (id: string, position: number, color: string, isEveryone = false): Role =>
  ({ id, serverId: 's', name: id, color, position, hoist: false, permissions: 0, createdAt: 0, isEveryone }) as Role;

test('a cor do nome vem do cargo mais alto que tem cor de verdade', () => {
  const roles = [role('everyone', 0, '#4f8edc', true), role('cinza', 5, '#68708b'), role('mod', 3, '#4fc6ad'), role('admin', 8, '#ee7798')];
  assert.equal(nameColorFor(['everyone', 'mod', 'admin'], roles), '#ee7798');
  assert.equal(nameColorFor(['everyone', 'mod'], roles), '#4fc6ad');
  // só @everyone e cinza neutro: nome na cor normal
  assert.equal(nameColorFor(['everyone', 'cinza'], roles), undefined);
  assert.equal(nameColorFor([], roles), undefined);
  const members = [
    { id: 'a', roleIds: ['mod'] }, { id: 'b', roleIds: [] }, { id: 'c', roleIds: ['admin', 'mod'] },
  ] as MemberSummary[];
  assert.deepEqual([...buildNameColorMap(members, roles)], [['a', '#4fc6ad'], ['c', '#ee7798']]);
});

test('a presença acompanha o status escolhido e some quando a pessoa fica offline', () => {
  const start = presenceFromResponse({ onlineUserIds: ['a', 'b'], statuses: { a: 'online', b: 'dnd' } });
  assert.equal(start.get('b'), 'dnd');
  // servidor antigo, sem "statuses": todo mundo online
  assert.equal(presenceFromResponse({ onlineUserIds: ['x'] }).get('x'), 'online');

  const idle = applyPresenceStatusEvent(start, { type: 'PRESENCE_UPDATE', userId: 'a', online: true, status: 'idle' });
  assert.equal(idle.get('a'), 'idle');
  const same = applyPresenceStatusEvent(idle, { type: 'PRESENCE_UPDATE', userId: 'a', online: true, status: 'idle' });
  assert.equal(same, idle);
  const gone = applyPresenceStatusEvent(idle, { type: 'PRESENCE_UPDATE', userId: 'a', online: false });
  assert.equal(gone.has('a'), false);
  assert.equal(applyPresenceStatusEvent(gone, { type: 'PRESENCE_UPDATE', userId: 'a', online: false }), gone);
  // evento sem status (servidor antigo) vale como online
  assert.equal(applyPresenceStatusEvent(gone, { type: 'PRESENCE_UPDATE', userId: 'a', online: true }).get('a'), 'online' as PresenceStatus);
  // outros tipos de evento não mexem em nada
  assert.equal(applyPresenceStatusEvent(gone, { type: 'MEMBER_LEAVE', serverId: 's', userId: 'a' }), gone);
});

test('"digitando" vale por alguns segundos, some quando a pessoa envia e ignora o próprio usuário', () => {
  const scope = { kind: 'channel', serverId: 's', channelId: 'c' } as const;
  const start = (userId: string, name: string, channelId = 'c'): RealtimeEvent => ({ type: 'TYPING_START', serverId: 's', channelId, userId, displayName: name });
  let typers = applyTypingEvent([], start('ana', 'Ana'), scope, 'eu', 1000);
  assert.deepEqual(typers, [{ userId: 'ana', name: 'Ana', until: 1000 + TYPING_VISIBLE_MS }]);
  // renovar não duplica
  typers = applyTypingEvent(typers, start('ana', 'Ana'), scope, 'eu', 3000);
  assert.equal(typers.length, 1);
  assert.equal(typers[0]!.until, 3000 + TYPING_VISIBLE_MS);
  // o próprio usuário e outro canal não entram
  assert.equal(applyTypingEvent(typers, start('eu', 'Eu'), scope, 'eu', 3000), typers);
  assert.equal(applyTypingEvent(typers, start('bia', 'Bia', 'outro'), scope, 'eu', 3000), typers);
  typers = applyTypingEvent(typers, start('bia', 'Bia'), scope, 'eu', 3500);
  assert.deepEqual(typers.map((typer) => typer.name), ['Ana', 'Bia']);
  // a mensagem enviada encerra o "digitando" de quem enviou
  const message = { id: 'm', channelId: 'c', senderId: 'ana' } as TextMessage;
  typers = applyTypingEvent(typers, { type: 'TEXT_MESSAGE_CREATE', serverId: 's', channelId: 'c', message }, scope, 'eu', 4000);
  assert.deepEqual(typers.map((typer) => typer.name), ['Bia']);
  // depois do prazo já não conta
  assert.deepEqual(activeTypers(typers, 3500 + TYPING_VISIBLE_MS - 1).length, 1);
  assert.deepEqual(activeTypers(typers, 3500 + TYPING_VISIBLE_MS).length, 0);

  const dm = { kind: 'dm', dmChannelId: 'd' } as const;
  const dmTyping = applyTypingEvent([], { type: 'DM_TYPING_START', dmChannelId: 'd', userId: 'ana', displayName: 'Ana' }, dm, 'eu', 0);
  assert.equal(dmTyping.length, 1);
  assert.equal(applyTypingEvent([], { type: 'DM_TYPING_START', dmChannelId: 'outra', userId: 'ana', displayName: 'Ana' }, dm, 'eu', 0).length, 0);
});

test('o texto do aviso de "digitando" em português', () => {
  assert.equal(typingLabel([]), '');
  assert.equal(typingLabel(['Ana']), 'Ana está digitando…');
  assert.equal(typingLabel(['Ana', 'Bia']), 'Ana e Bia estão digitando…');
  assert.equal(typingLabel(['Ana', 'Bia', 'Caio']), 'Ana, Bia e Caio estão digitando…');
  assert.equal(typingLabel(['a', 'b', 'c', 'd']), 'Várias pessoas estão digitando…');
});

test('só avisa que está digitando com texto, no intervalo certo e fora do modo invisível', () => {
  assert.equal(shouldSendTyping('oi', 0, TYPING_SEND_INTERVAL_MS, false), true);
  assert.equal(shouldSendTyping('oi', 0, TYPING_SEND_INTERVAL_MS - 1, false), false);
  assert.equal(shouldSendTyping('   ', 0, 10_000, false), false);
  assert.equal(shouldSendTyping('', 0, 10_000, false), false);
  assert.equal(shouldSendTyping('oi', 0, 10_000, true), false);
});
