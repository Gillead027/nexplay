import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DM_CALL_SERVER_ID } from '@nexplay/shared';
import { applyDmCallEvent, dmCallChannel, finishedCallNotice, incomingDmCall, isDmCallChannel, stampDmCall, type DmCallEvent } from './dmCallsState';

const event = (status: DmCallEvent['status'], elapsedMs: number | null = null): DmCallEvent => ({
  type: 'DM_CALL_UPDATE', dmChannelId: 'dm1', callerId: 'ana', calleeId: 'bia', status, elapsedMs,
});

test('chamando e em andamento entram no estado; o começo local desconta o tempo que o servidor contou', () => {
  const ringing = applyDmCallEvent({}, event('ringing'), 1_000_000);
  assert.equal(ringing.calls.dm1?.status, 'ringing');
  assert.equal(ringing.calls.dm1?.startedAtLocal, null);
  assert.equal(ringing.finished, null);
  const active = applyDmCallEvent(ringing.calls, event('active', 12_000), 1_000_000);
  assert.equal(active.calls.dm1?.status, 'active');
  assert.equal(active.calls.dm1?.startedAtLocal, 988_000);
});

test('quando a ligação acaba ela sai do estado e o app é avisado de COMO acabou', () => {
  const { calls } = applyDmCallEvent({}, event('ringing'), 1);
  for (const how of ['ended', 'declined', 'missed'] as const) {
    const result = applyDmCallEvent(calls, event(how));
    assert.deepEqual(result.calls, {});
    assert.equal(result.finished?.how, how);
    assert.equal(result.finished?.call.status, 'ringing');
  }
  // aviso de uma ligação que o app nem conhecia: nada a fazer
  assert.equal(applyDmCallEvent({}, event('ended')).finished, null);
});

test('a ligação recebida é a que está chamando ESTA pessoa; quem ligou não vê como recebida', () => {
  const { calls } = applyDmCallEvent({}, event('ringing'));
  assert.equal(incomingDmCall(calls, 'bia')?.dmChannelId, 'dm1');
  assert.equal(incomingDmCall(calls, 'ana'), null);
  assert.equal(incomingDmCall(applyDmCallEvent(calls, event('active', 0)).calls, 'bia'), null);
});

test('avisos de fim de ligação: perdida, recusada, não atendeu — e nada para o fim normal', () => {
  const ringing = stampDmCall({ dmChannelId: 'dm1', callerId: 'ana', calleeId: 'bia', status: 'ringing', elapsedMs: null });
  const active = stampDmCall({ dmChannelId: 'dm1', callerId: 'ana', calleeId: 'bia', status: 'active', elapsedMs: 5000 });
  assert.equal(finishedCallNotice({ call: ringing, how: 'missed' }, 'bia', 'Ana'), 'Ligação perdida de Ana.');
  assert.equal(finishedCallNotice({ call: ringing, how: 'missed' }, 'ana', 'Bia'), 'Bia não atendeu.');
  assert.equal(finishedCallNotice({ call: ringing, how: 'declined' }, 'ana', 'Bia'), 'Bia recusou a ligação.');
  assert.equal(finishedCallNotice({ call: ringing, how: 'declined' }, 'bia', 'Ana'), null);
  // quem ligou desistiu enquanto chamava: para quem recebia é ligação perdida; quem desistiu não precisa de aviso
  assert.equal(finishedCallNotice({ call: ringing, how: 'ended' }, 'bia', 'Ana'), 'Ligação perdida de Ana.');
  assert.equal(finishedCallNotice({ call: ringing, how: 'ended' }, 'ana', 'Bia'), null);
  assert.equal(finishedCallNotice({ call: active, how: 'ended' }, 'bia', 'Ana'), null);
});

test('o canal fictício da ligação usa o "servidor" das ligações e leva o nome de quem está do outro lado', () => {
  const channel = dmCallChannel('dm1', 'Bia');
  assert.equal(channel.id, 'dm1');
  assert.equal(channel.serverId, DM_CALL_SERVER_ID);
  assert.equal(channel.name, 'Ligação com Bia');
  assert.equal(isDmCallChannel(channel), true);
  assert.equal(isDmCallChannel({ serverId: 'um-servidor-de-verdade' }), false);
  assert.equal(isDmCallChannel(null), false);
});
